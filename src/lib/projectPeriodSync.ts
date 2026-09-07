/**
 * Verbindet den Projektzeitraum (Projektstart/-ende) mit der Organisation.
 *
 * Es wird ausschließlich der vorhandene Projektzeitraum-Eintrag der
 * Zeitstrahl-Daten gepflegt (`isPeriod`). Es entstehen keine täglichen
 * „Projektverlauf“-Einträge und keine zweite Datenhaltung.
 */
import { timelineStore, isPeriodItem, type TlItem } from "@/lib/timelineStore";

export function syncProjectPeriod(projectId: string, start?: string, end?: string) {
  if (!start && !end) return;
  timelineStore.setPeriod(projectId, { start: start || undefined, end: end || undefined });
  const s = timelineStore.getState(projectId);
  const existing = s.items.find((i) => isPeriodItem(i));
  const patch = { startDate: start || existing?.startDate, endDate: end || undefined };
  if (existing) {
    timelineStore.updateItem(projectId, existing.id, patch as Partial<TlItem>);
  } else if (start) {
    timelineStore.addItem(projectId, "event", {
      title: "Projektverlauf",
      isPeriod: true,
      startDate: start,
      endDate: end || undefined,
    } as Partial<TlItem>);
  }
}

/** Nächster zukünftiger Termin eines Projekts aus der Organisation. */
export function nextAppointment(projectId: string, now = new Date()): { date: string; title: string } | null {
  const s = timelineStore.getState(projectId);
  const todayIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const candidates: { date: string; title: string }[] = [];
  for (const item of s.items) {
    if (item.done) continue;
    const period = isPeriodItem(item);
    if (item.startDate && item.startDate >= todayIso) {
      candidates.push({ date: item.startDate, title: period ? "Projektstart" : item.title });
    }
    if (item.endDate && item.endDate >= todayIso) {
      candidates.push({ date: item.endDate, title: period ? "Projektende" : item.title });
    }
  }
  candidates.sort((a, b) => a.date.localeCompare(b.date));
  return candidates[0] ?? null;
}
