import React, { useEffect, useRef, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";

type LineStyle = "solid" | "dashed" | "dotted" | "dashdot" | "blob" | "image" | "pencil" | "marker" | "brush" | "spray" | "calligraphy" | "ink" | "crayon" | "chalk";

const STYLE_OPTIONS: { value: LineStyle; label: string }[] = [
  { value: "solid", label: "Linie" },
  { value: "dashed", label: "Gestrichelt" },
  { value: "dashdot", label: "Punkt-Strich" },
  { value: "dotted", label: "Punkte" },
  { value: "pencil", label: "Bleistift" },
  { value: "brush", label: "Pinsel" },
  { value: "marker", label: "Marker" },
  { value: "calligraphy", label: "Kalligrafie" },
  { value: "crayon", label: "Wachsmal" },
  { value: "chalk", label: "Kreide" },
  { value: "spray", label: "Sprühdose" },
  { value: "blob", label: "Klekse" },
  { value: "image", label: "Bild-Stempel" },
];

interface Props { app: CadApp | MiniCad | null; units?: "cm" | "m"; }

export const FreeDrawSettingsPanel: React.FC<Props> = ({ app, units = "cm" }) => {

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
  const [autoShape, setAutoShape] = useState(false);
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
    setAutoShape(app.defaultFreeAutoShape);
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

  // CAD-Oberfläche rechnet in Metern: Default-Linienskalierung = 1 m.
  useEffect(() => {
    if (!app || units !== "m") return;
    if ((app.defaultFreeGapM ?? 0) < 0.1) {
      app.defaultFreeGapM = 1;
      setGap(1);
    }
  }, [app, units]);


  const selectedStroke = () => app?.getSelectedFreeStroke?.() || null;
  const applyToStroke = (mutate: (s: any) => void) => {
    const s = selectedStroke();
    if (s) { mutate(s); }
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
      <FreeDrawPreview
        color={color}
        thickness={thickness}
        opacity={opacity}
        style={style}
        gap={gap}
        imageSrc={imageSrc}
        imgSpacing={imgSpacing}
        imgRotate={imgRotate}
      />

      <div className="space-y-3">
        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Ebene{selectedStrokeId ? " (Auswahl)" : ""}</span>
          <select
            value={labelId || app.activeDrawLabelId}
            onChange={(e) => {
              const v = e.target.value;
              setLabelId(v);
              if (selectedStrokeId) {
                applyToStroke((s) => { s.labelId = v; });
              } else {
                app.setActiveDrawLabelId(v);
              }
              app.refreshLabelUI();
            }}
            className="cad-settings-select w-full">
            {labels.map(l => (<option key={l.id} value={l.id}>{l.name}</option>))}
          </select>
        </label>

        <label className="block text-xs">

          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Farbe</span>
          <input type="color" value={color}
            onChange={(e) => {
              const v = e.target.value; setColor(v);
              if (selectedStrokeId) applyToStroke((s) => { s.color = v; });
              else app.defaultFreeColor = v;
            }}
            className="w-full h-8 rounded border" />
        </label>

        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Linienart</span>
          <select value={style}
            onChange={(e) => {
              const v = e.target.value as LineStyle; setStyle(v);
              if (selectedStrokeId) applyToStroke((s) => { s.lineStyle = v; });
              else app.defaultFreeLineStyle = v;
            }}
            className="w-full h-8 rounded border bg-background px-2 text-xs">
            {STYLE_OPTIONS.map(o => (
              <option key={o.value} value={o.value} disabled={o.value === "image" && !imageSrc}>{o.label}{o.value === "image" && !imageSrc ? " (Bild laden)" : ""}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>{style === "image" ? `Stempel-Größe (cm): ${(thickness * 100).toFixed(1)}` : `Liniendicke (cm): ${(thickness * 100).toFixed(2)}`}</span>
          <input type="range"
            min={style === "image" ? 0.02 : 0.0005}
            max={style === "image" ? 2 : 0.3}
            step={style === "image" ? 0.01 : 0.0005}
            value={thickness}
            onChange={(e) => {
              const v = parseFloat(e.target.value); setThickness(v);
              if (selectedStrokeId) applyToStroke((s) => { s.thicknessM = v; });
              else app.defaultFreeThicknessM = v;
            }}
            className="w-full" />
        </label>

        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Transparenz: {Math.round(opacity * 100)}%</span>
          <input type="range" min={0.05} max={1} step={0.05} value={opacity}
            onChange={(e) => {
              const v = parseFloat(e.target.value); setOpacity(v);
              if (selectedStrokeId) applyToStroke((s) => { s.opacity = v; });
              else app.defaultFreeOpacity = v;
            }}
            className="w-full" />
        </label>

        {(style === "dashed" || style === "dotted" || style === "dashdot" || style === "blob") && (
          <label className="block text-xs">
            <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              {style === "blob" ? `Klecks-Abstand (${units})` : `Linienskalierung (${units})`}: {units === "m" ? gap.toFixed(2) : (gap * 100).toFixed(1)}
            </span>
            <input type="range"
              min={units === "m" ? 0.1 : 0.001}
              max={units === "m" ? 1.9 : 0.02}
              step={units === "m" ? 0.05 : 0.0005}
              value={gap}
              onChange={(e) => {
                const v = parseFloat(e.target.value); setGap(v);
                if (selectedStrokeId) applyToStroke((s) => { s.gapM = v; });
                else app.defaultFreeGapM = v;
              }}
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

        <button type="button"
          onClick={() => {
            const v = !autoShape;
            setAutoShape(v);
            app.defaultFreeAutoShape = v;
          }}
          className="cad-toolbar-btn w-full justify-center h-9"
          style={autoShape ? { background: "hsl(var(--cad-toolbar-active))", color: "hsl(var(--cad-toolbar-active-foreground))" } : undefined}
          title="Beim Loslassen werden Geraden geradegezogen und Kreise zu echten Kreisen geformt.">
          <span className="text-xs">{autoShape ? "Auto-Form: AN" : "Auto-Form: AUS"}</span>
        </button>

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

interface PreviewProps {
  color: string;
  thickness: number;
  opacity: number;
  style: LineStyle;
  gap: number;
  imageSrc: string | null;
  imgSpacing: number;
  imgRotate: boolean;
}

const FreeDrawPreview: React.FC<PreviewProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!props.imageSrc) { setImgEl(null); return; }
    const img = new Image();
    img.onload = () => setImgEl(img);
    img.src = props.imageSrc;
  }, [props.imageSrc]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 220;
    const h = 68;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Hintergrund
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "hsl(var(--border))";
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    // Beispielpfad: sanfte Sinuskurve
    const pad = 14;
    const N = 120;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x = pad + t * (w - pad * 2);
      const y = h / 2 + Math.sin(t * Math.PI * 2.2) * (h * 0.28);
      pts.push({ x, y });
    }

    // Pixel-Breite: 1 m ≈ 100 px in Vorschau
    const pxPerM = 100;
    const widthPx = Math.max(0.6, props.thickness * pxPerM);
    const gapPx = Math.max(2, props.gap * pxPerM);
    const spacingPx = Math.max(4, props.imgSpacing * pxPerM);

    ctx.globalAlpha = props.opacity;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = props.color;
    ctx.fillStyle = props.color;
    ctx.lineWidth = widthPx;

    const drawPath = () => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    };

    const style = props.style;
    if (style === "solid") {
      drawPath(); ctx.setLineDash([]); ctx.stroke();
    } else if (style === "dashed") {
      drawPath(); ctx.setLineDash([Math.max(4, widthPx * 3), gapPx]); ctx.stroke();
    } else if (style === "dotted") {
      drawPath(); ctx.setLineDash([0.1, Math.max(3, gapPx * 0.6)]); ctx.stroke();
    } else if (style === "dashdot") {
      drawPath(); ctx.setLineDash([Math.max(6, widthPx * 4), gapPx, 0.1, gapPx]); ctx.stroke();
    } else if (style === "blob") {
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
        const d = Math.hypot(dx, dy);
        acc += d;
        if (acc >= gapPx) {
          acc = 0;
          ctx.beginPath();
          ctx.arc(pts[i].x, pts[i].y, widthPx * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (style === "pencil") {
      // Bleistift: mehrere körnige Passes mit Jitter, keine Dashes.
      const passes = 4;
      for (let pass = 0; pass < passes; pass++) {
        ctx.globalAlpha = props.opacity * 0.22;
        ctx.beginPath();
        pts.forEach((p, i) => {
          const jx = Math.sin(i * 12.9 + pass * 3.1) * 0.6 + Math.cos(i * 2.3 + pass) * 0.4;
          const jy = Math.cos(i * 7.1 + pass * 4.7) * 0.6 + Math.sin(i * 3.7 + pass) * 0.4;
          i ? ctx.lineTo(p.x + jx, p.y + jy) : ctx.moveTo(p.x + jx, p.y + jy);
        });
        ctx.lineWidth = Math.max(0.5, widthPx * (0.55 + pass * 0.12));
        ctx.stroke();
      }
      ctx.globalAlpha = props.opacity;
    } else if (style === "marker") {
      const prev = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = Math.min(1, props.opacity * 0.5);
      ctx.lineWidth = widthPx * 1.4;
      drawPath(); ctx.setLineDash([]); ctx.stroke();
      ctx.globalCompositeOperation = prev;
      ctx.globalAlpha = props.opacity;
    } else if (style === "brush") {
      // Variable Dicke entlang des Pfades
      for (let i = 1; i < pts.length; i++) {
        const t = i / (pts.length - 1);
        const w2 = widthPx * (0.6 + Math.abs(Math.sin(t * Math.PI)) * 0.7);
        ctx.lineWidth = w2;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    } else if (style === "calligraphy") {
      // Feste Ribbon-Achse 45°
      const ang = -Math.PI / 4;
      const dx = Math.cos(ang) * widthPx * 0.5;
      const dy = Math.sin(ang) * widthPx * 0.5;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        i ? ctx.lineTo(p.x + dx, p.y + dy) : ctx.moveTo(p.x + dx, p.y + dy);
      }
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        ctx.lineTo(p.x - dx, p.y - dy);
      }
      ctx.closePath();
      ctx.fill();
    } else if (style === "spray") {
      const density = 6;
      const r = widthPx * 1.4;
      for (let i = 0; i < pts.length; i++) {
        for (let k = 0; k < density; k++) {
          const a = (i * 91 + k * 37) % 360 * (Math.PI / 180);
          const rr = ((i * 13 + k * 29) % 100) / 100 * r;
          ctx.beginPath();
          ctx.arc(pts[i].x + Math.cos(a) * rr, pts[i].y + Math.sin(a) * rr, 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (style === "ink") {
      // Tinte: sanft taperende Enden, volle Mitte, weiche Rundungen.
      const n = pts.length;
      for (let i = 1; i < n; i++) {
        const tMid = (i - 0.5) / (n - 1);
        // Nur an den Enden dünner, sonst 100 %.
        const taper = Math.min(1, Math.min(tMid, 1 - tMid) * 6);
        ctx.lineWidth = Math.max(0.4, widthPx * (0.15 + 0.85 * taper));
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    } else if (style === "crayon") {
      // Wachsmal: 3 leicht versetzte, körnige Passes mit Multiply-Optik.
      const prev = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "multiply";
      for (let pass = 0; pass < 3; pass++) {
        ctx.globalAlpha = props.opacity * 0.35;
        ctx.lineWidth = widthPx * (0.9 + pass * 0.15);
        ctx.beginPath();
        pts.forEach((p, i) => {
          const jx = Math.sin(i * 5.3 + pass * 2.1) * 0.9;
          const jy = Math.cos(i * 4.7 + pass * 1.9) * 0.9;
          i ? ctx.lineTo(p.x + jx, p.y + jy) : ctx.moveTo(p.x + jx, p.y + jy);
        });
        ctx.stroke();
      }
      ctx.globalCompositeOperation = prev;
      ctx.globalAlpha = props.opacity;
    } else if (style === "chalk") {
      // Kreide: körniges Rauschen entlang des Pfades, keine durchgezogene Linie.
      const density = 5;
      const r = widthPx * 0.6;
      for (let i = 0; i < pts.length; i++) {
        for (let k = 0; k < density; k++) {
          const a = ((i * 53 + k * 91) % 360) * (Math.PI / 180);
          const rr = (((i * 17 + k * 41) % 100) / 100) * r;
          ctx.globalAlpha = props.opacity * (0.35 + ((k * 7) % 30) / 100);
          ctx.beginPath();
          ctx.arc(pts[i].x + Math.cos(a) * rr, pts[i].y + Math.sin(a) * rr, Math.max(0.3, widthPx * 0.18), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = props.opacity;
    } else if (style === "image" && imgEl) {
      const size = Math.max(6, widthPx);
      let acc = spacingPx;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
        const d = Math.hypot(dx, dy);
        acc += d;
        if (acc >= spacingPx) {
          acc = 0;
          const ang = props.imgRotate ? Math.atan2(dy, dx) : 0;
          ctx.save();
          ctx.translate(pts[i].x, pts[i].y);
          ctx.rotate(ang);
          ctx.drawImage(imgEl, -size / 2, -size / 2, size, size);
          ctx.restore();
        }
      }
    } else if (style === "image") {
      ctx.fillStyle = "hsl(var(--cad-toolbar-muted))";
      ctx.font = "11px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Bild laden für Vorschau", w / 2, h / 2 + 4);
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }, [props, imgEl]);

  return (
    <div className="mb-3">
      <canvas ref={canvasRef} style={{ width: "100%", height: 68, display: "block", borderRadius: 4 }} />
    </div>
  );
};

