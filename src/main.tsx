import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./landing.css";
import { settingsStore } from "./lib/settingsStore";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

settingsStore.init();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
