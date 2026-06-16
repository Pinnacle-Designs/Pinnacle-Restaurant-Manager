"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button, Badge, EmptyState } from "@/components/ui";
import { Input, Select, FormField, Modal } from "@/components/ui/form";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface StaffMember {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  hourlyRate?: number;
  isTippedEmployee?: boolean;
  tipPoints?: number;
  active: boolean;
  dateOfBirth?: string | null;
}

import { JOB_ROLES, TIPPED_JOB_ROLES } from "@/lib/payroll/job-roles";

const ROLES = JOB_ROLES;

export function StaffClient({
  initialStaff,
  onStaffChange,
  canEdit = true,
}: {
  initialStaff: StaffMember[];
  onStaffChange?: (staff: StaffMember[]) => void;
  canEdit?: boolean;
}) {
  const [staff, setStaff] = useState(initialStaff);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [form, setForm] = useState({
    name: "",
    role: "Server",
    email: "",
    phone: "",
    hourlyRate: "",
    isTippedEmployee: false,
    tipPoints: "1",
    active: true,
    dateOfBirth: "",
    clockPin: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateStaff = (next: StaffMember[]) => {
    setStaff(next);
    onStaffChange?.(next);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", role: "Server", email: "", phone: "", hourlyRate: "", isTippedEmployee: true, tipPoints: "1", active: true, dateOfBirth: "", clockPin: "" });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (member: StaffMember) => {
    setEditing(member);
    setForm({
      name: member.name,
      role: member.role,
      email: member.email || "",
      phone: member.phone || "",
      hourlyRate: String(member.hourlyRate),
      isTippedEmployee: member.isTippedEmployee ?? TIPPED_JOB_ROLES.has(member.role as never),
      tipPoints: String(member.tipPoints ?? 1),
      active: member.active,
      dateOfBirth: member.dateOfBirth
        ? String(member.dateOfBirth).slice(0, 10)
        : "",
      clockPin: "",
    });
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        role: form.role,
        email: form.email || null,
        phone: form.phone || null,
        hourlyRate: parseFloat(form.hourlyRate) || 0,
        isTippedEmployee: form.isTippedEmployee,
        tipPoints: parseFloat(form.tipPoints) || 1,
        active: form.active,
        dateOfBirth: form.dateOfBirth || null,
        ...(form.clockPin ? { clockPin: form.clockPin } : editing ? {} : { clockPin: "1234" }),
      };
      if (editing) {
        const updated = await apiPatch<StaffMember>(`/api/staff/${editing.id}`, payload);
        updateStaff(staff.map((s) => (s.id === editing.id ? updated : s)));
      } else {
        const created = await apiPost<StaffMember>("/api/staff", payload);
        updateStaff([...staff, created]);
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this staff member?")) return;
    await apiDelete(`/api/staff/${id}`);
    updateStaff(staff.filter((s) => s.id !== id));
  };

  return (
    <>
      {canEdit && (
        <div className="mb-6 flex justify-end">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Staff
          </Button>
        </div>
      )}

      {staff.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="No staff members"
          description="Add your team to track roles and staffing."
          action={canEdit ? <Button onClick={openCreate}>Add Staff</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((member) => (
            <div key={member.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{member.name}</h3>
                  <p className="text-sm text-slate-500">{member.role}</p>
                </div>
                <Badge className={member.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}>
                  {member.active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="mt-4 space-y-1 text-sm text-slate-600">
                {member.email && <p>{member.email}</p>}
                {member.phone && <p>{member.phone}</p>}
                {member.hourlyRate !== undefined && (
                  <p className="font-medium text-slate-900">{formatCurrency(member.hourlyRate)}/hr</p>
                )}
              </div>
              {canEdit && (
                <div className="mt-4 flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(member)}>
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(member.id)}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Staff" : "Add Staff"}>
        <div className="space-y-4">
          <FormField label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Role">
            <Select
              value={form.role}
              onChange={(e) => {
                const role = e.target.value;
                setForm({
                  ...form,
                  role,
                  isTippedEmployee: TIPPED_JOB_ROLES.has(role as never),
                });
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </FormField>
            <FormField label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Date of birth (for minor labor rules)">
            <Input
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
            />
          </FormField>
          <FormField label="Time clock PIN (4–6 digits)">
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder={editing ? "Leave blank to keep current PIN" : "Default 1234 if empty"}
              value={form.clockPin}
              onChange={(e) => setForm({ ...form, clockPin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Hourly Rate">
              <Input type="number" step="0.01" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} />
            </FormField>
            <FormField label="Status">
              <Select value={form.active ? "true" : "false"} onChange={(e) => setForm({ ...form, active: e.target.value === "true" })}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Tip pool points">
              <Input
                type="number"
                step="0.1"
                value={form.tipPoints}
                onChange={(e) => setForm({ ...form, tipPoints: e.target.value })}
              />
            </FormField>
            <FormField label="Tipped employee">
              <Select
                value={form.isTippedEmployee ? "true" : "false"}
                onChange={(e) =>
                  setForm({ ...form, isTippedEmployee: e.target.value === "true" })
                }
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </FormField>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
