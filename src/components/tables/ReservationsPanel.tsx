"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, Link2, RefreshCw, Unplug } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { cn } from "@/lib/utils";

interface ReservationRow {
  id: string;
  guestName: string;
  partySize: number;
  reservationAt: string;
  provider: string;
  status: string;
  table: { id: string; number: number; label: string | null } | null;
}

interface ConnectionRow {
  id: string;
  name: string;
  description: string;
  connected: boolean;
  restaurantExternalId: string | null;
  restaurantName: string | null;
  lastSyncAt: string | null;
  lastSyncMessage: string | null;
}

export function ReservationsPanel({
  onReservationChange,
}: {
  onReservationChange?: () => void;
}) {
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [connectForm, setConnectForm] = useState<{
    provider: string;
    restaurantId: string;
    restaurantName: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reservations");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setReservations(json.reservations);
      setConnections(json.connections);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load reservations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async (provider: string) => {
    setBusy(provider);
    setMessage(null);
    try {
      const res = await fetch("/api/reservations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          action: "connect",
          restaurantId: connectForm?.provider === provider ? connectForm.restaurantId : undefined,
          restaurantName: connectForm?.provider === provider ? connectForm.restaurantName : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Connect failed");
      setMessage(json.lastSyncMessage || "Connected");
      setConnectForm(null);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (provider: string) => {
    setBusy(provider);
    try {
      await fetch("/api/reservations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, action: "disconnect" }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const sync = async (provider?: string) => {
    setBusy(provider ?? "all");
    setMessage(null);
    try {
      const res = await fetch("/api/reservations/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(provider ? { provider } : {}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      const total = (json.results as Array<{ created: number }>).reduce(
        (s, r) => s + (r.created ?? 0),
        0
      );
      setMessage(total > 0 ? `Imported ${total} reservation(s)` : "Sync complete — no new bookings");
      await load();
      onReservationChange?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  if (loading) {
    return <p className="text-sm text-slate-500">Loading reservations…</p>;
  }

  return (
    <div className="space-y-8">
      {message && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Reservation platforms</h3>
            <p className="text-sm text-slate-600">
              Connect OpenTable, Resy, Tock, or Yelp to sync bookings onto your floor plan.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => sync()}
          >
            <RefreshCw className={cn("h-4 w-4", busy === "all" && "animate-spin")} />
            Sync all
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-semibold">{conn.name}</h4>
                  <p className="mt-1 text-sm text-slate-600">{conn.description}</p>
                </div>
                <Badge
                  className={
                    conn.connected
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-600"
                  }
                >
                  {conn.connected ? "Connected" : "Not connected"}
                </Badge>
              </div>
              {conn.connected && conn.restaurantName && (
                <p className="mt-2 text-xs text-slate-500">{conn.restaurantName}</p>
              )}
              {conn.lastSyncMessage && (
                <p className="mt-1 text-xs text-slate-500">{conn.lastSyncMessage}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {!conn.connected ? (
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      setConnectForm({
                        provider: conn.id,
                        restaurantId: "",
                        restaurantName: "",
                      })
                    }
                  >
                    <Link2 className="h-4 w-4" />
                    Connect
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy !== null}
                      onClick={() => sync(conn.id)}
                    >
                      <RefreshCw
                        className={cn("h-4 w-4", busy === conn.id && "animate-spin")}
                      />
                      Sync
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => disconnect(conn.id)}
                    >
                      <Unplug className="h-4 w-4" />
                      Disconnect
                    </Button>
                  </>
                )}
              </div>
              {connectForm?.provider === conn.id && (
                <div className="mt-4 space-y-3 border-t pt-4">
                  <FormField label="Restaurant ID (optional)">
                    <Input
                      value={connectForm.restaurantId}
                      onChange={(e) =>
                        setConnectForm({ ...connectForm, restaurantId: e.target.value })
                      }
                      placeholder="OpenTable restaurant ID"
                    />
                  </FormField>
                  <FormField label="Display name">
                    <Input
                      value={connectForm.restaurantName}
                      onChange={(e) =>
                        setConnectForm({ ...connectForm, restaurantName: e.target.value })
                      }
                      placeholder="Your restaurant on OpenTable"
                    />
                  </FormField>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy !== null} onClick={() => connect(conn.id)}>
                      Confirm connect
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConnectForm(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
          <Calendar className="h-5 w-5" />
          Upcoming reservations
        </h3>
        {reservations.length === 0 ? (
          <p className="text-sm text-slate-500">
            No reservations yet. Connect a platform and run sync, or add bookings manually from
            the floor plan.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3">Table</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reservations.map((r) => (
                  <tr key={r.id} className="bg-white">
                    <td className="px-4 py-3 whitespace-nowrap">{formatTime(r.reservationAt)}</td>
                    <td className="px-4 py-3 font-medium">{r.guestName}</td>
                    <td className="px-4 py-3">{r.partySize}</td>
                    <td className="px-4 py-3">
                      {r.table ? `Table ${r.table.number}` : "—"}
                    </td>
                    <td className="px-4 py-3 capitalize">{r.provider.toLowerCase()}</td>
                    <td className="px-4 py-3 capitalize">{r.status.toLowerCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
