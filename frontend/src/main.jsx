import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
// Self-gehostet statt Google Fonts — kein externer Request, funktioniert
// auch offline/hinter Firewalls. Ohne dieses Paket fällt der Browser trotz
// `font-family: Inter` in index.css lautlos auf einen Systemfont zurück.
import "@fontsource-variable/inter";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
