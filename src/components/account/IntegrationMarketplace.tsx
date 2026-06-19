"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Filter,
  Loader2,
  Plug,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { Button, Badge, ScrollableTabs, TabPill } from "@/components/ui";
import { cn } from "@/lib/utils";
import type {
  ApiTier,
  FunctionMapEntry,
  IntegrationPriority,
  LandscapeCategory,
  LandscapeSystem,
} from "@/lib/integrations/landscape";
import { FUNCTION_ROUTES } from "@/lib/integrations/landscape";

interface LandscapePayload {
  systems: LandscapeSystem[];
  categories: LandscapeCategory[];
  priorities: IntegrationPriority[];
  functions: FunctionMapEntry[];
  stats: {
    totalSystems: number;
    totalCategories: number;
    publicApi: number;
    partnerApi: number;
    limitedApi: number;
    nativeLive: number;
    nativePlanned: number;
  };
}

interface IntegrationMarketplaceProps {
  canManage: boolean;
  onNativeConnect?: (action: string, extra?: Record<string, unknown>) => Promise<void>;
  onSwitchTab?: (tab: "billing") => void;
}

const API_TIER_LABELS: Record<ApiTier, string> = {
  public: "Public API",
  partner: "Partner / Enterprise",
  limited: "Limited / Unclear",
  unknown: "Unknown",
};

const API_TIER_COLORS: Record<ApiTier, string> = {
  public: "bg-emerald-100 text-emerald-800",
  partner: "bg-blue-100 text-blue-800",
  limited: "bg-amber-100 text-amber-800",
  unknown: "bg-slate-100 text-slate-600",
};

const MODE_LABELS: Record<LandscapeSystem["integrationMode"], string> = {
  native_live: "Available now",
  native_planned: "On roadmap",
  partner_api: "Partner API",
  csv_bridge: "CSV / import",
  webhook_bridge: "Automation bridge",
  manual: "Manual / export",
};

function SystemCard({
  system,
  canManage,
  busy,
  onConnect,
  onRequest,
}: {
  system: LandscapeSystem;
  canManage: boolean;
  busy: string | null;
  onConnect: (system: LandscapeSystem) => void;
  onRequest: (system: LandscapeSystem) => void;
}) {
  const isLive = system.integrationMode === "native_live";
  const isPlanned = system.integrationMode === "native_planned";

  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate font-semibold text-slate-900">{system.name}</h4>
          <p className="mt-0.5 text-xs text-slate-500">{system.category}</p>
        </div>
        <Badge className={cn("shrink-0 text-[0.65rem]", API_TIER_COLORS[system.apiTier])}>
          {API_TIER_LABELS[system.apiTier]}
        </Badge>
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{system.functions}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge className="bg-slate-100 text-slate-700">{MODE_LABELS[system.integrationMode]}</Badge>
        {system.pinnacleArea && (
          <Badge className="bg-orange-50 text-orange-800">{system.pinnacleArea}</Badge>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {isLive && canManage && system.connectAction && (
          <Button
            size="sm"
            disabled={busy === system.id}
            onClick={() => onConnect(system)}
            className="btn-mobile-full sm:w-auto"
          >
            {busy === system.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
            Connect
          </Button>
        )}
        {isPlanned && canManage && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy === system.id}
            onClick={() => onRequest(system)}
            className="btn-mobile-full sm:w-auto"
          >
            Request integration
          </Button>
        )}
        {!isLive && !isPlanned && system.sourceUrl && (
          <a
            href={system.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100"
          >
            API docs
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {system.featureRoute && (
          <Link
            href={system.featureRoute}
            className="inline-flex min-h-[40px] items-center rounded-lg px-3 text-sm text-orange-700 hover:bg-orange-50"
          >
            Open in Pinnacle
          </Link>
        )}
      </div>
    </article>
  );
}

export function IntegrationMarketplace({
  canManage,
  onNativeConnect,
  onSwitchTab,
}: IntegrationMarketplaceProps) {
  const [data, setData] = useState<LandscapePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [apiTier, setApiTier] = useState<ApiTier | "">("");
  const [availability, setAvailability] = useState<"all" | "live" | "planned">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (category) params.set("category", category);
      if (apiTier) params.set("apiTier", apiTier);
      const res = await fetch(`/api/integrations/landscape?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load integration catalog");
      setData(json);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load catalog");
    } finally {
      setLoading(false);
    }
  }, [query, category, apiTier]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const filteredSystems = useMemo(() => {
    if (!data) return [];
    return data.systems.filter((s) => {
      if (availability === "live" && s.integrationMode !== "native_live") return false;
      if (availability === "planned" && s.integrationMode !== "native_planned") return false;
      return true;
    });
  }, [data, availability]);

  const handleConnect = async (system: LandscapeSystem) => {
    const action = system.connectAction;
    if (!action) return;

    setBusy(system.id);
    setMessage(null);
    try {
      if (action.type === "page") {
        window.location.assign(action.href);
        return;
      }
      if (action.type === "csv_import") {
        window.location.assign(action.href);
        return;
      }
      if (action.type === "payment") {
        onSwitchTab?.("billing");
        setMessage(`Open Billing to connect ${action.provider === "square" ? "Square" : "Stripe"}.`);
        return;
      }
      if (action.type === "webhook") {
        setMessage(
          `Automation webhook: POST ${window.location.origin}${action.endpoint} — set INTEGRATION_WEBHOOK_SECRET in your environment.`
        );
        return;
      }
      if (action.type === "accounting" && onNativeConnect) {
        await onNativeConnect("accounting_connect", { provider: action.provider });
        setMessage(`Connecting ${system.name}…`);
        return;
      }
      if (action.type === "vendor" && onNativeConnect) {
        await onNativeConnect("vendor_connect", { provider: action.provider });
        setMessage(`Connecting ${system.name}…`);
        return;
      }
      if (action.type === "pos_sync") {
        setMessage(`${system.name} uses partner APIs — request access below while we finish the native connector.`);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleRequest = async (system: LandscapeSystem) => {
    setBusy(system.id);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/landscape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemId: system.id, systemName: system.name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setMessage(json.message);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading integration catalog…
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-red-600">{message || "Catalog unavailable"}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Integration marketplace</h3>
        <p className="mt-1 text-sm text-slate-600">
          {data.stats.totalSystems} restaurant systems across {data.stats.totalCategories} categories —
          mapped to Pinnacle features with API paths from your landscape workbook.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge className="bg-emerald-100 text-emerald-800">{data.stats.publicApi} public APIs</Badge>
          <Badge className="bg-blue-100 text-blue-800">{data.stats.partnerApi} partner APIs</Badge>
          <Badge className="bg-orange-100 text-orange-800">{data.stats.nativeLive} live in Pinnacle</Badge>
          <Badge className="bg-violet-100 text-violet-800">{data.stats.nativePlanned} on roadmap</Badge>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      {/* MVP priorities */}
      <section className="rounded-xl border border-orange-200 bg-orange-50/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-5 w-5 text-orange-700" />
          <h4 className="font-semibold text-slate-900">MVP integration path</h4>
        </div>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.priorities.slice(0, 6).map((p) => (
            <li key={p.priority} className="rounded-lg bg-white/80 px-3 py-2 text-sm">
              <span className="font-medium text-orange-800">#{p.priority} {p.name}</span>
              <p className="mt-0.5 text-xs text-slate-600">{p.mvp}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Business functions → Pinnacle screens */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-600" />
          <h4 className="font-semibold text-slate-900">What Pinnacle tracks</h4>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.functions.map((f) => (
            <Link
              key={f.function}
              href={FUNCTION_ROUTES[f.function] ?? "/dashboard"}
              className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm transition-colors hover:border-orange-200 hover:bg-orange-50/50"
            >
              <span className="font-medium text-slate-900">{f.function}</span>
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{f.pinnacleFeature}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Toast, Square, DoorDash, 7shifts…"
            className="input pl-9"
          />
        </div>

        <ScrollableTabs className="gap-1.5" menuLabel="Filters">
          <TabPill active={availability === "all"} onClick={() => setAvailability("all")}>
            All
          </TabPill>
          <TabPill active={availability === "live"} onClick={() => setAvailability("live")}>
            Available now
          </TabPill>
          <TabPill active={availability === "planned"} onClick={() => setAvailability("planned")}>
            Roadmap
          </TabPill>
          {(["public", "partner", "limited"] as ApiTier[]).map((tier) => (
            <TabPill
              key={tier}
              active={apiTier === tier}
              onClick={() => setApiTier(apiTier === tier ? "" : tier)}
            >
              {API_TIER_LABELS[tier]}
            </TabPill>
          ))}
        </ScrollableTabs>

        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Filter className="h-4 w-4 shrink-0" />
          <select
            className="input max-w-full sm:max-w-md"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories ({data.categories.length})</option>
            {data.categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category} ({c.systemsCount})
              </option>
            ))}
          </select>
          <span className="hidden text-xs text-slate-400 sm:inline">
            {filteredSystems.length} systems
          </span>
        </div>
      </div>

      {/* Category blurb */}
      {category && (
        <p className="text-sm text-slate-600">
          {data.categories.find((c) => c.category === category)?.pinnacleUse}
        </p>
      )}

      {/* System grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filteredSystems.map((system) => (
          <SystemCard
            key={system.id}
            system={system}
            canManage={canManage}
            busy={busy}
            onConnect={handleConnect}
            onRequest={handleRequest}
          />
        ))}
      </div>

      {filteredSystems.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">No systems match your filters.</p>
      )}
    </div>
  );
}
