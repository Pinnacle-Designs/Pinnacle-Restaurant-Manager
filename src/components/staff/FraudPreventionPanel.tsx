"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Shield, Fingerprint, Camera, Loader2 } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { Input, Select, FormField } from "@/components/ui/form";
import { punchVerificationLabel, PUNCH_VERIFICATION_MODES } from "@/lib/timeclock/types";

interface FraudSettings {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geoFenceRadiusM: number;
  geoClockInRequired: boolean;
  punchPhotoRequired: boolean;
  punchVerificationMode: string;
  earlyClockInBufferMins: number;
  forgottenClockOutGraceMins: number;
  blockUnscheduledPunch: boolean;
}

export function FraudPreventionPanel() {
  const [location, setLocation] = useState<FraudSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/timeclock/settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load settings");
      setLocation(data.location);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch: Partial<FraudSettings> & { geocodeFromAddress?: boolean }) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/timeclock/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setLocation(data.location);
      setMessage("Fraud prevention settings saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!location) {
    return <p className="text-sm text-red-600">{message || "Settings unavailable"}</p>;
  }

  const geoConfigured = location.latitude != null && location.longitude != null;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="mb-4 flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 text-orange-600" />
          <div>
            <h2 className="font-semibold text-slate-900">Ironclad fraud prevention</h2>
            <p className="text-sm text-slate-500">
              Block buddy punching and early clock-ins. Photo or device biometrics prove who punched.
              GPS geofencing blocks mobile punches off property.
            </p>
          </div>
        </div>

        {message && (
          <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Camera className="h-4 w-4" />
              Identity verification
            </h3>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={location.punchPhotoRequired}
                onChange={(e) => save({ punchPhotoRequired: e.target.checked })}
                disabled={saving}
              />
              Require identity verification on punch
            </label>

            <FormField label="Verification method">
              <Select
                value={location.punchVerificationMode}
                onChange={(e) => save({ punchVerificationMode: e.target.value })}
                disabled={saving}
              >
                {PUNCH_VERIFICATION_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {punchVerificationLabel(mode)}
                  </option>
                ))}
              </Select>
            </FormField>

            <p className="text-xs text-slate-500">
              <strong>Photo</strong> — front camera snap on POS tablet or phone.
              <strong> Biometric</strong> — Touch ID / Face ID / Windows Hello after employee enrolls on
              their device. <strong>Photo or biometric</strong> — either satisfies punch.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <MapPin className="h-4 w-4" />
              Geofencing (mobile punches)
            </h3>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={location.geoClockInRequired}
                onChange={(e) => save({ geoClockInRequired: e.target.checked })}
                disabled={saving}
              />
              Block punch unless GPS shows employee on property
            </label>

            <FormField label="Fence radius (meters)">
              <Input
                type="number"
                min={25}
                max={500}
                value={location.geoFenceRadiusM}
                onChange={(e) =>
                  setLocation({ ...location, geoFenceRadiusM: Number(e.target.value) })
                }
                onBlur={() => save({ geoFenceRadiusM: location.geoFenceRadiusM })}
                disabled={saving}
              />
            </FormField>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={
                  geoConfigured ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                }
              >
                {geoConfigured
                  ? `Center: ${location.latitude!.toFixed(5)}, ${location.longitude!.toFixed(5)}`
                  : "Geo center not set"}
              </Badge>
              <Button
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => save({ geocodeFromAddress: true })}
              >
                Set from restaurant address
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Fingerprint className="h-4 w-4" />
          Riding the clock prevention
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Early clock-in buffer (minutes before shift)">
            <Input
              type="number"
              min={0}
              max={120}
              value={location.earlyClockInBufferMins}
              onChange={(e) =>
                setLocation({ ...location, earlyClockInBufferMins: Number(e.target.value) })
              }
              onBlur={() => save({ earlyClockInBufferMins: location.earlyClockInBufferMins })}
              disabled={saving}
            />
            <p className="mt-1 text-xs text-slate-500">
              Employees cannot clock in earlier than this many minutes before their scheduled shift.
            </p>
          </FormField>

          <FormField label="Forgotten clock-out grace (minutes after shift end)">
            <Input
              type="number"
              min={0}
              max={180}
              value={location.forgottenClockOutGraceMins ?? 30}
              onChange={(e) =>
                setLocation({ ...location, forgottenClockOutGraceMins: Number(e.target.value) })
              }
              onBlur={() =>
                save({ forgottenClockOutGraceMins: location.forgottenClockOutGraceMins ?? 30 })
              }
              disabled={saving}
            />
            <p className="mt-1 text-xs text-slate-500">
              Alert closing managers when someone is still clocked in this long after their scheduled
              shift end — before end-of-day labor reports.
            </p>
          </FormField>

          <div className="flex items-end">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={location.blockUnscheduledPunch}
                onChange={(e) => save({ blockUnscheduledPunch: e.target.checked })}
                disabled={saving}
              />
              <span>
                Block punches with no shift scheduled today
                <span className="mt-1 block text-xs text-slate-500">
                  Stops hanging out on the clock without a scheduled shift.
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
