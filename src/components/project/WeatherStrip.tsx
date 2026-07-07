import { useWeather, weatherLabel } from "@/lib/weather";
import { MapPin } from "lucide-react";

interface Props {
  ort: string | undefined;
}

/**
 * Kompakter Wetter-Streifen für den Projektkopf: heute + 3 Tage,
 * dezent im Karten-Look, passt zum Gold-Akzent des Projektes.
 */
export function WeatherStrip({ ort }: Props) {
  const { data, status } = useWeather(ort);

  if (!ort?.trim()) {
    return (
      <div
        className="mt-4 rounded-xl px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground"
        style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
      >
        <MapPin size={13} />
        Keine Projektadresse hinterlegt — Wetter wird angezeigt, sobald eine Adresse gesetzt ist.
      </div>
    );
  }

  if (status === "loading" || status === "idle") {
    return (
      <div
        className="mt-4 rounded-xl px-4 py-3 text-xs text-muted-foreground"
        style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
      >
        Wetter wird geladen …
      </div>
    );
  }

  if (status !== "ok" || !data) {
    return (
      <div
        className="mt-4 rounded-xl px-4 py-3 text-xs text-muted-foreground"
        style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
      >
        Wetter derzeit nicht verfügbar für „{ort}".
      </div>
    );
  }

  return (
    <div
      className="mt-4 rounded-xl px-4 py-3 flex items-stretch gap-3 flex-wrap"
      style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pr-3" style={{ borderRight: "1px solid hsl(var(--hairline))" }}>
        <MapPin size={12} />
        <span className="truncate max-w-[180px]">{data.location}</span>
      </div>
      {data.days.map((d, i) => {
        const info = weatherLabel(d.code);
        const isToday = i === 0;
        return (
          <div
            key={d.date}
            className="flex items-center gap-2 min-w-0"
            style={{
              paddingRight: i < data.days.length - 1 ? 12 : 0,
              borderRight: i < data.days.length - 1 ? "1px solid hsl(var(--hairline))" : "none",
            }}
          >
            <div
              className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: isToday ? "hsl(var(--accent-gold))" : "hsl(var(--ink-soft))" }}
            >
              {isToday ? "Heute" : d.weekdayShort}
            </div>
            <div className="text-lg leading-none" aria-hidden>
              {info.icon}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">
                {d.tMax}° <span className="text-muted-foreground font-normal">/ {d.tMin}°</span>
              </div>
              <div className="text-[10px] text-muted-foreground leading-tight truncate max-w-[110px]">
                {info.label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
