"use client";

import { useCallback, useEffect, useState } from "react";
import { Shield, Building2, Users, Mail } from "lucide-react";
import { PageHeader, Button, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { PlanId } from "@/lib/plans";

type Tab = "locations" | "users" | "partnerships";

interface PitchInquiry {
  id: string;
  name: string;
  email: string;
  company: string | null;
  interest: string;
  message: string | null;
  createdAt: string;
}

interface LocationRow {
  id: string;
  name: string;
  plan: PlanId;
  active: boolean;
  setupComplete: boolean;
  autopayEnabled: boolean;
  billingEmail: string | null;
  userCount: number;
  subscriptionProvider: string;
  subscriptionStatus: string | null;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  isPlatformAdmin: boolean;
  locationName: string | null;
  createdAt: string;
}

export function AdminClient() {
  const [tab, setTab] = useState<Tab>("locations");
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [inquiries, setInquiries] = useState<PitchInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [locRes, userRes, pitchRes] = await Promise.all([
        fetch("/api/admin/locations"),
        fetch("/api/admin/users"),
        fetch("/api/admin/pitch-inquiries"),
      ]);
      const locJson = await locRes.json();
      const userJson = await userRes.json();
      const pitchJson = await pitchRes.json();
      if (!locRes.ok) throw new Error(locJson.error);
      if (!userRes.ok) throw new Error(userJson.error);
      if (!pitchRes.ok) throw new Error(pitchJson.error);
      setLocations(locJson.locations);
      setUsers(userJson.users);
      setInquiries(pitchJson.inquiries);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchLocation = async (id: string, data: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/locations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    setMessage("Location updated");
    await load();
  };

  const patchUser = async (userId: string, data: Record<string, unknown>) => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...data }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    setMessage("User updated");
    await load();
  };

  return (
    <div>
      <PageHeader
        title="Platform admin"
        description="Manage restaurants, plans, and accounts across the platform."
      />

      {message && (
        <p className="mb-4 text-sm text-green-700">{message}</p>
      )}

      <div className="mb-6 flex gap-2">
        {(
          [
            { id: "locations" as Tab, label: "Locations", icon: Building2 },
            { id: "users" as Tab, label: "Users", icon: Users },
            { id: "partnerships" as Tab, label: "Pitch requests", icon: Mail },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                tab === item.id ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : tab === "locations" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Restaurant</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Billing</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <tr key={loc.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{loc.name}</p>
                    <p className="text-xs text-slate-500">{loc.userCount} users · {new Date(loc.createdAt).toLocaleDateString()}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className="bg-slate-100 text-slate-700">{loc.plan}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {loc.subscriptionProvider}
                    {loc.autopayEnabled && " · autopay"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={loc.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                      {loc.active ? "Active" : "Suspended"}
                    </Badge>
                    {!loc.setupComplete && (
                      <Badge className="ml-1 bg-amber-100 text-amber-800">Onboarding</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          void patchLocation(loc.id, { active: !loc.active })
                        }
                      >
                        {loc.active ? "Suspend" : "Activate"}
                      </Button>
                      {loc.plan !== "PRO" && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void patchLocation(loc.id, { plan: "PRO" })}
                        >
                          Upgrade PRO
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "users" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {u.role}
                    {u.isPlatformAdmin && (
                      <Badge className="ml-1 bg-purple-100 text-purple-800">
                        <Shield className="mr-0.5 inline h-3 w-3" />
                        Admin
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.locationName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge className={u.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                      {u.active ? "Active" : "Disabled"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void patchUser(u.id, { active: !u.active })}
                      >
                        {u.active ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          void patchUser(u.id, { isPlatformAdmin: !u.isPlatformAdmin })
                        }
                      >
                        {u.isPlatformAdmin ? "Revoke admin" : "Make admin"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <p className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Private deck requests from the public investors page. Send <code className="rounded bg-slate-200 px-1">private/pitch-deck.html</code> manually after review.
          </p>
          {inquiries.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No requests yet.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Interest</th>
                  <th className="px-4 py-3 font-medium">Message</th>
                  <th className="px-4 py-3 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-500">
                        <a href={`mailto:${row.email}`} className="text-orange-600 hover:underline">
                          {row.email}
                        </a>
                      </p>
                      {row.company && <p className="text-xs text-slate-500">{row.company}</p>}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-700">{row.interest}</td>
                    <td className="max-w-xs px-4 py-3 text-slate-600">{row.message ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
