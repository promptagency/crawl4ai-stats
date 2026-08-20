import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { Dashboard } from "./components/Dashboard";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Dashboard />
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: "#12141e",
          border: "1px solid #1e2130",
          color: "#c8ccd4",
          fontFamily: "inherit",
          fontSize: "12px",
        },
      }}
    />
  </StrictMode>,
);
