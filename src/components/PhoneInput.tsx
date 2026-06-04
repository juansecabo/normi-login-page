import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

/**
 * Input de teléfono con selector de país (indicativo). El `value` es el número
 * completo en dígitos con indicativo (formato WhatsApp, ej. "573001234567"); si
 * no hay número, es "". Colombia (+57) es el país por defecto.
 */

interface Pais {
  nombre: string;
  iso: string;
  dial: string;
}

// Colombia primero (default). El resto, países donde podría usarse la plataforma.
const PAISES: Pais[] = [
  { nombre: "Colombia", iso: "CO", dial: "57" },
  { nombre: "Argentina", iso: "AR", dial: "54" },
  { nombre: "Bolivia", iso: "BO", dial: "591" },
  { nombre: "Brasil", iso: "BR", dial: "55" },
  { nombre: "Chile", iso: "CL", dial: "56" },
  { nombre: "Costa Rica", iso: "CR", dial: "506" },
  { nombre: "Cuba", iso: "CU", dial: "53" },
  { nombre: "Ecuador", iso: "EC", dial: "593" },
  { nombre: "El Salvador", iso: "SV", dial: "503" },
  { nombre: "España", iso: "ES", dial: "34" },
  { nombre: "Estados Unidos", iso: "US", dial: "1" },
  { nombre: "Guatemala", iso: "GT", dial: "502" },
  { nombre: "Honduras", iso: "HN", dial: "504" },
  { nombre: "México", iso: "MX", dial: "52" },
  { nombre: "Nicaragua", iso: "NI", dial: "505" },
  { nombre: "Panamá", iso: "PA", dial: "507" },
  { nombre: "Paraguay", iso: "PY", dial: "595" },
  { nombre: "Perú", iso: "PE", dial: "51" },
  { nombre: "Rep. Dominicana", iso: "DO", dial: "1809" },
  { nombre: "Uruguay", iso: "UY", dial: "598" },
  { nombre: "Venezuela", iso: "VE", dial: "58" },
];

const DEFAULT_DIAL = "57";

const soloDigitos = (s: string) => (s || "").replace(/\D/g, "");

// Bandera como imagen (los emoji de bandera no se renderizan en Windows). Se
// usa flagcdn.com, un CDN gratuito de banderas. Si falla, queda solo el indicativo.
const banderaUrl = (iso: string) => `https://flagcdn.com/24x18/${iso.toLowerCase()}.png`;

const Bandera = ({ iso }: { iso: string }) => (
  <img
    src={banderaUrl(iso)}
    alt={iso}
    width={20}
    height={15}
    className="inline-block rounded-[2px] shrink-0"
    loading="lazy"
  />
);

// Separa el indicativo del número a partir del valor completo. Elige el dial
// más largo que sea prefijo (para distinguir 57 de 573, etc.).
function parse(value: string): { dial: string; numero: string } {
  const d = soloDigitos(value);
  if (!d) return { dial: DEFAULT_DIAL, numero: "" };
  const match = PAISES
    .filter((p) => d.startsWith(p.dial))
    .sort((a, b) => b.dial.length - a.dial.length)[0];
  if (match) return { dial: match.dial, numero: d.slice(match.dial.length) };
  return { dial: DEFAULT_DIAL, numero: d };
}

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const PhoneInput = ({ value, onChange, disabled, placeholder }: PhoneInputProps) => {
  const { dial, numero } = parse(value);

  const setDial = (newDial: string) => onChange(numero ? newDial + numero : "");
  const setNumero = (raw: string) => {
    const n = soloDigitos(raw);
    onChange(n ? dial + n : "");
  };

  return (
    <div className="flex gap-2">
      <Select value={dial} onValueChange={setDial} disabled={disabled}>
        <SelectTrigger className={`w-[110px] shrink-0 ${disabled ? "bg-muted" : ""}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAISES.map((p) => (
            <SelectItem key={p.iso} value={p.dial}>
              <span className="flex items-center gap-1.5">
                <Bandera iso={p.iso} /> +{p.dial}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="text"
        inputMode="numeric"
        value={numero}
        onChange={(e) => setNumero(e.target.value)}
        placeholder={placeholder || "Número"}
        readOnly={disabled}
        className={disabled ? "bg-muted" : ""}
      />
    </div>
  );
};

export default PhoneInput;
