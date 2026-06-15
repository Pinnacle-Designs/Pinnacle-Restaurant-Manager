"use client";

import { useCallback, useEffect, useState } from "react";
import { Monitor, Printer, RefreshCw } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MENU_COURSE_SHORT } from "@/lib/kitchen/courses";

interface Station {
  id: string;
  name: string;
  slug: string;
  outputKind: string;
  color: string | null;
}

interface Ticket {
  id: string;
  orderId: string;
  tableNumber: number | null;
  course: string;
  quantity: number;
  menuItemName: string;
  modifierSummary: string | null;
  seatNumber: number | null;
  kitchenStatus: string;
  firedAt: string | null;
  station: Station | null;
}

export function KdsClient() {
  const [stations, setStations] = useState<Station[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stationId, setStationId] = useState<string | "all">("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const qs = stationId === "all" ? "" : `?stationId=${stationId}`;
      const res = await fetch(`/api/kitchen/kds${qs}`);
      if (!res.ok) return;
      const data = await res.json();
      setStations(data.stations);
      setTickets(data.tickets);
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const bump = async (id: string) => {
    await fetch(`/api/kitchen/kds/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kitchenStatus: "DONE" }),
    });
    load();
  };

  const visible = tickets.filter((t) => t.kitchenStatus !== "DONE");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStationId("all")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              stationId === "all" ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-700"
            )}
          >
            All stations
          </button>
          {stations.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStationId(s.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                stationId === s.id ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-700"
              )}
              style={stationId === s.id && s.color ? { backgroundColor: s.color } : undefined}
            >
              {s.name}
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No active tickets — fired items appear here by station.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((ticket) => (
            <article
              key={ticket.id}
              className={cn(
                "rounded-xl border-l-4 bg-white p-4 shadow-sm",
                ticket.kitchenStatus === "PENDING" ? "border-amber-400 opacity-80" : "border-orange-500"
              )}
              style={{
                borderLeftColor: ticket.station?.color ?? undefined,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    {ticket.tableNumber ? `Table ${ticket.tableNumber}` : "Quick order"}
                    {ticket.seatNumber ? ` · S${ticket.seatNumber}` : ""}
                  </p>
                  <h3 className="text-lg font-bold text-slate-900">
                    {ticket.quantity > 1 ? `${ticket.quantity}× ` : ""}
                    {ticket.menuItemName}
                  </h3>
                </div>
                <Badge className="bg-slate-100 text-slate-700">
                  {MENU_COURSE_SHORT[ticket.course as keyof typeof MENU_COURSE_SHORT] ?? ticket.course}
                </Badge>
              </div>

              {ticket.modifierSummary && (
                <p className="mt-2 text-sm text-slate-600">{ticket.modifierSummary}</p>
              )}

              <div className="mt-3 flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  {ticket.station?.outputKind === "PRINTER" ? (
                    <Printer className="h-3 w-3" />
                  ) : (
                    <Monitor className="h-3 w-3" />
                  )}
                  {ticket.station?.name ?? "Kitchen"}
                  {ticket.kitchenStatus === "PENDING" && " · held"}
                </span>
                {ticket.kitchenStatus === "FIRED" && (
                  <Button size="sm" onClick={() => bump(ticket.id)}>
                    Bump
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
