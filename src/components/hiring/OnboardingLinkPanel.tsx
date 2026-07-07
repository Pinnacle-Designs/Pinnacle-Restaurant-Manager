"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  FileText,
  Send,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const DOC_STEPS = [
  { type: "I9", label: "Form I-9" },
  { type: "W4", label: "Form W-4" },
  { type: "DIRECT_DEPOSIT", label: "Direct deposit" },
] as const;

const POLICY_STEPS = [
  { key: "employee_handbook", label: "Employee handbook" },
  { key: "anti_harassment", label: "Anti-harassment" },
  { key: "dress_code", label: "Dress code" },
  { key: "food_safety", label: "Food safety" },
] as const;

interface OnboardingPacket {
  token: string;
  status: string;
  documents: { docType: string; completedAt: string | null }[];
  acknowledgments: { policyKey: string }[];
}

function onboardingHref(token: string) {
  return `/onboard/hire/${token}`;
}

function progress(packet: OnboardingPacket) {
  const docsDone = DOC_STEPS.filter((s) =>
    packet.documents.some((d) => d.docType === s.type && d.completedAt)
  ).length;
  const policiesDone = POLICY_STEPS.filter((s) =>
    packet.acknowledgments.some((a) => a.policyKey === s.key)
  ).length;
  const total = DOC_STEPS.length + POLICY_STEPS.length;
  const done = docsDone + policiesDone;
  return { done, total, complete: done >= total };
}

export function OnboardingLinkPanel({
  packet,
  applicantName,
  onResend,
  resending,
}: {
  packet: OnboardingPacket;
  applicantName: string;
  onResend: () => void;
  resending: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const href = onboardingHref(packet.token);
  const { done, total, complete } = progress(packet);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy onboarding link:", href);
    }
  };

  return (
    <div className="rounded-xl border border-green-200 bg-green-50/80 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-green-100 p-2">
          <Smartphone className="h-5 w-5 text-green-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-green-900">Paperless mobile onboarding</p>
          <p className="mt-0.5 text-sm text-green-800">
            {complete
              ? `${applicantName} completed all forms — staff profile created.`
              : `${applicantName} can complete I-9, W-4, direct deposit, and handbook sign-offs on their phone before day one.`}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
            complete ? "bg-green-200 text-green-900" : "bg-amber-100 text-amber-900"
          )}
        >
          {complete ? "Complete" : `${done}/${total}`}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="flex-1 truncate rounded-lg border border-green-200 bg-white px-3 py-2 text-xs text-slate-700">
          {href}
        </code>
        <div className="flex shrink-0 gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={copyLink}>
            <Copy className="h-4 w-4" />
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-4 w-4" />
            Open
          </Button>
          <Button type="button" size="sm" disabled={resending} onClick={onResend}>
            <Send className="h-4 w-4" />
            Resend SMS
          </Button>
        </div>
      </div>

      <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
        {DOC_STEPS.map((step) => {
          const doneStep = packet.documents.some(
            (d) => d.docType === step.type && d.completedAt
          );
          return (
            <li key={step.type} className="flex items-center gap-2 text-sm text-green-900">
              {doneStep ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <Circle className="h-4 w-4 text-green-400" />
              )}
              <FileText className="h-3.5 w-3.5 opacity-60" />
              {step.label}
            </li>
          );
        })}
        {POLICY_STEPS.map((step) => {
          const doneStep = packet.acknowledgments.some((a) => a.policyKey === step.key);
          return (
            <li key={step.key} className="flex items-center gap-2 text-sm text-green-900">
              {doneStep ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <Circle className="h-4 w-4 text-green-400" />
              )}
              {step.label}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-green-700">
        In development, SMS is logged to the server console. Copy the link above to test on your phone.
      </p>
    </div>
  );
}
