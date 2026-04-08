import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App.jsx";
import AppProviders from "./app/providers.jsx";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./styles/tokens.css";
import "./styles/base.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>
);
