"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { FloorPlanSection } from "@/lib/tables/floor-plan-constants";

interface TableOrder {
  id: string;
  status: string;
}

interface TableReservation {
  id: string;
  guestName: string;
  partySize: number;
  reservationAt: string;
  provider: string;
}

export interface FloorPlanTable {
  id: string;
  number: number;
  label: string | null;
  capacity: number;
  status: string;
  section: string;
  shape: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  orders: TableOrder[];
  reservations?: TableReservation[];
}

const STATUS_STYLES: Record<string, string> = {
  available: "bg-emerald-100 border-emerald-400 text-emerald-900",
  occupied: "bg-amber-100 border-amber-400 text-amber-900",
  reserved: "bg-sky-100 border-sky-400 text-sky-900",
};

function tableShapeClass(shape: string) {
  if (shape === "round") return "rounded-full";
  if (shape === "bar") return "rounded-lg";
  return "rounded-md";
}

export function FloorPlanCanvas({
  width,
  height,
  sections,
  tables,
  editMode,
  selectedId,
  onSelect,
  onMoveTable,
}: {
  width: number;
  height: number;
  sections: FloorPlanSection[];
  tables: FloorPlanTable[];
  editMode: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMoveTable: (id: string, posX: number, posY: number) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const [scale, setScale] = useState(1);

  const onPointerDown = (e: React.PointerEvent, table: FloorPlanTable) => {
    if (!editMode) {
      onSelect(table.id === selectedId ? null : table.id);
      return;
    }
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: table.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: table.posX,
      origY: table.posY,
    };
    onSelect(table.id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    const nx = Math.max(0, Math.min(width - 40, drag.origX + dx));
    const ny = Math.max(0, Math.min(height - 40, drag.origY + dy));
    onMoveTable(drag.id, nx, ny);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <p className="text-sm text-slate-600">
          {editMode
            ? "Drag tables to arrange your floor. Click a table to select it."
            : "Live floor view — reservations and table status update in real time."}
        </p>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Zoom</span>
          <button
            type="button"
            className="rounded border px-2 py-0.5 hover:bg-slate-50"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
          >
            −
          </button>
          <span className="w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className="rounded border px-2 py-0.5 hover:bg-slate-50"
            onClick={() => setScale((s) => Math.min(1.5, s + 0.1))}
          >
            +
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-4">
        <div
          ref={canvasRef}
          className="relative mx-auto origin-top-left bg-white shadow-inner"
          style={{
            width: width * scale,
            height: height * scale,
            transform: `scale(1)`,
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onClick={(e) => {
            if (e.target === e.currentTarget) onSelect(null);
          }}
        >
          <div
            className="relative"
            style={{
              width,
              height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {sections.map((sec) => (
              <div
                key={sec.id}
                className="absolute border border-dashed border-slate-300"
                style={{
                  left: sec.x,
                  top: sec.y,
                  width: sec.width,
                  height: sec.height,
                  backgroundColor: sec.color,
                }}
              >
                <span className="absolute left-2 top-1 text-xs font-medium text-slate-500">
                  {sec.name}
                </span>
              </div>
            ))}

            {tables.map((table) => {
              const res = table.reservations?.[0];
              const isSelected = selectedId === table.id;
              return (
                <button
                  key={table.id}
                  type="button"
                  className={cn(
                    "absolute flex flex-col items-center justify-center border-2 text-center shadow-sm transition-shadow",
                    tableShapeClass(table.shape),
                    STATUS_STYLES[table.status] || "bg-slate-50 border-slate-300",
                    editMode && "cursor-grab active:cursor-grabbing",
                    isSelected && "ring-2 ring-indigo-500 ring-offset-1",
                    table.orders.length > 0 && "font-semibold"
                  )}
                  style={{
                    left: table.posX,
                    top: table.posY,
                    width: table.width,
                    height: table.height,
                    transform: `rotate(${table.rotation}deg)`,
                  }}
                  onPointerDown={(e) => onPointerDown(e, table)}
                  title={
                    res
                      ? `${res.guestName} · party of ${res.partySize}`
                      : `Table ${table.number}`
                  }
                >
                  <span className="text-sm font-bold leading-none">{table.number}</span>
                  <span className="text-[10px] opacity-75">{table.capacity}p</span>
                  {res && (
                    <span className="mt-0.5 max-w-full truncate px-1 text-[9px] font-medium">
                      {res.guestName.split(" ")[0]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-600 no-print">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-full border-2 border-emerald-400 bg-emerald-100" />
          Available
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-full border-2 border-amber-400 bg-amber-100" />
          Occupied
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-full border-2 border-sky-400 bg-sky-100" />
          Reserved
        </span>
      </div>
    </div>
  );
}
