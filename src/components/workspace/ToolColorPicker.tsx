type ToolColorPickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Einheitliche, kompakte Farbauswahl für Werkzeugeinstellungen. */
export function ToolColorPicker({ label, value, onChange }: ToolColorPickerProps) {
  const pickerValue = HEX_COLOR.test(value) ? value : "#000000";

  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span
        className="relative block h-10 w-full overflow-hidden rounded-md border shadow-inner focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1"
        style={{
          borderColor: "hsl(var(--hairline))",
          backgroundColor: pickerValue,
        }}
      >
        <input
          type="color"
          value={pickerValue}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={`${label} auswählen`}
          title={`${label} auswählen`}
        />
      </span>
      <span className="text-[9px] font-medium tabular-nums tracking-wide text-muted-foreground">
        {pickerValue.toUpperCase()}
      </span>
    </label>
  );
}
