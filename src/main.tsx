import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary";
import { installAutoRecover } from "./utils/autoRecover";

// Recuperación automática si un fragmento no carga (despliegue nuevo / red).
installAutoRecover();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
