import { createRoot } from "react-dom/client";
import { installOfflineApi } from "./lib/offline-api";
import App from "./App";
import "./index.css";

installOfflineApi();

createRoot(document.getElementById("root")!).render(<App />);
