import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App.jsx";
import AppProviders from "./app/providers.jsx";

// Keep order stable for coexistence mode:
// 1) Bootstrap base/utilities, 2) Tailwind utilities, 3) legacy app styles.
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./styles/tailwind.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/design-system.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>
);
