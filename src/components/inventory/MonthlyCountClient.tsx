"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Wifi,
  WifiOff,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  RefreshCw,
  ClipboardList,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Users,
  Barcode,
  Camera,
  UserCheck,
} from "lucide-react";
import { Button, Badge, StatCard, ScrollableTabs, TabPill } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { useWalkInOffline } from "@/hooks/useWalkInOffline";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { format } from "date-fns";
import {
  convertQuantity,
  parseAlternateUnits,
} from "@/lib/walk-in/unit-convert";
import { findItemByBarcode } from "@/lib/walk-in/barcode-match";
import { parseJsonResponse } from "@/lib/fetch-json";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";

const COUNTER_STORAGE_KEY = "pinnacle-monthly-count-counter";

interface Zone {
  id: string;
  name: string;
  slug: string;
  routeSteps: {
    id: string;
    inventoryItemId: string | null;
    sortOrder: number;
    inventoryItem: {
      id: string;
      name: string;
      quantity: number;
      unit: string;
      barcode: string | null;
      alternateUnits?: string | null;
    } | null;
  }[];
}

interface CatalogItem {
  id: string;
  name: string;
  barcode: string | null;
  quantity: number;
  unit: string;
  storageZoneId: string | null;
  alternates: { unit: string; factor: number; label?: string }[];
  isLiquor: boolean;
}

interface CountLine {
  id: string;
  inventoryItemId: string;
  countedQty: number;
  bookQty: number;
  variance: number;
  locationLabel: string | null;
  partialFill: number | null;
  unitBreakdown: string | null;
  countedBy: string | null;
  zoneId?: string | null;
  inventoryItem: { name: string; unit: string };
  zone?: { name: string } | null;
}

interface CountSession {
  id: string;
  status: string;
  periodMonth: string | null;
  lines: CountLine[];
}

interface UnitEntry {
  unit: string;
  qty: string;
}

interface AnomalyWarning {
  message: string;
  deviationPct: number;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

interface ZoneAssignment {
  id: string;
  zoneId: string;
  staffMemberId: string;
  zone: { id: string; name: string; slug: string };
  staffMember: { id: string; name: string; role: string };
}

interface ScannedItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  barcode: string | null;
  alternateUnits?: string | null;
}

type View = "count" | "summary" | "variance" | "assign";

export function MonthlyCountClient() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [session, setSession] = useState<CountSession | null>(null);
  const [history, setHistory] = useState<{ id: string; periodMonth: string | null; finalizedAt: string | null }[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [routeIndex, setRouteIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("count");
  const [anomaly, setAnomaly] = useState<AnomalyWarning | null>(null);
  const [finalizeReport, setFinalizeReport] = useState<{
    cogsPct: number;
    cogsAmount: number;
    totalInventoryValue: number;
    revenue: number;
    summary: string;
    varianceLines: { name: string; varianceQty: number; variancePct: number; flag: string }[];
  } | null>(null);

  const [countMode, setCountMode] = useState<"simple" | "multi" | "partial">("simple");
  const [countQty, setCountQty] = useState("");
  const [countUnit, setCountUnit] = useState("");
  const [partialFill, setPartialFill] = useState(1);
  const [unitEntries, setUnitEntries] = useState<UnitEntry[]>([
    { unit: "case", qty: "" },
    { unit: "sleeve", qty: "" },
    { unit: "each", qty: "" },
  ]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [zoneAssignments, setZoneAssignments] = useState<ZoneAssignment[]>([]);
  const [assignmentDraft, setAssignmentDraft] = useState<Record<string, string>>({});
  const [counterId, setCounterId] = useState("");
  const [filterMyZones, setFilterMyZones] = useState(false);
  const [scannedItem, setScannedItem] = useState<ScannedItem | null>(null);
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { online, pendingCount, cacheCatalog, queueCountLine, syncQueue } = useWalkInOffline(
    session?.id ?? null
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/monthly-count");
      const data = await parseJsonResponse<{
        error?: string;
        zones?: Zone[];
        catalogItems?: CatalogItem[];
        activeSession?: CountSession | null;
        history?: typeof history;
        staff?: StaffMember[];
        zoneAssignments?: ZoneAssignment[];
        currentStaff?: { id: string; name: string; role: string };
      }>(res);
      if (!res.ok) throw new Error(data.error ?? "Failed to load monthly count");
      setZones(data.zones ?? []);
      setCatalog(data.catalogItems ?? []);
      setSession(
        data.activeSession
          ? { ...data.activeSession, lines: data.activeSession.lines ?? [] }
          : null
      );
      setHistory(data.history ?? []);
      setStaff(data.staff ?? []);
      setZoneAssignments(data.zoneAssignments ?? []);
      const draft: Record<string, string> = {};
      for (const a of data.zoneAssignments ?? []) {
        draft[a.zoneId] = a.staffMemberId;
      }
      for (const z of data.zones ?? []) {
        if (!draft[z.id]) draft[z.id] = "";
      }
      setAssignmentDraft(draft);
      if (data.currentStaff?.id) {
        setCounterId((prev) => prev || data.currentStaff!.id);
      }
      if (data.zones?.[0]) {
        setSelectedZoneId((prev) => prev || data.zones![0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load — offline cache available for counts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    cacheCatalog();
    const saved = localStorage.getItem(COUNTER_STORAGE_KEY);
    if (saved) setCounterId(saved);
  }, [load, cacheCatalog]);

  useEffect(() => {
    if (counterId) localStorage.setItem(COUNTER_STORAGE_KEY, counterId);
  }, [counterId]);

  const assignedZoneIds = useMemo(() => {
    if (!counterId || !filterMyZones) return null;
    const ids = zoneAssignments
      .filter((a) => a.staffMemberId === counterId)
      .map((a) => a.zoneId);
    return ids.length > 0 ? new Set(ids) : null;
  }, [counterId, filterMyZones, zoneAssignments]);

  const visibleZones = useMemo(() => {
    if (!assignedZoneIds) return zones;
    return zones.filter((z) => assignedZoneIds.has(z.id));
  }, [zones, assignedZoneIds]);

  useEffect(() => {
    if (visibleZones.length > 0 && !visibleZones.some((z) => z.id === selectedZoneId)) {
      setSelectedZoneId(visibleZones[0].id);
      setRouteIndex(0);
    }
  }, [visibleZones, selectedZoneId]);

  const selectedZone = visibleZones.find((z) => z.id === selectedZoneId) ?? zones.find((z) => z.id === selectedZoneId);

  const routeSteps = useMemo(() => {
    const fromRoute = selectedZone?.routeSteps.filter((s) => s.inventoryItem) ?? [];
    if (fromRoute.length > 0) return fromRoute;

    if (!selectedZoneId) return [];
    return catalog
      .filter((c) => c.storageZoneId === selectedZoneId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item, idx) => ({
        id: `catalog-${item.id}`,
        inventoryItemId: item.id,
        sortOrder: idx,
        inventoryItem: {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          barcode: item.barcode,
          alternateUnits: null,
        },
      }));
  }, [selectedZone, selectedZoneId, catalog]);

  const routeItem = routeSteps[routeIndex]?.inventoryItem ?? null;
  const currentItem = scannedItem ?? routeItem;
  const catalogItem = currentItem ? catalog.find((c) => c.id === currentItem.id) : null;

  const counterName = staff.find((s) => s.id === counterId)?.name;

  const saveAssignments = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const assignments = zones.map((z) => ({
        zoneId: z.id,
        staffMemberId: assignmentDraft[z.id] || null,
      }));
      const res = await fetch(`/api/inventory/monthly-count/${session.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign-zones", assignments }),
      });
      const data = await parseJsonResponse<{ error?: string; assignments?: ZoneAssignment[] }>(res);
      if (!res.ok) throw new Error(data.error ?? "Failed to save assignments");
      setZoneAssignments(data.assignments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save assignments");
    } finally {
      setSaving(false);
    }
  };

  const resolveBarcode = useCallback(
    (code: string) => {
      const catalogMatch = findItemByBarcode(catalog, code);
      if (!catalogMatch) {
        setScanHint(`No item found for barcode "${code.trim()}"`);
        return;
      }

      setScanHint(null);

      for (const zone of zones) {
        const idx = zone.routeSteps.findIndex(
          (s) => s.inventoryItemId === catalogMatch.id
        );
        if (idx >= 0) {
          setSelectedZoneId(zone.id);
          setRouteIndex(idx);
          setScannedItem(null);
          setCountUnit(catalogMatch.unit);
          setCountMode(catalogMatch.isLiquor ? "partial" : "simple");
          return;
        }
      }

      if (catalogMatch.storageZoneId) {
        setSelectedZoneId(catalogMatch.storageZoneId);
        const idx = catalog
          .filter((c) => c.storageZoneId === catalogMatch.storageZoneId)
          .sort((a, b) => a.name.localeCompare(b.name))
          .findIndex((c) => c.id === catalogMatch.id);
        if (idx >= 0) setRouteIndex(idx);
      }

      setScannedItem({
        id: catalogMatch.id,
        name: catalogMatch.name,
        quantity: catalogMatch.quantity,
        unit: catalogMatch.unit,
        barcode: catalogMatch.barcode,
      });
      setCountUnit(catalogMatch.unit);
      setCountMode(catalogMatch.isLiquor ? "partial" : "simple");
    },
    [catalog, zones]
  );

  const onBarcode = useCallback(
    (code: string) => resolveBarcode(code),
    [resolveBarcode]
  );

  const {
    videoRef,
    active: scanning,
    error: cameraError,
    permissionDenied,
    permissionState,
    start: startScanning,
    stop: stopScanning,
    retry: retryCamera,
    supported: scannerSupported,
    nativeSupported,
  } = useBarcodeScanner(onBarcode);

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (barcodeInput.trim()) {
      resolveBarcode(barcodeInput.trim());
      setBarcodeInput("");
    }
  };

  const locationLabel = customLocation.trim() || selectedZone?.name || "Unassigned";

  const zoneProgressMap = useMemo(() => {
    const map = new Map<string, { counted: number; total: number; assignee?: string }>();
    for (const zone of zones) {
      const total = zone.routeSteps.filter((s) => s.inventoryItem).length;
      const counted = new Set(
        (session?.lines ?? [])
          .filter((l) => l.zoneId === zone.id)
          .map((l) => l.inventoryItemId)
      ).size;
      const assignee = zoneAssignments.find((a) => a.zoneId === zone.id)?.staffMember.name;
      map.set(zone.id, { counted, total, assignee });
    }
    return map;
  }, [zones, session, zoneAssignments]);

  const aggregatedByItem = useMemo(() => {
    if (!session) return new Map<string, { total: number; locations: string[]; name: string; unit: string }>();
    const map = new Map<string, { total: number; locations: string[]; name: string; unit: string }>();
    for (const line of session.lines) {
      const loc = line.locationLabel ?? line.zone?.name ?? "Unassigned";
      const prev = map.get(line.inventoryItemId);
      if (prev) {
        prev.total += line.countedQty;
        if (!prev.locations.includes(loc)) prev.locations.push(loc);
      } else {
        map.set(line.inventoryItemId, {
          total: line.countedQty,
          locations: [loc],
          name: line.inventoryItem.name,
          unit: line.inventoryItem.unit,
        });
      }
    }
    return map;
  }, [session]);

  const startSession = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/inventory/monthly-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodMonth: new Date().toISOString() }),
      });
      const data = await parseJsonResponse<{ error?: string; session?: CountSession }>(res);
      if (!res.ok) throw new Error(data.error ?? "Failed to start");
      setSession({ ...data.session!, lines: data.session?.lines ?? [] });
      setRouteIndex(0);
      setFinalizeReport(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setSaving(false);
    }
  };

  const buildPayload = () => {
    if (!currentItem) return null;
    const base: Record<string, unknown> = {
      inventoryItemId: currentItem.id,
      zoneId: selectedZoneId,
      locationLabel,
      clientId: crypto.randomUUID(),
      countedBy: counterName ?? undefined,
    };

    if (countMode === "partial" && catalogItem?.isLiquor) {
      return { ...base, partialFill, countedQty: partialFill, countUnit: currentItem.unit };
    }
    if (countMode === "multi") {
      const breakdown = unitEntries
        .filter((e) => e.qty && parseFloat(e.qty) > 0)
        .map((e) => ({ unit: e.unit, qty: parseFloat(e.qty) }));
      if (breakdown.length === 0) return null;
      const total = breakdown.reduce((s, e) => s + e.qty, 0);
      return { ...base, unitBreakdown: breakdown, countedQty: total, countUnit: currentItem.unit };
    }
    const qty = parseFloat(countQty);
    if (!qty && qty !== 0) return null;
    return {
      ...base,
      countedQty: qty,
      countUnit: countUnit || currentItem.unit,
    };
  };

  const submitCount = async () => {
    if (!session || !currentItem) return;
    const payload = buildPayload();
    if (!payload) return;

    setSaving(true);
    setAnomaly(null);
    try {
      if (online) {
        const res = await fetch(`/api/inventory/monthly-count/${session.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await parseJsonResponse<{
          error?: string;
          anomaly?: AnomalyWarning;
          line?: CountLine;
        }>(res);
        if (!res.ok) throw new Error(data.error ?? "Count failed");
        if (data.anomaly) setAnomaly(data.anomaly);
        if (!data.line) throw new Error("No count line returned");

        const savedLine = {
          ...data.line,
          inventoryItem: data.line.inventoryItem ?? {
            name: currentItem.name,
            unit: currentItem.unit,
          },
          zone: data.line.zone ?? (selectedZone ? { name: selectedZone.name } : null),
        };

        setSession((prev) =>
          prev
            ? {
                ...prev,
                lines: [
                  savedLine,
                  ...(prev.lines ?? []).filter(
                    (l) =>
                      !(
                        l.inventoryItemId === currentItem.id &&
                        (l.locationLabel ?? "") === locationLabel
                      )
                  ),
                ],
              }
            : prev
        );
      } else {
        await queueCountLine(payload);
      }

      resetCountInputs();
      setScannedItem(null);
      if (!scannedItem && routeIndex < routeSteps.length - 1) setRouteIndex((i) => i + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Count failed");
    } finally {
      setSaving(false);
    }
  };

  const resetCountInputs = () => {
    setCountQty("");
    setPartialFill(1);
    setUnitEntries([
      { unit: "case", qty: "" },
      { unit: "sleeve", qty: "" },
      { unit: "each", qty: "" },
    ]);
    setAnomaly(null);
  };

  const finalizeSession = async () => {
    if (!session) return;
    setSaving(true);
    try {
      await syncQueue();
      const res = await fetch(`/api/inventory/monthly-count/${session.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize" }),
      });
      const data = await parseJsonResponse<{ error?: string; report?: typeof finalizeReport }>(res);
      if (!res.ok) throw new Error(data.error ?? "Finalize failed");
      if (data.report) setFinalizeReport(data.report);
      setSession(null);
      setView("summary");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finalize failed");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (currentItem) {
      setCountUnit(currentItem.unit);
      const existing = session?.lines.find(
        (l) =>
          l.inventoryItemId === currentItem.id &&
          (l.locationLabel ?? l.zone?.name ?? "") === locationLabel
      );
      if (existing) {
        if (existing.partialFill != null) {
          setCountMode("partial");
          setPartialFill(existing.partialFill);
        } else if (existing.unitBreakdown) {
          setCountMode("multi");
          try {
            const parsed = JSON.parse(existing.unitBreakdown) as { unit: string; qty: number }[];
            setUnitEntries((prev) =>
              prev.map((e) => {
                const match = parsed.find((p) => p.unit === e.unit);
                return match ? { ...e, qty: String(match.qty) } : e;
              })
            );
          } catch {
            setCountQty(String(existing.countedQty));
          }
        } else {
          setCountMode("simple");
          setCountQty(String(existing.countedQty));
        }
      } else {
        resetCountInputs();
        setCountMode(catalogItem?.isLiquor ? "partial" : "simple");
      }
    }
  }, [currentItem, session, locationLabel, catalogItem?.isLiquor]);

  const alternates = currentItem
    ? [
        ...(catalogItem?.alternates ?? []),
        ...parseAlternateUnits(
          typeof currentItem.alternateUnits === "string" ? currentItem.alternateUnits : undefined
        ),
      ]
    : [];

  const itemAggregate = currentItem ? aggregatedByItem.get(currentItem.id) : null;
  const periodLabel = session?.periodMonth
    ? format(new Date(session.periodMonth), "MMMM yyyy")
    : format(new Date(), "MMMM yyyy");

  const multiUnitPreview =
    countMode === "multi" && currentItem
      ? unitEntries.reduce((total, e) => {
          if (!e.qty || parseFloat(e.qty) <= 0) return total;
          return (
            total +
            convertQuantity(parseFloat(e.qty), e.unit, currentItem.unit, alternates)
          );
        }, 0)
      : 0;

  return (
    <div className="touch-manipulation">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge className={online ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
          {online ? <Wifi className="mr-1 inline h-4 w-4" /> : <WifiOff className="mr-1 inline h-4 w-4" />}
          {online ? "Online" : "Offline — counts queue & sync automatically"}
        </Badge>
        {pendingCount > 0 && (
          <Badge className="bg-blue-100 text-blue-800">{pendingCount} pending sync</Badge>
        )}
        <Badge className="bg-slate-100 text-slate-700">
          <Users className="mr-1 inline h-3 w-3" />
          Multi-user safe
        </Badge>
        <Button variant="ghost" size="sm" onClick={() => { load(); syncQueue(); }} className="ml-auto min-h-10 min-w-10">
          <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Period" value={periodLabel} subtext="Monthly count" />
        <StatCard label="Locations" value={zones.length} subtext="Sheet-to-shelf zones" />
        <StatCard label="Lines counted" value={session?.lines.length ?? 0} subtext="Including duplicates per location" />
        <StatCard label="Items aggregated" value={aggregatedByItem.size} subtext="Unique SKUs totalled" />
      </div>

      <ScrollableTabs className="mb-4 border-b border-slate-200 pb-2" menuLabel="Monthly count">
        {(["count", "assign", "summary", "variance"] as View[]).map((v) => (
          <TabPill key={v} active={view === v} onClick={() => setView(v)}>
            {v === "count"
              ? "Count"
              : v === "assign"
                ? "Zone assignments"
                : v === "summary"
                  ? "Summary"
                  : "Variance & COGS"}
          </TabPill>
        ))}
      </ScrollableTabs>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">{error}</div>
      )}

      {anomaly && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-4 text-base text-amber-900">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" />
          <div>
            <p className="font-semibold">Anomaly detected</p>
            <p>{anomaly.message}</p>
          </div>
        </div>
      )}

      {view === "count" && (
        <PageSectionShell pageId="monthly-count">
        <div className="grid gap-6 lg:grid-cols-2">
          <PageSection id="count-session" title={`Monthly count — ${periodLabel}`} defaultOpen>
            {!session ? (
              <>
                <p className="mb-4 text-base text-slate-600">
                  Full-location count organized by your storage zones. Same item can be counted in multiple locations — totals aggregate automatically.
                </p>
                <Button className="min-h-14 w-full text-lg" onClick={startSession} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ClipboardList className="mr-2 h-5 w-5" />}
                  Start monthly count
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-base text-slate-600">
                  {session.lines.length} lines · {aggregatedByItem.size} unique items
                </p>
                <Button variant="secondary" className="min-h-14 w-full text-lg" onClick={finalizeSession} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                  Submit count &amp; calculate COGS
                </Button>
              </div>
            )}
          </PageSection>

          {session && (
            <PageSection id="count-entry" title="Count entry">
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <FormField label="Counting as">
                  <select
                    className="min-h-12 w-full rounded-lg border border-slate-200 px-4 py-3 text-base"
                    value={counterId}
                    onChange={(e) => setCounterId(e.target.value)}
                  >
                    <option value="">Select employee…</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Zone filter">
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={filterMyZones}
                      onChange={(e) => setFilterMyZones(e.target.checked)}
                      className="h-5 w-5 accent-orange-600"
                    />
                    <span className="text-base">Show only my assigned zones</span>
                  </label>
                </FormField>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-h-11 text-base"
                  onClick={() => (scanning ? stopScanning() : void startScanning())}
                >
                  <Barcode className="mr-2 h-4 w-4" />
                  {scanning ? "Stop camera" : "Scan barcode"}
                </Button>
              </div>

              <div
                className="relative mb-4 overflow-hidden rounded-lg border bg-slate-950 aspect-video"
              >
                <video
                  ref={videoRef}
                  className="aspect-video w-full object-cover"
                  playsInline
                  muted
                />
                <canvas ref={canvasRef} className="hidden" />
                {!scanning && !cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/80 text-slate-300">
                    <Camera className="h-8 w-8" />
                    <p className="text-sm">Tap &quot;Scan barcode&quot; to open the camera</p>
                  </div>
                )}
                {!scanning && cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/90 px-6 text-center text-slate-200">
                    <Camera className="h-8 w-8 text-slate-400" />
                    <p className="text-sm">{cameraError}</p>
                    {permissionDenied ? (
                      <div className="space-y-2">
                        <Button type="button" size="sm" onClick={() => void retryCamera()}>
                          Allow camera access
                        </Button>
                        <p className="text-xs text-slate-400">
                          {permissionState === "denied"
                            ? "Open your browser site settings and allow Camera for this page."
                            : "Your browser will ask for camera permission."}
                        </p>
                      </div>
                    ) : (
                      <Button type="button" size="sm" variant="secondary" onClick={() => void retryCamera()}>
                        Try again
                      </Button>
                    )}
                  </div>
                )}
                {scanning && (
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-8">
                    <div className="mx-auto h-24 max-w-xs rounded-lg border-2 border-orange-400/80" />
                  </div>
                )}
              </div>

              {!nativeSupported && scannerSupported && scanning && (
                <p className="mb-4 text-xs text-slate-600">
                  Using compatibility scanning in this browser. Hold the barcode steady in the frame.
                </p>
              )}
              {!scannerSupported && (
                <p className="mb-4 text-xs text-amber-700">
                  Automatic scanning is not available in this browser — type the barcode below or try Chrome.
                </p>
              )}

              <form onSubmit={handleBarcodeSubmit} className="mb-4 flex gap-2">
                <Input
                  className="min-h-12 flex-1 text-base"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Scan or type barcode (e.g. MEAT-BRISKET-01)"
                  inputMode="numeric"
                  autoFocus={false}
                />
                <Button type="submit" variant="secondary" className="min-h-12">
                  Look up
                </Button>
              </form>

              {scanHint && (
                <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{scanHint}</p>
              )}

              <FormField label="Storage zone (walk path)">
                <select
                  className="min-h-12 w-full rounded-lg border border-slate-200 px-4 py-3 text-base"
                  value={selectedZoneId}
                  onChange={(e) => { setSelectedZoneId(e.target.value); setRouteIndex(0); setScannedItem(null); }}
                >
                  {visibleZones.map((z) => {
                    const prog = zoneProgressMap.get(z.id);
                    const assignee = zoneAssignments.find((a) => a.zoneId === z.id)?.staffMember.name;
                    return (
                      <option key={z.id} value={z.id}>
                        {z.name}
                        {assignee ? ` · ${assignee}` : ""}
                        {prog ? ` (${prog.counted}/${prog.total})` : ""}
                      </option>
                    );
                  })}
                </select>
              </FormField>

              <FormField label="Custom location (optional)">
                <Input
                  className="min-h-12 text-base"
                  value={customLocation}
                  onChange={(e) => setCustomLocation(e.target.value)}
                  placeholder='e.g. "Top Shelf", "Bar Speed Rack"'
                />
              </FormField>

              {currentItem ? (
                <>
                  <div className="my-4 rounded-lg bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">
                      {scannedItem
                        ? "Scanned item"
                        : `Step ${routeIndex + 1} of ${routeSteps.length}`}{" "}
                      · {locationLabel}
                      {counterName && ` · ${counterName}`}
                    </p>
                    <h3 className="text-xl font-bold">{currentItem.name}</h3>
                    <p className="text-base text-slate-600">
                      Book: {currentItem.quantity} {currentItem.unit}
                      {itemAggregate && itemAggregate.locations.length > 0 && (
                        <span className="ml-2 text-orange-700">
                          · Total counted: {itemAggregate.total.toFixed(2)} {itemAggregate.unit}
                          {itemAggregate.locations.length > 1 && ` (${itemAggregate.locations.length} locations)`}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="mb-4 flex flex-wrap gap-2">
                    {(["simple", "multi", "partial"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setCountMode(m)}
                        disabled={m === "partial" && !catalogItem?.isLiquor}
                        className={`min-h-11 rounded-lg px-4 py-2 text-sm font-medium ${
                          countMode === m
                            ? "bg-orange-100 text-orange-800"
                            : "bg-slate-100 text-slate-600"
                        } ${m === "partial" && !catalogItem?.isLiquor ? "opacity-40" : ""}`}
                      >
                        {m === "simple" ? "Single unit" : m === "multi" ? "Multi-unit" : "Partial bottle"}
                      </button>
                    ))}
                  </div>

                  {countMode === "simple" && (
                    <div className="grid grid-cols-2 gap-3">
                      <FormField label={`Quantity (${countUnit || currentItem.unit})`}>
                        <Input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          className="min-h-14 text-xl"
                          value={countQty}
                          onChange={(e) => setCountQty(e.target.value)}
                          placeholder="0"
                        />
                      </FormField>
                      <FormField label="Count as">
                        <select
                          className="min-h-14 w-full rounded-lg border border-slate-200 px-3 text-base"
                          value={countUnit || currentItem.unit}
                          onChange={(e) => setCountUnit(e.target.value)}
                        >
                          <option value={currentItem.unit}>{currentItem.unit}</option>
                          {alternates.map((a) => (
                            <option key={a.unit} value={a.unit}>{a.label ?? a.unit}</option>
                          ))}
                        </select>
                      </FormField>
                    </div>
                  )}

                  {countMode === "multi" && (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-500">Enter cases, sleeves, and individual units — auto-converts to {currentItem.unit}</p>
                      {unitEntries.map((entry, idx) => (
                        <div key={entry.unit} className="flex items-center gap-3">
                          <span className="w-20 text-base font-medium capitalize">{entry.unit}</span>
                          <Input
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            className="min-h-12 flex-1 text-lg"
                            value={entry.qty}
                            onChange={(e) => {
                              const next = [...unitEntries];
                              next[idx] = { ...entry, qty: e.target.value };
                              setUnitEntries(next);
                            }}
                            placeholder="0"
                          />
                        </div>
                      ))}
                      {multiUnitPreview > 0 && (
                        <p className="text-base font-medium text-orange-700">
                          → {multiUnitPreview.toFixed(2)} {currentItem.unit} total
                        </p>
                      )}
                    </div>
                  )}

                  {countMode === "partial" && (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-500">Slide or type how full the bottle is (0 = empty, 1 = full)</p>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={partialFill}
                        onChange={(e) => setPartialFill(parseFloat(e.target.value))}
                        className="h-4 w-full accent-orange-600"
                      />
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          inputMode="decimal"
                          className="min-h-14 w-32 text-xl"
                          value={partialFill}
                          onChange={(e) => setPartialFill(Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)))}
                        />
                        <span className="text-base text-slate-600">
                          = {partialFill.toFixed(2)} bottle{partialFill !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex h-8 overflow-hidden rounded-lg bg-slate-200">
                        <div
                          className="bg-orange-500 transition-all"
                          style={{ width: `${partialFill * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <Button
                    className="mt-6 min-h-14 w-full text-lg"
                    disabled={saving || (countMode === "simple" && !countQty) || (countMode === "multi" && multiUnitPreview <= 0)}
                    onClick={submitCount}
                  >
                    {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                    Save count
                  </Button>

                  <div className="mt-4 flex justify-between gap-2">
                    <Button
                      variant="ghost"
                      className="min-h-12 flex-1 text-base"
                      disabled={routeIndex === 0}
                      onClick={() => setRouteIndex((i) => i - 1)}
                    >
                      <ChevronLeft className="mr-1 h-5 w-5" /> Previous
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-12 flex-1 text-base"
                      disabled={routeIndex >= routeSteps.length - 1}
                      onClick={() => setRouteIndex((i) => i + 1)}
                    >
                      Skip <ChevronRight className="ml-1 h-5 w-5" />
                    </Button>
                  </div>
                </>
              ) : (
                <p className="mt-4 text-base text-slate-500">
                  No items in this zone yet — assign inventory to this storage zone under Items, or scan a barcode to count any item.
                </p>
              )}
            </PageSection>
          )}
        </div>
        </PageSectionShell>
      )}

      {view === "assign" && (
        <PageSectionShell pageId="monthly-assign">
          <PageSection
            id="zone-assignments"
            title="Assign zones to counters"
            description="Split the count across your team — e.g. one person on food zones, another on liquor. Each employee sees only their zones when filtering."
            defaultOpen
          >
          {!session ? (
            <p className="text-slate-500">Start a monthly count to assign zones.</p>
          ) : (
            <>
              <div className="space-y-3">
                {zones.map((zone) => {
                  const prog = zoneProgressMap.get(zone.id);
                  return (
                    <div
                      key={zone.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 px-4 py-3"
                    >
                      <div className="min-w-[140px] flex-1">
                        <p className="font-medium">{zone.name}</p>
                        <p className="text-sm text-slate-500">
                          {prog?.counted ?? 0}/{prog?.total ?? 0} items counted
                        </p>
                      </div>
                      <select
                        className="min-h-11 min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-base"
                        value={assignmentDraft[zone.id] ?? ""}
                        onChange={(e) =>
                          setAssignmentDraft((prev) => ({ ...prev, [zone.id]: e.target.value }))
                        }
                      >
                        <option value="">Unassigned</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              <Button
                className="mt-4 min-h-12 w-full text-base sm:w-auto"
                onClick={saveAssignments}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
                Save assignments
              </Button>
            </>
          )}
          </PageSection>
          {session && zoneAssignments.length > 0 && (
            <PageSection id="current-assignments" title="Current assignments">
              <ul className="space-y-2">
                {zoneAssignments.map((a) => (
                  <li key={a.id} className="flex justify-between rounded-lg bg-slate-50 px-4 py-2 text-sm">
                    <span>{a.zone.name}</span>
                    <span className="font-medium">{a.staffMember.name}</span>
                  </li>
                ))}
              </ul>
            </PageSection>
          )}
        </PageSectionShell>
      )}

      {view === "summary" && (
        <PageSectionShell pageId="monthly-summary">
          <PageSection id="count-summary" title="Count summary" defaultOpen>
          {finalizeReport ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-green-50 p-4">
                  <p className="text-sm text-green-700">COGS %</p>
                  <p className="text-3xl font-bold text-green-900">{finalizeReport.cogsPct}%</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-sm text-blue-700">COGS amount</p>
                  <p className="text-3xl font-bold text-blue-900">${finalizeReport.cogsAmount.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-orange-50 p-4">
                  <p className="text-sm text-orange-700">Inventory value</p>
                  <p className="text-3xl font-bold text-orange-900">${finalizeReport.totalInventoryValue.toLocaleString()}</p>
                </div>
              </div>
              <p className="text-base text-slate-600">{finalizeReport.summary}</p>
            </div>
          ) : session ? (
            <div>
              <p className="mb-4 text-base text-slate-600">{session.lines.length} count lines across {aggregatedByItem.size} items</p>
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {Array.from(aggregatedByItem.entries()).map(([id, agg]) => (
                  <div key={id} className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3">
                    <div>
                      <p className="font-medium">{agg.name}</p>
                      <p className="text-sm text-slate-500">{agg.locations.join(", ")}</p>
                    </div>
                    <span className="text-lg font-semibold">{agg.total.toFixed(2)} {agg.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-slate-500">No active or recent count. Start a monthly count to begin.</p>
          )}
          </PageSection>
          {history.length > 0 && (
            <PageSection id="past-counts" title="Past monthly counts">
              <ul className="space-y-2">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2 text-sm">
                    <span>{h.periodMonth ? format(new Date(h.periodMonth), "MMMM yyyy") : "Unknown"}</span>
                    <span className="text-slate-500">
                      {h.finalizedAt ? format(new Date(h.finalizedAt), "MMM d, yyyy") : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </PageSection>
          )}
        </PageSectionShell>
      )}

      {view === "variance" && (
        <PageSectionShell pageId="monthly-variance">
          <PageSection
            id="variance-analysis"
            title="Theoretical vs. actual variance"
            description="Opening + purchases − POS sales compared to your physical count. Uses latest invoice prices."
            defaultOpen
          >
          {finalizeReport?.varianceLines && finalizeReport.varianceLines.length > 0 ? (
            <div className="space-y-2">
              {finalizeReport.varianceLines.slice(0, 20).map((line) => (
                <div
                  key={line.name}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    line.flag === "UNDER"
                      ? "border-red-200 bg-red-50"
                      : line.flag === "OVER"
                        ? "border-amber-200 bg-amber-50"
                        : "border-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {line.flag === "UNDER" ? (
                      <TrendingDown className="h-5 w-5 text-red-600" />
                    ) : line.flag === "OVER" ? (
                      <TrendingUp className="h-5 w-5 text-amber-600" />
                    ) : null}
                    <span className="font-medium">{line.name}</span>
                  </div>
                  <span className="text-base">
                    {line.varianceQty > 0 ? "+" : ""}{line.varianceQty} ({line.variancePct}%)
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500">Finalize a monthly count to see variance analysis and COGS.</p>
          )}
          </PageSection>
        </PageSectionShell>
      )}
    </div>
  );
}
