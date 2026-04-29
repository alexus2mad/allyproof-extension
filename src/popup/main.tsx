import React from "react";
import { createRoot } from "react-dom/client";
import { Popup } from "./Popup";
import "../styles/globals.css";

const el = document.getElementById("popup-root");
if (!el) {
  throw new Error("popup-root not found");
}
createRoot(el).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
