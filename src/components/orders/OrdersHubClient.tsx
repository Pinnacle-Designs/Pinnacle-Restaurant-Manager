"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { OrdersClient } from "@/components/orders/OrdersClient";
import { ServerPosClient } from "@/components/pos/ServerPosClient";
import type { OrderMenuItem } from "@/components/orders/OrderMenuSheet";
import type { PayableOrder } from "@/components/orders/PayCheckScreen";

type View = "serve" | "checks";

interface Table {
  id: string;
  number: number;
  capacity: number;
}

interface OrderRow extends PayableOrder {
  notes: string | null;
}

interface OrdersHubClientProps {
  initialOrders: OrderRow[];
  menuItems: OrderMenuItem[];
  tables: Table[];
  initialMenuRevision?: number;
  defaultView?: View;
}

export function OrdersHubClient({
  initialOrders,
  menuItems,
  tables,
  initialMenuRevision = 0,
  defaultView = "serve",
}: OrdersHubClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramView = searchParams.get("view");
  const view: View =
    paramView === "checks" ? "checks" : paramView === "serve" ? "serve" : defaultView;

  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);

  const upsertOrder = useCallback((updated: PayableOrder & { notes?: string | null }) => {
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === updated.id);
      const merged: OrderRow = {
        ...(idx >= 0 ? prev[idx] : { notes: null }),
        ...updated,
        notes: updated.notes ?? (idx >= 0 ? prev[idx].notes : null),
      };
      if (idx >= 0) {
        return prev.map((o) => (o.id === updated.id ? merged : o));
      }
      return [merged, ...prev];
    });
  }, []);

  const refreshOrders = useCallback(async () => {
    try {
      const data = await apiFetch<OrderRow[]>("/api/orders");
      setOrders(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (view === "checks") {
      void refreshOrders();
    }
  }, [view, refreshOrders]);

  const setView = useCallback(
    (next: View) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", next);
      router.replace(`/orders?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl border bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setView("serve")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
            view === "serve"
              ? "bg-orange-500 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          )}
        >
          <Zap className="h-4 w-4" />
          Serve
        </button>
        <button
          type="button"
          onClick={() => setView("checks")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
            view === "checks"
              ? "bg-orange-500 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          )}
        >
          <ClipboardList className="h-4 w-4" />
          Checks &amp; history
        </button>
      </div>

      {view === "serve" ? (
        <ServerPosClient onOrderUpdated={upsertOrder} />
      ) : (
        <OrdersClient
          orders={orders}
          setOrders={setOrders}
          menuItems={menuItems}
          tables={tables}
          initialMenuRevision={initialMenuRevision}
        />
      )}
    </div>
  );
}
