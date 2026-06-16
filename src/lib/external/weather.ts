import type { WeatherForecastDay } from "@/lib/analytics/types";
import { fetchWithTimeout } from "./fetch-timeout";

export type WeatherSource = "weather.com" | "openweathermap" | "open-meteo";

export interface WeatherFetchResult {
  source: WeatherSource;
  forecasts: WeatherForecastDay[];
}

const WMO_CODES: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

function wmoLabel(code: number) {
  return WMO_CODES[code] ?? "Mixed conditions";
}

function isRainyCondition(condition: string) {
  return /rain|drizzle|shower|storm|snow/i.test(condition);
}

async function fetchWeatherCom(lat: number, lon: number, apiKey: string): Promise<WeatherForecastDay[] | null> {
  try {
    const url = `https://api.weather.com/v3/wx/forecast/daily/7day?geocode=${lat},${lon}&format=json&apiKey=${apiKey}&units=e`;
    const res = await fetchWithTimeout(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      validTimeUtc?: string[];
      calendarDayTemperatureMax?: number[];
      calendarDayTemperatureMin?: number[];
      daypart?: Array<{ precipChance?: number[] }>;
    };
    const dates = data.validTimeUtc ?? [];
    if (dates.length === 0) return null;

    return dates.slice(0, 7).map((iso, i) => {
      const precipArr = data.daypart?.[0]?.precipChance ?? [];
      const precip = precipArr[i * 2] ?? precipArr[i] ?? 0;
      const max = data.calendarDayTemperatureMax?.[i] ?? 0;
      const min = data.calendarDayTemperatureMin?.[i] ?? 0;
      const condition =
        precip >= 60 ? "Rain likely" : precip >= 30 ? "Chance of rain" : max > 85 ? "Hot" : "Fair";
      return {
        date: iso.split("T")[0]!,
        condition,
        tempHigh: Math.round(max),
        tempLow: Math.round(min),
        precipitationPct: Math.round(precip),
        isRainy: isRainyCondition(condition),
      };
    });
  } catch {
    return null;
  }
}

async function fetchOpenWeather(lat: number, lon: number, apiKey: string): Promise<WeatherForecastDay[] | null> {
  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial&cnt=40`;
    const res = await fetchWithTimeout(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      list?: Array<{
        dt_txt: string;
        main: { temp_max: number; temp_min: number };
        weather: Array<{ main: string; description: string }>;
        pop: number;
      }>;
    };
    const byDay = new Map<string, WeatherForecastDay>();
    for (const entry of data.list ?? []) {
      const date = entry.dt_txt.split(" ")[0]!;
      const condition = entry.weather[0]?.main ?? "Unknown";
      const precip = Math.round((entry.pop ?? 0) * 100);
      const existing = byDay.get(date);
      if (!existing || precip > existing.precipitationPct) {
        byDay.set(date, {
          date,
          condition,
          tempHigh: Math.round(entry.main.temp_max),
          tempLow: Math.round(entry.main.temp_min),
          precipitationPct: precip,
          isRainy: isRainyCondition(condition),
        });
      }
    }
    const forecasts = [...byDay.values()].slice(0, 7);
    return forecasts.length > 0 ? forecasts : null;
  } catch {
    return null;
  }
}

async function fetchOpenMeteo(lat: number, lon: number): Promise<WeatherForecastDay[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=auto&forecast_days=7&temperature_unit=fahrenheit`;
  const res = await fetchWithTimeout(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error("Open-Meteo forecast failed");
  const data = (await res.json()) as {
    daily?: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: number[];
    };
  };
  const daily = data.daily;
  if (!daily?.time?.length) return [];

  return daily.time.map((date, i) => {
    const code = daily.weather_code[i] ?? 0;
    const condition = wmoLabel(code);
    const precip = Math.round(daily.precipitation_probability_max[i] ?? 0);
    return {
      date,
      condition,
      tempHigh: Math.round(daily.temperature_2m_max[i] ?? 0),
      tempLow: Math.round(daily.temperature_2m_min[i] ?? 0),
      precipitationPct: precip,
      isRainy: isRainyCondition(condition) || precip >= 50,
    };
  });
}

/** Fetch 7-day local forecast — Weather.com (IBM) → OpenWeatherMap → Open-Meteo fallback. */
export async function fetchWeatherForecast(lat: number, lon: number): Promise<WeatherFetchResult> {
  const weatherComKey = process.env.WEATHER_COM_API_KEY?.trim();
  if (weatherComKey) {
    const forecasts = await fetchWeatherCom(lat, lon, weatherComKey);
    if (forecasts?.length) return { source: "weather.com", forecasts };
  }

  const openWeatherKey = process.env.OPENWEATHER_API_KEY?.trim();
  if (openWeatherKey) {
    const forecasts = await fetchOpenWeather(lat, lon, openWeatherKey);
    if (forecasts?.length) return { source: "openweathermap", forecasts };
  }

  const forecasts = await fetchOpenMeteo(lat, lon);
  return { source: "open-meteo", forecasts };
}
