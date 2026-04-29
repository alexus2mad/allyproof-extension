/**
 * Side-panel root. Reuses the popup's React component so the user
 * gets the same surface in a docked-alongside-page format. Side
 * panel persists across tab navigation, so the popup's "load
 * current tab on mount" behavior gracefully degrades — it picks
 * up whatever tab is active each time.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { Popup } from "@/popup/Popup";
import "../styles/globals.css";

const el = document.getElementById("sidepanel-root");
if (!el) throw new Error("sidepanel-root not found");
createRoot(el).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
