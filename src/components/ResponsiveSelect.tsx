import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Option {
  value: string;
  label: string;
}

interface ResponsiveSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  options: Option[];
  disabled?: boolean;
}

/**
 * Native <select> on mobile (better OS picker UX),
 * shadcn Select on desktop (consistent design, always opens down).
 */
const ResponsiveSelect = ({ value, onValueChange, placeholder, options, disabled }: ResponsiveSelectProps) => {
  return (
    <>
      {/* Mobile: native select */}
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={disabled}
        className="md:hidden w-full p-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Desktop: shadcn Select */}
      <div className="hidden md:block">
        <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
};

export default ResponsiveSelect;
