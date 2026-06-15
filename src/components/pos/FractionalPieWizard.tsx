"use client";

import { useState } from "react";
import { Flame } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  buildFractionalSummary,
  fractionalPriceDelta,
  type FractionalModifierSelection,
  type FractionCoverage,
} from "@/lib/pos/fractional-modifiers";
import type { ModifierGroupConfig } from "@/lib/pos/modifiers";

interface FractionalPieWizardProps {
  open: boolean;
  itemName: string;
  groups: ModifierGroupConfig[];
  onClose: () => void;
  onFire: (payload: {
    modifiers: FractionalModifierSelection[];
    modifierSummary: string;
    price: number;
  }) => void;
}

const ZONES: { id: FractionCoverage; label: string; className: string }[] = [
  { id: "LEFT_HALF", label: "Left half", className: "rounded-l-xl" },
  { id: "RIGHT_HALF", label: "Right half", className: "rounded-r-xl" },
];

export function FractionalPieWizard({
  open,
  itemName,
  groups,
  onClose,
  onFire,
}: FractionalPieWizardProps) {
  const pieGroup = groups.find((g) => g.layout === "FRACTIONAL_PIE") ?? groups[0];
  const [activeZone, setActiveZone] = useState<FractionCoverage>("LEFT_HALF");
  const [wholeMods, setWholeMods] = useState<string[]>([]);
  const [zoneMods, setZoneMods] = useState<Record<FractionCoverage, string[]>>({
    WHOLE: [],
    LEFT_HALF: [],
    RIGHT_HALF: [],
    TOP_HALF: [],
    BOTTOM_HALF: [],
  });

  if (!open || !pieGroup) return null;

  const toggleWhole = (optionId: string) => {
    setWholeMods((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]
    );
  };

  const toggleZone = (optionId: string) => {
    setZoneMods((prev) => {
      const current = prev[activeZone] ?? [];
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      return { ...prev, [activeZone]: next };
    });
  };

  const buildSelections = (): FractionalModifierSelection[] => {
    const out: FractionalModifierSelection[] = [];
    for (const optionId of wholeMods) {
      const option = pieGroup.options.find((o) => o.id === optionId);
      if (!option) continue;
      out.push({
        groupId: pieGroup.id,
        groupName: pieGroup.name,
        optionId: option.id,
        optionName: option.name,
        priceDelta: option.priceDelta,
        coverage: "WHOLE",
      });
    }
    for (const zone of ["LEFT_HALF", "RIGHT_HALF"] as FractionCoverage[]) {
      for (const optionId of zoneMods[zone] ?? []) {
        const option = pieGroup.options.find((o) => o.id === optionId);
        if (!option) continue;
        out.push({
          groupId: pieGroup.id,
          groupName: pieGroup.name,
          optionId: option.id,
          optionName: option.name,
          priceDelta: option.priceDelta * 0.5,
          coverage: zone,
        });
      }
    }
    return out;
  };

  const handleFire = () => {
    const selections = buildSelections();
    onFire({
      modifiers: selections,
      modifierSummary: buildFractionalSummary(selections),
      price: fractionalPriceDelta(selections),
    });
  };

  const toppingOptions = pieGroup.options.filter(
    (o) => !o.name.toLowerCase().includes("sauce") && !o.name.toLowerCase().includes("cheese")
  );
  const wholeOptions = pieGroup.options.filter(
    (o) => o.name.toLowerCase().includes("sauce") || o.name.toLowerCase().includes("cheese")
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="border-b px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
            Fractional modifiers
          </p>
          <h2 className="text-lg font-bold text-slate-900">{itemName}</h2>
          <p className="mt-1 text-sm text-slate-600">
            Tap a half, then toppings — e.g. pepperoni left, mushroom right, light sauce on whole pie.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-1">
            {ZONES.map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => setActiveZone(zone.id)}
                className={cn(
                  "border-2 py-8 text-sm font-semibold transition-colors",
                  zone.className,
                  activeZone === zone.id
                    ? "border-orange-500 bg-orange-50 text-orange-900"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                )}
              >
                {zone.label}
                {(zoneMods[zone.id]?.length ?? 0) > 0 && (
                  <span className="mt-1 block text-xs font-normal">
                    {zoneMods[zone.id].map((id) => pieGroup.options.find((o) => o.id === id)?.name).join(", ")}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-800">
              Toppings for {activeZone === "LEFT_HALF" ? "left half" : "right half"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {toppingOptions.map((option) => {
                const picked = (zoneMods[activeZone] ?? []).includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleZone(option.id)}
                    className={cn(
                      "rounded-xl border-2 px-3 py-3 text-sm font-semibold",
                      picked
                        ? "border-orange-500 bg-orange-50 text-orange-900"
                        : "border-slate-200 bg-slate-50"
                    )}
                  >
                    {option.name}
                  </button>
                );
              })}
            </div>
          </div>

          {wholeOptions.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Whole pie</p>
              <div className="grid grid-cols-2 gap-2">
                {wholeOptions.map((option) => {
                  const picked = wholeMods.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleWhole(option.id)}
                      className={cn(
                        "rounded-xl border-2 px-3 py-3 text-sm font-semibold",
                        picked
                          ? "border-orange-500 bg-orange-50 text-orange-900"
                          : "border-slate-200 bg-slate-50"
                      )}
                    >
                      {option.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t p-4">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleFire} className="flex-1">
            <Flame className="h-4 w-4" />
            Add to order
          </Button>
        </div>
      </div>
    </div>
  );
}
