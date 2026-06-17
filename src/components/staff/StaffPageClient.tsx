"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ComplianceClient } from "@/components/staff/ComplianceClient";
import { RetentionClient } from "@/components/staff/RetentionClient";
import { FraudPreventionPanel } from "@/components/staff/FraudPreventionPanel";
import {
  Users,
  Calendar,
  Banknote,
  ArrowLeftRight,
  CalendarDays,
  UserPlus,
  GraduationCap,
  Shield,
  Heart,
  Clock,
  ClipboardCheck,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { StaffClient } from "@/components/staff/StaffClient";
import { ScheduleClient } from "@/components/staff/ScheduleClient";
import { PayrollClient } from "@/components/staff/PayrollClient";
import { MyScheduleClient } from "@/components/staff/MyScheduleClient";
import { ShiftSwapClient } from "@/components/staff/ShiftSwapClient";
import { HiringClient } from "@/components/staff/HiringClient";
import { TrainingClient } from "@/components/staff/TrainingClient";
import { TimeClockClient } from "@/components/staff/TimeClockClient";
import { TimePunchesPanel } from "@/components/staff/TimePunchesPanel";
import { ForgottenClockOutAlert } from "@/components/staff/ForgottenClockOutAlert";
import { ComplianceAlertsBanner } from "@/components/staff/ComplianceAlertsBanner";

interface StaffMember {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  hourlyRate?: number;
  isTippedEmployee?: boolean;
  tipPoints?: number;
  active: boolean;
}

type Tab = "time_clock" | "punches" | "fraud" | "team" | "schedule" | "payroll" | "my_schedule" | "swaps" | "hiring" | "training" | "compliance" | "retention";

type TabDef = {
  id: Tab;
  label: string;
  icon: LucideIcon;
  show: boolean;
};

export function StaffPageClient({ initialStaff }: { initialStaff: StaffMember[] }) {
  const { can } = useAuth();
  const canEdit = can("edit_staff");
  const canSchedule = can("manage_schedule");
  const canPayroll = can("manage_payroll");
  const canHiring = can("manage_hiring");
  const canTraining = can("manage_training") || can("complete_training");
  const canCompliance = can("manage_compliance");
  const canRetention = can("manage_retention");
  const canOwnSchedule = can("view_own_schedule");
  const canSwaps = canOwnSchedule || can("approve_shift_swaps");
  const canClock = can("clock_in");

  const tabs: TabDef[] = useMemo(
    () =>
      [
        { id: "time_clock", label: "Time clock", icon: Clock, show: canClock },
        { id: "punches", label: "Punches", icon: ClipboardCheck, show: canSchedule },
        { id: "fraud", label: "Fraud prevention", icon: ShieldCheck, show: canSchedule },
        { id: "team", label: "Team", icon: Users, show: true },
        { id: "schedule", label: "Schedule", icon: Calendar, show: canSchedule },
        { id: "swaps", label: "Shift swaps", icon: ArrowLeftRight, show: canSwaps },
        {
          id: "my_schedule",
          label: "My schedule",
          icon: CalendarDays,
          show: canOwnSchedule && !canSchedule,
        },
        { id: "hiring", label: "Hiring", icon: UserPlus, show: canHiring },
        { id: "training", label: "Training", icon: GraduationCap, show: canTraining },
        { id: "retention", label: "Retention", icon: Heart, show: canRetention },
        { id: "payroll", label: "Payroll", icon: Banknote, show: canPayroll },
        { id: "compliance", label: "Compliance", icon: Shield, show: canCompliance },
      ].filter((t) => t.show) as TabDef[],
    [
      canClock,
      canSchedule,
      canHiring,
      canTraining,
      canRetention,
      canPayroll,
      canCompliance,
      canOwnSchedule,
      canSwaps,
    ]
  );

  const defaultTab: Tab = canClock
    ? "time_clock"
    : canHiring
      ? "hiring"
      : canPayroll
        ? "payroll"
        : canSchedule
          ? "schedule"
          : canOwnSchedule
            ? "my_schedule"
            : "team";

  const [tab, setTab] = useState<Tab>(defaultTab);
  const [staff, setStaff] = useState(initialStaff);
  const searchParams = useSearchParams();

  useEffect(() => {
    const fromUrl = searchParams.get("tab") as Tab | null;
    if (fromUrl && tabs.some((t) => t.id === fromUrl)) {
      setTab(fromUrl);
    }
  }, [searchParams, tabs]);

  return (
    <>
      {tabs.length > 1 && (
        <div className="no-print mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                tab === id ? "bg-orange-100 text-orange-800" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "time_clock" && canClock && <TimeClockClient />}
      {tab === "punches" && canSchedule && (
        <>
          <ForgottenClockOutAlert variant="panel" className="mb-6" />
          <ComplianceAlertsBanner variant="panel" className="mb-6" />
          <TimePunchesPanel />
        </>
      )}
      {tab === "fraud" && canSchedule && <FraudPreventionPanel />}
      {tab === "hiring" && canHiring && <HiringClient />}
      {tab === "training" && canTraining && <TrainingClient staff={staff} />}
      {tab === "compliance" && canCompliance && <ComplianceClient staff={staff} />}
      {tab === "retention" && canRetention && <RetentionClient staff={staff} />}
      {tab === "payroll" && canPayroll && <PayrollClient staff={staff} />}
      {tab === "schedule" && canSchedule && <ScheduleClient staff={staff} />}
      {tab === "my_schedule" && canOwnSchedule && <MyScheduleClient />}
      {tab === "swaps" && canSwaps && <ShiftSwapClient />}
      {tab === "team" && (
        <StaffClient initialStaff={staff} onStaffChange={setStaff} canEdit={canEdit} />
      )}
    </>
  );
}
