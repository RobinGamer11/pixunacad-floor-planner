import { useState } from "react";
import { Check, Circle, Loader2, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectOpeningState } from "@/lib/projectOpening";
const phases = ["access", "local", "cloud", "resources", "view"];
const labels = ["Projekt und Zugriff vorbereiten", "Lokalen Stand laden", "Cloudstand prüfen", "Zeichnung und Ressourcen vorbereiten", "Erste Ansicht fertigstellen"];

export function ProjectLoadingScreen({ state, name, onRetry, onHome, onLocal, onCloud, onDevice, onFinished }: {
  state: ProjectOpeningState; name?: string; onRetry: () => void; onHome: () => void;
  onLocal: () => void; onCloud: () => void; onDevice: () => void;
  onFinished?: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const active = phases.indexOf(state.phase);
  return <section className={`project-preparation ${state.phase === "ready" ? "project-preparation-complete" : ""}`} onAnimationEnd={event => { if (event.target === event.currentTarget && state.phase === "ready") onFinished?.(); }} aria-label="Projekt wird vorbereitet" aria-busy={state.phase !== "ready" && !state.error && !state.conflict}>
    <div className="project-preparation-content">
      <div className="project-preparation-brand">Pixuna<span>CAD</span></div>
      {!imageFailed && <img className="project-preparation-image" src="/project-preparation.webp" alt="Goldener Grundriss mit teilweise aufgebauten Wänden, Bäumen, Wegen und Wasserfläche" onError={() => setImageFailed(true)} />}
      <h1 className="text-2xl sm:text-3xl font-semibold">Dein Projekt wird vorbereitet</h1>
      <p className="project-preparation-name">{name ?? "Projekt wird ermittelt …"}</p>
      <div className="project-preparation-progress" role="progressbar" aria-label="Fortschritt der Projektöffnung" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.progress}>
        <progress max={100} value={state.progress} /><span>{state.progress} %</span>
      </div>
      <p className="project-preparation-status" role="status" aria-live="polite">{state.error ?? (state.conflict ? "Geräte- und Cloudstand weichen ab. Bitte einen Stand wählen." : state.offline ? "Lokaler Stand geöffnet – Cloud nicht geprüft" : state.phase === "ready" ? "Dein Projekt ist bereit" : labels[active])}</p>
      <ol className="project-preparation-steps">{labels.map((label, index) => <li key={label} data-state={index === 2 && state.offline ? "waiting" : state.phase === "ready" || index < active ? "done" : index === active ? "active" : "waiting"}>
        {index === 2 && state.offline ? <Circle size={12} /> : state.phase === "ready" || index < active ? <Check size={14} /> : index === active && !state.error && !state.conflict ? <Loader2 size={14} className="motion-safe:animate-spin" /> : <Circle size={12} />}
        <span>{index === 2 && state.offline ? "Cloud nicht geprüft" : label}</span>
      </li>)}</ol>
      {(state.error || state.conflict) && <div className="flex flex-wrap justify-center gap-2 mt-4">
        {state.conflict ? <><Button onClick={onCloud}>Cloudstand laden</Button><Button variant="outline" onClick={onDevice}>Gerätestand übernehmen</Button></> : <Button onClick={onRetry}><RefreshCw />Erneut versuchen</Button>}
        {state.localAvailable && !state.conflict && <Button variant="outline" onClick={onLocal}>Lokalen Stand öffnen</Button>}
        <Button variant="outline" onClick={onHome}><ArrowLeft />Zur Projektübersicht</Button>
      </div>}
    </div>
  </section>;
}