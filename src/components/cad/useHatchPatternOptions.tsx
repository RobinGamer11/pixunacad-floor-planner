import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { HATCH_PATTERNS } from "@/cad/hatchPatterns";
import {
  addCustomPattern,
  isCustomPatternId,
  listCustomPatterns,
  onPatternsChanged,
  removeCustomPattern,
} from "@/cad/customHatchPatterns";

export interface PatternOption { id: string; label: string }

/** Eingebaute + benutzerdefinierte Muster, reaktiv auf Änderungen. */
export function useHatchPatternOptions(): PatternOption[] {
  const [, force] = useState(0);
  useEffect(() => onPatternsChanged(() => force((x) => x + 1)), []);
  return [...HATCH_PATTERNS, ...listCustomPatterns().map((p) => ({ id: p.id, label: p.label }))];
}

interface ManageProps {
  /** Aktuell gewähltes Muster. */
  patternId: string;
  disabled?: boolean;
  /** Wird nach dem Hinzufügen/Löschen mit der neuen ID aufgerufen. */
  onSelect: (id: string) => void;
  borderColor: string;
}

/**
 * „Muster hinzufügen“ und (bei eigenen Mustern) „Muster löschen“.
 * Eigene Muster werden als Kachelbild lokal gespeichert.
 */
export const HatchPatternManage: React.FC<ManageProps> = ({ patternId, disabled, onSelect, borderColor }) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const isCustom = isCustomPatternId(patternId);

  const onFile = useCallback((file: File | null | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      if (!src.startsWith("data:")) return;
      const name = window.prompt("Bezeichnung des Musters", file.name.replace(/\.[^.]+$/, "")) ?? "";
      if (!name.trim()) return;
      const p = addCustomPattern(name, src);
      onSelect(p.id);
    };
    reader.readAsDataURL(file);
  }, [onSelect]);

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => { onFile(e.target.files?.[0]); e.currentTarget.value = ""; }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => fileRef.current?.click()}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded border px-2 py-1 text-[10px] ${disabled ? "opacity-50" : "hover:bg-muted"}`}
        style={{ borderColor }}
        title="Eigenes Muster als Kachelbild hinzufügen"
      >
        <Plus size={12} /> Muster hinzufügen
      </button>
      {isCustom && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!window.confirm("Dieses eigene Muster löschen?")) return;
            removeCustomPattern(patternId);
            onSelect(HATCH_PATTERNS[0].id);
          }}
          title="Eigenes Muster löschen"
          className={`flex items-center justify-center rounded border px-2 py-1 text-[10px] ${disabled ? "opacity-50" : "hover:bg-muted"}`}
          style={{ borderColor, color: "hsl(var(--destructive))" }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
};
