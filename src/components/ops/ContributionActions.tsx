import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectReadOnly } from "@/lib/projectAccess";
import { deleteContribution } from "@/lib/contributionActions";

export function ContributionActions({ projectId, itemId, onEdit, onDeleted }: {
  projectId: string;
  itemId: string;
  onEdit: () => void;
  onDeleted?: () => void;
}) {
  const readOnly = useProjectReadOnly(projectId);
  return <span className="inline-flex shrink-0 flex-wrap gap-1" onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
    <Button type="button" variant="ghost" size="icon" className="h-11 w-11" disabled={readOnly} title="Beitrag bearbeiten" aria-label="Beitrag bearbeiten" onClick={onEdit}><Pencil /></Button>
    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 contribution-delete-icon" disabled={readOnly} title="Beitrag löschen" aria-label="Beitrag löschen" onClick={() => { if (deleteContribution(projectId, itemId)) onDeleted?.(); }}><Trash2 className="h-4 w-4" /></Button>
  </span>;
}