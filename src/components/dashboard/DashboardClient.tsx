"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Camera,
  Package,
  Users,
  DollarSign,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { PageHeader, StatCard, Badge } from "@/components/ui";
import { InsightPanel } from "@/components/insights/InsightPanel";
import { ForgottenClockOutAlert } from "@/components/staff/ForgottenClockOutAlert";
import { useAuth } from "@/components/auth/AuthProvider";
import { PLAN_BY_ID, requiredPlanForRoute } from "@/lib/plans";
import { formatCurrency } from "@/lib/utils";

interface DashboardData {
  locationName: string;
  menuCount: number;
  inventoryCount: number;
  lowStockCount: number;
  staffCount: number;
  weeklyOrders: number;
  weeklyRevenue: number;
  monthlyExpenses: number;
  photoCount: number;
  insights: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    severity: string;
    actionable: string | null;
    resolved: boolean;
    createdAt: string;
  }>;
  activity: Array<{ id: string; action: string; details: string | null }>;
  lowStock: Array<{ id: string; name: string; quantity: number; unit: string; minQuantity: number }>;
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const searchParams = useSearchParams();
  const upgradeFeature = searchParams.get("upgrade");
  const { can, user } = useAuth();
  const canViewFinances = can("view_finances");
  const canViewInsights = can("view_insights");
  const canSeed = user?.role === "OWNER" || user?.role === "MANAGER";
  const canAnalytics = can("view_analytics");
  const canManageSchedule = can("manage_schedule");
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  const handleSeed = async () => {
    setSeeding(true);
    setSeedMessage(null);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || body.hint || "Seed failed");
      setSeedMessage(body.message);
      if (!body.alreadySeeded) window.location.reload();
    } catch (err) {
      setSeedMessage(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`${data.locationName} — overview of your restaurant operations`}
      >
        <Link
          href="/photos"
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          <Camera className="h-4 w-4" />
          Capture Photo
        </Link>
      </PageHeader>

      {canManageSchedule && <ForgottenClockOutAlert variant="banner" />}

      {upgradeFeature && (
        <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm font-medium text-orange-900">
            Upgrade to unlock {upgradeFeature}
          </p>
          <p className="mt-1 text-sm text-orange-800">
            Your {user?.plan ? PLAN_BY_ID[user.plan].name : "current"} plan does not include this
            feature.{" "}
            {requiredPlanForRoute(`/${upgradeFeature}`)
              ? `Upgrade to ${PLAN_BY_ID[requiredPlanForRoute(`/${upgradeFeature}`)!].name} or higher.`
              : "Choose a higher plan to get access."}
          </p>
          <Link
            href="/docs/#pricing"
            className="mt-3 inline-flex text-sm font-medium text-orange-600 hover:text-orange-500"
          >
            View plans →
          </Link>
        </div>
      )}

      {data.menuCount === 0 && canSeed && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            {data.locationName.includes("Blank")
              ? "You're on a blank demo workspace. Add menu items, inventory, and staff manually, or load sample data below."
              : "Welcome! Load sample menu items, inventory, staff, tables, expenses, and social accounts to explore the app."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSeed}
              disabled={seeding}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {seeding ? "Seeding..." : "Load sample data"}
            </button>
            <a
              href="/api/seed"
              className="text-sm text-amber-700 underline hover:text-amber-900"
            >
              Or open /api/seed
            </a>
          </div>
          {seedMessage && (
            <p className="mt-2 text-sm text-amber-900">{seedMessage}</p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {canViewFinances && (
          <>
            <StatCard
              label="Weekly Revenue"
              value={formatCurrency(data.weeklyRevenue)}
              subtext={`${data.weeklyOrders} orders this week`}
            />
            <StatCard
              label="Monthly Expenses"
              value={formatCurrency(data.monthlyExpenses)}
              subtext="Last 30 days"
            />
          </>
        )}
        <StatCard
          label="Active Staff"
          value={data.staffCount}
          subtext={`${data.menuCount} menu items`}
        />
        <StatCard
          label="Photos Uploaded"
          value={data.photoCount}
          subtext={`${data.lowStockCount} low stock alerts`}
        />
        {!canViewFinances && (
          <StatCard
            label="Orders This Week"
            value={data.weeklyOrders}
            subtext="Open orders from your team"
          />
        )}
      </div>

      {data.lowStock.length > 0 && (
        <div className="mt-6 card border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="font-semibold text-amber-900">Low Stock Alerts</h2>
          </div>
          <ul className="mt-3 space-y-1">
            {data.lowStock.map((item) => (
              <li key={item.id} className="text-sm text-amber-800">
                {item.name}: {item.quantity} {item.unit} (min: {item.minQuantity})
              </li>
            ))}
          </ul>
          <Link
            href="/inventory"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-900"
          >
            View inventory <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {canViewInsights && (
        <div className="mt-8">
          <InsightPanel insights={data.insights} />
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold text-slate-900">Quick Actions</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link href="/photos" className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-slate-50">
              <Camera className="h-5 w-5 text-orange-500" />
              <span className="text-sm font-medium">Upload Photo</span>
            </Link>
            <Link href="/inventory" className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-slate-50">
              <Package className="h-5 w-5 text-blue-500" />
              <span className="text-sm font-medium">Check Inventory</span>
            </Link>
            <Link href="/staff" className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-slate-50">
              <Users className="h-5 w-5 text-purple-500" />
              <span className="text-sm font-medium">View Staff</span>
            </Link>
            {canViewFinances ? (
              <Link href="/finances" className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-slate-50">
                <DollarSign className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">View Finances</span>
              </Link>
            ) : canAnalytics ? (
              <Link href="/analytics" className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-slate-50">
                <DollarSign className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">View Analytics</span>
              </Link>
            ) : (
              <Link href="/orders" className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-slate-50">
                <Package className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">Place Orders</span>
              </Link>
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-slate-900">Recent Activity</h2>
          {data.activity.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No activity yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {data.activity.map((log) => (
                <li key={log.id} className="flex items-start gap-3 text-sm">
                  <Badge className="bg-slate-100 text-slate-600 shrink-0">{log.action}</Badge>
                  <span className="text-slate-600">{log.details}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
