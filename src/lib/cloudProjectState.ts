/**
 * Entscheidungsregeln für die kontoübergreifende Projektspeicherung.
 *
 * Reine Funktionen ohne Netz- oder Speicherzugriff, damit CAD und
 * Projektmappe exakt dieselbe Regel verwenden und sie testbar bleibt.
 *
 * Grundsätze:
 *  - Ein leerer Cloudstand ist nie verbindlich (kein halbfertiger Erststand).
 *  - Lokaler Leerstand überschreibt nie einen Cloudstand.
 *  - Zwei unterschiedliche, nicht leere Stände werden nie automatisch
 *    vermischt – es muss ausdrücklich gewählt werden.
 *  - Offene lokale Änderungen werden nie still überschrieben.
 */
export type OpenDecision =
  /** Cloudstand übernehmen (ersetzt den lokalen Stand dieses Projekts). */
  | "apply"
  /** Noch kein Cloud-Erststand – nur auf diesem Gerät. */
  | "deviceOnly"
  /** Gerätestand und Cloudstand weichen ab – ausdrückliche Wahl nötig. */
  | "conflict"
  /** Neuerer Cloudstand, aber lokale offene Änderungen. */
  | "updateAvailable"
  /** Nichts zu tun. */
  | "idle";

export interface OpenFacts {
  /** Auf diesem Gerät wurde schon einmal ein Cloudstand bestätigt. */
  hasBaseline: boolean;
  /** Anzahl echter Inhaltsobjekte lokal (ohne Strukturobjekte). */
  localContent: number;
  /** Anzahl nicht gelöschter Objekte in der Cloud. */
  remoteLive: number;
  /** Lokale, noch nicht gesicherte Änderungen. */
  pending: number;
  /** Cloud hat seit dem letzten Abgleich dieses Geräts neue Änderungen. */
  remoteChanged: boolean;
}

export function decideOpen(f: OpenFacts): OpenDecision {
  if (!f.hasBaseline) {
    if (f.remoteLive === 0) return f.localContent > 0 ? "deviceOnly" : "apply";
    if (f.localContent === 0) return "apply";
    return "conflict";
  }
  if (f.remoteLive === 0 && f.localContent > 0 && f.pending > 0) return "deviceOnly";
  if (f.pending === 0) return f.remoteChanged ? "apply" : "idle";
  return f.remoteChanged ? "updateAvailable" : "idle";
}

/** Zuletzt gesehene Cloud-Sequenz je Gerät (nur eine Zahl, keine Inhalte). */
export function loadSeenSeq(baseKey: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(`${baseKey}.seq`);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function saveSeenSeq(baseKey: string, seq: number): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(`${baseKey}.seq`, String(seq)); } catch { /* entbehrlich */ }
}

/**
 * Lokale Sicherheitskopie vor „Gerätestand als Hauptstand übernehmen“.
 * Zuerst im lokalen Speicher; passt sie dort nicht hinein, wird sie als Datei
 * heruntergeladen – die Kopie geht also nie verloren.
 */
export function writeSafetyCopy(scope: "cad", projectId: string, content: string): void {
  if (typeof window === "undefined") return;
  const key = `pixuna.cloudbackup.${scope}.${projectId}`;
  try {
    window.localStorage.setItem(key, JSON.stringify({ at: new Date().toISOString(), content }));
    return;
  } catch { /* Speicher voll → Datei */ }
  try {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pixuna-sicherheitskopie-${scope}-${projectId}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch { /* nichts weiter möglich */ }
}
