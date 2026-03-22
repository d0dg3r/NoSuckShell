import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { parseOsc7WorkingDirectoryPayload } from "../features/terminal-osc7-path";
import { resizeSession } from "../tauri-api";
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

const sessionBuffers = new Map<string, string>();
const MAX_BUFFER_CHARS = 250_000;
const ENTER_REPEAT_MIN_INTERVAL_MS = 45;
const GENERIC_REPEAT_MIN_INTERVAL_MS = 45;
export function TerminalPane({ sessionId, onUserInput, onSessionWorkingDirectoryChange, fontSize, fontFamily }: Props) {
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

    const buffered = sessionBuffers.get(sessionId) ?? "";
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
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === "keydown" && event.repeat && event.key !== "Enter") {
        const keyId = `${event.code}:${event.key}`;
        const now = Date.now();
        const lastAt = lastRepeatKeydownAtByKeyRef.current.get(keyId) ?? null;
        if (lastAt !== null && now - lastAt < GENERIC_REPEAT_MIN_INTERVAL_MS) {
          return false;
        }
        lastRepeatKeydownAtByKeyRef.current.set(keyId, now);
      }
      if (event.key === "Enter" && event.type === "keydown") {
        const now = Date.now();
        const previousManualSendAt = lastManualEnterSendAtRef.current;
        const sincePreviousManualSend = previousManualSendAt === null ? null : now - previousManualSendAt;
        const isThrottledRepeat =
          event.repeat && sincePreviousManualSend !== null && sincePreviousManualSend < ENTER_REPEAT_MIN_INTERVAL_MS;
        if (isThrottledRepeat) {
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

    const unsubscribeOutput = subscribeSessionOutput(sessionId, (payload: SessionOutputEvent) => {
      const existing = sessionBuffers.get(sessionId) ?? "";
      const next = (existing + payload.chunk).slice(-MAX_BUFFER_CHARS);
      sessionBuffers.set(sessionId, next);
      terminal.write(payload.chunk);
      if (payload.host_key_prompt) {
        terminal.writeln("\r\n[Known host prompt detected. Press 'Trust host'.]");
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
    const fontFaceSet = typeof document !== "undefined" ? document.fonts : null;
    if (fontFaceSet) {
      void fontFaceSet.ready.then(() => {
        if (!disposed) {
          scheduleFitAndResize();
        }
      });
    }

    return () => {
      disposed = true;
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
      unsubscribeOutput();
      terminal.dispose();
    };
  }, [fontFamily, fontSize, sessionId]);

  return (
    <div ref={rootRef} className="terminal-root">
      <div ref={terminalHostRef} className="terminal-host" data-nosuckshell-terminal-host="true" />
    </div>
  );
}
