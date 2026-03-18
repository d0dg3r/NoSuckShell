import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { resizeSession } from "../tauri-api";
import type { SessionOutputEvent } from "../types";

type Props = {
  sessionId: string;
  onUserInput: (sessionId: string, data: string) => void;
};

const sessionBuffers = new Map<string, string>();
const MAX_BUFFER_CHARS = 250_000;

export function TerminalPane({ sessionId, onUserInput }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const fitCallCountRef = useRef<number>(0);
  const observerCallCountRef = useRef<number>(0);
  const onUserInputRef = useRef(onUserInput);

  useEffect(() => {
    onUserInputRef.current = onUserInput;
  }, [onUserInput]);

  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "608500" },
      body: JSON.stringify({
        sessionId: "608500",
        runId: "pre-fix-resize",
        hypothesisId: "H16",
        location: "TerminalPane.tsx:24",
        message: "terminal_effect_mount",
        data: { sessionId },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    let disposed = false;
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "monospace",
      fontSize: 14,
      theme: {
        background: "#0f141f",
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
      // #region agent log
      fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "608500" },
        body: JSON.stringify({
          sessionId: "608500",
          runId: "pre-fix",
          hypothesisId: "H1",
          location: "TerminalPane.tsx:43",
          message: "terminal_opened",
          data: {
            paneWidth: rootRef.current.clientWidth,
            paneScrollWidth: rootRef.current.scrollWidth,
            paneHeight: rootRef.current.clientHeight,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
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
    });

    const fitAndResize = () => {
      const root = rootRef.current;
      const pane = root?.closest(".split-pane") as HTMLElement | null;
      fitCallCountRef.current += 1;
      // #region agent log
      fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "608500" },
        body: JSON.stringify({
          sessionId: "608500",
          runId: "pre-fix",
          hypothesisId: "H2",
          location: "TerminalPane.tsx:90",
          message: "fit_before",
          data: {
            fitCount: fitCallCountRef.current,
            sessionId,
            rootWidth: root?.clientWidth ?? null,
            rootScrollWidth: root?.scrollWidth ?? null,
            paneWidth: pane?.clientWidth ?? null,
            paneScrollWidth: pane?.scrollWidth ?? null,
            colsBefore: terminal.cols,
            rowsBefore: terminal.rows,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      fitAddon.fit();
      // #region agent log
      fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "608500" },
        body: JSON.stringify({
          sessionId: "608500",
          runId: "pre-fix",
          hypothesisId: "H3",
          location: "TerminalPane.tsx:113",
          message: "fit_after",
          data: {
            fitCount: fitCallCountRef.current,
            sessionId,
            rootWidth: root?.clientWidth ?? null,
            rootScrollWidth: root?.scrollWidth ?? null,
            paneWidth: pane?.clientWidth ?? null,
            paneScrollWidth: pane?.scrollWidth ?? null,
            colsAfter: terminal.cols,
            rowsAfter: terminal.rows,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      void resizeSession(sessionId, terminal.cols, terminal.rows);
    };

    let resizeObserver: ResizeObserver | null = null;
    if (rootRef.current) {
      resizeObserver = new ResizeObserver(() => {
        observerCallCountRef.current += 1;
        // #region agent log
        fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "608500" },
          body: JSON.stringify({
            sessionId: "608500",
            runId: "pre-fix",
            hypothesisId: "H4",
            location: "TerminalPane.tsx:139",
            message: "resize_observer_fired",
            data: {
              observerCount: observerCallCountRef.current,
              sessionId,
              paneWidth: rootRef.current?.clientWidth ?? null,
              paneScrollWidth: rootRef.current?.scrollWidth ?? null,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        fitAndResize();
      });
      resizeObserver.observe(rootRef.current);
    }
    fitAndResize();

    return () => {
      // #region agent log
      fetch("http://127.0.0.1:7498/ingest/1fd4618e-1a4f-4b3a-baf2-b03e2eb2e5ab", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "608500" },
        body: JSON.stringify({
          sessionId: "608500",
          runId: "pre-fix-resize",
          hypothesisId: "H16",
          location: "TerminalPane.tsx:151",
          message: "terminal_effect_cleanup",
          data: { sessionId },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      disposed = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (unlisten) {
        void unlisten();
      }
      terminal.dispose();
    };
  }, [sessionId]);

  return <div ref={rootRef} className="terminal-root" />;
}
