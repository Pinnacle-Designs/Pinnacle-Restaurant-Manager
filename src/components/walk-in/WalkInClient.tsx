"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Wifi,
  WifiOff,
  Scale,
  Barcode,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RefreshCw,
  MapPin,
  Trash2,
  ClipboardList,
} from "lucide-react";
import { Button, Badge, StatCard, ScrollableTabs, TabPill } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useScaleSerial } from "@/hooks/useScaleSerial";
import { useWalkInOffline } from "@/hooks/useWalkInOffline";
import {
  convertQuantity,
  formatConversionHint,
  parseAlternateUnits,
  scaleReadingToInventoryUnit,
} from "@/lib/walk-in/unit-convert";
import { findItemByBarcode } from "@/lib/walk-in/barcode-match";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";

interface Zone {
  id: string;
  name: string;
  slug: string;
  routeSteps: { id: string; inventoryItemId: string | null; sortOrder: number; inventoryItem: { id: string; name: string; quantity: number; unit: string; barcode: string | null; alternateUnits?: string | null } | null }[];
}

interface FifoAlert {
  lotId: string;
  itemName: string;
  quantity: number;
  unit: string;
  daysUntilExpiry: number;
  zoneName?: string;
  severity: string;
}

interface CountSession {
  id: string;
  status: string;
  zone?: { name: string };
  lines: { id: string; inventoryItemId: string; countedQty: number; bookQty: number; variance: number; inventoryItem: { name: string; unit: string } }[];
}

interface CatalogItem {
  id: string;
  name: string;
  barcode: string | null;
  quantity: number;
  unit: string;
  alternateUnits?: { unit: string; factor: number; label?: string }[];
  countByWeight?: boolean;
}

type Tab = "count" | "fifo" | "route";

export function WalkInClient() {
  const [tab, setTab] = useState<Tab>("count");
  const [zones, setZones] = useState<Zone[]>([]);
  const [fifoAlerts, setFifoAlerts] = useState<FifoAlert[]>([]);
  const [session, setSession] = useState<CountSession | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [routeIndex, setRouteIndex] = useState(0);
  const [countQty, setCountQty] = useState("");
  const [countUnit, setCountUnit] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasteReason, setWasteReason] = useState("");
  const [showWaste, setShowWaste] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { online, pendingCount, cacheCatalog, queueCountLine, syncQueue } = useWalkInOffline(
    session?.id ?? null
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/walk-in/counts");
      const data = await res.json();
      setZones(data.zones ?? []);
      setFifoAlerts(data.fifoAlerts ?? []);
      setSession(data.activeSession ?? null);
      if (data.zones?.[0] && !selectedZoneId) setSelectedZoneId(data.zones[0].id);
    } catch {
      setError("Failed to load — using offline cache if available");
    } finally {
      setLoading(false);
    }
  }, [selectedZoneId]);

  useEffect(() => {
    load();
    cacheCatalog().then(async () => {
      try {
        const res = await fetch("/api/walk-in/catalog");
        if (res.ok) {
          const data = await res.json();
          setCatalog(data.items ?? []);
        }
      } catch {
        const cached = localStorage.getItem("catalog-cache");
        if (cached) setCatalog(JSON.parse(cached));
      }
    });
  }, [load, cacheCatalog]);

  const selectedZone = zones.find((z) => z.id === selectedZoneId);
  const routeSteps = selectedZone?.routeSteps.filter((s) => s.inventoryItem) ?? [];
  const currentStep = routeSteps[routeIndex];
  const currentItem = currentStep?.inventoryItem;

  const startSession = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/walk-in/counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoneId: selectedZoneId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSession(data.session);
      setRouteIndex(0);
      setCountQty("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setSaving(false);
    }
  };

  const submitCount = async (itemId: string, qty: number, unit: string, weighedGrams?: number) => {
    if (!session) return;
    setSaving(true);
    const payload = {
      inventoryItemId: itemId,
      countedQty: qty,
      countUnit: unit,
      weighedGrams,
      clientId: crypto.randomUUID(),
    };

    try {
      if (online) {
        const res = await fetch(`/api/walk-in/counts/${session.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setSession((prev) =>
          prev
            ? {
                ...prev,
                lines: [
                  ...prev.lines.filter((l) => l.inventoryItemId !== itemId),
                  {
                    id: data.line.id,
                    inventoryItemId: itemId,
                    countedQty: data.countedQty,
                    bookQty: data.bookQty,
                    variance: data.variance,
                    inventoryItem: { name: data.item.name, unit: data.item.unit },
                  },
                ],
              }
            : prev
        );
      } else {
        await queueCountLine(payload);
      }
      setCountQty("");
      if (routeIndex < routeSteps.length - 1) setRouteIndex((i) => i + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Count failed");
    } finally {
      setSaving(false);
    }
  };

  const finalizeSession = async () => {
    if (!session) return;
    setSaving(true);
    try {
      await syncQueue();
      const res = await fetch(`/api/walk-in/counts/${session.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize" }),
      });
      if (!res.ok) throw new Error("Finalize failed");
      setSession(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finalize failed");
    } finally {
      setSaving(false);
    }
  };

  const logWaste = async () => {
    if (!currentItem || !wasteReason) return;
    const qty = parseFloat(countQty) || 1;
    try {
      if (online) {
        await fetch("/api/walk-in/waste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inventoryItemId: currentItem.id,
            itemName: currentItem.name,
            quantity: qty,
            unit: countUnit || currentItem.unit,
            reason: wasteReason,
            countSessionId: session?.id,
          }),
        });
      }
      setShowWaste(false);
      setWasteReason("");
    } catch {
      setError("Waste log failed");
    }
  };

  const onScaleWeight = useCallback(
    (value: number, unit: string) => {
      if (!currentItem) return;
      const alternates = parseAlternateUnits(
        typeof currentItem.alternateUnits === "string" ? currentItem.alternateUnits : undefined
      );
      const converted = scaleReadingToInventoryUnit(value, unit, currentItem.unit, alternates);
      setCountQty(String(Math.round(converted * 100) / 100));
      setCountUnit(currentItem.unit);
    },
    [currentItem]
  );

  const scale = useScaleSerial(onScaleWeight);

  const onBarcode = useCallback(
    (code: string) => {
      const catalogMatch = findItemByBarcode(catalog, code);
      const routeMatch = routeSteps.find(
        (s) => s.inventoryItem && findItemByBarcode([s.inventoryItem], code)
      );
      const item = catalogMatch ?? routeMatch?.inventoryItem;
      if (item) {
        const idx = routeSteps.findIndex((s) => s.inventoryItemId === item.id);
        if (idx >= 0) setRouteIndex(idx);
        setCountUnit(item.unit);
      }
    },
    [catalog, routeSteps]
  );

  const { videoRef, active: scanning, start: startScanning, stop: stopScanning } = useBarcodeScanner(onBarcode);

  useEffect(() => {
    if (currentItem) {
      setCountUnit(currentItem.unit);
      const counted = session?.lines.find((l) => l.inventoryItemId === currentItem.id);
      if (counted) setCountQty(String(counted.countedQty));
      else setCountQty("");
    }
  }, [currentItem, session]);

  const alternates = currentItem
    ? parseAlternateUnits(
        typeof currentItem.alternateUnits === "string" ? currentItem.alternateUnits : undefined
      )
    : [];
  const conversionHints =
    currentItem && countQty
      ? formatConversionHint(parseFloat(countQty) || 0, currentItem.unit, alternates)
      : [];

  const fifoCritical = fifoAlerts.filter((a) => a.severity === "EXPIRED" || a.severity === "EXPIRING").length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge className={online ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
          {online ? <Wifi className="mr-1 inline h-3 w-3" /> : <WifiOff className="mr-1 inline h-3 w-3" />}
          {online ? "Online" : "Offline — counts queue locally"}
        </Badge>
        {pendingCount > 0 && (
          <Badge className="bg-blue-100 text-blue-800">{pendingCount} pending sync</Badge>
        )}
        <Button variant="ghost" size="sm" onClick={() => { load(); syncQueue(); }} className="ml-auto">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Storage zones" value={zones.length} subtext="Shelf-to-sheet routes" />
        <StatCard label="Route items" value={routeSteps.length} subtext={selectedZone?.name ?? "Select zone"} />
        <StatCard label="FIFO alerts" value={fifoCritical} subtext="Expiring or expired" />
        <StatCard label="Counted" value={session?.lines.length ?? 0} subtext={session ? "This session" : "No active count"} />
      </div>

      <ScrollableTabs className="mb-4 border-b border-slate-200 pb-2" menuLabel="Walk-in">
        {(["count", "fifo", "route"] as Tab[]).map((t) => (
          <TabPill key={t} active={tab === t} onClick={() => setTab(t)}>
            {t === "count" ? "Count" : t === "fifo" ? "FIFO Alerts" : "Count Route"}
          </TabPill>
        ))}
      </ScrollableTabs>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {tab === "count" && (
        <PageSectionShell pageId="walk-in-count">
          <div className="grid gap-6 lg:grid-cols-2">
          <PageSection id="walk-in-start" title="Start count" defaultOpen>
            <FormField label="Storage zone">
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={selectedZoneId}
                onChange={(e) => { setSelectedZoneId(e.target.value); setRouteIndex(0); }}
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </FormField>
            {!session ? (
              <Button className="mt-4 w-full" onClick={startSession} disabled={saving || !selectedZoneId}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-2 h-4 w-4" />}
                Start shelf-to-sheet count
              </Button>
            ) : (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-slate-600">
                  Session active — {session.lines.length} items counted
                </p>
                <Button variant="secondary" className="w-full" onClick={finalizeSession} disabled={saving}>
                  Finalize & update book inventory
                </Button>
              </div>
            )}
          </PageSection>

          {session && currentItem && (
            <PageSection
              id="walk-in-item"
              title={currentItem.name}
              description={`Step ${routeIndex + 1} of ${routeSteps.length} · ${selectedZone?.name} · Book: ${currentItem.quantity} ${currentItem.unit}`}
            >
              <div className="mb-3 flex items-center justify-end">
                <ChevronRight className="h-5 w-5 text-slate-300" />
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={scanning ? stopScanning : startScanning}>
                  <Barcode className="mr-1 h-3 w-3" />
                  {scanning ? "Stop scan" : "Scan"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={scale.connected ? scale.disconnect : scale.connect}
                >
                  <Scale className="mr-1 h-3 w-3" />
                  {scale.connected ? "Disconnect scale" : "Connect Bluetooth scale"}
                </Button>
              </div>

              {scanning && (
                <div className="relative mb-4 aspect-video overflow-hidden rounded-lg bg-black">
                  <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <FormField label={`Count (${countUnit || currentItem.unit})`}>
                  <Input
                    type="number"
                    step="0.01"
                    value={countQty}
                    onChange={(e) => setCountQty(e.target.value)}
                    placeholder="0"
                  />
                </FormField>
                <FormField label="Count as">
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={countUnit || currentItem.unit}
                    onChange={(e) => setCountUnit(e.target.value)}
                  >
                    <option value={currentItem.unit}>{currentItem.unit} (inventory)</option>
                    {alternates.map((a) => (
                      <option key={a.unit} value={a.unit}>{a.label ?? a.unit}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              {conversionHints.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  ≈ {conversionHints.join(" · ")} (auto-converted on save)
                </p>
              )}

              {countQty && countUnit && countUnit !== currentItem.unit && (
                <p className="mt-1 text-sm text-orange-700">
                  → {convertQuantity(parseFloat(countQty) || 0, countUnit, currentItem.unit, alternates).toFixed(2)}{" "}
                  {currentItem.unit} in book
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  className="flex-1"
                  disabled={saving || !countQty}
                  onClick={() =>
                    submitCount(
                      currentItem.id,
                      parseFloat(countQty),
                      countUnit || currentItem.unit
                    )
                  }
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Save & next
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowWaste(true)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {showWaste && (
                <div className="mt-4 rounded-lg border border-slate-200 p-3">
                  <FormField label="Waste reason">
                    <Input value={wasteReason} onChange={(e) => setWasteReason(e.target.value)} placeholder="Spoilage, trim, dropped" />
                  </FormField>
                  <Button size="sm" className="mt-2" onClick={logWaste}>Log waste</Button>
                </div>
              )}

              <div className="mt-4 flex justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={routeIndex === 0}
                  onClick={() => setRouteIndex((i) => i - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={routeIndex >= routeSteps.length - 1}
                  onClick={() => setRouteIndex((i) => i + 1)}
                >
                  Skip
                </Button>
              </div>
            </PageSection>
          )}
          </div>
        </PageSectionShell>
      )}

      {tab === "fifo" && (
        <PageSectionShell pageId="walk-in-fifo">
          <PageSection id="fifo-alerts" title="First-In, First-Out" defaultOpen>
          {fifoAlerts.length === 0 ? (
            <p className="text-slate-500">No expiry or rotation alerts.</p>
          ) : (
            <div className="space-y-3">
              {fifoAlerts.map((a) => (
                <div
                  key={a.lotId}
                  className={`rounded-lg border p-3 ${
                    a.severity === "EXPIRED"
                      ? "border-red-200 bg-red-50"
                      : a.severity === "EXPIRING"
                        ? "border-amber-200 bg-amber-50"
                        : "border-blue-200 bg-blue-50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{a.itemName}</p>
                      <p className="text-sm text-slate-600">
                        {a.quantity} {a.unit} · {a.zoneName ?? "Storage"}
                      </p>
                    </div>
                    <Badge
                      className={
                        a.severity === "EXPIRED"
                          ? "bg-red-200 text-red-900"
                          : a.severity === "EXPIRING"
                            ? "bg-amber-200 text-amber-900"
                            : "bg-blue-200 text-blue-900"
                      }
                    >
                      {a.severity === "USE_FIRST" ? "Use first" : a.severity.toLowerCase()}
                    </Badge>
                  </div>
                  {a.severity !== "USE_FIRST" && (
                    <p className="mt-1 text-xs text-slate-500">
                      {a.daysUntilExpiry < 0
                        ? `${Math.abs(a.daysUntilExpiry)} days past expiry`
                        : `${a.daysUntilExpiry} days left`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          </PageSection>
        </PageSectionShell>
      )}

      {tab === "route" && (
        <PageSectionShell pageId="walk-in-route">
          <PageSection
            id="count-route"
            title="Shelf-to-Sheet Route"
            description="Count path matches your physical walk-through order — top shelf to bottom, door to back."
            defaultOpen
          >
          <FormField label="Zone">
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={selectedZoneId}
              onChange={(e) => setSelectedZoneId(e.target.value)}
            >
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
          </FormField>
          <ol className="mt-4 space-y-2">
            {routeSteps.map((step, idx) => (
              <li
                key={step.id}
                className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-medium">
                  {idx + 1}
                </span>
                <MapPin className="h-4 w-4 text-slate-400" />
                <span className="font-medium">{step.inventoryItem?.name}</span>
                <span className="ml-auto text-slate-400">{step.inventoryItem?.unit}</span>
              </li>
            ))}
          </ol>
          {routeSteps.length === 0 && (
            <p className="mt-4 text-sm text-slate-500">No route configured — run seed or assign items to this zone.</p>
          )}
          </PageSection>
        </PageSectionShell>
      )}
    </div>
  );
}
