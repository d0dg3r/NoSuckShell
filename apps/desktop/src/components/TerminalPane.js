import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import { resizeSession } from "../tauri-api";
const sessionBuffers = new Map();
const MAX_BUFFER_CHARS = 250_000;
const hasTauriTransformCallback = () => {
    if (typeof window === "undefined") {
        return false;
    }
    const tauriInternals = window
        .__TAURI_INTERNALS__;
    return typeof tauriInternals?.transformCallback === "function";
};
export function TerminalPane({ sessionId, onUserInput }) {
    const rootRef = useRef(null);
    const terminalRef = useRef(null);
    const fitAddonRef = useRef(null);
    const onUserInputRef = useRef(onUserInput);
    const fitFrameRef = useRef(null);
    const fitDebounceRef = useRef(null);
    const lastResizeRef = useRef(null);
    useEffect(() => {
        onUserInputRef.current = onUserInput;
    }, [onUserInput]);
    useEffect(() => {
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
        }
        const buffered = sessionBuffers.get(sessionId) ?? "";
        if (buffered.length > 0) {
            terminal.write(buffered);
        }
        else {
            terminal.writeln("Connecting...");
        }
        terminal.onData((data) => {
            onUserInputRef.current(sessionId, data);
        });
        let unlisten = null;
        if (hasTauriTransformCallback()) {
            void listen("session-output", (event) => {
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
                }
                else {
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
            const didSizeChange = !lastResizeRef.current ||
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
        let resizeObserver = null;
        if (rootRef.current) {
            resizeObserver = new ResizeObserver(() => {
                scheduleFitAndResize();
            });
            resizeObserver.observe(rootRef.current);
        }
        const onExternalFitRequest = () => {
            scheduleFitAndResize();
        };
        const onExternalFocusRequest = (event) => {
            const focusEvent = event;
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
    }, [sessionId]);
    return _jsx("div", { ref: rootRef, className: "terminal-root" });
}
