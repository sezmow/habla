import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/figtree";
import "@fontsource-variable/fraunces";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/exercise.css";
import "./styles/pages.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
}
