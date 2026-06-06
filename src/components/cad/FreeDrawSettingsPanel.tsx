import React, { useEffect, useRef, useState } from "react";
import type { CadApp } from "@/cad/CadApp";

type LineStyle = "solid" | "dashed" | "dotted" | "dashdot" | "blob" | "image";

const STYLE_OPTIONS: { value: LineStyle; label: string }[] = [
  { value: "solid", label: "Linie" },
  { value: "dashed", label: "Gestrichelt" },
  { value: "dashdot", label: "Punkt-Strich" },
  { value: "dotted", label: "Punkte" },
  { value: "blob", label: "Klekse" },
  { value: "image", label: "Bild-Stempel" },
];

interface Props { app: CadApp | null; }

export const FreeDrawSettingsPanel: React.FC<Props> = ({ app }) => {
  const [color, setColor] = useState("#111111");
  const [thickness, setThickness] = useState(0.03);
  const [opacity, setOpacity] = useState(1);
  const [style, setStyle] = useState<LineStyle>("solid");
  const [gap, setGap] = useState(0.08);
  const [hasRuler, setHasRuler] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState(0.18);
  const [imgSpacing, setImgSpacing] = useState(0.22);
  const [imgRotate, setImgRotate] = useState(true);
  const [labelId, setLabelId] = useState<string>("");
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const [, force] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const syncFromState = () => {
    if (!app) return;
    const stroke = app.getSelectedFreeStroke?.() || null;
    if (stroke) {
      setSelectedStrokeId(stroke.id);
      setColor(stroke.color);
      setThickness(stroke.thicknessM);
      setOpacity(stroke.opacity);
      setStyle(stroke.lineStyle as LineStyle);
      setGap(stroke.gapM);
      setImageSrc(stroke.imageSrc);
      setImgSize(stroke.imageSizeM);
      setImgSpacing(stroke.imageSpacingM);
      setImgRotate(stroke.imageRotateAlongPath);
      setLabelId(stroke.labelId);
    } else {
      setSelectedStrokeId(null);
      setColor(app.defaultFreeColor);
      setThickness(app.defaultFreeThicknessM);
      setOpacity(app.defaultFreeOpacity);
      setStyle(app.defaultFreeLineStyle);
      setGap(app.defaultFreeGapM);
      setImageSrc(app.defaultFreeImageSrc);
      setImgSize(app.defaultFreeImageSizeM);
      setImgSpacing(app.defaultFreeImageSpacingM);
      setImgRotate(app.defaultFreeImageRotate);
      setLabelId(app.activeDrawLabelId);
    }
    setHasRuler(!!app.scene.rulerGuide);
  };

  useEffect(() => {
    if (!app) return;
    syncFromState();
    const prevLabels = app.onLabelsChange;
    app.onLabelsChange = () => { prevLabels?.(); syncFromState(); force(x => x + 1); };
    const prevSel = app.onSelectionChange;
    app.onSelectionChange = () => { prevSel?.(); syncFromState(); force(x => x + 1); };
    return () => { app.onLabelsChange = prevLabels; app.onSelectionChange = prevSel; };
  }, [app]);

  const selectedStroke = () => app?.getSelectedFreeStroke?.() || null;
  const applyToStroke = (mutate: (s: any) => void) => {
    const s = selectedStroke();
    if (s) { mutate(s); app?.requestRender?.(); }
  };

  if (!app) return null;
  const labels = app.labelManager.list();

  const toggleRuler = () => {
    if (!app) return;
    if (app.scene.rulerGuide) {
      app.scene.rulerGuide = null;
      setHasRuler(false);
    } else {
      const rect = app.canvas.getBoundingClientRect();
      const left = app.camera.screenToWorld(rect.width * 0.2, rect.height * 0.5);
      const right = app.camera.screenToWorld(rect.width * 0.8, rect.height * 0.5);
      app.scene.rulerGuide = { a: { x: left.x, y: left.y }, b: { x: right.x, y: right.y } };
      setHasRuler(true);
    }
  };

  const onPickFile = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { alert("Nur Bilddateien (PNG/JPG/SVG/WebP) erlaubt."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setImageSrc(url);
      app.defaultFreeImageSrc = url;
      // Bei Upload automatisch zur Bild-Linienart wechseln.
      setStyle("image");
      app.defaultFreeLineStyle = "image";
    };
    reader.readAsDataURL(f);
  };

  const clearImage = () => {
    setImageSrc(null);
    app.defaultFreeImageSrc = null;
    if (style === "image") {
      setStyle("solid");
      app.defaultFreeLineStyle = "solid";
    }
  };

  return (
    <div className="cad-settings-panel mb-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Freihand</div>
      <div className="space-y-3">
        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Bezeichnungs-ID</span>
          <select
            value={labelId || app.activeDrawLabelId}
            onChange={(e) => { setLabelId(e.target.value); app.setActiveDrawLabelId(e.target.value); app.refreshLabelUI(); }}
            className="cad-settings-select w-full">
            {labels.map(l => (<option key={l.id} value={l.id}>{l.name}</option>))}
          </select>
        </label>

        <label className="block text-xs">

          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Farbe</span>
          <input type="color" value={color}
            onChange={(e) => { setColor(e.target.value); app.defaultFreeColor = e.target.value; }}
            className="w-full h-8 rounded border" />
        </label>

        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Linienart</span>
          <select value={style}
            onChange={(e) => { const v = e.target.value as LineStyle; setStyle(v); app.defaultFreeLineStyle = v; }}
            className="w-full h-8 rounded border bg-background px-2 text-xs">
            {STYLE_OPTIONS.map(o => (
              <option key={o.value} value={o.value} disabled={o.value === "image" && !imageSrc}>{o.label}{o.value === "image" && !imageSrc ? " (Bild laden)" : ""}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>{style === "image" ? "Stempel-Größe (m)" : "Dicke (m)"}: {thickness.toFixed(3)}</span>
          <input type="range" min={0.005} max={style === "image" ? 2 : 0.5} step={style === "image" ? 0.01 : 0.005} value={thickness}
            onChange={(e) => { const v = parseFloat(e.target.value); setThickness(v); app.defaultFreeThicknessM = v; }}
            className="w-full" />
        </label>

        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Transparenz: {Math.round(opacity * 100)}%</span>
          <input type="range" min={0.05} max={1} step={0.05} value={opacity}
            onChange={(e) => { const v = parseFloat(e.target.value); setOpacity(v); app.defaultFreeOpacity = v; }}
            className="w-full" />
        </label>

        {(style === "dashed" || style === "dotted" || style === "dashdot" || style === "blob") && (
          <label className="block text-xs">
            <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>{style === "blob" ? "Abstand (m)" : "Lücke (m)"}: {gap.toFixed(3)}</span>
            <input type="range" min={0.01} max={0.5} step={0.005} value={gap}
              onChange={(e) => { const v = parseFloat(e.target.value); setGap(v); app.defaultFreeGapM = v; }}
              className="w-full" />
          </label>
        )}

        {/* Bild-Stempel-Block */}
        <div className="space-y-2 pt-2" style={{ borderTop: "1px solid hsl(var(--border))" }}>
          <div className="flex items-center gap-2">
            {imageSrc ? (
              <img src={imageSrc} alt="Stempel" className="w-10 h-10 object-contain rounded border" style={{ background: "#fff" }} />
            ) : (
              <div className="w-10 h-10 rounded border flex items-center justify-center text-[10px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>—</div>
            )}
            <div className="flex-1 flex flex-col gap-1">
              <button type="button" onClick={onPickFile} className="cad-toolbar-btn h-7 justify-center text-xs">Bild laden</button>
              {imageSrc && (
                <button type="button" onClick={clearImage} className="cad-toolbar-btn h-6 justify-center text-[10px]">Entfernen</button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          </div>
          {style === "image" && imageSrc && (
            <>
              {/* Größe wird über den Dicke-Slider oben gesteuert. */}
              <label className="block text-xs">
                <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Abstand (m): {imgSpacing.toFixed(3)}</span>
                <input type="range" min={0.02} max={2} step={0.01} value={imgSpacing}
                  onChange={(e) => { const v = parseFloat(e.target.value); setImgSpacing(v); app.defaultFreeImageSpacingM = v; }}
                  className="w-full" />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={imgRotate}
                  onChange={(e) => { setImgRotate(e.target.checked); app.defaultFreeImageRotate = e.target.checked; }} />
                <span style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Mit Pfad-Tangente rotieren</span>
              </label>
            </>
          )}
        </div>

        <button type="button" onClick={toggleRuler}
          className="cad-toolbar-btn w-full justify-center h-9">
          <span className="text-xs">{hasRuler ? "Lineal entfernen" : "Lineal hinzufügen"}</span>
        </button>

        <div className="text-[11px] leading-relaxed pt-2" style={{ color: "hsl(var(--cad-toolbar-muted))", borderTop: "1px solid hsl(var(--border))" }}>
          Maus gedrückt halten → zeichnen. Lineal: an Endpunkten oder Mitte verschiebbar; Stift folgt der Linie.
        </div>
      </div>
    </div>
  );
};
