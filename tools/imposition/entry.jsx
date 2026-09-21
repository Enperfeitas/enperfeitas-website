import React from "react";
import { createRoot } from "react-dom/client";
import ImpositionTool from "./imposition.jsx";

const el = document.getElementById("imposition-root");
if (el) {
  createRoot(el).render(<ImpositionTool />);
}
