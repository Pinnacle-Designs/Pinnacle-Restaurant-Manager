"use client";

import { useCallback, useEffect, useState } from "react";
import { Shield, Users, RotateCcw } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  PERMISSION_LABELS,
  ROLE_COLORS,
  ROLE_LABELS,
  type Permission,
} from "@/lib/permissions";
import type { AppRole } from "@prisma/client";

type PermissionsMode = "roles" | "people";

interface RolePermissionRow {
  permissions: Permission[];
  customized: boolean;
  defaults: Permission[];
}

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  roleLabel: string;
  editable: boolean;
  hasOverride: boolean;
  overridePermissions: Permission[] | null;
  effectivePermissions: Permission[];
  rolePermissions: Permission[];
}

interface PermissionsPayload {
  actorRole: AppRole;
  editableRoles: AppRole[];
  rolePermissions: Record<AppRole, RolePermissionRow>;
  users: TeamUser[];
  permissionCatalog: {
    assignable: Permission[];
    groups: { label: string; permissions: Permission[] }[];
  };
}

function PermissionChecklist({
  selected,
  assignable,
  groups,
  disabled,
  onChange,
}: {
  selected: Permission[];
  assignable: Permission[];
  groups: { label: string; permissions: Permission[] }[];
  disabled?: boolean;
  onChange: (next: Permission[]) => void;
}) {
  const toggle = (permission: Permission) => {
    if (disabled || !assignable.includes(permission)) return;
    onChange(
      selected.includes(permission)
        ? selected.filter((p) => p !== permission)
        : [...selected, permission]
    );
  };

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const visible = group.permissions.filter((p) => assignable.includes(p));
        if (visible.length === 0) return null;
        return (
          <div key={group.label}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {group.label}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {visible.map((permission) => {
                const active = selected.includes(permission);
                return (
                  <label
                    key={permission}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                      active
                        ? "border-orange-300 bg-orange-50"
                        : "border-slate-200 bg-white hover:border-slate-300",
                      disabled && "cursor-not-allowed opacity-60"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      disabled={disabled}
                      onChange={() => toggle(permission)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-600"
                    />
                    <span className="text-slate-700">{PERMISSION_LABELS[permission]}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useAuth } from "@/components/auth/AuthProvider";

export function PermissionsTab() {
  const { refresh } = useAuth();
  const [data, setData] = useState<PermissionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<PermissionsMode>("roles");
  const [selectedRole, setSelectedRole] = useState<AppRole>("SERVER");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Permission[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/permissions");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load permissions");
      setData(json);
      const firstRole = json.editableRoles[0] as AppRole | undefined;
      if (firstRole) {
        setSelectedRole(firstRole);
        setDraft(json.rolePermissions[firstRole].permissions);
      }
      const firstEditableUser = (json.users as TeamUser[]).find((u) => u.editable);
      if (firstEditableUser) {
        setSelectedUserId(firstEditableUser.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load permissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    if (mode === "roles") {
      setDraft(data.rolePermissions[selectedRole]?.permissions ?? []);
      return;
    }
    const user = data.users.find((u) => u.id === selectedUserId);
    if (user) {
      setDraft(user.hasOverride ? user.overridePermissions ?? [] : user.effectivePermissions);
    }
  }, [data, mode, selectedRole, selectedUserId]);

  const selectedUser = data?.users.find((u) => u.id === selectedUserId) ?? null;

  const saveRole = async () => {
    if (!data) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/permissions/roles/${selectedRole}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: draft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save role permissions");
      setMessage(`${ROLE_LABELS[selectedRole]} permissions saved`);
      await load();
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const resetRole = async () => {
    if (!data) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/permissions/roles/${selectedRole}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not reset role");
      setMessage(json.message || "Role reset to defaults");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not reset");
    } finally {
      setSaving(false);
    }
  };

  const saveUser = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/permissions/users/${selectedUserId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: draft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save user permissions");
      setMessage("Individual access saved");
      await load();
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const resetUser = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/permissions/users/${selectedUserId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not reset user");
      setMessage(json.message || "User reset to role permissions");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not reset");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-sm text-slate-500">Loading team access…</div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error || "Team access unavailable"}
      </div>
    );
  }

  const managerNote =
    data.actorRole === "MANAGER"
      ? "As a manager, you can customize access for your team. Owner accounts always keep full access."
      : "Customize what each role or person can see and do. Owner access is always full.";

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">Team access</h2>
      <p className="mt-1 text-sm text-slate-500">{managerNote}</p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("roles")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
            mode === "roles" ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-600"
          )}
        >
          <Shield className="h-4 w-4" />
          By role
        </button>
        <button
          type="button"
          onClick={() => setMode("people")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
            mode === "people" ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-600"
          )}
        >
          <Users className="h-4 w-4" />
          By person
        </button>
      </div>

      {mode === "roles" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">
            {data.editableRoles.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setSelectedRole(role)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm",
                  selectedRole === role
                    ? "border-orange-300 bg-orange-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                )}
              >
                <span className="font-medium text-slate-800">{ROLE_LABELS[role]}</span>
                {data.rolePermissions[role]?.customized && (
                  <Badge className="bg-slate-100 text-[10px] text-slate-600">Custom</Badge>
                )}
              </button>
            ))}
          </div>

          <div>
            <p className="text-sm font-medium text-slate-800">
              Permissions for {ROLE_LABELS[selectedRole]}s
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Applies to everyone with this role unless they have individual overrides.
            </p>
            <div className="mt-4">
              <PermissionChecklist
                selected={draft}
                assignable={data.permissionCatalog.assignable}
                groups={data.permissionCatalog.groups}
                onChange={setDraft}
              />
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button type="button" onClick={() => void saveRole()} disabled={saving}>
                Save role access
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void resetRole()}
                disabled={saving}
              >
                <RotateCcw className="h-4 w-4" />
                Reset to defaults
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-2">
            {data.users.map((member) => (
              <button
                key={member.id}
                type="button"
                disabled={!member.editable}
                onClick={() => member.editable && setSelectedUserId(member.id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left text-sm",
                  selectedUserId === member.id
                    ? "border-orange-300 bg-orange-50"
                    : "border-slate-200 bg-white hover:border-slate-300",
                  !member.editable && "cursor-not-allowed opacity-60"
                )}
              >
                <p className="font-medium text-slate-800">{member.name}</p>
                <p className="truncate text-xs text-slate-500">{member.email}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge className={cn("text-[10px]", ROLE_COLORS[member.role])}>
                    {member.roleLabel}
                  </Badge>
                  {member.hasOverride && (
                    <Badge className="bg-amber-100 text-[10px] text-amber-800">Custom</Badge>
                  )}
                </div>
              </button>
            ))}
          </div>

          <div>
            {selectedUser?.editable ? (
              <>
                <p className="text-sm font-medium text-slate-800">
                  Individual access for {selectedUser.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Overrides the {selectedUser.roleLabel} role defaults for this person only.
                </p>
                <div className="mt-4">
                  <PermissionChecklist
                    selected={draft}
                    assignable={data.permissionCatalog.assignable}
                    groups={data.permissionCatalog.groups}
                    onChange={setDraft}
                  />
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void saveUser()} disabled={saving}>
                    Save individual access
                  </Button>
                  {selectedUser.hasOverride && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void resetUser()}
                      disabled={saving}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Use role defaults
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Select a team member you can manage. Owner accounts cannot be changed.
              </div>
            )}
          </div>
        </div>
      )}

      {message && (
        <p
          className={cn(
            "mt-4 text-sm",
            message.includes("saved") || message.includes("reset") || message.includes("removed")
              ? "text-green-700"
              : "text-red-600"
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}
