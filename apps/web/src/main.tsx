import React from "react";
import { createRoot } from "react-dom/client";
import { BoardPreview } from "./BoardPreview";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");
createRoot(root).render(<BoardPreview seed="preview" />);
