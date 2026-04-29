import React from "react";
import { createRoot } from "react-dom/client";
import { PanelView } from "./view";
import "../styles/globals.css";

const el = document.getElementById("panel-root");
if (!el) throw new Error("panel-root not found");
createRoot(el).render(
  <React.StrictMode>
    <PanelView />
  </React.StrictMode>
);
