import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { resizeSession } from "../tauri-api";
import type { SessionOutputEvent } from "../types";

type Props = {
  sessionId: string;
  onUserInput: (sessionId: string, data: string) => void;
  fontSize: number;
};

const sessionBuffers = new Map<string, string>();
const MAX_BUFFER_CHARS = 250_000;
const hasTauriTransformCallback = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  const tauriInternals = (window as Window & { __TAURI_INTERNALS__?: { transformCallback?: unknown } })
    .__TAURI_INTERNALS__;
  return typeof tauriInternals?.transformCallback === "function";
};

export function TerminalPane({ sessionId, onUserInput, fontSize }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onUserInputRef = useRef(onUserInput);
  const fitFrameRef = useRef<number | null>(null);
  const fitDebounceRef = useRef<number | null>(null);
  const lastResizeRef = useRef<{ cols: number; rows: number } | null>(null);

  useEffect(() => {
    onUserInputRef.current = onUserInput;
  }, [onUserInput]);

  useEffect(() => {
    let disposed = false;
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "monospace",
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

    if (rootRef.current) {
      terminal.open(rootRef.current);
      fitAddon.fit();
    }

    const buffered = sessionBuffers.get(sessionId) ?? "";
    if (buffered.length > 0) {
      terminal.write(buffered);
    } else {
      terminal.writeln("Connecting...");
    }
    terminal.onData((data) => {
      onUserInputRef.current(sessionId, data);
    });

    let unlisten: UnlistenFn | null = null;
    if (hasTauriTransformCallback()) {
      void listen<SessionOutputEvent>("session-output", (event) => {
        if (event.payload.session_id !== sessionId) {
          return;
        }

        const existing = sessionBuffers.get(sessionId) ?? "";
        const next = (existing + event.payload.chunk).slice(-MAX_BUFFER_CHARS);
        sessionBuffers.set(sessionId, next);
        terminal.write(event.payload.chunk);
        if (event.payload.host_key_prompt) {
          terminal.writeln("\r\n[Known host prompt detected. Press 'Trust host'.]");
        }
      }).then((fn) => {
        if (disposed) {
          void fn();
        } else {
          unlisten = fn;
        }
      }).catch(() => {
        // Tauri event bridge can be temporarily unavailable during dev reload.
      });
    }

    const fitAndResize = () => {
      const root = rootRef.current;
      if (!root) {
        return;
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
    if (rootRef.current) {
      resizeObserver = new ResizeObserver(() => {
        scheduleFitAndResize();
      });
      resizeObserver.observe(rootRef.current);
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

    return () => {
      disposed = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener("nosuckshell:terminal-fit-request", onExternalFitRequest);
      window.removeEventListener("nosuckshell:terminal-focus-request", onExternalFocusRequest);
      if (fitDebounceRef.current !== null) {
        window.clearTimeout(fitDebounceRef.current);
      }
      if (fitFrameRef.current !== null) {
        window.cancelAnimationFrame(fitFrameRef.current);
      }
      if (unlisten) {
        void unlisten();
      }
      terminal.dispose();
    };
  }, [fontSize, sessionId]);

  return <div ref={rootRef} className="terminal-root" />;
}
