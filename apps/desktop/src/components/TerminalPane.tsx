import { memo, useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { parseOsc7WorkingDirectoryPayload } from "../features/terminal-osc7-path";
import { sanitizeTerminalPaste } from "../features/terminal-paste-sanitize";
import {
  ENTER_REPEAT_MIN_INTERVAL_MS,
  shouldThrottleEnterRepeat,
  shouldThrottleGenericKeyRepeat,
} from "../features/terminal-key-repeat";
import { createTerminalOutputBatcher } from "../features/terminal-output-batch";
import { appendSessionScrollback, getSessionScrollback } from "../features/terminal-scrollback-buffer";
import { readTerminalMiddleClickPasteText, resizeSession, writeTerminalSelectionClipboard } from "../tauri-api";
import { subscribeSessionOutput } from "../session-output-bridge";
import type { SessionOutputEvent } from "../types";

type Props = {
  sessionId: string;
  onUserInput: (sessionId: string, data: string) => void;
  /** OSC 7 (file://…) from shell — updates pane title CWD when supported. */
  onSessionWorkingDirectoryChange?: (sessionId: string, path: string) => void;
  fontSize: number;
  fontFamily: string;
};

const GENERIC_REPEAT_MIN_INTERVAL_MS = 45;
/** Debounce wl-copy/xclip while the user is still dragging a selection. */
const SELECTION_CLIPBOARD_DEBOUNCE_MS = 120;

function TerminalPaneInner({ sessionId, onUserInput, onSessionWorkingDirectoryChange, fontSize, fontFamily }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onUserInputRef = useRef(onUserInput);
  const onSessionWorkingDirectoryChangeRef = useRef(onSessionWorkingDirectoryChange);
  const fitFrameRef = useRef<number | null>(null);
  const fitDebounceRef = useRef<number | null>(null);
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const enterKeyIsDownRef = useRef(false);
  const lastEnterKeyupAtRef = useRef<number | null>(null);
  const lastManualEnterSendAtRef = useRef<number | null>(null);
  const lastRepeatKeydownAtByKeyRef = useRef<Map<string, number>>(new Map());

  const handleTerminalHostPointerDownCapture = useCallback(async (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.button !== 1) {
      return;
    }
    event.preventDefault();
    const term = terminalRef.current;
    if (!term) {
      return;
    }
    try {
      const text = await readTerminalMiddleClickPasteText();
      if (text) {
        const clean = sanitizeTerminalPaste(text);
        if (clean) term.paste(clean);
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    onUserInputRef.current = onUserInput;
  }, [onUserInput]);

  useEffect(() => {
    onSessionWorkingDirectoryChangeRef.current = onSessionWorkingDirectoryChange;
  }, [onSessionWorkingDirectoryChange]);

  useEffect(() => {
    let disposed = false;
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily,
      fontSize,
      theme: {
        background: "#0b0d10",
        foreground: "#dce6f8",
        cursor: "#4cd8ff",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    if (terminalHostRef.current) {
      terminal.open(terminalHostRef.current);
      fitAddon.fit();
      // Sync pty to xterm as soon as the pane has real dimensions. Without this, the
      // backend keeps the Rust default (e.g. 120×30) until the debounced
      // scheduleFitAndResize() runs, which can be hundreds of ms late on first
      // paint; that mismatch plus slow first-shell startup feels like "keys appear
      // in one burst" after the first prompt.
      lastResizeRef.current = { cols: terminal.cols, rows: terminal.rows };
      void resizeSession(sessionId, terminal.cols, terminal.rows);
    }

    const osc7Disposable = terminal.parser.registerOscHandler(7, (data) => {
      const path = parseOsc7WorkingDirectoryPayload(data);
      if (path === null) {
        return false;
      }
      const notify = onSessionWorkingDirectoryChangeRef.current;
      if (notify) {
        notify(sessionId, path);
      }
      return true;
    });

    const buffered = getSessionScrollback(sessionId);
    if (buffered.length > 0) {
      terminal.write(buffered);
    } else {
      terminal.writeln("Connecting...");
    }
    terminal.onData((data) => {
      if (data === "\r") {
        return;
      }
      onUserInputRef.current(sessionId, data);
    });
    const onWindowKeyup = (event: KeyboardEvent) => {
      if (event.key !== "Enter") {
        return;
      }
      enterKeyIsDownRef.current = false;
      lastEnterKeyupAtRef.current = Date.now();
    };
    window.addEventListener("keyup", onWindowKeyup);

    const pasteTerminalFromClipboard = () => {
      navigator.clipboard.readText().then((text) => {
        if (!text) return;
        const clean = sanitizeTerminalPaste(text);
        if (clean) terminal.paste(clean);
      }).catch(() => {});
    };

    const pushTerminalSelectionToSystemClipboard = (sel: string) => {
      if (!sel) {
        return;
      }
      void writeTerminalSelectionClipboard(sel).catch(() => {
        void navigator.clipboard.writeText(sel).catch(() => {});
      });
    };

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === "keydown" && (event.key === "c" || event.key === "C") && event.ctrlKey && event.shiftKey) {
        const sel = terminal.getSelection();
        if (sel) {
          pushTerminalSelectionToSystemClipboard(sel);
        }
        return false;
      }
      if (event.type === "keydown" && event.key === "Insert" && event.ctrlKey && !event.shiftKey) {
        const sel = terminal.getSelection();
        if (sel) {
          pushTerminalSelectionToSystemClipboard(sel);
        }
        return false;
      }
      if (event.type === "keydown" && event.key === "v" && event.ctrlKey && event.shiftKey) {
        pasteTerminalFromClipboard();
        return false;
      }
      if (event.type === "keydown" && event.key === "Insert" && event.shiftKey && !event.ctrlKey) {
        pasteTerminalFromClipboard();
        return false;
      }
      if (
        shouldThrottleGenericKeyRepeat(
          event,
          lastRepeatKeydownAtByKeyRef.current,
          Date.now(),
          GENERIC_REPEAT_MIN_INTERVAL_MS,
        )
      ) {
        return false;
      }
      if (event.key === "Enter" && event.type === "keydown") {
        const now = Date.now();
        if (
          shouldThrottleEnterRepeat(
            event,
            lastManualEnterSendAtRef.current,
            now,
            ENTER_REPEAT_MIN_INTERVAL_MS,
          )
        ) {
          return false;
        }
        enterKeyIsDownRef.current = true;
        lastManualEnterSendAtRef.current = now;
        onUserInputRef.current(sessionId, "\r");
        return false;
      }
      if (event.key === "Enter" && event.type === "keypress") {
        return false;
      }
      if (event.key === "Enter" && event.type === "keyup") {
        enterKeyIsDownRef.current = false;
        lastEnterKeyupAtRef.current = Date.now();
        return false;
      }
      return true;
    });

    let selectionSyncDebounceTimer: number | null = null;
    const selectionChangeDisposable = terminal.onSelectionChange(() => {
      if (selectionSyncDebounceTimer !== null) {
        window.clearTimeout(selectionSyncDebounceTimer);
      }
      selectionSyncDebounceTimer = window.setTimeout(() => {
        selectionSyncDebounceTimer = null;
        const sel = terminal.getSelection();
        pushTerminalSelectionToSystemClipboard(sel);
      }, SELECTION_CLIPBOARD_DEBOUNCE_MS);
    });

    const outputBatcher = createTerminalOutputBatcher(
      (combined) => {
        terminal.write(combined);
        appendSessionScrollback(sessionId, combined);
      },
      () => {
        terminal.writeln("\r\n[Known host prompt detected. Press 'Trust host'.]");
      },
    );

    const unsubscribeOutput = subscribeSessionOutput(sessionId, (payload: SessionOutputEvent) => {
      outputBatcher.enqueue(payload.chunk);
      if (payload.host_key_prompt) {
        outputBatcher.enqueueHostKeyNotice();
      }
    });

    const fitAndResize = () => {
      const root = rootRef.current;
      const terminalHost = terminalHostRef.current;
      if (!root || !terminalHost) {
        return;
      }
      const pane = root.closest(".split-pane") as HTMLElement | null;
      const label = pane?.querySelector(".split-pane-label") as HTMLElement | null;
      if (pane && label) {
        const paneTop = pane.getBoundingClientRect().top;
        const labelBottom = label.getBoundingClientRect().bottom;
        const requiredTopInset = Math.ceil(Math.max(0, labelBottom - paneTop) + 2);
        root.style.setProperty("--pane-terminal-top-inset", `${requiredTopInset}px`);
      } else {
        root.style.removeProperty("--pane-terminal-top-inset");
      }
      fitAddon.fit();
      const didSizeChange =
        !lastResizeRef.current ||
        lastResizeRef.current.cols !== terminal.cols ||
        lastResizeRef.current.rows !== terminal.rows;
      if (didSizeChange) {
        lastResizeRef.current = { cols: terminal.cols, rows: terminal.rows };
        void resizeSession(sessionId, terminal.cols, terminal.rows);
      }
    };

    const scheduleFitAndResize = () => {
      if (fitDebounceRef.current !== null) {
        window.clearTimeout(fitDebounceRef.current);
      }
      fitDebounceRef.current = window.setTimeout(() => {
        if (fitFrameRef.current !== null) {
          window.cancelAnimationFrame(fitFrameRef.current);
        }
        fitFrameRef.current = window.requestAnimationFrame(() => {
          fitFrameRef.current = null;
          fitAndResize();
        });
      }, 40);
    };

    let resizeObserver: ResizeObserver | null = null;
    if (terminalHostRef.current) {
      resizeObserver = new ResizeObserver(() => {
        scheduleFitAndResize();
      });
      resizeObserver.observe(terminalHostRef.current);
    }
    const onExternalFitRequest = () => {
      scheduleFitAndResize();
    };
    const onExternalFocusRequest: EventListener = (event) => {
      const focusEvent = event as CustomEvent<{ sessionId?: string }>;
      if (focusEvent.detail?.sessionId !== sessionId) {
        return;
      }
      window.requestAnimationFrame(() => {
        terminal.focus();
      });
    };
    window.addEventListener("nosuckshell:terminal-fit-request", onExternalFitRequest);
    window.addEventListener("nosuckshell:terminal-focus-request", onExternalFocusRequest);
    scheduleFitAndResize();
    // Auto-focus on mount so the first keystroke after a session is attached lands in xterm
    // (avoids the perceived "delay" where the user has to click into the pane first).
    window.requestAnimationFrame(() => {
      if (!disposed) {
        terminal.focus();
      }
    });
    const fontFaceSet = typeof document !== "undefined" ? document.fonts : null;
    if (fontFaceSet) {
      void fontFaceSet.ready.then(() => {
        if (disposed) {
          return;
        }
        // Defer a frame so font swap + layout are settled without blocking
        // immediately after the ready callback (improves first-typing feel).
        requestAnimationFrame(() => {
          if (!disposed) {
            scheduleFitAndResize();
          }
        });
      });
    }

    return () => {
      disposed = true;
      outputBatcher.dispose();
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener("keyup", onWindowKeyup);
      window.removeEventListener("nosuckshell:terminal-fit-request", onExternalFitRequest);
      window.removeEventListener("nosuckshell:terminal-focus-request", onExternalFocusRequest);
      if (fitDebounceRef.current !== null) {
        window.clearTimeout(fitDebounceRef.current);
      }
      if (fitFrameRef.current !== null) {
        window.cancelAnimationFrame(fitFrameRef.current);
      }
      osc7Disposable.dispose();
      if (selectionSyncDebounceTimer !== null) {
        window.clearTimeout(selectionSyncDebounceTimer);
      }
      selectionChangeDisposable.dispose();
      unsubscribeOutput();
      terminal.dispose();
    };
  }, [fontFamily, fontSize, sessionId]);

  return (
    <div ref={rootRef} className="terminal-root">
      <div
        ref={terminalHostRef}
        className="terminal-host"
        data-nosuckshell-terminal-host="true"
        onPointerDownCapture={handleTerminalHostPointerDownCapture}
      />
    </div>
  );
}

/**
 * Wraps the xterm pane in `React.memo` so unrelated parent renders (sidebar, settings, drag, …)
 * do not re-render the terminal subtree. All callback props are `useCallback`-stable in `App.tsx`,
 * so the default shallow comparison is correct.
 */
export const TerminalPane = memo(TerminalPaneInner);
