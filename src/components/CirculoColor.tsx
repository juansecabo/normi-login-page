import { useRef } from "react";

/**
 * Círculo de colores como el de los programas de edición: el ángulo es el tono y la
 * distancia al centro la intensidad (centro blanco, borde el color pleno). Devuelve "#rrggbb".
 */
const aHex = (h: number, s: number, v = 1): string => {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
};
const aHsv = (hex: string): { h: number; s: number } | null => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: ((h * 60) + 360) % 360, s: max ? d / max : 0 };
};

export default function CirculoColor({ valor, onChange, tam = 176 }: { valor: string | null; onChange: (hex: string) => void; tam?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const arrastrando = useRef(false);
  const escoger = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360; // 0° arriba, como el degradado
    onChange(aHex(h, s));
  };
  const hsv = valor ? aHsv(valor) : null;
  const marca = hsv ? { left: tam / 2 + Math.sin((hsv.h * Math.PI) / 180) * hsv.s * (tam / 2), top: tam / 2 - Math.cos((hsv.h * Math.PI) / 180) * hsv.s * (tam / 2) } : null;
  return (
    <div
      ref={ref}
      className="relative rounded-full cursor-crosshair touch-none select-none shrink-0"
      style={{ width: tam, height: tam, background: "radial-gradient(circle closest-side, #fff, rgba(255,255,255,0)), conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
      onPointerDown={(e) => { arrastrando.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); escoger(e); }}
      onPointerMove={(e) => { if (arrastrando.current) escoger(e); }}
      onPointerUp={() => { arrastrando.current = false; }}
      role="slider"
      aria-label="Círculo de colores"
    >
      {marca && <span className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-white shadow ring-1 ring-black/30 pointer-events-none" style={{ left: marca.left, top: marca.top, backgroundColor: valor || undefined }} />}
    </div>
  );
}
