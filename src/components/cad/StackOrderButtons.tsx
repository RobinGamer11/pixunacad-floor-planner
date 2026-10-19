import { useEffect, useState } from "react";

interface StackHost {
  canMoveSelectionStack(dir: "front" | "back"): boolean;
  moveSelectionStack(dir: "front" | "back"): boolean;
}

/** Zwei überlagerte Flächen; Pfeil zeigt, wohin die obere Fläche wandert. */
function StackIcon({ dir }: { dir: "front" | "back" }) {
  const front = dir === "front";
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <rect x="2.5" y="7.5" width="9" height="9" rx="1.2" fill={front ? "none" : "currentColor"} fillOpacity={front ? 0 : 0.35} />
      <rect x="6.5" y="3.5" width="9" height="9" rx="1.2" fill={front ? "currentColor" : "hsl(var(--surface-card))"} fillOpacity={front ? 0.35 : 1} />
      {front
        ? <path d="M17 19V14.5M15 16.5l2-2 2 2" />
        : <path d="M17 13.5V18M15 16l2 2 2-2" />}
    </svg>
  );
}

/** „In den Vordergrund“ / „In den Hintergrund“ für die ausgewählten Objekte. */
export function StackOrderButtons({ getApp }: { getApp: () => StackHost | null }) {
  const [can, setCan] = useState({ front: false, back: false });

  useEffect(() => {
    const check = () => {
      const app = getApp();
      let next = { front: false, back: false };
      try { if (app) next = { front: app.canMoveSelectionStack("front"), back: app.canMoveSelectionStack("back") }; } catch { /* Auswahl im Umbau */ }
      setCan((p) => (p.front === next.front && p.back === next.back ? p : next));
    };
    check();
    const t = window.setInterval(check, 350);
    return () => window.clearInterval(t);
  }, [getApp]);

  const btn = (dir: "front" | "back", title: string) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={!can[dir]}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        const app = getApp();
        if (app?.moveSelectionStack(dir)) setCan({ front: app.canMoveSelectionStack("front"), back: app.canMoveSelectionStack("back") });
      }}
      className="h-10 w-10 rounded-full flex items-center justify-center shadow-lg transition-transform enabled:hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: "hsl(var(--surface-card))",
        color: "hsl(var(--ink))",
        border: "1.5px solid hsl(var(--primary) / 0.55)",
      }}
    >
      <StackIcon dir={dir} />
    </button>
  );

  return (
    <>
      {btn("front", "In den Vordergrund")}
      {btn("back", "In den Hintergrund")}
    </>
  );
}
