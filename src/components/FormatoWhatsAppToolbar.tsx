import { RefObject } from "react";
import { Bold, Italic } from "lucide-react";

/**
 * Botonera B / I para textareas cuyo contenido se envía por WhatsApp.
 * WhatsApp formatea *negrilla* y _cursiva_, así que los botones envuelven
 * la selección con esos marcadores, estilo Word: seleccionar y pulsar
 * aplica; volver a pulsar sobre lo ya formateado lo quita (toggle).
 * También soporta Ctrl+B / Ctrl+I vía handleFormatoKeyDown.
 */

export function aplicarFormatoWhatsApp(
  textarea: HTMLTextAreaElement | null,
  marcador: "*" | "_",
  valor: string,
  setValor: (v: string) => void,
): void {
  if (!textarea) return;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  if (start === end) { textarea.focus(); return; } // sin selección no hay qué formatear

  const antes = valor.slice(0, start);
  const sel = valor.slice(start, end);
  const despues = valor.slice(end);

  let nuevo: string;
  let selStart: number;
  let selEnd: number;

  if (sel.length >= 2 && sel.startsWith(marcador) && sel.endsWith(marcador)) {
    // La selección incluye los marcadores → quitarlos
    nuevo = antes + sel.slice(1, -1) + despues;
    selStart = start;
    selEnd = end - 2;
  } else if (antes.endsWith(marcador) && despues.startsWith(marcador)) {
    // Los marcadores están justo afuera de la selección → quitarlos
    nuevo = antes.slice(0, -1) + sel + despues.slice(1);
    selStart = start - 1;
    selEnd = end - 1;
  } else {
    // Aplicar: los espacios de los bordes quedan FUERA de los marcadores
    // (WhatsApp no formatea "* texto *").
    const lead = (sel.match(/^\s*/) as RegExpMatchArray)[0];
    const trail = (sel.match(/\s*$/) as RegExpMatchArray)[0];
    const core = sel.slice(lead.length, sel.length - trail.length);
    if (!core) { textarea.focus(); return; }
    nuevo = antes + lead + marcador + core + marcador + trail + despues;
    selStart = start;
    selEnd = end + 2;
  }

  setValor(nuevo);
  // Restaurar foco y selección después de que React re-renderice.
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(selStart, selEnd);
  });
}

/** Ctrl+B / Ctrl+I dentro del textarea (pasar como onKeyDown). */
export function handleFormatoKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  valor: string,
  setValor: (v: string) => void,
): void {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k !== "b" && k !== "i") return;
  e.preventDefault();
  aplicarFormatoWhatsApp(e.currentTarget, k === "b" ? "*" : "_", valor, setValor);
}

export default function FormatoWhatsAppToolbar({ textareaRef, valor, setValor }: {
  textareaRef: RefObject<HTMLTextAreaElement>;
  valor: string;
  setValor: (v: string) => void;
}) {
  const btn = "p-1.5 rounded border bg-background hover:bg-muted/60 cursor-pointer text-foreground";
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        title="Negrilla (Ctrl+B) — selecciona el texto primero"
        aria-label="Negrilla"
        className={btn}
        onMouseDown={(e) => e.preventDefault() /* no robar el foco ni la selección */}
        onClick={() => aplicarFormatoWhatsApp(textareaRef.current, "*", valor, setValor)}
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Cursiva (Ctrl+I) — selecciona el texto primero"
        aria-label="Cursiva"
        className={btn}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => aplicarFormatoWhatsApp(textareaRef.current, "_", valor, setValor)}
      >
        <Italic className="h-4 w-4" />
      </button>
    </div>
  );
}
