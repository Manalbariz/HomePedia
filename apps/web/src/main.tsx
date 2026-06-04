import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadTheme } from "./context/ThemeContext";
import "./index.css";

const initialTheme = loadTheme();
document.documentElement.dataset.theme = initialTheme;
document.documentElement.classList.add(initialTheme);
document.documentElement.style.colorScheme = initialTheme;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
