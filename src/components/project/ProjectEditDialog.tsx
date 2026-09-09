/**
 * Gemeinsamer Dialog für Projektdaten.
 *
 * Wird sowohl beim Anlegen eines neuen Projekts als auch beim Bearbeiten
 * eines bestehenden Projekts verwendet. Änderungen werden erst über
 * „Speichern“ übernommen; „Abbrechen“ verwirft alles.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { projectStore, type Project, type CustomField } from "@/lib/projectStore";
import {
  PROJECT_TYPES,
  PROJECT_STATUSES,
  PROJECT_TYPE_OTHER,
  defaultThumbnailForType,
  isPlaceholderThumbnail,
  readAddress,
  composeAddress,
  EMPTY_ADDRESS,
  projectThumbnailSrc,
  thumbnailErrorFallback,
  type ProjectAddress,
} from "@/lib/projectMeta";

export interface ProjectDraft {
  name: string;
  bauherr: string;
  projektTyp: string;
  status: string;
  address: ProjectAddress;
  projektStart: string;
  projektEnde: string;
  konzept: string;
  thumbnail: string;
}

const CARD = { background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" };
const LINE = "hsl(var(--hairline))";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl p-4 sm:p-5" style={CARD}>
      <div
        className="text-[11px] font-semibold tracking-[0.18em] uppercase mb-4"
        style={{ color: "hsl(var(--accent-gold))" }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text", error, disabled, hint,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="block min-w-0">
      <div className="text-xs font-medium text-muted-foreground mb-1.5">{label}</div>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full h-12 rounded-lg border px-3 text-sm bg-transparent outline-none disabled:opacity-60"
        style={{ borderColor: error ? "hsl(0 70% 50%)" : LINE }}
      />
      {hint && !error && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
      {error && <div className="mt-1 text-[11px]" style={{ color: "hsl(0 70% 50%)" }}>{error}</div>}
    </label>
  );
}

function Select({
  label, value, onChange, options, allowEmpty = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  allowEmpty?: boolean;
}) {
  // Unbekannte Bestandswerte bleiben als eigene Option erhalten.
  const list = useMemo(
    () => (value && !options.includes(value) ? [value, ...options] : [...options]),
    [value, options],
  );
  return (
    <label className="block min-w-0">
      <div className="text-xs font-medium text-muted-foreground mb-1.5">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-12 rounded-lg border px-3 text-sm outline-none"
        style={{ borderColor: LINE, background: "hsl(var(--surface))", color: "hsl(var(--ink))" }}
      >
        {allowEmpty && <option value="">Noch nicht hinterlegt</option>}
        {list.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function AutoTextarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 420)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={5}
      placeholder="Leitgedanke und kurze Beschreibung des Projekts …"
      className="w-full max-w-full block resize-none rounded-lg border p-3 text-sm bg-transparent outline-none whitespace-pre-wrap break-words"
      style={{ borderColor: LINE }}
    />
  );
}

export function emptyDraft(): ProjectDraft {
  return {
    name: "Neues Projekt",
    bauherr: "",
    projektTyp: "",
    status: "",
    address: { ...EMPTY_ADDRESS },
    projektStart: "",
    projektEnde: "",
    konzept: "",
    thumbnail: "",
  };
}

export function draftFromProject(p: Project): ProjectDraft {
  return {
    name: p.name,
    bauherr: p.bauherr ?? "",
    projektTyp: p.projektTyp ?? "",
    status: p.status ?? "",
    address: readAddress(p),
    projektStart: p.projektStart ?? "",
    projektEnde: p.projektEnde ?? "",
    konzept: p.konzept ?? "",
    thumbnail: isPlaceholderThumbnail(p.thumbnail) ? "" : p.thumbnail,
  };
}

/** Wandelt einen Entwurf in ein Projekt-Patch (Adresse bleibt zusätzlich als Text). */
export function draftToPatch(d: ProjectDraft, mode: "create" | "edit"): Partial<Project> {
  const composed = composeAddress(d.address);
  const patch: Partial<Project> = {
    name: d.name.trim() || "Neues Projekt",
    bauherr: d.bauherr,
    projektTyp: d.projektTyp,
    status: d.status,
    adrStrasse: d.address.strasse,
    adrHausnummer: d.address.hausnummer,
    adrPlz: d.address.plz,
    adrOrt: d.address.ort,
    adrLand: d.address.land,
    projektStart: d.projektStart,
    projektEnde: d.projektEnde,
    konzept: d.konzept,
  };
  if (composed) patch.ort = composed;
  // Ohne eigenes Bild wird immer das aktuelle Standardbild gespeichert – so
  // verschwinden alte, nur intern gültige Bildadressen dauerhaft.
  patch.thumbnail = d.thumbnail || defaultThumbnailForType(d.projektTyp);
  return patch;
}

interface Props {
  title: string;
  submitLabel: string;
  initial: ProjectDraft;
  /** Bestehendes Projekt – blendet „Weitere Einstellungen“ ein. */
  project?: Project;
  onCancel: () => void;
  onSubmit: (draft: ProjectDraft) => void;
}

export function ProjectEditDialog({ title, submitLabel, initial, project, onCancel, onSubmit }: Props) {
  const [d, setD] = useState<ProjectDraft>(initial);
  const [errors, setErrors] = useState<{ name?: string; ende?: string }>({});
  const fileRef = useRef<HTMLInputElement | null>(null);
  const set = <K extends keyof ProjectDraft>(k: K, v: ProjectDraft[K]) => setD((s) => ({ ...s, [k]: v }));
  const setAddr = (k: keyof ProjectAddress, v: string) =>
    setD((s) => ({ ...s, address: { ...s.address, [k]: v } }));

  const previewSrc = projectThumbnailSrc(d.thumbnail || undefined, d.projektTyp);
  const customFields: CustomField[] = project?.customFields ?? [];

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const r = new FileReader();
    r.onload = () => set("thumbnail", String(r.result));
    r.readAsDataURL(f);
  };

  const submit = () => {
    const next: typeof errors = {};
    if (!d.name.trim()) next.name = "Bitte einen Projektnamen eingeben.";
    if (d.projektStart && d.projektEnde && d.projektEnde < d.projektStart) {
      next.ende = "Das Projektende darf nicht vor dem Projektstart liegen.";
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit(d);
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto p-0 sm:p-6"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full sm:max-w-3xl min-h-full sm:min-h-0 sm:rounded-2xl shadow-xl flex flex-col"
        style={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--hairline))" }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 h-16 border-b"
          style={{ background: "hsl(var(--surface))", borderColor: LINE }}
        >
          <div className="text-base font-semibold">{title}</div>
          <button
            onClick={onCancel}
            className="h-11 w-11 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground"
            title="Abbrechen"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 px-4 sm:px-6 py-5 space-y-4 pb-32 sm:pb-6">
          <Section title="Grunddaten">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Projektname *" value={d.name} onChange={(v) => set("name", v)} error={errors.name} />
              <Field label="Bauherr" value={d.bauherr} onChange={(v) => set("bauherr", v)} placeholder="Optional" />
              <div className="min-w-0">
                <Select
                  label="Projekttyp"
                  value={PROJECT_TYPES.includes(d.projektTyp as never) || !d.projektTyp ? d.projektTyp : PROJECT_TYPE_OTHER}
                  onChange={(v) => set("projektTyp", v)}
                  options={PROJECT_TYPES}
                />
                {(d.projektTyp === PROJECT_TYPE_OTHER || (!!d.projektTyp && !PROJECT_TYPES.includes(d.projektTyp as never))) && (
                  <div className="mt-3">
                    <Field
                      label="Eigene Bezeichnung"
                      value={PROJECT_TYPES.includes(d.projektTyp as never) ? "" : d.projektTyp}
                      onChange={(v) => set("projektTyp", v || PROJECT_TYPE_OTHER)}
                      placeholder="z. B. Innenausbau"
                    />
                  </div>
                )}
              </div>
              <Select label="Status" value={d.status} onChange={(v) => set("status", v)} options={PROJECT_STATUSES} />
            </div>
          </Section>

          <Section title="Adresse">
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
              <div className="sm:col-span-4"><Field label="Straße" value={d.address.strasse} onChange={(v) => setAddr("strasse", v)} /></div>
              <div className="sm:col-span-2"><Field label="Hausnummer" value={d.address.hausnummer} onChange={(v) => setAddr("hausnummer", v)} /></div>
              <div className="sm:col-span-2"><Field label="Postleitzahl" value={d.address.plz} onChange={(v) => setAddr("plz", v)} /></div>
              <div className="sm:col-span-4"><Field label="Ort" value={d.address.ort} onChange={(v) => setAddr("ort", v)} /></div>
              <div className="sm:col-span-6"><Field label="Land" value={d.address.land} onChange={(v) => setAddr("land", v)} /></div>
            </div>
          </Section>

          <Section title="Zeitraum">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Projektstart" type="date" value={d.projektStart} onChange={(v) => set("projektStart", v)} />
              <Field
                label="Geplantes Projektende"
                type="date"
                value={d.projektEnde}
                onChange={(v) => set("projektEnde", v)}
                error={errors.ende}
              />
            </div>
          </Section>

          <Section title="Beschreibung">
            <AutoTextarea value={d.konzept} onChange={(v) => set("konzept", v)} />
          </Section>

          <Section title="Projektbild">
            <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
              <div
                className="w-full sm:w-64 aspect-[16/9] rounded-xl overflow-hidden shrink-0"
                style={{ background: "hsl(var(--surface-muted))", border: `1px solid ${LINE}` }}
              >
                <img
                  src={previewSrc}
                  onError={(e) => thumbnailErrorFallback(e, d.projektTyp)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="h-11 px-4 rounded-lg border text-sm flex items-center gap-2"
                  style={{ borderColor: LINE }}
                >
                  <Upload size={15} /> Bild auswählen
                </button>
                {d.thumbnail && (
                  <button
                    onClick={() => set("thumbnail", "")}
                    className="h-11 px-4 rounded-lg border text-sm flex items-center gap-2"
                    style={{ borderColor: LINE, color: "hsl(0 70% 50%)" }}
                  >
                    <Trash2 size={15} /> Bild entfernen
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
                <div className="w-full text-xs text-muted-foreground flex items-center gap-1.5">
                  <ImageIcon size={13} /> Ohne eigenes Bild wird ein passendes PixunaCAD-Bild zum Projekttyp verwendet.
                </div>
              </div>
            </div>
          </Section>

          {project && customFields.length > 0 && (
            <Section title="Weitere Einstellungen">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {customFields.map((f) => (
                  <Field
                    key={f.id}
                    label={f.label}
                    value={f.value ?? ""}
                    onChange={(v) => projectStore.updateCustomField(project.id, f.id, { value: v })}
                    hint="Wird sofort gespeichert."
                  />
                ))}
              </div>
            </Section>
          )}
        </div>

        <div
          className="sticky bottom-0 flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t"
          style={{ background: "hsl(var(--surface))", borderColor: LINE }}
        >
          <button
            onClick={onCancel}
            className="h-12 px-5 rounded-lg border text-sm font-medium"
            style={{ borderColor: LINE }}
          >
            Abbrechen
          </button>
          <button
            onClick={submit}
            className="h-12 px-6 rounded-lg text-sm font-semibold"
            style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--ink))" }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProjectEditDialog;
