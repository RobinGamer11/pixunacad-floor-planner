/**
 * Projektzugriff & Rollen (Paket 1 / Teilschritt 1).
 *
 * Eine Person hat je Projekt genau eine Mitgliedschaft. Die Rolle kommt
 * ausschließlich aus der gemeinsamen Datenbasis:
 *   - `network_projects.owner_id`  → Rolle "owner"
 *   - `project_members.role`       → "admin" | "member" | "viewer"
 * Individuelle Abweichungen liegen als kleine, klar begrenzte Menge von
 * Flags in `project_members.permissions`.
 *
 * Wichtig: Dieselben Regeln gelten serverseitig per RLS/Trigger
 * (db/migrations/20260831093000_project_access.sql). Der Client blendet
 * lediglich zusätzlich aus und schützt vor versehentlichen Schreibvorgängen.
 *
 * Projekte, die (noch) nicht in der gemeinsamen Datenbasis stehen, sind rein
 * persönliche lokale Projekte: dort behält der angemeldete Benutzer wie
 * bisher volle Rechte.
 */
import { useSyncExternalStore } from "react";
import { getNetworkClient, isMissingSchemaError } from "@/lib/networkClient";
import { supabase as authClient } from "@/lib/supabase";

export type ProjectRole = "owner" | "admin" | "member" | "viewer";

/** Klar begrenzte Abweichungen vom Rollenstandard. */
export interface ProjectPermissionOverrides {
  can_edit?: boolean;
  can_manage_members?: boolean;
  can_comment?: boolean;
}

export interface ProjectPermissions {
  canEdit: boolean;
  canManageMembers: boolean;
  canComment: boolean;
}

export interface ProjectAccess {
  projectId: string;
  /** null = keine Mitgliedschaft bekannt (fremdes oder unbekanntes Projekt). */
  role: ProjectRole | null;
  /** true, wenn das Projekt in der gemeinsamen Datenbasis geführt wird. */
  shared: boolean;
  overrides: ProjectPermissionOverrides;
  permissions: ProjectPermissions;
  /** Abweichungen gegenüber dem Rollenstandard (für die Anzeige). */
  deviations: (keyof ProjectPermissions)[];
}

export const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Besitzer",
  admin: "Administrator",
  member: "Mitglied",
  viewer: "Betrachter",
};

/** Rollenstandards – zentral definiert, nicht pro Oberfläche wiederholt. */
export function permissionsForRole(role: ProjectRole): ProjectPermissions {
  switch (role) {
    case "owner":
      return { canEdit: true, canManageMembers: true, canComment: true };
    case "admin":
      return { canEdit: true, canManageMembers: true, canComment: true };
    case "member":
      return { canEdit: true, canManageMembers: false, canComment: true };
    case "viewer":
      return { canEdit: false, canManageMembers: false, canComment: true };
  }
}

/** Rollenstandard + zulässige individuelle Abweichungen. */
export function effectivePermissions(
  role: ProjectRole,
  overrides: ProjectPermissionOverrides | undefined,
): ProjectPermissions {
  const base = permissionsForRole(role);
  const o = overrides ?? {};
  if (role === "owner") return base; // Ownership ist nicht überschreibbar.
  return {
    canEdit: o.can_edit ?? base.canEdit,
    // Verwaltungsrechte lassen sich nur entziehen, nie zusätzlich vergeben.
    canManageMembers: base.canManageMembers ? (o.can_manage_members ?? true) : false,
    canComment: o.can_comment ?? base.canComment,
  };
}

function deviationsOf(role: ProjectRole, perms: ProjectPermissions): (keyof ProjectPermissions)[] {
  const base = permissionsForRole(role);
  return (Object.keys(base) as (keyof ProjectPermissions)[]).filter((k) => base[k] !== perms[k]);
}

const LOCAL_OWNER: Omit<ProjectAccess, "projectId"> = {
  role: "owner",
  shared: false,
  overrides: {},
  permissions: permissionsForRole("owner"),
  deviations: [],
};

/* ------------------------------------------------------------------ Store */

interface AccessState {
  loading: boolean;
  /** Gemeinsame Datenbasis erreichbar (Migration eingespielt & angemeldet). */
  ready: boolean;
  schemaMissing: boolean;
  myId: string | null;
  byProject: Map<string, ProjectAccess>;
}

let state: AccessState = {
  loading: true,
  ready: false,
  schemaMissing: false,
  myId: null,
  byProject: new Map(),
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function parseOverrides(raw: unknown): ProjectPermissionOverrides {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const pick = (k: string) => (typeof o[k] === "boolean" ? (o[k] as boolean) : undefined);
  return {
    can_edit: pick("can_edit"),
    can_manage_members: pick("can_manage_members"),
    can_comment: pick("can_comment"),
  };
}

function buildAccess(projectId: string, role: ProjectRole, overrides: ProjectPermissionOverrides): ProjectAccess {
  const permissions = effectivePermissions(role, overrides);
  return {
    projectId,
    role,
    shared: true,
    overrides,
    permissions,
    deviations: deviationsOf(role, permissions),
  };
}

let inflight: Promise<void> | null = null;

async function loadAccess(): Promise<void> {
  const client = getNetworkClient();
  const session = authClient.getSession();
  if (!client || !session) {
    state = { ...state, loading: false, ready: false, myId: session?.user.id ?? null, byProject: new Map() };
    emit();
    return;
  }
  const myId = session.user.id;
  try {
    const [{ data: owned, error: ownedErr }, { data: memberships, error: memberErr }] = await Promise.all([
      client.from("network_projects").select("id,owner_id"),
      client.from("project_members").select("project_id,user_id,role,permissions"),
    ]);
    if (ownedErr) throw ownedErr;
    if (memberErr) throw memberErr;

    const byProject = new Map<string, ProjectAccess>();
    for (const row of (memberships ?? []) as { project_id: string; user_id: string; role: string; permissions?: unknown }[]) {
      if (row.user_id !== myId) continue;
      const role: ProjectRole =
        row.role === "admin" || row.role === "viewer" ? row.role : "member";
      byProject.set(row.project_id, buildAccess(row.project_id, role, parseOverrides(row.permissions)));
    }
    // Ownership hat immer Vorrang und wird nie von Overrides berührt.
    for (const row of (owned ?? []) as { id: string; owner_id: string }[]) {
      if (row.owner_id === myId) byProject.set(row.id, buildAccess(row.id, "owner", {}));
      else if (!byProject.has(row.id)) {
        // Sichtbar, aber ohne Mitgliedschaft → kein Zugriff.
        byProject.set(row.id, {
          projectId: row.id,
          role: null,
          shared: true,
          overrides: {},
          permissions: { canEdit: false, canManageMembers: false, canComment: false },
          deviations: [],
        });
      }
    }

    state = { loading: false, ready: true, schemaMissing: false, myId, byProject };
    emit();
  } catch (error) {
    state = {
      loading: false,
      ready: false,
      schemaMissing: isMissingSchemaError(error),
      myId,
      byProject: new Map(),
    };
    emit();
  }
}

export const projectAccessStore = {
  getState: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  reload(): Promise<void> {
    if (inflight) return inflight;
    inflight = loadAccess().finally(() => { inflight = null; });
    return inflight;
  },
  /**
   * Zugriff auf ein einzelnes Projekt.
   * Unbekannte Projekt-IDs sind persönliche lokale Projekte → volle Rechte.
   * Die Ersatzobjekte werden zwischengespeichert, damit `getSnapshot` bei
   * gleichem Zustand referenzstabil bleibt (sonst Endlos-Renderschleife).
   */
  accessFor(projectId: string | undefined): ProjectAccess {
    if (!projectId) return localAccessFor("");
    const known = state.byProject.get(projectId);
    if (known) return known;
    return localAccessFor(projectId);
  },

  /** Schreibrecht – wird auch als Schreibschutz-Wächter im Projektstore genutzt. */
  canEdit(projectId: string | undefined): boolean {
    return projectAccessStore.accessFor(projectId).permissions.canEdit;
  },
  canManageMembers(projectId: string | undefined): boolean {
    return projectAccessStore.accessFor(projectId).permissions.canManageMembers;
  },
  canComment(projectId: string | undefined): boolean {
    return projectAccessStore.accessFor(projectId).permissions.canComment;
  },
};

/* ------------------------------------------------------------------ Hooks */

export function useProjectAccess(projectId: string | undefined): ProjectAccess {
  return useSyncExternalStore(
    projectAccessStore.subscribe,
    () => projectAccessStore.accessFor(projectId),
    () => projectAccessStore.accessFor(projectId),
  );
}

export function useProjectAccessState(): AccessState {
  return useSyncExternalStore(
    projectAccessStore.subscribe,
    () => state,
    () => state,
  );
}

/** True, wenn das Projekt für den aktuellen Benutzer nur lesbar ist. */
export function useProjectReadOnly(projectId: string | undefined): boolean {
  return !useProjectAccess(projectId).permissions.canEdit;
}
