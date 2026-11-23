import "./lib/accountStorage";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initTheme } from "./lib/theme";

initTheme();

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
