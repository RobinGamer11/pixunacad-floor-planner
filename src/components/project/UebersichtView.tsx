import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Pencil, Image as ImageIcon, User, MapPin, FileText, Flag, CalendarDays, Clock, Lightbulb, X,
} from "lucide-react";
import { projectStore, type Project } from "@/lib/projectStore";
import { useTimeline } from "@/lib/timelineStore";
import { nextAppointment } from "@/lib/projectPeriodSync";
import {
  NOT_SET,
  createdAtLabel,
  formatDateDE,
  isLegacyAssetThumbnail,
  isPlaceholderThumbnail,
  projectThumbnailSrc,
  thumbnailErrorFallback,
} from "@/lib/projectMeta";

interface Props {
  project: Project;
  activeMappeId?: string;
  onSelectMappe?: (id: string) => void;
  /** Öffnet den gemeinsamen Projekt-Bearbeiten-Dialog. */
  onEditProject?: () => void;
}

const CARD: React.CSSProperties = {
  background: "hsl(var(--surface-card))",
  border: "1px solid hsl(var(--hairline))",
};

/**
 * Projektreiter „Übersicht“:
 * Projektbild und Projektinformationen nebeneinander (auf dem Handy
 * untereinander), darunter die Konzept-Karte. Es werden ausschließlich die
 * echten Daten des gewählten Projekts angezeigt.
 */
export function UebersichtView({ project, onEditProject }: Props) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <ProjectImageCard project={project} />
        <ProjectInfoCard project={project} onEdit={onEditProject} />
      </div>
      <KonzeptCard project={project} />
    </div>
  );
}

/* ------------------------------------------------------------- Projektbild */

function ProjectImageCard({ project }: { project: Project }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Alte interne Bildverweise gelten weiterhin als „Bild vorhanden“ und
  // werden über `projectThumbnailSrc` auf das Standardbild aufgelöst.
  const legacyThumb = isLegacyAssetThumbnail(project.thumbnail);
  const hasImage = legacyThumb || !isPlaceholderThumbnail(project.thumbnail);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const r = new FileReader();
    r.onload = () => projectStore.updateProject(project.id, { thumbnail: String(r.result) });
    r.readAsDataURL(f);
    setMenuOpen(false);
  };

  return (
    <section className="rounded-2xl overflow-hidden relative" style={CARD}>
      <div className="relative aspect-[16/10] w-full" style={{ background: "hsl(var(--surface-muted))" }}>
        {hasImage ? (
          <img
            src={projectThumbnailSrc(project.thumbnail, project.projektTyp)}
            onError={(e) => thumbnailErrorFallback(e, project.projektTyp)}
            alt={`Projektbild ${project.name}`}
            className="w-full h-full object-cover"
          />

        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full h-full flex flex-col items-center justify-center gap-3 text-sm"
            style={{ color: "hsl(var(--ink-soft))" }}
          >
            <span
              className="h-14 w-14 rounded-full flex items-center justify-center"
              style={{ background: "hsl(var(--accent-gold) / 0.18)", color: "hsl(var(--accent-gold))" }}
            >
              <ImageIcon size={24} />
            </span>
            Projektbild hinzufügen
          </button>
        )}

        <div className="absolute top-3 right-3">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title="Projektbild bearbeiten"
            className="h-11 w-11 rounded-full flex items-center justify-center shadow"
            style={{ background: "hsl(var(--surface))", color: "hsl(var(--ink))", border: "1px solid hsl(var(--hairline))" }}
          >
            <Pencil size={16} />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 mt-2 min-w-[210px] rounded-lg border shadow-md py-1 text-sm z-20"
              style={{ background: "hsl(var(--surface))", borderColor: "hsl(var(--hairline))" }}
            >
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full px-3 h-11 flex items-center gap-2 hover:bg-muted text-left"
              >
                <ImageIcon size={15} /> {hasImage ? "Bild ersetzen" : "Bild hochladen"}
              </button>
              {hasImage && (
                <button
                  onClick={() => {
                    projectStore.updateProject(project.id, { thumbnail: "" });
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 h-11 flex items-center gap-2 hover:bg-muted text-left"
                  style={{ color: "hsl(0 70% 50%)" }}
                >
                  <X size={15} /> Bild entfernen
                </button>
              )}
            </div>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pick} />
      </div>
    </section>
  );
}

/* --------------------------------------------------- Projektinformationen */

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const empty = !value;
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span className="mt-0.5 shrink-0" style={{ color: "hsl(var(--accent-gold))" }}>{icon}</span>
      <div className="min-w-0">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div
          className="text-base break-words"
          style={{ color: empty ? "hsl(var(--ink-soft))" : "hsl(var(--ink))" }}
        >
          {value || NOT_SET}
        </div>
      </div>
    </div>
  );
}

function ProjectInfoCard({ project, onEdit }: { project: Project; onEdit?: () => void }) {
  // Abo auf die Organisationsdaten, damit der nächste Termin aktuell bleibt.
  useTimeline(project.id);
  const termin = useMemo(() => nextAppointment(project.id), [project.id, project.updatedAt]);
  const terminText = termin ? `${formatDateDE(termin.date)} · ${termin.title}` : "Kein Termin geplant";

  return (
    <section className="rounded-2xl p-5 sm:p-6" style={CARD}>
      <div className="flex items-center gap-3 mb-5">
        <span
          className="h-9 w-9 rounded-lg flex items-center justify-center"
          style={{ background: "hsl(var(--accent-gold) / 0.16)", color: "hsl(var(--accent-gold))" }}
        >
          <FileText size={18} />
        </span>
        <h2 className="text-lg font-semibold">Projektinformationen</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
        <InfoItem icon={<User size={18} />} label="Bauherr" value={project.bauherr ?? ""} />
        <InfoItem icon={<Flag size={18} />} label="Status" value={project.status ?? ""} />
        <InfoItem icon={<MapPin size={18} />} label="Projektadresse" value={project.ort ?? ""} />
        <InfoItem icon={<CalendarDays size={18} />} label="Erstellt am" value={createdAtLabel(project)} />
        <InfoItem icon={<FileText size={18} />} label="Projekttyp" value={project.projektTyp ?? ""} />
        <InfoItem icon={<Clock size={18} />} label="Nächster Termin" value={terminText} />
      </div>

      <button
        onClick={onEdit}
        className="mt-6 w-full h-12 rounded-lg border text-sm font-medium flex items-center justify-center gap-2"
        style={{ borderColor: "hsl(var(--accent-gold) / 0.6)", color: "hsl(var(--accent-gold))" }}
      >
        <Pencil size={15} /> Projektinformationen bearbeiten
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ Konzept */

function KonzeptCard({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false);
  const title = project.konzeptTitle ?? "Konzept";

  return (
    <section className="rounded-2xl p-5 sm:p-6" style={CARD}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <span
          className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "hsl(var(--accent-gold) / 0.16)", color: "hsl(var(--accent-gold))" }}
        >
          <Lightbulb size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">Leitgedanke und kurze Beschreibung des Projekts</p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="h-12 px-5 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 shrink-0"
          style={{ borderColor: "hsl(var(--accent-gold) / 0.6)", color: "hsl(var(--accent-gold))" }}
        >
          <Pencil size={15} /> Konzept bearbeiten
        </button>
      </div>

      <div className="mt-5 pt-5 border-t" style={{ borderColor: "hsl(var(--hairline))" }}>
        <p className="text-base leading-relaxed whitespace-pre-wrap break-words"
          style={{ color: project.konzept ? "hsl(var(--ink))" : "hsl(var(--ink-soft))" }}>
          {project.konzept || "Noch keine Projektbeschreibung hinterlegt."}
        </p>
      </div>

      {editing && (
        <KonzeptDialog
          initial={project.konzept ?? ""}
          onCancel={() => setEditing(false)}
          onSave={(v) => {
            projectStore.updateProject(project.id, { konzept: v });
            setEditing(false);
          }}
        />
      )}
    </section>
  );
}

function KonzeptDialog({
  initial, onCancel, onSave,
}: { initial: string; onCancel: () => void; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 460)}px`;
  }, [draft]);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto p-0 sm:p-6"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full sm:max-w-2xl min-h-full sm:min-h-0 sm:rounded-2xl shadow-xl flex flex-col"
        style={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--hairline))" }}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 h-16 border-b" style={{ borderColor: "hsl(var(--hairline))" }}>
          <div className="text-base font-semibold">Konzept bearbeiten</div>
          <button onClick={onCancel} className="h-11 w-11 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 px-4 sm:px-6 py-5 pb-28 sm:pb-5">
          <textarea
            ref={ref}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            placeholder="Leitgedanke und kurze Beschreibung des Projekts …"
            className="w-full max-w-full block resize-none rounded-lg border p-3 text-sm bg-transparent outline-none whitespace-pre-wrap break-words"
            style={{ borderColor: "hsl(var(--hairline))" }}
          />
        </div>
        <div
          className="sticky bottom-0 flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t"
          style={{ background: "hsl(var(--surface))", borderColor: "hsl(var(--hairline))" }}
        >
          <button onClick={onCancel} className="h-12 px-5 rounded-lg border text-sm font-medium" style={{ borderColor: "hsl(var(--hairline))" }}>
            Abbrechen
          </button>
          <button
            onClick={() => onSave(draft)}
            className="h-12 px-6 rounded-lg text-sm font-semibold"
            style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--ink))" }}
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

export default UebersichtView;
