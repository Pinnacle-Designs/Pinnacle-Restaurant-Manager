"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LOCALE_SETTINGS,
  formatCurrencyAmount,
  formatDateLocalized,
  formatTemperatureAmount,
  formatWeightAmount,
  setActiveLocationLocale,
  type LocationLocaleSettings,
  type MeasurementSystem,
  type VolumeStandard,
  measurementSystemLabel,
} from "@/lib/location/locale";
import { useAuth } from "@/components/auth/AuthProvider";
import { clientFetch } from "@/lib/embed-api-client";

interface LocationLocaleContextValue {
  settings: LocationLocaleSettings;
  loading: boolean;
  refresh: () => Promise<void>;
  formatCurrency: (amount: number) => string;
  formatDate: (date: Date | string) => string;
  formatWeight: (value: number, unit: string) => string;
  formatTemperature: (celsius: number) => string;
  currencyCode: string;
  measurementSystem: MeasurementSystem;
  volumeStandard: VolumeStandard;
  measurementLabel: string;
}

const LocationLocaleContext = createContext<LocationLocaleContextValue>({
  settings: DEFAULT_LOCALE_SETTINGS,
  loading: true,
  refresh: async () => {},
  formatCurrency: (amount) => formatCurrencyAmount(amount),
  formatDate: (date) => formatDateLocalized(date),
  formatWeight: (value, unit) => formatWeightAmount(value, unit),
  formatTemperature: (c) => formatTemperatureAmount(c),
  currencyCode: "USD",
  measurementSystem: "imperial",
  volumeStandard: "us",
  measurementLabel: measurementSystemLabel(DEFAULT_LOCALE_SETTINGS),
});

export function LocationLocaleProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, embedSession } = useAuth();
  const [settings, setSettings] = useState<LocationLocaleSettings>(DEFAULT_LOCALE_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const locationId = user?.locationId;
    if (!locationId) {
      if (embedSession) {
        setLoading(false);
        return;
      }
      setSettings(DEFAULT_LOCALE_SETTINGS);
      setActiveLocationLocale(DEFAULT_LOCALE_SETTINGS);
      setLoading(false);
      return;
    }
    try {
      const res = await clientFetch("/api/locations/current");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const ms = data.location.measurementSystem;
      const vs = data.location.volumeStandard;
      const next: LocationLocaleSettings = {
        currencyCode: data.location.currencyCode ?? "USD",
        measurementSystem:
          ms === "metric" || ms === "mixed" ? ms : "imperial",
        volumeStandard: vs === "uk" || vs === "metric" ? vs : "us",
        locale: data.location.locale ?? "en-US",
      };
      setSettings(next);
      setActiveLocationLocale(next);
    } catch {
      setSettings(DEFAULT_LOCALE_SETTINGS);
      setActiveLocationLocale(DEFAULT_LOCALE_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, [user?.locationId, embedSession]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  const value = useMemo<LocationLocaleContextValue>(
    () => ({
      settings,
      loading,
      refresh,
      formatCurrency: (amount) => formatCurrencyAmount(amount, settings),
      formatDate: (date) => formatDateLocalized(date, settings),
      formatWeight: (value, unit) => formatWeightAmount(value, unit, settings),
      formatTemperature: (c) => formatTemperatureAmount(c, settings),
      currencyCode: settings.currencyCode,
      measurementSystem: settings.measurementSystem,
      volumeStandard: settings.volumeStandard,
      measurementLabel: measurementSystemLabel(settings),
    }),
    [settings, loading, refresh]
  );

  return <LocationLocaleContext.Provider value={value}>{children}</LocationLocaleContext.Provider>;
}

export function useLocationLocale() {
  return useContext(LocationLocaleContext);
}
