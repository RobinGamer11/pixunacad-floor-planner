import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router-dom";
import { Contrast, FileText, Moon, Settings, Shield, Sun } from "lucide-react";
import { getTheme, isCanvasDark, setCanvasDark, setTheme, subscribeTheme } from "@/lib/theme";

/** Liest die globalen Darstellungs-Einstellungen reaktiv. */
export function useThemeSettings() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "light" as const);
  const canvasDark = useSyncExternalStore(subscribeTheme, isCanvasDark, () => false);
  return { theme, canvasDark };
}

/** Einstellungs-Popup: Darstellung (hell/dunkel/Zeichenfläche) + Rechtliches. */
export function LegalMenuPopover({ onClose }: { onClose: () => void }) {
  const { theme, canvasDark } = useThemeSettings();

  return (
    <div
      role="menu"
      className="min-w-[220px] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Darstellung
      </div>
      <div className="flex items-center gap-1 px-1.5 pb-1.5">
        <ThemeIconButton
          active={theme === "light"}
          title="Helles Design"
          onClick={() => setTheme("light")}
        >
          <Sun size={15} />
        </ThemeIconButton>
        <ThemeIconButton
          active={theme === "dark"}
          title="Dunkles Design"
          onClick={() => setTheme("dark")}
        >
          <Moon size={15} />
        </ThemeIconButton>
        <ThemeIconButton
          active={canvasDark}
          title="Nur Zeichenfläche schwarz (CAD & Projektmappe, auch beim Export)"
          onClick={() => setCanvasDark(!canvasDark)}
        >
          <Contrast size={15} />
        </ThemeIconButton>
      </div>

      <div className="my-1 h-px bg-border" />

      <Link
        to="/impressum"
        role="menuitem"
        onClick={onClose}
        className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] hover:bg-accent hover:text-accent-foreground"
      >
        <FileText size={14} /> Impressum
      </Link>
      <Link
        to="/datenschutz"
        role="menuitem"
        onClick={onClose}
        className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] hover:bg-accent hover:text-accent-foreground"
      >
        <Shield size={14} /> Datenschutz
      </Link>
    </div>
  );
}

function ThemeIconButton({
  active, title, onClick, children,
}: {
  active: boolean; title: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={`h-8 w-8 rounded-md border flex items-center justify-center transition-colors ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** Zahnrad unten links – in allen Oberflächen (außer Startseite, dort in der Sidebar-Fußzeile). */
export default function LegalGearButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (pathname === "/") return null;

  return (
    <div ref={ref} className="fixed bottom-3 left-3 z-[90]" data-hub-control>
      {open && <div className="absolute bottom-11 left-0">{<LegalMenuPopover onClose={() => setOpen(false)} />}</div>}
      <button
        type="button"
        aria-label="Einstellungen"
        title="Einstellungen"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9 rounded-full border bg-background/95 text-muted-foreground shadow-sm backdrop-blur flex items-center justify-center hover:text-foreground"
      >
        <Settings size={15} />
      </button>
    </div>
  );
}
