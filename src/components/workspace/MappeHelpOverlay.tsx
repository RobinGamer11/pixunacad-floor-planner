import React from "react";
import { ClipboardPaste, Copy, Keyboard } from "lucide-react";

type MouseHighlight = "wheel" | "left" | "right";

function MouseGlyph({ highlight, pressed = false }: { highlight: MouseHighlight; pressed?: boolean }) {
  const active = "hsl(var(--surface))";
  const stroke = "hsl(var(--surface) / 0.86)";

  return (
    <svg viewBox="0 0 32 42" className="h-8 w-7" fill="none" aria-hidden="true">
      {highlight === "left" && (
        <path d="M6 16V13C6 6.7 9.7 3 15 3v13H6Z" fill={active} opacity="0.92" />
      )}
      {highlight === "right" && (
        <path d="M17 3c5.3 0 9 3.7 9 10v3h-9V3Z" fill={active} opacity="0.92" />
      )}
      <rect x="5" y="2.5" width="22" height="37" rx="11" stroke={stroke} strokeWidth="1.6" />
      <path d="M16 3v13" stroke={stroke} strokeWidth="1.2" />
      <path d="M5.8 16.5h20.4" stroke={stroke} strokeWidth="1.2" />
      <rect
        x="13.4"
        y={pressed ? "6.8" : "6"}
        width="5.2"
        height="9"
        rx="2.6"
        fill={highlight === "wheel" ? active : "transparent"}
        stroke={stroke}
        strokeWidth="1.2"
      />
      {pressed && highlight === "wheel" && (
        <path d="m12.6 18.4 3.4 3.2 3.4-3.2" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function ShiftClickGlyph() {
  return (
    <div className="relative flex h-8 items-center justify-center" aria-hidden="true">
      <MouseGlyph highlight="left" />
      <span
        className="absolute -right-3 -top-0.5 rounded border px-1 text-[7px] font-bold leading-3"
        style={{
          borderColor: "hsl(var(--surface) / 0.55)",
          background: "hsl(var(--surface) / 0.18)",
          color: "hsl(var(--surface))",
        }}
      >
        Shift
      </span>
    </div>
  );
}

function HelpItem({
  icon,
  shortcut,
  description,
}: {
  icon: React.ReactNode;
  shortcut: string;
  description: string;
}) {
  return (
    <div className="flex min-w-[62px] flex-col items-center justify-end px-1.5 py-1 text-center">
      <div className="mb-1 flex h-8 items-center justify-center">{icon}</div>
      <div className="whitespace-nowrap text-[10px] font-semibold leading-3.5">{shortcut}</div>
      <div className="whitespace-nowrap text-[8px] leading-3 opacity-75">{description}</div>
    </div>
  );
}

function HelpGroup({
  title,
  children,
  bordered = false,
}: {
  title: string;
  children: React.ReactNode;
  bordered?: boolean;
}) {
  return (
    <section
      className="px-2 py-1.5"
      style={bordered ? { borderLeft: "1px solid hsl(var(--surface) / 0.22)" } : undefined}
    >
      <div className="mb-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] opacity-70">{title}</div>
      <div className="flex items-end justify-center">{children}</div>
    </section>
  );
}

function KeyboardGlyph() {
  return <Keyboard className="h-7 w-8" strokeWidth={1.45} aria-hidden="true" />;
}

function HeaderActionGlyph({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-full border"
      style={{ borderColor: "hsl(var(--surface) / 0.44)" }}
    >
      {children}
    </div>
  );
}

/** Rein visuelle, vollständig durchklickbare Schnellhilfe für die Mappe. */
export function MappeHelpOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-14 z-40 flex select-none justify-center px-3"
      aria-hidden="true"
    >
      <div
        className="flex max-w-full flex-wrap items-stretch justify-center overflow-hidden rounded-xl border shadow-xl backdrop-blur-md"
        style={{
          borderColor: "hsl(var(--surface) / 0.24)",
          background: "hsl(var(--ink) / 0.78)",
          color: "hsl(var(--surface))",
        }}
      >
        <HelpGroup title="Navigation">
          <HelpItem icon={<MouseGlyph highlight="wheel" />} shortcut="Mausrad" description="Zoomen" />
          <HelpItem icon={<MouseGlyph highlight="wheel" pressed />} shortcut="Rad gedrückt" description="Bewegen" />
        </HelpGroup>

        <HelpGroup title="Auswahl" bordered>
          <HelpItem icon={<MouseGlyph highlight="left" />} shortcut="L-Klick" description="Auswählen" />
          <HelpItem icon={<MouseGlyph highlight="right" />} shortcut="R-Klick" description="Hilfslinie" />
          <HelpItem icon={<ShiftClickGlyph />} shortcut="Shift + L-Klick" description="Mehrfachauswahl" />
        </HelpGroup>

        <HelpGroup title="Zeichnen & Bearbeiten" bordered>
          <HelpItem icon={<KeyboardGlyph />} shortcut="Enter" description="Objekt setzen" />
          <HelpItem icon={<KeyboardGlyph />} shortcut="ESC" description="Abbrechen" />
          <HelpItem
            icon={<HeaderActionGlyph><Copy size={17} /></HeaderActionGlyph>}
            shortcut="Strg + C"
            description="Kopieren"
          />
          <HelpItem
            icon={<HeaderActionGlyph><ClipboardPaste size={17} /></HeaderActionGlyph>}
            shortcut="Strg + V"
            description="Einfügen"
          />
        </HelpGroup>
      </div>
    </div>
  );
}
