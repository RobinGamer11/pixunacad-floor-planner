import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FileText, Settings, Shield } from "lucide-react";

/** Kleines Popup mit Links zu Impressum & Datenschutz. */
export function LegalMenuPopover({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="menu"
      className="min-w-[190px] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
    >
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
        aria-label="Impressum & Datenschutz"
        title="Impressum & Datenschutz"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9 rounded-full border bg-background/95 text-muted-foreground shadow-sm backdrop-blur flex items-center justify-center hover:text-foreground"
      >
        <Settings size={15} />
      </button>
    </div>
  );
}
