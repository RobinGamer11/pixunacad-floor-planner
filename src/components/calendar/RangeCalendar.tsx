import { useMemo, useState } from "react";

/**
 * Gemeinsamer Kalender für Organisation (Startseite, Projekt) und Orga-Oberfläche.
 * Umschaltbar zwischen Monat, Woche und Tag – Default ist Monat.
 */
export type CalRange = "month" | "week" | "day";

export interface CalEntry {
  id: string;
  /** ISO-Datum YYYY-MM-DD */
  date?: string;
  title: string;
  color: string;
  /** Zusatzzeile (Projekt, Kategorie, Uhrzeit …) */
  sub?: string;
  done?: boolean;
  onOpen?: () => void;
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const startOfWeek = (d: Date) => {
  const c = new Date(d);
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  c.setHours(0, 0, 0, 0);
  return c;
};

export function RangeCalendar({
  entries,
  selectedDates,
  onSelectDate,
  defaultRange = "month",
  cellHeight = 64,
}: {
  entries: CalEntry[];
  selectedDates: string[];
  onSelectDate: (date: string, additive: boolean) => void;
  defaultRange?: CalRange;
  cellHeight?: number;
}) {
  const [range, setRange] = useState<CalRange>(defaultRange);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  /** Zuletzt gewählter Tag – bestimmt, welcher Zeitraum beim Umschalten gezeigt wird. */
  const anchorIso = selectedDates.length ? selectedDates[selectedDates.length - 1] : null;

  /** Kalender folgt der Auswahl (auch bei Auswahl aus einer anderen Ansicht). */
  useEffect(() => {
    if (!anchorIso) return;
    const [y, m, d] = anchorIso.split("-").map(Number);
    if (!y || !m || !d) return;
    const next = new Date(y, m - 1, d);
    next.setHours(0, 0, 0, 0);
    setCursor((cur) => (iso(cur) === iso(next) ? cur : next));
  }, [anchorIso]);

  /** Beim Wechsel Monat/Woche/Tag auf den ausgewählten Tag springen. */
  const switchRange = (v: CalRange) => {
    setRange(v);
    if (!anchorIso) return;
    const [y, m, d] = anchorIso.split("-").map(Number);
    if (!y || !m || !d) return;
    const next = new Date(y, m - 1, d);
    next.setHours(0, 0, 0, 0);
    setCursor(next);
  };

  const byDate = useMemo(() => {
    const map = new Map<string, CalEntry[]>();
    for (const e of entries) {
      if (!e.date) continue;
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [entries]);

  const todayIso = iso(new Date());

  const shift = (dir: number) => {
    const d = new Date(cursor);
    if (range === "month") d.setMonth(d.getMonth() + dir);
    else if (range === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  };

  const label =
    range === "month"
      ? cursor.toLocaleString("de-DE", { month: "long", year: "numeric" })
      : range === "week"
        ? (() => {
            const s = startOfWeek(cursor);
            const e = new Date(s);
            e.setDate(e.getDate() + 6);
            return `${s.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${e.toLocaleDateString(
              "de-DE",
              { day: "2-digit", month: "2-digit", year: "numeric" },
            )}`;
          })()
        : cursor.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  const Chip = ({ e, big }: { e: CalEntry; big?: boolean }) => (
    <span
      key={e.id}
      title={e.sub ? `${e.title} · ${e.sub}` : e.title}
      onClick={(ev) => {
        if (!e.onOpen) return;
        ev.stopPropagation();
        e.onOpen();
      }}
      className={`rounded-[4px] px-1 truncate ${big ? "text-[11px] leading-[18px]" : "text-[9px] leading-[13px]"} ${
        e.onOpen ? "cursor-pointer" : ""
      }`}
      style={{
        background: e.color,
        color: "hsl(var(--surface))",
        opacity: e.done ? 0.55 : 1,
        textDecoration: e.done ? "line-through" : undefined,
      }}
    >
      {e.title || "Eintrag"}
      {big && e.sub ? ` · ${e.sub}` : ""}
    </span>
  );

  const DayCell = ({ day, height }: { day: Date; height: number }) => {
    const s = iso(day);
    const list = byDate.get(s) ?? [];
    const isSelected = selectedDates.includes(s);
    const isToday = s === todayIso;
    const max = height > 90 ? 6 : 2;
    return (
      <button
        onClick={(e) => onSelectDate(s, e.shiftKey || e.metaKey || e.ctrlKey)}
        className="flex flex-col items-stretch rounded-md relative p-1 gap-0.5 text-left overflow-hidden"
        style={{
          height,
          background: isSelected
            ? "hsl(var(--accent-gold) / 0.2)"
            : list.length
              ? "hsl(var(--surface-muted))"
              : "transparent",
          border: isSelected
            ? "1px solid hsl(var(--accent-gold))"
            : isToday
              ? "1px solid hsl(var(--ink))"
              : "1px solid transparent",
          fontWeight: isToday || isSelected ? 600 : undefined,
        }}
      >
        <span className="leading-none text-[11px]">{day.getDate()}</span>
        {list.slice(0, max).map((e) => (
          <Chip key={e.id} e={e} />
        ))}
        {list.length > max && (
          <span className="text-[9px] leading-none text-muted-foreground">+{list.length - max}</span>
        )}
      </button>
    );
  };

  /* -------------------------------- Ansichten ------------------------------- */
  let body: React.ReactNode = null;

  if (range === "month") {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    body = (
      <>
        <div className="grid grid-cols-7 gap-1 text-[11px] text-muted-foreground text-center">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 mt-1 text-xs">
          {Array.from({ length: lead }).map((_, i) => (
            <div key={`p${i}`} style={{ height: cellHeight }} />
          ))}
          {Array.from({ length: days }, (_, i) => (
            <DayCell
              key={i}
              day={new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)}
              height={cellHeight}
            />
          ))}
        </div>
      </>
    );
  } else if (range === "week") {
    const s = startOfWeek(cursor);
    body = (
      <>
        <div className="grid grid-cols-7 gap-1 text-[11px] text-muted-foreground text-center">
          {WEEKDAYS.map((d, i) => {
            const day = new Date(s);
            day.setDate(s.getDate() + i);
            return (
              <div key={d}>
                {d} {day.getDate()}.
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-7 gap-1 mt-1 text-xs">
          {Array.from({ length: 7 }, (_, i) => {
            const day = new Date(s);
            day.setDate(s.getDate() + i);
            return <DayCell key={i} day={day} height={Math.max(150, cellHeight * 2.4)} />;
          })}
        </div>
      </>
    );
  } else {
    const s = iso(cursor);
    const list = byDate.get(s) ?? [];
    const isSelected = selectedDates.includes(s);
    body = (
      <div
        onClick={(e) => onSelectDate(s, e.shiftKey || e.metaKey || e.ctrlKey)}
        className="rounded-md p-2 cursor-pointer"
        style={{
          border: isSelected ? "1px solid hsl(var(--accent-gold))" : "1px solid hsl(var(--hairline))",
          background: isSelected ? "hsl(var(--accent-gold) / 0.12)" : "hsl(var(--surface-muted))",
          minHeight: 180,
        }}
      >
        {list.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Keine Einträge an diesem Tag.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {list.map((e) => (
              <Chip key={e.id} e={e} big />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => shift(-1)} className="text-muted-foreground hover:text-foreground px-1">
          ‹
        </button>
        <span className="flex-1 text-center text-sm font-medium capitalize truncate">{label}</span>
        <button onClick={() => shift(1)} className="text-muted-foreground hover:text-foreground px-1">
          ›
        </button>
      </div>
      <div className="flex items-center gap-1 mb-2">
        {([
          ["month", "Monat"],
          ["week", "Woche"],
          ["day", "Tag"],
        ] as [CalRange, string][]).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setRange(v)}
            className="h-7 px-2.5 rounded-md border text-[11px] font-medium"
            style={{
              borderColor: range === v ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
              background: range === v ? "hsl(var(--accent-gold) / 0.14)" : "transparent",
              color: range === v ? "hsl(var(--accent-gold))" : "hsl(var(--ink-soft))",
            }}
          >
            {l}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setCursor(new Date())}
          className="h-7 px-2.5 rounded-md border text-[11px]"
          style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}
        >
          Heute
        </button>
      </div>
      {body}
    </div>
  );
}
