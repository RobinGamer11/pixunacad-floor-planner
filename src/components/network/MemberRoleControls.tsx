/**
 * Rolle und klar begrenzte Abweichungen eines Projektmitglieds.
 * Gemeinsame Komponente für Netzwerk („Projekte / Teams“) und den
 * projektbezogenen Team-Reiter der Startseite – keine zweite Verwaltung.
 */
import {
  ROLE_LABEL,
  effectivePermissions,
  permissionsForRole,
  type ProjectPermissionOverrides,
  type ProjectRole,
} from "@/lib/projectAccess";

export function MemberRoleControls({
  role, overrides, canManage, onRole, onOverrides, className,
}: {
  role: ProjectRole;
  overrides: ProjectPermissionOverrides;
  canManage: boolean;
  onRole: (role: Exclude<ProjectRole, "owner">) => void;
  onOverrides: (o: ProjectPermissionOverrides) => void;
  className?: string;
}) {
  const base = permissionsForRole(role);
  const eff = effectivePermissions(role, overrides);
  const deviating =
    eff.canEdit !== base.canEdit ||
    eff.canManageMembers !== base.canManageMembers ||
    eff.canComment !== base.canComment;

  const toggle = (key: keyof ProjectPermissionOverrides, value: boolean) =>
    onOverrides({ ...overrides, [key]: value });

  return (
    <div className={`flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground ${className ?? "ml-11 mb-1.5"}`}>
      {canManage && role !== "owner" ? (
        <select
          value={role}
          onChange={(e) => onRole(e.target.value as Exclude<ProjectRole, "owner">)}
          className="h-6 rounded border px-1 text-[10px]"
          style={{ background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink))" }}
        >
          <option value="admin">{ROLE_LABEL.admin}</option>
          <option value="member">{ROLE_LABEL.member}</option>
          <option value="viewer">{ROLE_LABEL.viewer}</option>
        </select>
      ) : (
        <span className="rounded border px-1.5 py-0.5" style={{ borderColor: "hsl(var(--hairline))" }}>
          {ROLE_LABEL[role]}
        </span>
      )}

      <label className="flex items-center gap-1">
        <input type="checkbox" disabled={!canManage || role === "owner"} checked={eff.canEdit}
               onChange={(e) => toggle("can_edit", e.target.checked)} />
        Bearbeiten
      </label>
      {base.canManageMembers && (
        <label className="flex items-center gap-1">
          <input type="checkbox" disabled={!canManage || role === "owner"} checked={eff.canManageMembers}
                 onChange={(e) => toggle("can_manage_members", e.target.checked)} />
          Mitglieder
        </label>
      )}
      <label className="flex items-center gap-1">
        <input type="checkbox" disabled={!canManage || role === "owner"} checked={eff.canComment}
               onChange={(e) => toggle("can_comment", e.target.checked)} />
        Kommentieren
      </label>

      {deviating && (
        <span className="rounded px-1.5 py-0.5" style={{ background: "hsl(var(--accent-gold) / 0.18)", color: "hsl(var(--ink))" }}>
          Abweichung vom Rollenstandard
        </span>
      )}
    </div>
  );
}

export default MemberRoleControls;
