import { describe, expect, it } from "vitest";
import { deriveActuals, netMinutes, overlappingEntryIds, sumMinutes, type TimeEntry } from "@/lib/opsStore";

const entry = (over: Partial<TimeEntry> & { id: string; started_at: string; ended_at: string }): TimeEntry => ({
  project_id: "p1",
  item_id: "i1",
  user_id: "u1",
  break_minutes: 0,
  note: null,
  ...over,
} as TimeEntry);

describe("Zeiterfassung – Ableitungen", () => {
  it("zieht Pausen ab und behandelt Zeiträume über Mitternacht", () => {
    const e = entry({ id: "a", started_at: "2026-09-01T22:00:00Z", ended_at: "2026-09-02T02:30:00Z", break_minutes: 30 });
    expect(netMinutes(e)).toBe(240);
  });

  it("leitet Ist-Zeitraum und Aufwand aus mehreren Personen ab", () => {
    const entries = [
      entry({ id: "a", started_at: "2026-09-01T08:00:00Z", ended_at: "2026-09-01T12:00:00Z" }),
      entry({ id: "b", user_id: "u2", started_at: "2026-09-01T10:00:00Z", ended_at: "2026-09-01T16:00:00Z" }),
    ];
    const actual = deriveActuals(entries).get("i1")!;
    expect(actual.startedAt).toBe("2026-09-01T08:00:00Z");
    expect(actual.endedAt).toBe("2026-09-01T16:00:00Z");
    // Personenstunden, nicht kalendarische Dauer.
    expect(actual.minutes).toBe(600);
    expect(sumMinutes(entries)).toBe(600);
  });

  it("erkennt Überschneidungen nur bei derselben Person", () => {
    const entries = [
      entry({ id: "a", started_at: "2026-09-01T08:00:00Z", ended_at: "2026-09-01T12:00:00Z" }),
      entry({ id: "b", started_at: "2026-09-01T11:00:00Z", ended_at: "2026-09-01T13:00:00Z" }),
      entry({ id: "c", user_id: "u2", started_at: "2026-09-01T08:00:00Z", ended_at: "2026-09-01T12:00:00Z" }),
      // Direkt angrenzend ist kein Konflikt.
      entry({ id: "d", user_id: "u2", started_at: "2026-09-01T12:00:00Z", ended_at: "2026-09-01T13:00:00Z" }),
    ];
    expect([...overlappingEntryIds(entries)].sort()).toEqual(["a", "b"]);
  });
});
