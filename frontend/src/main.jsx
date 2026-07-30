import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
// Outfit ist die Hausschrift von SIREGO — sirego.ch und crm.sirego.ch laden
// beide sie. Self-gehostet statt Google Fonts: kein externer Request,
// funktioniert auch offline/hinter Firewalls. Ohne dieses Paket fällt der
// Browser lautlos auf einen Systemfont zurück, egal was in index.css steht.
import "@fontsource-variable/outfit";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
