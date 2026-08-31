/**
 * Paket 06 – gemeinsame Auswertung je Projekt: Netto-Arbeitszeit gesamt und
 * je Person. Grundlage sind ausschließlich die erfassten Zeiten (RLS: nur
 * Projektbeteiligte sehen sie).
 */
import { useMemo } from "react";
import { formatMinutes, useTimeEntries } from "@/lib/opsStore";

export function ProjectTimeSummary({
  projectId,
  peopleById,
}: {
  projectId: string;
  peopleById: Map<string, string>;
}) {
  const time = useTimeEntries(projectId);

  const rows = useMemo(
    () => Array.from(time.minutesByUser.entries()).sort((a, b) => b[1] - a[1]),
    [time.minutesByUser],
  );
  const total = rows.reduce((s, [, m]) => s + m, 0);

  if (time.unavailable || !rows.length) return null;

  return (
    <div className="mt-2 text-[11px]" style={{ color: "hsl(var(--ink-soft))" }}>
      <div className="font-medium">Erfasste Zeit: {formatMinutes(total)}</div>
      <div className="flex flex-wrap gap-x-3">
        {rows.map(([userId, minutes]) => (
          <span key={userId}>
            {userId === time.myId ? "Ich" : peopleById.get(userId) ?? "Unbekannt"}: {formatMinutes(minutes)}
          </span>
        ))}
      </div>
    </div>
  );
}
