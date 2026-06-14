"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { Input, FormField, Modal } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { PLANS, type PlanId, parsePlanId } from "@/lib/plans";
import { InstallAppPrompt } from "@/components/auth/InstallAppPrompt";

type Step = "plan" | "account" | "install";

interface SignupFlowProps {
  initialPlan?: PlanId;
  onSuccess?: () => void;
  onCancel?: () => void;
  embedded?: boolean;
}

export function SignupFlow({ initialPlan = "GROWTH", onSuccess, onCancel, embedded }: SignupFlowProps) {
  const [step, setStep] = useState<Step>("plan");
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);
  const [name, setName] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = PLANS.find((p) => p.id === selectedPlan)!;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, restaurantName, plan: selectedPlan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create account");

      if (onSuccess) {
        onSuccess();
      } else {
        setStep("install");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setLoading(false);
    }
  };

  if (step === "install") {
    return (
      <InstallAppPrompt
        plan={selectedPlan}
        embedded={embedded}
        onContinue={() => {
          window.location.assign("/dashboard");
        }}
      />
    );
  }

  if (step === "plan") {
    return (
      <div>
        <p className="text-sm text-slate-600">
          Choose the plan that fits your restaurant. You can upgrade anytime.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const active = selectedPlan === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={cn(
                  "relative rounded-xl border p-4 text-left transition-all",
                  active
                    ? "border-orange-500 bg-orange-50 ring-2 ring-orange-500"
                    : "border-slate-200 bg-white hover:border-slate-300"
                )}
              >
                {plan.featured && (
                  <span className="absolute -top-2.5 left-3 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Popular
                  </span>
                )}
                <p className="font-semibold text-slate-900">{plan.name}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  ${plan.price}
                  <span className="text-xs font-normal text-slate-500">/mo</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">{plan.bestFor}</p>
                <ul className="mt-3 space-y-1">
                  {plan.features.slice(0, 4).map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5 text-xs text-slate-600">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-orange-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="button" className="sm:min-w-[160px]" onClick={() => setStep("account")}>
            Continue with {selected.name}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-900">
            {selected.name} plan — ${selected.price}/mo
          </p>
          <p className="text-xs text-slate-600">{selected.blurb}</p>
        </div>
        <button
          type="button"
          onClick={() => setStep("plan")}
          className="text-sm font-medium text-orange-600 hover:text-orange-500"
        >
          Change
        </button>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormField label="Your name">
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Owner"
            required
          />
        </FormField>
        <FormField label="Restaurant name">
          <Input
            type="text"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            placeholder="Pinnacle Bistro"
          />
        </FormField>
        <FormField label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@restaurant.com"
            required
          />
        </FormField>
        <FormField label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className={cn("flex gap-2", embedded ? "flex-col-reverse sm:flex-row sm:justify-end" : "")}>
          <Button type="button" variant="secondary" onClick={() => setStep("plan")}>
            Back
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Creating account…" : `Start with ${selected.name}`}
          </Button>
        </div>
      </form>
    </div>
  );
}

interface SignupPlanModalProps {
  open: boolean;
  onClose: () => void;
  initialPlan?: PlanId;
}

export function SignupPlanModal({ open, onClose, initialPlan }: SignupPlanModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Get started with Pinnacle"
      size="xl"
    >
      <SignupFlow initialPlan={initialPlan} onCancel={onClose} embedded />
    </Modal>
  );
}

export function planFromSearchParam(value: string | null): PlanId {
  return parsePlanId(value) ?? "GROWTH";
}
