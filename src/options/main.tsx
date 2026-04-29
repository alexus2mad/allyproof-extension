import React from "react";
import { createRoot } from "react-dom/client";
import { Options } from "./Options";
import "../styles/globals.css";

const el = document.getElementById("options-root");
if (!el) throw new Error("options-root not found");
createRoot(el).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
