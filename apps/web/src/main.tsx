import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/archivo/standard.css";
import "@fontsource-variable/martian-mono/standard.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@vialz/ui";
import "./site.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
