/**
 * Dezente Präsenzanzeige: wer arbeitet gerade mit an dieser Zeichnung.
 * Bewusst klein gehalten – keine zusätzlichen Panels oder Hilfebereiche.
 */
import { initialsOf, type CadPresenceUser } from "@/lib/cadCollab/types";

interface Props {
  peers: CadPresenceUser[];
  connected: boolean;
}

export function CadPresenceBar({ peers, connected }: Props) {
  if (!connected || peers.length === 0) return null;
  return (
    <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 backdrop-blur">
      {peers.slice(0, 5).map((peer) => (
        <span
          key={peer.userId}
          title={peer.editingObjectId ? `${peer.displayName} bearbeitet gerade ein Objekt` : peer.displayName}
          className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-background"
          style={{ background: peer.color }}
        >
          {initialsOf(peer.displayName)}
        </span>
      ))}
      {peers.length > 5 && (
        <span className="px-1 text-[11px] text-muted-foreground">+{peers.length - 5}</span>
      )}
    </div>
  );
}
