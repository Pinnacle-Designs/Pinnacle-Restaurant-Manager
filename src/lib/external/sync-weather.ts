import { prisma } from "@/lib/prisma";
import { geocodeLocation } from "./geocode";
import { fetchWeatherForecast } from "./weather";

const SYNC_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Sync 7-day weather forecast into ExternalFactor records (auto-runs from analytics). */
export async function syncWeatherForecasts(
  locationId: string,
  location: { name: string; address: string | null }
) {
  const recent = await prisma.externalFactor.findFirst({
    where: {
      locationId,
      factorType: "weather",
      description: { startsWith: "Forecast:" },
      createdAt: { gte: new Date(Date.now() - SYNC_COOLDOWN_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return { synced: false, reason: "recent_sync", source: null as string | null };
  }

  const geo = await geocodeLocation(location.address, location.name);
  if (!geo) {
    return { synced: false, reason: "geocode_failed", source: null };
  }

  const { source, forecasts } = await fetchWeatherForecast(geo.lat, geo.lon);
  const today = startOfDay(new Date());

  await prisma.externalFactor.deleteMany({
    where: {
      locationId,
      factorType: "weather",
      description: { startsWith: "Forecast:" },
      date: { gte: today },
    },
  });

  for (const f of forecasts) {
    const date = startOfDay(new Date(`${f.date}T12:00:00`));
    const impactPct = f.isRainy ? 25 : f.precipitationPct > 40 ? 15 : 0;
    await prisma.externalFactor.create({
      data: {
        locationId,
        date,
        factorType: "weather",
        description: `Forecast: ${f.condition} (${f.precipitationPct}% precip) — ${geo.label} via ${source}`,
        impactPct,
      },
    });
  }

  return { synced: true, reason: "ok", source, count: forecasts.length, geo: geo.label };
}
