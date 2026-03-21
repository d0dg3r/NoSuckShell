import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "@xterm/xterm/css/xterm.css";
// Prevents TAURI "Couldn't find callback id" warnings during HMR when Rust has pending async ops
window.addEventListener("unload", () => { });
ReactDOM.createRoot(document.getElementById("root")).render(_jsx(React.StrictMode, { children: _jsx(App, {}) }));
