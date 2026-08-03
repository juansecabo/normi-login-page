import { Component, type ReactNode } from "react";
import { reloadOnce } from "@/utils/autoRecover";

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

/**
 * Red de seguridad de toda la app. Si algún componente se cae al renderizar
 * (típico cuando Chrome "despierta" una pestaña que tuvo dormida mucho rato),
 * en vez de dejar la pantalla en blanco intenta recargar sola una vez. Si acabamos
 * de recargar y sigue fallando, muestra una pantalla de reintento manual.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(): void {
    // Primer intento: recargar solo. reloadOnce() no repite si ya recargó hace <10s.
    reloadOnce();
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 14,
          fontFamily: "system-ui, -apple-system, sans-serif", color: "#0f3258",
          padding: 24, textAlign: "center",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>Reconectando…</div>
        <div style={{ fontSize: 14, color: "#5b6b7a" }}>
          Si no se recarga sola, toca el botón.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "#16a34a", color: "#fff", border: "none", borderRadius: 8,
            padding: "10px 22px", fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}
        >
          Recargar
        </button>
      </div>
    );
  }
}
