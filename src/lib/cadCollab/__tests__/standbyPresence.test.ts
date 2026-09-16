import { beforeEach, describe, expect, it, vi } from "vitest";

/** Kanal-Attrappe: zählt Presence-Meldungen. */
const tracks: unknown[] = [];
const channel = {
  on() { return channel; },
  subscribe(cb: (state: string) => void) { setTimeout(() => cb("SUBSCRIBED"), 0); return channel; },
  track(payload: unknown) { tracks.push(payload); return Promise.resolve("ok"); },
  presenceState() { return {}; },
  send() { return Promise.resolve("ok"); },
};

/** Tabellenabfragen liefern leere Ergebnisse (noch nichts in der Cloud). */
const emptyQuery: Record<string, unknown> = {};
["select", "eq", "gt", "order", "limit"].forEach((fn) => {
  emptyQuery[fn] = () => emptyQuery;
});
emptyQuery.maybeSingle = () => Promise.resolve({ data: null, error: null });
emptyQuery.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });

vi.mock("@/lib/networkClient", () => ({
  isMissingSchemaError: () => false,
  getNetworkClient: () => ({
    channel: () => channel,
    removeChannel: () => Promise.resolve("ok"),
    from: () => emptyQuery,
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}));

vi.mock("@/lib/projectAccess", () => ({
  projectAccessStore: {
    accessFor: () => ({ shared: true, role: "editor" }),
    otherMemberCount: () => 1,
    canEdit: () => true,
  },
}));

import { CadCollabSession } from "../session";

const app = {
  scenesById: new Map<string, unknown>(),
  activeSheetId: "sheet-1",
  serializeForCollab: () => null,
};

describe("CAD-Standby: keine wiederholten Presence-Meldungen", () => {
  beforeEach(() => { tracks.length = 0; });

  it("sendet nach der Startmeldung nichts mehr bei Zeiger-, Auswahl- oder Blattwechsel", async () => {
    const session = new CadCollabSession({
      projectId: "p1",
      userId: "u1",
      displayName: "Phil",
      app,
      requestRender: () => {},
    });
    await session.start();
    await new Promise((r) => setTimeout(r, 5));
    expect(tracks).toHaveLength(1);

    for (let i = 0; i < 20; i++) {
      session.updatePresence({ cursor: { x: i, y: i } });
    }
    session.updatePresence({ sheetId: "sheet-2" });
    await session.lockObject("sheet-1", "obj-1");
    await session.unlockObject("sheet-1", "obj-1");

    expect(tracks).toHaveLength(1);
    session.destroy();
  });
});
