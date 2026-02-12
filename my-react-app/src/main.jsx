import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App.jsx";
// 1. Import the provider
import { AuthProvider } from "./context/AuthContext"; 

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {/* 2. Wrap the App component */}
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);