import React from "react";
import ReactDOM from "react-dom/client";
import { ProxmoxStandaloneRoot } from "./components/ProxmoxStandaloneRoot";
import "./styles.css";
import "@xterm/xterm/css/xterm.css";

// Cold-start diagnostics: surface in browser/WebView Performance panel and via
// `performance.getEntriesByType("mark" | "measure")`. Cheap (a few microseconds);
// safe to keep in production so user reports can include real timings.
if (typeof performance !== "undefined" && typeof performance.mark === "function") {
  performance.mark("nss:js-start");
}

// Prevents TAURI "Couldn't find callback id" warnings during HMR when Rust has pending async ops
window.addEventListener("unload", () => {});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ProxmoxStandaloneRoot />
  </React.StrictMode>,
);

if (typeof performance !== "undefined" && typeof performance.mark === "function") {
  performance.mark("nss:react-render-scheduled");
  try {
    performance.measure("nss:js-to-render-scheduled", "nss:js-start", "nss:react-render-scheduled");
  } catch {
    // Marks may be unavailable in restricted environments; ignore.
  }
}
