/**
 * Kommentare (Paket 07) – zentrale Datenbasis für CAD, Projektmappe und
 * Team-Auswertung.
 *
 * Grundsätze:
 *  - Genau eine Tabelle (`project_comments`), keine zweite Zählerhaltung.
 *  - Autor, Projektzuordnung und Zeitstempel setzt der Server (Trigger + RLS,
 *    siehe db/migrations/20260902090000_comments.sql).
 *  - Es wird immer nur der benötigte Ausschnitt geladen (Projekt + Kontext +
 *    Blatt/Seite). Keine Dauerabfragen: Aktualisierungen kommen über den
 *    vorhandenen Realtime-Kanal.
 *  - Kommentare sind KEINE Zeichenobjekte: sie werden getrennt gespeichert und
 *    berühren weder Projektdokument noch Workspace-Sync.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getNetworkClient, networkConfigured } from "@/lib/networkClient";
import { supabase as authClient } from "@/lib/supabase";

export type CommentContext = "cad" | "mappe";
export type CommentStatus = "open" | "done";

export interface ProjectComment {
  id: string;
  project_id: string;
  context: CommentContext;
  sheet_id: string;
  book_id: string | null;
  pos_x: number;
  pos_y: number;
  body: string;
  author_id: string;
  status: CommentStatus;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  /** Antwort auf einen anderen Kommentar (null = Ausgangskommentar). */
  parent_id: string | null;
  /** Erwähnte Benutzer-IDs – reine Information, keine Rechtevergabe. */
  mentions: string[];
}

export interface CommentAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

const COLUMNS =
  "id,project_id,context,sheet_id,book_id,pos_x,pos_y,body,author_id,status,created_at,updated_at,edited_at,resolved_at,resolved_by,parent_id,mentions";


/* ------------------------------------------------ Kommentarmodus (UI-Zustand) */

interface CommentUiState {
  /** Aktiv = nächster Klick auf der Zeichenfläche setzt einen Pin. */
  mode: boolean;
  /** Pins ein-/ausblenden. */
  visible: boolean;
  /** Statusfilter der Pins. */
  filter: "all" | "open" | "done";
}

let uiState: CommentUiState = { mode: false, visible: true, filter: "all" };
const uiListeners = new Set<() => void>();
const emitUi = () => uiListeners.forEach((fn) => fn());

export const commentUi = {
  getState: () => uiState,
  subscribe(fn: () => void) {
    uiListeners.add(fn);
    return () => { uiListeners.delete(fn); };
  },
  set(patch: Partial<CommentUiState>) {
    uiState = { ...uiState, ...patch };
    emitUi();
  },
  toggleMode() { commentUi.set({ mode: !uiState.mode, visible: true }); },
  exitMode() { if (uiState.mode) commentUi.set({ mode: false }); },
};

export function useCommentUi(): CommentUiState {
  return useSyncExternalStore(commentUi.subscribe, commentUi.getState, commentUi.getState);
}

/* --------------------------------------------------------------- Zielsprung */

export interface CommentTarget {
  projectId: string;
  context: CommentContext;
  sheetId: string;
  bookId: string | null;
  commentId: string;
}

let pendingTarget: CommentTarget | null = null;
const targetListeners = new Set<() => void>();

export const commentNavigation = {
  request(target: CommentTarget) {
    pendingTarget = target;
    targetListeners.forEach((fn) => fn());
  },
  peek: () => pendingTarget,
  consume(): CommentTarget | null {
    const t = pendingTarget;
    pendingTarget = null;
    return t;
  },
  subscribe(fn: () => void) {
    targetListeners.add(fn);
    return () => { targetListeners.delete(fn); };
  },
};

/** Liefert einmalig das offene Sprungziel für die angegebene Oberfläche. */
export function useCommentTarget(projectId: string | undefined, context: CommentContext): CommentTarget | null {
  const [target, setTarget] = useState<CommentTarget | null>(null);
  useEffect(() => {
    const check = () => {
      const t = commentNavigation.peek();
      if (t && t.projectId === projectId && t.context === context) {
        commentNavigation.consume();
        setTarget(t);
      }
    };
    check();
    return commentNavigation.subscribe(check);
  }, [projectId, context]);
  return target;
}

/* ------------------------------------------------------------ Profilnamen */

const profileCache = new Map<string, CommentAuthor>();

export function useCommentAuthors(ids: string[]): Map<string, CommentAuthor> {
  const key = useMemo(() => Array.from(new Set(ids)).sort().join(","), [ids]);
  const [, force] = useState(0);

  useEffect(() => {
    const wanted = key ? key.split(",") : [];
    const missing = wanted.filter((id) => id && !profileCache.has(id));
    if (!missing.length || !networkConfigured) return;
    let cancelled = false;
    void (async () => {
      const client = getNetworkClient();
      if (!client) return;
      const { data } = await client.from("profiles").select("id,display_name,avatar_url").in("id", missing);
      const rows = (data ?? []) as { id: string; display_name?: string | null; avatar_url?: string | null }[];
      for (const id of missing) {
        const row = rows.find((r) => r.id === id);
        profileCache.set(id, {
          id,
          name: row?.display_name?.trim() || "Nicht mehr verfügbar",
          avatarUrl: row?.avatar_url ?? null,
        });
      }
      if (!cancelled) force((n) => n + 1);
    })();
    return () => { cancelled = true; };
  }, [key]);

  return useMemo(() => {
    const map = new Map<string, CommentAuthor>();
    for (const id of key ? key.split(",") : []) {
      map.set(id, profileCache.get(id) ?? { id, name: "Wird geladen …", avatarUrl: null });
    }
    return map;
  }, [key]);
}

/** Initialen als Avatar-Ersatzdarstellung. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/* --------------------------------------------------------- Kommentar-Hook */

export interface NewComment {
  posX: number;
  posY: number;
  body: string;
}

export interface CommentsApi {
  comments: ProjectComment[];
  loading: boolean;
  /** Datenbasis erreichbar (angemeldet + Migration eingespielt). */
  ready: boolean;
  error: string | null;
  myId: string | null;
  create: (input: NewComment) => Promise<ProjectComment | null>;
  updateBody: (id: string, body: string) => Promise<boolean>;
  setStatus: (id: string, status: CommentStatus) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  reload: () => Promise<void>;
  canModerate: boolean;
}

export function useSheetComments(opts: {
  projectId: string | undefined;
  context: CommentContext;
  sheetId: string | undefined;
  bookId?: string | null;
  canModerate?: boolean;
}): CommentsApi {
  const { projectId, context, sheetId, bookId = null, canModerate = false } = opts;
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const myId = authClient.getSession()?.user.id ?? null;
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async () => {
    const client = getNetworkClient();
    if (!client || !projectId || !sheetId || !authClient.getSession()) {
      setComments([]);
      setReady(false);
      return;
    }
    setLoading(true);
    try {
      let query = client
        .from("project_comments")
        .select(COLUMNS)
        .eq("project_id", projectId)
        .eq("context", context)
        .eq("sheet_id", sheetId);
      query = bookId ? query.eq("book_id", bookId) : query.is("book_id", null);
      const { data, error: err } = await query.order("created_at", { ascending: true });
      if (err) throw err;
      if (!mounted.current) return;
      setComments((data ?? []) as ProjectComment[]);
      setReady(true);
      setError(null);
    } catch (e: any) {
      if (!mounted.current) return;
      setReady(false);
      setError(e?.message ?? "Kommentare konnten nicht geladen werden.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [projectId, context, sheetId, bookId]);

  useEffect(() => { void load(); }, [load]);

  // Aktualisierung durch andere Personen: ein Kanal je Projekt, kein Polling.
  useEffect(() => {
    const client = getNetworkClient();
    if (!client || !projectId) return;
    const channel = client
      .channel(`pixuna-comments-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_comments", filter: `project_id=eq.${projectId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [projectId, load]);

  const create = useCallback<CommentsApi["create"]>(async ({ posX, posY, body }) => {
    const client = getNetworkClient();
    const text = body.trim();
    if (!client || !projectId || !sheetId || !text) return null;
    try {
      const { data, error: err } = await client
        .from("project_comments")
        .insert({ project_id: projectId, context, sheet_id: sheetId, book_id: bookId, pos_x: posX, pos_y: posY, body: text })
        .select(COLUMNS)
        .single();
      if (err) throw err;
      const row = data as ProjectComment;
      setComments((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row]));
      setError(null);
      return row;
    } catch (e: any) {
      setError(e?.message ?? "Kommentar konnte nicht gespeichert werden.");
      return null;
    }
  }, [projectId, context, sheetId, bookId]);

  const patch = useCallback(async (id: string, values: Record<string, unknown>, failure: string) => {
    const client = getNetworkClient();
    if (!client) return false;
    try {
      const { data, error: err } = await client
        .from("project_comments")
        .update(values)
        .eq("id", id)
        .select(COLUMNS)
        .single();
      if (err) throw err;
      const row = data as ProjectComment;
      setComments((prev) => prev.map((c) => (c.id === row.id ? row : c)));
      setError(null);
      return true;
    } catch (e: any) {
      setError(e?.message ?? failure);
      return false;
    }
  }, []);

  const updateBody = useCallback<CommentsApi["updateBody"]>((id, body) => {
    const text = body.trim();
    if (!text) return Promise.resolve(false);
    return patch(id, { body: text }, "Änderung konnte nicht gespeichert werden.");
  }, [patch]);

  const setStatus = useCallback<CommentsApi["setStatus"]>(
    (id, status) => patch(id, { status }, "Status konnte nicht gespeichert werden."),
    [patch],
  );

  const remove = useCallback<CommentsApi["remove"]>(async (id) => {
    const client = getNetworkClient();
    if (!client) return false;
    try {
      const { error: err } = await client.from("project_comments").delete().eq("id", id);
      if (err) throw err;
      setComments((prev) => prev.filter((c) => c.id !== id));
      setError(null);
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Kommentar konnte nicht gelöscht werden.");
      return false;
    }
  }, []);

  return { comments, loading, ready, error, myId, create, updateBody, setStatus, remove, reload: load, canModerate };
}

/* ------------------------------------------- Auswertung für die Team-Ansicht */

export interface CommentStat {
  open: number;
  done: number;
}

/**
 * Kommentare eines Projekts (nur die für die Auswertung nötigen Felder).
 * Zähler werden daraus abgeleitet – keine separate Zählerhaltung.
 */
export function useProjectCommentOverview(projectId: string | undefined) {
  const [rows, setRows] = useState<ProjectComment[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const client = getNetworkClient();
    if (!client || !projectId || !authClient.getSession()) { setRows([]); setReady(false); return; }
    try {
      const { data, error } = await client
        .from("project_comments")
        .select(COLUMNS)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows((data ?? []) as ProjectComment[]);
      setReady(true);
    } catch {
      setRows([]);
      setReady(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const statsByUser = useMemo(() => {
    const map = new Map<string, CommentStat>();
    for (const r of rows) {
      const cur = map.get(r.author_id) ?? { open: 0, done: 0 };
      if (r.status === "done") cur.done += 1; else cur.open += 1;
      map.set(r.author_id, cur);
    }
    return map;
  }, [rows]);

  return { comments: rows, statsByUser, ready, reload: load };
}
