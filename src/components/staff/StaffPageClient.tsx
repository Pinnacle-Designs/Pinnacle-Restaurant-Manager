"use client";

import { useState } from "react";
import { ComplianceClient } from "@/components/staff/ComplianceClient";
import { RetentionClient } from "@/components/staff/RetentionClient";
import { Users, Calendar, Banknote, ArrowLeftRight, CalendarDays, UserPlus, GraduationCap, Shield, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { StaffClient } from "@/components/staff/StaffClient";
import { ScheduleClient } from "@/components/staff/ScheduleClient";
import { PayrollClient } from "@/components/staff/PayrollClient";
import { MyScheduleClient } from "@/components/staff/MyScheduleClient";
import { ShiftSwapClient } from "@/components/staff/ShiftSwapClient";
import { HiringClient } from "@/components/staff/HiringClient";
import { TrainingClient } from "@/components/staff/TrainingClient";

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

type Tab = "team" | "schedule" | "payroll" | "my_schedule" | "swaps" | "hiring" | "training" | "compliance" | "retention";

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

  const defaultTab: Tab = canHiring
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

  const tabs = (
    [
      { id: "hiring" as Tab, label: "Hiring", icon: UserPlus, show: canHiring },
      { id: "training" as Tab, label: "Training", icon: GraduationCap, show: canTraining },
      { id: "compliance" as Tab, label: "Compliance", icon: Shield, show: canCompliance },
      { id: "retention" as Tab, label: "Retention", icon: Heart, show: canRetention },
      { id: "payroll" as Tab, label: "Payroll", icon: Banknote, show: canPayroll },
      { id: "schedule" as Tab, label: "Schedule", icon: Calendar, show: canSchedule },
      { id: "my_schedule" as Tab, label: "My schedule", icon: CalendarDays, show: canOwnSchedule && !canSchedule },
      { id: "swaps" as Tab, label: "Shift swaps", icon: ArrowLeftRight, show: canSwaps },
      { id: "team" as Tab, label: "Team", icon: Users, show: true },
    ] as { id: Tab; label: string; icon: typeof Users; show: boolean }[]
  ).filter((t) => t.show);

  return (
    <div>
      {tabs.length > 1 && (
        <div className="mb-6 flex gap-1 rounded-lg border bg-white p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors sm:flex-none",
                tab === id ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "hiring" && canHiring ? (
        <HiringClient />
      ) : tab === "training" && canTraining ? (
        <TrainingClient staff={staff} />
      ) : tab === "compliance" && canCompliance ? (
        <ComplianceClient staff={staff} />
      ) : tab === "retention" && canRetention ? (
        <RetentionClient staff={staff} />
      ) : tab === "payroll" && canPayroll ? (
        <PayrollClient staff={staff} />
      ) : tab === "schedule" && canSchedule ? (
        <ScheduleClient staff={staff} />
      ) : tab === "my_schedule" && canOwnSchedule ? (
        <MyScheduleClient />
      ) : tab === "swaps" && canSwaps ? (
        <ShiftSwapClient />
      ) : (
        <StaffClient initialStaff={staff} onStaffChange={setStaff} canEdit={canEdit} />
      )}
    </div>
  );
}
