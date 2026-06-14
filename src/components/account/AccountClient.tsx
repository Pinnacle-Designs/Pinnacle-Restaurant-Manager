"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Camera,
  CreditCard,
  Lock,
  Shield,
  User,
  CheckCircle2,
  AlertCircle,
  Users,
} from "lucide-react";
import { PageHeader, Button, Badge } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { useAuth } from "@/components/auth/AuthProvider";
import { PermissionsTab } from "@/components/account/PermissionsTab";
import { PLAN_BY_ID } from "@/lib/plans";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/permissions";
import { cn, formatCurrency } from "@/lib/utils";
import type { PlanId } from "@/lib/plans";
import type { AppRole } from "@prisma/client";

type Tab = "profile" | "security" | "billing" | "permissions";

const BASE_TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Lock },
  { id: "billing", label: "Billing & autopay", icon: CreditCard },
  { id: "permissions", label: "Team access", icon: Users },
];

interface AccountData {
  profile: {
    id: string;
    email: string;
    name: string;
    role: AppRole;
    avatarUrl: string | null;
  };
  location: { id: string; name: string };
  billing: {
    plan: PlanId;
    planName: string;
    monthlyAmount: number;
    autopayEnabled: boolean;
    billingEmail: string | null;
    paymentBrand: string | null;
    paymentLast4: string | null;
    paymentExpMonth: number | null;
    paymentExpYear: number | null;
    nextBillingDate: string | null;
    hasPaymentMethod: boolean;
    canManage: boolean;
  };
}

function AvatarPlaceholder({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-orange-100 text-2xl font-semibold text-orange-700">
      {initial}
    </div>
  );
}

export function AccountClient() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab | null) ?? "profile";
  const { refresh, can } = useAuth();
  const visibleTabs = BASE_TABS.filter(
    (item) => item.id !== "permissions" || can("manage_permissions")
  );
  const [tab, setTab] = useState<Tab>(
    visibleTabs.some((t) => t.id === initialTab) ? initialTab : "profile"
  );
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const [billingEmail, setBillingEmail] = useState("");
  const [autopayEnabled, setAutopayEnabled] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load account");
      setData(json);
      setName(json.profile.name);
      setBillingEmail(json.billing.billingEmail || json.profile.email);
      setAutopayEnabled(json.billing.autopayEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load account");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setProfileMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/account/avatar", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setData((prev) =>
        prev
          ? { ...prev, profile: { ...prev.profile, avatarUrl: json.avatarUrl } }
          : prev
      );
      setProfileMessage("Profile photo updated");
      await refresh();
    } catch (err) {
      setProfileMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save profile");
      setProfileMessage("Profile saved");
      await refresh();
    } catch (err) {
      setProfileMessage(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setProfileSaving(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);
    if (newPassword !== confirmPassword) {
      setPasswordMessage("New passwords do not match");
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update password");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated successfully");
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setPasswordSaving(false);
    }
  };

  const saveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data?.billing.canManage) return;
    setBillingSaving(true);
    setBillingMessage(null);
    try {
      const payload: Record<string, unknown> = {
        autopayEnabled,
        billingEmail,
      };
      if (cardNumber.trim()) {
        payload.cardNumber = cardNumber;
        payload.expMonth = Number(expMonth);
        payload.expYear = Number(expYear);
      }

      const res = await fetch("/api/account/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save billing");

      setCardNumber("");
      setExpMonth("");
      setExpYear("");
      setBillingMessage(
        autopayEnabled ? "Autopay is enabled for your subscription" : "Billing settings saved"
      );
      await loadAccount();
    } catch (err) {
      setBillingMessage(err instanceof Error ? err.message : "Could not save billing");
    } finally {
      setBillingSaving(false);
    }
  };

  const removePaymentMethod = async () => {
    if (!data?.billing.canManage) return;
    setBillingSaving(true);
    setBillingMessage(null);
    try {
      const res = await fetch("/api/account/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autopayEnabled: false, removePaymentMethod: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not remove card");
      setAutopayEnabled(false);
      setBillingMessage("Payment method removed");
      await loadAccount();
    } catch (err) {
      setBillingMessage(err instanceof Error ? err.message : "Could not remove card");
    } finally {
      setBillingSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-slate-500">Loading account…</div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {error || "Account unavailable"}
      </div>
    );
  }

  const avatarUrl = data.profile.avatarUrl;

  return (
    <div>
      <PageHeader
        title="Account"
        description="Manage your profile, password, and subscription billing."
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex gap-2 overflow-x-auto lg:w-52 lg:flex-col lg:gap-1">
          {visibleTabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-orange-50 text-orange-700"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {tab === "profile" && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your photo and name appear across the app and on schedules.
              </p>

              <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <div className="relative">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt={data.profile.name}
                      width={96}
                      height={96}
                      className="h-24 w-24 rounded-full object-cover ring-2 ring-slate-100"
                    />
                  ) : (
                    <AvatarPlaceholder name={data.profile.name} />
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                    aria-label="Change profile photo"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => void handleAvatarChange(e)}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{data.profile.name}</p>
                  <p className="text-sm text-slate-500">{data.profile.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge className={ROLE_COLORS[data.profile.role]}>
                      {ROLE_LABELS[data.profile.role]}
                    </Badge>
                    <Badge className="bg-slate-100 text-slate-700">
                      {data.location.name}
                    </Badge>
                  </div>
                </div>
              </div>

              <form className="mt-8 max-w-md space-y-4" onSubmit={saveProfile}>
                <FormField label="Display name">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </FormField>
                <FormField label="Email">
                  <Input value={data.profile.email} disabled className="bg-slate-50" />
                  <p className="mt-1 text-xs text-slate-400">Contact support to change your email.</p>
                </FormField>
                {profileMessage && (
                  <p
                    className={cn(
                      "text-sm",
                      profileMessage.includes("updated") || profileMessage.includes("saved")
                        ? "text-green-700"
                        : "text-red-600"
                    )}
                  >
                    {profileMessage}
                  </p>
                )}
                <Button type="submit" disabled={profileSaving}>
                  {profileSaving ? "Saving…" : "Save profile"}
                </Button>
              </form>
            </div>
          )}

          {tab === "security" && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Security</h2>
              <p className="mt-1 text-sm text-slate-500">
                Update your password to keep your account secure.
              </p>

              <form className="mt-6 max-w-md space-y-4" onSubmit={savePassword}>
                <FormField label="Current password">
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </FormField>
                <FormField label="New password">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </FormField>
                <FormField label="Confirm new password">
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </FormField>
                {passwordMessage && (
                  <p
                    className={cn(
                      "text-sm",
                      passwordMessage.includes("success") ? "text-green-700" : "text-red-600"
                    )}
                  >
                    {passwordMessage}
                  </p>
                )}
                <Button type="submit" disabled={passwordSaving}>
                  <Shield className="h-4 w-4" />
                  {passwordSaving ? "Updating…" : "Update password"}
                </Button>
              </form>
            </div>
          )}

          {tab === "billing" && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Billing & autopay</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your {data.billing.planName} plan is {formatCurrency(data.billing.monthlyAmount)}/mo
                for {data.location.name}.
              </p>

              {data.billing.autopayEnabled ? (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Autopay is on</p>
                    {data.billing.nextBillingDate && (
                      <p className="mt-0.5">
                        Next charge: {formatCurrency(data.billing.monthlyAmount)} on{" "}
                        {new Date(data.billing.nextBillingDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Autopay is off. Add a card below so your subscription renews automatically.
                  </p>
                </div>
              )}

              {!data.billing.canManage && (
                <p className="mt-4 text-sm text-slate-500">
                  Only the location owner can change billing settings.
                </p>
              )}

              <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-800">Current plan</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {data.billing.planName}
                  <span className="text-sm font-normal text-slate-500">
                    {" "}
                    — {formatCurrency(data.billing.monthlyAmount)}/mo
                  </span>
                </p>
                <Link
                  href="/docs/#pricing"
                  className="mt-2 inline-block text-sm font-medium text-orange-600 hover:text-orange-500"
                >
                  Compare plans →
                </Link>
              </div>

              {data.billing.canManage ? (
                <form className="mt-6 max-w-lg space-y-4" onSubmit={saveBilling}>
                  <FormField label="Billing email">
                    <Input
                      type="email"
                      value={billingEmail}
                      onChange={(e) => setBillingEmail(e.target.value)}
                      required
                    />
                  </FormField>

                  {data.billing.hasPaymentMethod && (
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">Saved payment method</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {data.billing.paymentBrand} •••• {data.billing.paymentLast4}
                        {data.billing.paymentExpMonth && data.billing.paymentExpYear && (
                          <span>
                            {" "}
                            — exp {String(data.billing.paymentExpMonth).padStart(2, "0")}/
                            {String(data.billing.paymentExpYear).slice(-2)}
                          </span>
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => void removePaymentMethod()}
                        disabled={billingSaving}
                        className="mt-2 text-xs font-medium text-red-600 hover:text-red-500 disabled:opacity-50"
                      >
                        Remove card
                      </button>
                    </div>
                  )}

                  <p className="text-sm font-medium text-slate-800">
                    {data.billing.hasPaymentMethod ? "Update card" : "Add payment method"}
                  </p>
                  <FormField label="Card number">
                    <Input
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="4242 4242 4242 4242"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Exp month">
                      <Input
                        inputMode="numeric"
                        placeholder="MM"
                        maxLength={2}
                        value={expMonth}
                        onChange={(e) => setExpMonth(e.target.value)}
                      />
                    </FormField>
                    <FormField label="Exp year">
                      <Input
                        inputMode="numeric"
                        placeholder="YYYY"
                        maxLength={4}
                        value={expYear}
                        onChange={(e) => setExpYear(e.target.value)}
                      />
                    </FormField>
                  </div>
                  <p className="text-xs text-slate-400">
                    We only store the last four digits and card brand — never the full card number.
                  </p>

                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={autopayEnabled}
                      onChange={(e) => setAutopayEnabled(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-800">
                        Enable autopay
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Charge {formatCurrency(data.billing.monthlyAmount)} monthly for your{" "}
                        {PLAN_BY_ID[data.billing.plan].name} plan. Cancel anytime.
                      </span>
                    </span>
                  </label>

                  {billingMessage && (
                    <p
                      className={cn(
                        "text-sm",
                        billingMessage.includes("enabled") ||
                          billingMessage.includes("saved") ||
                          billingMessage.includes("removed")
                          ? "text-green-700"
                          : "text-red-600"
                      )}
                    >
                      {billingMessage}
                    </p>
                  )}

                  <Button type="submit" disabled={billingSaving}>
                    <CreditCard className="h-4 w-4" />
                    {billingSaving ? "Saving…" : "Save billing settings"}
                  </Button>
                </form>
              ) : (
                <div className="mt-6 text-sm text-slate-600">
                  <p>
                    Plan: <strong>{data.billing.planName}</strong> (
                    {formatCurrency(data.billing.monthlyAmount)}/mo)
                  </p>
                  <p className="mt-1">
                    Autopay: {data.billing.autopayEnabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "permissions" && can("manage_permissions") && <PermissionsTab />}
        </div>
      </div>
    </div>
  );
}
