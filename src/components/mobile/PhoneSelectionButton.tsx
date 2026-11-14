import { useState } from "react";
import { MousePointerSquareDashed, SlidersHorizontal, BringToFront, SendToBack } from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { phonePanelStore } from "@/lib/phoneLayout";

export function PhoneSelectionButton({ app }: { app: CadApp | null }) {
  const [open, setOpen] = useState(false);
  const [, update] = useState(0);
  const filter = () => {
    if (!app) return;
    app.selectionFilterOpen = true;
    app.onSelectionFilterChange?.();
    phonePanelStore.set("props"); setOpen(false);
  };
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button size="icon" variant="outline" className="phone-canvas-fab" aria-label="Auswahlaktionen" aria-pressed={open}><MousePointerSquareDashed /></Button></PopoverTrigger>
    <PopoverContent align="start" className="z-[100] space-y-1" onPointerDown={e => e.stopPropagation()}>
      <Button variant="ghost" className="w-full justify-start" disabled={!app} onClick={() => { app?.selectAllInActiveCadPlan(); update(n => n + 1); }}><MousePointerSquareDashed />Alles auswählen</Button>
      <Button variant="ghost" className="w-full justify-start" disabled={!app} aria-pressed={!!app?.selectionFilterOpen} onClick={filter}><SlidersHorizontal />Auswahlfilter</Button>
      <Button variant="ghost" className="w-full justify-start" disabled={!app?.canMoveSelectionStack("front")} onClick={() => { app?.moveSelectionStack("front"); update(n => n + 1); }}><BringToFront />In den Vordergrund</Button>
      <Button variant="ghost" className="w-full justify-start" disabled={!app?.canMoveSelectionStack("back")} onClick={() => { app?.moveSelectionStack("back"); update(n => n + 1); }}><SendToBack />In den Hintergrund</Button>
    </PopoverContent>
  </Popover>;
}