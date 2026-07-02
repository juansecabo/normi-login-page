import { forwardRef, useEffect, useImperativeHandle, useRef, useState, RefObject } from "react";
import { Bold, Italic } from "lucide-react";

/**
 * Editor WYSIWYG para comunicados que viajan por WhatsApp.
 * En pantalla el texto se VE en negrilla/cursiva (como Word); por dentro el
 * valor que se emite usa el formato de WhatsApp (*negrilla*, _cursiva_), que
 * es lo que de verdad se envía y lo que cuenta caracteres.
 */

// ── HTML del editor → texto WhatsApp ───────────────────────────────────────
function htmlToWhatsApp(root: HTMLElement | null): string {
  if (!root) return "";
  type Seg = { t: string; b: boolean; i: boolean };
  const segs: Seg[] = [];

  const walk = (node: Node, b: boolean, i: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      segs.push({ t: node.textContent || "", b, i });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    if (tag === "BR") { segs.push({ t: "\n", b: false, i: false }); return; }
    const fw = node.style.fontWeight;
    const nb = b || tag === "B" || tag === "STRONG" || fw === "bold" || (parseInt(fw, 10) || 0) >= 600;
    const ni = i || tag === "I" || tag === "EM" || node.style.fontStyle === "italic";
    // Cada bloque (línea del editor) inicia en línea nueva.
    if ((tag === "DIV" || tag === "P") && segs.length > 0 && segs[segs.length - 1].t !== "\n") {
      segs.push({ t: "\n", b: false, i: false });
    }
    node.childNodes.forEach((c) => walk(c, nb, ni));
  };
  root.childNodes.forEach((c) => walk(c, false, false));

  // Unir tramos contiguos con el mismo formato
  const merged: Seg[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && last.b === s.b && last.i === s.i) last.t += s.t;
    else merged.push({ ...s });
  }

  let out = "";
  for (const s of merged) {
    if (!s.b && !s.i) { out += s.t; continue; }
    // Espacios de borde FUERA de los marcadores (WhatsApp no formatea "* x *")
    const lead = (s.t.match(/^\s*/) as RegExpMatchArray)[0];
    const trail = s.t.length > lead.length ? (s.t.match(/\s*$/) as RegExpMatchArray)[0] : "";
    const core = s.t.slice(lead.length, s.t.length - trail.length);
    if (!core) { out += s.t; continue; }
    let w = core;
    if (s.i) w = `_${w}_`;
    if (s.b) w = `*${w}*`;
    out += lead + w + trail;
  }
  return /^\s*$/.test(out) ? "" : out;
}

// ── texto WhatsApp → HTML (para restaurar valor externo, ej. al limpiar) ───
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function whatsappToHtml(v: string): string {
  if (!v) return "";
  let h = escapeHtml(v);
  h = h.replace(/\*([^*\n]+)\*/g, "<b>$1</b>");
  h = h.replace(/_([^_\n]+)_/g, "<i>$1</i>");
  return h.replace(/\n/g, "<br>");
}

function ejecutar(cmd: "bold" | "italic") {
  document.execCommand("styleWithCSS", false, "false");
  document.execCommand(cmd);
  // La toolbar escucha esto para pintar el boton como activo/inactivo
  window.dispatchEvent(new Event("formato-wa-estado"));
}

export interface EditorComunicadoHandle { exec: (cmd: "bold" | "italic") => void; }

export const EditorComunicado = forwardRef<EditorComunicadoHandle, {
  valor: string;
  setValor: (v: string) => void;
  placeholder?: string;
}>(({ valor, setValor, placeholder }, ref) => {
  const divRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string>("");

  const serialize = () => {
    const el = divRef.current;
    if (!el) return;
    const v = htmlToWhatsApp(el);
    lastEmitted.current = v;
    setValor(v);
  };

  // Editor "vacío" suele quedar con un <br> residual: limpiarlo al salir para
  // que vuelva el placeholder (CSS :empty). No se hace durante la escritura
  // porque resetear innerHTML cancela el formato activado con el cursor.
  const limpiarSiVacio = () => {
    const el = divRef.current;
    if (el && htmlToWhatsApp(el) === "" && el.innerHTML !== "") el.innerHTML = "";
  };

  useImperativeHandle(ref, () => ({
    exec: (cmd) => {
      divRef.current?.focus();
      ejecutar(cmd);
      serialize();
    },
  }));

  // Cambios de valor desde afuera (limpiar formulario, prefill de reenvío...)
  useEffect(() => {
    if (valor !== lastEmitted.current && divRef.current) {
      divRef.current.innerHTML = whatsappToHtml(valor);
      lastEmitted.current = valor;
    }
  }, [valor]);

  return (
    <div
      ref={divRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      data-placeholder={placeholder || ""}
      onInput={serialize}
      onBlur={limpiarSiVacio}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "b" || e.key.toLowerCase() === "i")) {
          e.preventDefault();
          ejecutar(e.key.toLowerCase() === "b" ? "bold" : "italic");
          serialize();
        }
      }}
      onPaste={(e) => {
        // Pegar SIEMPRE como texto plano (sin estilos de Word/web ajenos)
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
      className="min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm whitespace-pre-wrap break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none"
    />
  );
});
EditorComunicado.displayName = "EditorComunicado";

export default function FormatoWhatsAppToolbar({ editorRef }: {
  editorRef: RefObject<EditorComunicadoHandle>;
}) {
  const [activo, setActivo] = useState({ b: false, i: false });

  useEffect(() => {
    const update = () => {
      try {
        setActivo({
          b: document.queryCommandState("bold"),
          i: document.queryCommandState("italic"),
        });
      } catch { /* queryCommandState puede fallar fuera de un editable */ }
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("formato-wa-estado", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("formato-wa-estado", update);
    };
  }, []);

  const btn = (on: boolean) =>
    `p-1.5 rounded border cursor-pointer transition-colors ${
      on
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-background hover:bg-muted/60 text-foreground"
    }`;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        title="Negrilla (Ctrl+B)"
        aria-label="Negrilla"
        aria-pressed={activo.b}
        className={btn(activo.b)}
        onMouseDown={(e) => e.preventDefault() /* no robar el foco ni la selección */}
        onClick={() => editorRef.current?.exec("bold")}
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Cursiva (Ctrl+I)"
        aria-label="Cursiva"
        aria-pressed={activo.i}
        className={btn(activo.i)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editorRef.current?.exec("italic")}
      >
        <Italic className="h-4 w-4" />
      </button>
    </div>
  );
}
