import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import { resizeSession } from "../tauri-api";
const sessionBuffers = new Map();
const MAX_BUFFER_CHARS = 250_000;
const ENTER_REPEAT_MIN_INTERVAL_MS = 45;
const GENERIC_REPEAT_MIN_INTERVAL_MS = 45;
const hasTauriTransformCallback = () => {
    if (typeof window === "undefined") {
        return false;
    }
    const tauriInternals = window
        .__TAURI_INTERNALS__;
    return typeof tauriInternals?.transformCallback === "function";
};
export function TerminalPane({ sessionId, onUserInput, fontSize }) {
    const rootRef = useRef(null);
    const terminalHostRef = useRef(null);
    const terminalRef = useRef(null);
    const fitAddonRef = useRef(null);
    const onUserInputRef = useRef(onUserInput);
    const fitFrameRef = useRef(null);
    const fitDebounceRef = useRef(null);
    const lastResizeRef = useRef(null);
    const enterKeyIsDownRef = useRef(false);
    const lastEnterKeyupAtRef = useRef(null);
    const lastManualEnterSendAtRef = useRef(null);
    const lastRepeatKeydownAtByKeyRef = useRef(new Map());
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
        if (terminalHostRef.current) {
            terminal.open(terminalHostRef.current);
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
            if (data === "\r") {
                return;
            }
            onUserInputRef.current(sessionId, data);
        });
        const onWindowKeyup = (event) => {
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
                const isThrottledRepeat = event.repeat && sincePreviousManualSend !== null && sincePreviousManualSend < ENTER_REPEAT_MIN_INTERVAL_MS;
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
            const terminalHost = terminalHostRef.current;
            if (!root || !terminalHost) {
                return;
            }
            const pane = root.closest(".split-pane");
            const label = pane?.querySelector(".split-pane-label");
            if (pane && label) {
                const paneTop = pane.getBoundingClientRect().top;
                const labelBottom = label.getBoundingClientRect().bottom;
                const requiredTopInset = Math.ceil(Math.max(0, labelBottom - paneTop) + 2);
                root.style.setProperty("--pane-terminal-top-inset", `${requiredTopInset}px`);
            }
            else {
                root.style.removeProperty("--pane-terminal-top-inset");
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
        if (terminalHostRef.current) {
            resizeObserver = new ResizeObserver(() => {
                scheduleFitAndResize();
            });
            resizeObserver.observe(terminalHostRef.current);
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
            window.removeEventListener("keyup", onWindowKeyup);
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
    return (_jsx("div", { ref: rootRef, className: "terminal-root", children: _jsx("div", { ref: terminalHostRef, className: "terminal-host" }) }));
}
