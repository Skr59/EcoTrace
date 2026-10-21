/**
 * Open-Meteo Air Quality API (CAMS reanalysis + forecast) client.
 *
 * AQICN gives us the live reading for the reference station; Open-Meteo gives us
 * the continuous hourly series for that coordinate so the dashboard can chart
 * hourly / daily / monthly / hour-of-day divisions and compute baselines.
 *
 * The API is free and key-less and publishes a US-EPA AQI directly.
 */

export interface AirQualityPoint {
  /** ISO local timestamp, e.g. "2026-10-21T18:00" */
  time: string;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  o3: number | null;
  co: number | null;
  aqi: number | null;
}

export interface AirQualitySeries {
  ok: boolean;
  lat: number;
  lng: number;
  start: string;
  end: string;
  points: AirQualityPoint[];
  error?: string;
}

const HOURLY_FIELDS = [
  "pm2_5",
  "pm10",
  "nitrogen_dioxide",
  "sulphur_dioxide",
  "ozone",
  "carbon_monoxide",
  "us_aqi",
].join(",");

const cache = new Map<string, { at: number; value: AirQualitySeries }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return isoDate(d);
}

export async function fetchAirQualitySeries(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string
): Promise<AirQualitySeries> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${startDate},${endDate}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}` +
    `&hourly=${HOURLY_FIELDS}&timezone=Asia%2FKolkata&start_date=${startDate}&end_date=${endDate}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
    const json = await res.json();
    const h = json?.hourly ?? {};
    const times: string[] = h.time ?? [];
    const points: AirQualityPoint[] = times.map((t: string, i: number) => ({
      time: t,
      pm25: num(h.pm2_5?.[i]),
      pm10: num(h.pm10?.[i]),
      no2: num(h.nitrogen_dioxide?.[i]),
      so2: num(h.sulphur_dioxide?.[i]),
      o3: num(h.ozone?.[i]),
      co: num(h.carbon_monoxide?.[i]),
      aqi: num(h.us_aqi?.[i]),
    }));

    const value: AirQualitySeries = { ok: true, lat, lng, start: startDate, end: endDate, points };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    const value: AirQualitySeries = {
      ok: false,
      lat,
      lng,
      start: startDate,
      end: endDate,
      points: [],
      error: err instanceof Error ? err.message : "Unable to reach Open-Meteo",
    };
    cache.set(key, { at: Date.now(), value });
    return value;
  }
}
