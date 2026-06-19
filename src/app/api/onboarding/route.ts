import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { requireSecureAuth } from "@/lib/api-auth";
import { enrichUserWithPlan } from "@/lib/location-plan";
import { seedLocationData } from "@/lib/seed-data";
import { syncLocationGeoFields } from "@/lib/location/geo";
import { resolveLocationLocale } from "@/lib/location/locale";
import { syncExternalFactorsForLocation } from "@/lib/external/sync-weather";
import { stripeConfigured } from "@/lib/payments/providers";
import { PLAN_BY_ID } from "@/lib/plans";
import { planMonthlyAmount } from "@/lib/billing";
import type { PlanId } from "@/lib/plans";
import { privateJsonResponse } from "@/lib/secure-response";

export async function GET(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (user!.role !== "OWNER" || !user!.locationId) {
    return privateJsonResponse({ error: "Only owners can access onboarding" }, { status: 403 });
  }

  const location = await prisma.location.findUnique({
    where: { id: user!.locationId },
    select: {
      id: true,
      name: true,
      address: true,
      phone: true,
      seatCount: true,
      plan: true,
      setupComplete: true,
      onboardingStep: true,
      autopayEnabled: true,
      postalCode: true,
      city: true,
      stateProvince: true,
      countryCode: true,
      timezone: true,
    },
  });

  if (!location) {
    return privateJsonResponse({ error: "Location not found" }, { status: 404 });
  }

  const plan = location.plan as PlanId;
  return privateJsonResponse({
    location,
    plan: {
      id: plan,
      name: PLAN_BY_ID[plan].name,
      monthlyAmount: planMonthlyAmount(plan),
    },
    stripeConfigured: stripeConfigured(),
  });
}

export async function PATCH(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (user!.role !== "OWNER" || !user!.locationId) {
    return privateJsonResponse({ error: "Only owners can update onboarding" }, { status: 403 });
  }

  const body = await request.json();
  const action = String(body.action || "");

  if (action === "details") {
    const name = String(body.name || "").trim().slice(0, 120);
    const address = String(body.address || "").trim().slice(0, 240);
    const phone = body.phone ? String(body.phone).trim().slice(0, 40) : null;
    const postalCode = body.postalCode ? String(body.postalCode).trim().slice(0, 20) : null;
    const city = body.city ? String(body.city).trim().slice(0, 80) : null;
    const stateProvince = body.stateProvince ? String(body.stateProvince).trim().slice(0, 40) : null;
    const countryCode = body.countryCode
      ? String(body.countryCode).trim().slice(0, 2).toUpperCase()
      : "US";
    const seatCount = body.seatCount != null ? Math.max(1, Math.min(500, Number(body.seatCount))) : undefined;

    if (!name) {
      return privateJsonResponse({ error: "Restaurant name is required" }, { status: 400 });
    }

    const merged = {
      name,
      address: address || null,
      phone,
      postalCode,
      city,
      stateProvince,
      countryCode,
      seatCount: seatCount ?? 40,
      latitude: null as number | null,
      longitude: null as number | null,
      timezone: null as string | null,
    };
    const geo = await syncLocationGeoFields(merged);
    const effectiveCountry = geo?.countryCode ?? countryCode;
    const regional = resolveLocationLocale(effectiveCountry);

    const updated = await prisma.location.update({
      where: { id: user!.locationId },
      data: {
        name,
        address: address || null,
        phone,
        postalCode,
        city: geo?.city ?? city,
        stateProvince: geo?.stateProvince ?? stateProvince,
        countryCode: geo?.countryCode ?? countryCode,
        seatCount: seatCount ?? undefined,
        currencyCode: regional.currencyCode,
        measurementSystem: regional.measurementSystem,
        volumeStandard: regional.volumeStandard,
        locale: regional.locale,
        ...(geo
          ? { latitude: geo.latitude, longitude: geo.longitude, timezone: geo.timezone }
          : { latitude: null, longitude: null, timezone: null }),
        onboardingStep: Math.max(1, 1),
      },
      select: { onboardingStep: true, setupComplete: true },
    });

    if (geo) {
      const loc = await prisma.location.findUnique({ where: { id: user!.locationId } });
      if (loc) {
        await syncExternalFactorsForLocation(user!.locationId, loc).catch(() => {});
      }
    }

    return privateJsonResponse({
      message: geo
        ? "Restaurant details saved — local time & forecasts synced"
        : "Restaurant details saved",
      ...updated,
    });
  }

  if (action === "seed") {
    const result = await seedLocationData(user!.locationId);
    await prisma.location.update({
      where: { id: user!.locationId },
      data: { onboardingStep: Math.max(2, 2) },
    });
    return privateJsonResponse({ message: result.message, seeded: !result.alreadySeeded });
  }

  if (action === "skip-seed") {
    await prisma.location.update({
      where: { id: user!.locationId },
      data: { onboardingStep: Math.max(2, 2) },
    });
    return privateJsonResponse({ message: "Skipped sample data" });
  }

  if (action === "billing-skipped") {
    await prisma.location.update({
      where: { id: user!.locationId },
      data: { onboardingStep: Math.max(3, 3) },
    });
    return privateJsonResponse({ message: "Billing step skipped" });
  }

  if (action === "complete") {
    await prisma.location.update({
      where: { id: user!.locationId },
      data: { setupComplete: true, onboardingStep: 4 },
    });

    const sessionUser = await enrichUserWithPlan({
      ...user!,
      setupComplete: true,
    });
    const response = privateJsonResponse({ message: "Onboarding complete" });
    const token = await createSessionToken(sessionUser);
    response.cookies.set(sessionCookieOptions(token));
    return response;
  }

  return privateJsonResponse({ error: "Unsupported onboarding action" }, { status: 400 });
}
