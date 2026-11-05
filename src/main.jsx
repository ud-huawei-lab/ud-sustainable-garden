import React from "react";
import { createRoot } from "react-dom/client";
import Auth from "./Auth.jsx";
import "./styles.css";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Auth />
  </React.StrictMode>,
);
