import { getNetworkClient } from "./networkClient";
import { projectStore } from "./projectStore";
import { projectAccessStore } from "./projectAccess";
import { readMetadata, writeMetadata, metadataDecision } from "./projectMetadataState";
import { accountGeneration, currentAccount, sessionIsCurrent } from "./accountStorage";

export function reconcileProjectName(id: string, name: string, updatedAt: string) {
  const local = projectStore.getState().projects.find(p => p.id === id);
  if (!local) { projectStore.ensureCloudStub(id, name); writeMetadata(id, { name, updatedAt, dirty: false }); return; }
  const base = readMetadata(id);
  const decision = metadataDecision(base, local.name, name, updatedAt);
  if (decision === "adopt") {
    // System adoption is not a local rename and must not create a dirty edit.
    projectStore.applySharedProject({ ...local, name });
    writeMetadata(id, { name, updatedAt, dirty: false });
  } else if (decision === "conflict") {
    writeMetadata(id, { name: base?.name ?? local.name, updatedAt: base?.updatedAt ?? "", dirty: true, conflict: true });
  }
}

export async function saveProjectMetadata(id: string) {
  const base = readMetadata(id);
  if (!base?.dirty) return;
  if (base.conflict || !base.updatedAt) throw new Error("Der Projektname weicht vom Cloudstand ab. Bitte den Namen bewusst abgleichen.");
  if (!projectAccessStore.canEdit(id)) throw new Error("Keine Berechtigung zum Speichern des Projektnamens.");
  const client = getNetworkClient();
  if (!client) throw new Error("Cloud nicht erreichbar.");
  const owner = currentAccount(), epoch = accountGeneration();
  const project = projectStore.getState().projects.find(p => p.id === id);
  if (!project) throw new Error("Projekt nicht verfügbar.");
  const name = project.name;
  const { data, error } = await client.from("network_projects").update({ name })
    .eq("id", id).eq("name", base.name).eq("updated_at", base.updatedAt).select("name,updated_at").maybeSingle();
  if (!sessionIsCurrent(owner, epoch)) throw new Error("Kontositzung wurde gewechselt.");
  if (error) throw new Error(error.message);
  if (!data) { writeMetadata(id, { ...base, conflict: true }); throw new Error("Ein anderes Gerät hat den Projektnamen geändert. Deine lokale Änderung bleibt erhalten."); }
  const current = projectStore.getState().projects.find(p => p.id === id);
  writeMetadata(id, { name: data.name, updatedAt: data.updated_at, dirty: current?.name !== name });
  await projectAccessStore.reload();
}

export async function resolveProjectName(id: string, choice: "cloud" | "device") {
  const base = readMetadata(id);
  if (!base?.conflict) return;
  const owner = currentAccount(), epoch = accountGeneration();
  const client = getNetworkClient();
  if (!client) throw new Error("Cloud nicht erreichbar.");
  const { data, error } = await client.from("network_projects").select("name,updated_at").eq("id", id).single();
  if (!sessionIsCurrent(owner, epoch)) throw new Error("Kontositzung beendet.");
  if (error) throw new Error(error.message);
  const local = projectStore.getState().projects.find(p => p.id === id);
  if (!local) throw new Error("Projekt fehlt auf dem Gerät.");
  if (choice === "cloud") {
    projectStore.applySharedProject({ ...local, name: data.name });
    writeMetadata(id, { name: data.name, updatedAt: data.updated_at, dirty: false });
  } else {
    writeMetadata(id, { name: data.name, updatedAt: data.updated_at, dirty: true, conflict: false });
    await saveProjectMetadata(id);
  }
}