"use client";

import { useEffect, useState } from "react";
import { Monitor, Printer, Route } from "lucide-react";
import { Badge } from "@/components/ui";
import type { KitchenStationDto } from "@/lib/kitchen/stations";

export function KitchenStationsPanel() {
  const [stations, setStations] = useState<KitchenStationDto[]>([]);

  useEffect(() => {
    fetch("/api/kitchen/stations")
      .then((r) => r.json())
      .then(setStations)
      .catch(() => {});
  }, []);

  if (!stations.length) return null;

  return (
    <section className="card mb-8">
      <div className="flex items-center gap-2">
        <Route className="h-5 w-5 text-orange-600" />
        <h2 className="text-lg font-semibold text-slate-900">Kitchen routing</h2>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Menu items route to stations automatically. Combos split to multiple KDS screens or bar
        printers. Assign a station and course on each item below.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {stations.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.color ?? "#ea580c" }}
            />
            <span className="font-medium text-slate-800">{s.name}</span>
            <Badge className="bg-white text-[10px] text-slate-600">
              {s.outputKind === "PRINTER" ? (
                <span className="inline-flex items-center gap-0.5">
                  <Printer className="h-3 w-3" /> Printer
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5">
                  <Monitor className="h-3 w-3" /> KDS
                </span>
              )}
            </Badge>
          </div>
        ))}
      </div>
    </section>
  );
}
