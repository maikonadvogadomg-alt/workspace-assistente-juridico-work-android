import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Patch global fetch so all /api/... calls use the correct base path
const _BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
if (_BASE) {
  const _originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && (input.startsWith("/api/") || input === "/api")) {
      input = _BASE + input;
    }
    return _originalFetch(input, init);
  };
}

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL || "/";
    navigator.serviceWorker.register(`${base}sw.js`).catch(() => {});
  });
}
