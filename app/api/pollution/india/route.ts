/**
 * India-wide live pollution feed for every registered polluting facility.
 *
 * For each facility we pull the current CAMS (Open-Meteo) air quality over its
 * own dispersion footprint, convert the observed pollutant load into a
 * CO2e-equivalent footprint, and compare that against the figure the facility
 * is expected to declare to its regulator.
 *
 * The two numbers are independent on purpose:
 *   reported  - capacity x the official benchmark intensity (or the value
 *               actually filed with the regulator, pasted into the dashboard)
 *   observed  - what the atmosphere over the plant actually contains right now
 *
 * The gap between them is the screening signal the platform acts on.
 */

import { NextResponse } from "next/server";
import { INDIA_FACILITIES, INDIA_FACILITY_SOURCES, type IndiaFacility } from "@/lib/indiaFacilities";
import { INDUSTRIES, SECTOR_LABELS, SECTOR_ORDER, type SectorKey } from "@/lib/industries";
import { EMISSION_MODEL, computeCarbonLiability, type ConcentrationSet } from "@/lib/carbonFromAqi";
import { getCreditPrice, isLivePrice, resolveCreditPrice } from "@/lib/creditPrice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOURLY_FIELDS = [
  "pm2_5",
  "pm10",
  "nitrogen_dioxide",
  "sulphur_dioxide",
  "ozone",
  "carbon_monoxide",
  "us_aqi",
].join(",");

const CHUNK = 120;
const CACHE_TTL_MS = 10 * 60 * 1000;
const AVG_WINDOW_HOURS = 3;

interface Cached {
  at: number;
  payload: unknown;
}
const cache = new Map<string, Cached>();

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Current wall-clock time in Asia/Kolkata, as an ISO local string. */
function nowInIst(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

interface CamsPoint {
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  o3: number | null;
  co: number | null;
  aqi: number | null;
}

/** Fetch the live CAMS series for a set of coordinates (parallel lat/lng lists). */
async function fetchCams(
  points: { lat: number; lng: number }[]
): Promise<{ ok: boolean; observedAt: string | null; points: CamsPoint[]; error?: string }> {
  const lat = points.map((p) => p.lat).join(",");
  const lng = points.map((p) => p.lng).join(",");
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}` +
    `&hourly=${HOURLY_FIELDS}&timezone=Asia%2FKolkata&past_days=1&forecast_days=1`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
    const json = await res.json();
    const list: any[] = Array.isArray(json) ? json : [json];
    const nowIso = nowInIst();

    const out: CamsPoint[] = [];
    let observedAt: string | null = null;

    for (const entry of list) {
      const h = entry?.hourly ?? {};
      const times: string[] = h.time ?? [];
      // Index of the last hour that has already happened.
      let idx = -1;
      for (let i = 0; i < times.length; i++) {
        if (times[i] <= nowIso) idx = i;
        else break;
      }
      if (idx < 0) {
        out.push({ pm25: null, pm10: null, no2: null, so2: null, o3: null, co: null, aqi: null });
        continue;
      }
      if (!observedAt) observedAt = times[idx];

      // Average the last few observed hours so a single noisy hour does not
      // move a facility in the ledger.
      const from = Math.max(0, idx - (AVG_WINDOW_HOURS - 1));
      const mean = (arr: unknown[] | undefined) => {
        if (!arr) return null;
        let sum = 0;
        let count = 0;
        for (let i = from; i <= idx; i++) {
          const v = num(arr[i]);
          if (v !== null) {
            sum += v;
            count++;
          }
        }
        return count ? sum / count : null;
      };

      out.push({
        pm25: mean(h.pm2_5),
        pm10: mean(h.pm10),
        no2: mean(h.nitrogen_dioxide),
        so2: mean(h.sulphur_dioxide),
        o3: mean(h.ozone),
        co: mean(h.carbon_monoxide),
        aqi: mean(h.us_aqi),
      });
    }

    return { ok: true, observedAt, points: out };
  } catch (err) {
    return {
      ok: false,
      observedAt: null,
      points: [],
      error: err instanceof Error ? err.message : "Unable to reach Open-Meteo",
    };
  }
}

export interface IndiaFacilityLive {
  id: string;
  name: string;
  subType: string;
  sector: SectorKey;
  sectorLabel: string;
  state: string;
  lat: number;
  lng: number;
  owner: string;
  capacity: number | null;
  capacityUnit: string;
  fuel: string | null;
  instrumentKey: string;
  instrumentLabel: string;
  instrumentAuthority: string;
  instrumentReturn: string;
  instrumentRegistry: string;
  instrumentUrl: string;
  zoneRadiusKm: number;
  zoneAreaKm2: number;
  /** tCO2e/yr the facility is expected to declare to the regulator. */
  reportedEmissionsT: number;
  reportedBasis: string;
  /** Live air quality over the facility footprint. */
  observed: {
    pm25: number | null;
    pm10: number | null;
    no2: number | null;
    so2: number | null;
    o3: number | null;
    co: number | null;
    aqi: number | null;
  };
  /** kg/day of each pollutant resident over the footprint. */
  loadsKgPerDay: ConcentrationSet;
  /** tCO2e/yr implied by what the air actually contains. */
  observedCo2eT: number;
  /** tCO2e/yr that should be turned into credits by deploying existing abatement. */
  shouldProduceT: number;
  /** observed / reported. >1 means the air shows more than the facility declares. */
  observabilityRatio: number | null;
  /** True when the live signal materially exceeds the declared figure. */
  flagged: boolean;
  /** Why the facility is flagged (or why it is not). */
  flagReason: string;
}

export interface IndiaSectorRollup {
  sector: SectorKey;
  label: string;
  facilities: number;
  reportedT: number;
  observedT: number;
  shouldProduceT: number;
  producedT: number;
  deficitT: number;
  deficitValueINR: number;
  compliancePct: number;
  flaggedFacilities: number;
  /** tCO2e/yr observed with no crediting obligation attached to it. */
  outsidePerimeterT: number;
}

export interface IndiaInstrumentRollup {
  key: string;
  label: string;
  authority: string;
  return: string;
  registry: string;
  url: string;
  facilities: number;
  reportedT: number;
  observedT: number;
  shouldProduceT: number;
  deficitT: number;
  deficitValueINR: number;
  flaggedFacilities: number;
}

function buildLive(
  facility: IndiaFacility,
  point: CamsPoint
): IndiaFacilityLive {
  const zoneAreaKm2 = Math.PI * facility.zoneRadiusKm * facility.zoneRadiusKm;
  const conc: ConcentrationSet = {
    pm25: point.pm25,
    pm10: point.pm10,
    no2: point.no2,
    so2: point.so2,
    o3: point.o3,
    co: point.co,
  };
  const liability = computeCarbonLiability(conc, { zoneAreaKm2 });
  const observedCo2eT = liability.totalCo2eTPerYear;
  const shouldProduceT = liability.requiredCreditsTPerYear;
  const ratio = facility.reportedEmissionsT > 0 ? observedCo2eT / facility.reportedEmissionsT : null;

  let flagged = false;
  let flagReason = "Live footprint consistent with the declared figure";
  if (facility.reportedEmissionsT <= 0 && observedCo2eT > 0) {
    flagged = true;
    flagReason =
      "Pollution observed over the site with no crediting obligation attached - outside the current perimeter";
  } else if (ratio !== null && ratio > 1) {
    flagged = true;
    flagReason = `Observed footprint is ${ratio.toFixed(1)}x the declared figure - verification candidate`;
  } else if (ratio !== null) {
    flagReason = `Observed footprint is ${(ratio * 100).toFixed(0)}% of the declared figure`;
  }

  return {
    id: facility.id,
    name: facility.name,
    subType: facility.subType,
    sector: facility.sector,
    sectorLabel: facility.sectorLabel,
    state: facility.state,
    lat: facility.lat,
    lng: facility.lng,
    owner: facility.owner,
    capacity: facility.capacity,
    capacityUnit: facility.capacityUnit,
    fuel: facility.fuel,
    instrumentKey: facility.instrument.key,
    instrumentLabel: facility.instrument.label,
    instrumentAuthority: facility.instrument.authority,
    instrumentReturn: facility.instrument.return,
    instrumentRegistry: facility.instrument.registry,
    instrumentUrl: facility.instrument.url,
    zoneRadiusKm: facility.zoneRadiusKm,
    zoneAreaKm2,
    reportedEmissionsT: facility.reportedEmissionsT,
    reportedBasis: facility.reportedBasis,
    observed: point,
    loadsKgPerDay: liability.loads,
    observedCo2eT,
    shouldProduceT,
    observabilityRatio: ratio,
    flagged,
    flagReason,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { searchParams } = url;
  const sectorFilter = searchParams.get("sector");

  const fetchedPrice = await getCreditPrice();
  const creditPriceINR = resolveCreditPrice(searchParams, fetchedPrice);
  const livePrice = isLivePrice(searchParams, fetchedPrice);

  const cacheKey = `india:${sectorFilter ?? "all"}:${creditPriceINR}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.payload, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const facilities = sectorFilter
    ? INDIA_FACILITIES.filter((f) => f.sector === sectorFilter)
    : INDIA_FACILITIES;

  // Pull the live feed in parallel chunks.
  const chunks: { lat: number; lng: number }[][] = [];
  for (let i = 0; i < facilities.length; i += CHUNK) {
    chunks.push(facilities.slice(i, i + CHUNK).map((f) => ({ lat: f.lat, lng: f.lng })));
  }
  const results = await Promise.all(chunks.map((c) => fetchCams(c)));

  const allPoints: CamsPoint[] = [];
  let observedAt: string | null = null;
  let feedError: string | undefined;
  for (const r of results) {
    if (r.ok) {
      if (!observedAt && r.observedAt) observedAt = r.observedAt;
      allPoints.push(...r.points);
    } else {
      feedError = r.error;
    }
  }

  const live: IndiaFacilityLive[] = facilities.map((f, i) =>
    buildLive(
      f,
      allPoints[i] ?? {
        pm25: null,
        pm10: null,
        no2: null,
        so2: null,
        o3: null,
        co: null,
        aqi: null,
      }
    )
  );

  // --- sector roll-up -----------------------------------------------------
  const sectorRollup: IndiaSectorRollup[] = SECTOR_ORDER.map((sector) => {
    const rows = live.filter((f) => f.sector === sector);
    const reportedT = rows.reduce((s, r) => s + r.reportedEmissionsT, 0);
    const observedT = rows.reduce((s, r) => s + r.observedCo2eT, 0);
    const shouldProduceT = rows.reduce((s, r) => s + r.shouldProduceT, 0);
    const producedT = INDUSTRIES.filter((i) => i.sector === sector).reduce(
      (s, i) => s + i.actualCreditsT,
      0
    );
    const deficitT = Math.max(0, shouldProduceT - producedT);
    const outsidePerimeterT = rows
      .filter((r) => r.reportedEmissionsT <= 0)
      .reduce((s, r) => s + r.observedCo2eT, 0);
    return {
      sector,
      label: SECTOR_LABELS[sector],
      facilities: rows.length,
      reportedT,
      observedT,
      shouldProduceT,
      producedT,
      deficitT,
      deficitValueINR: deficitT * creditPriceINR,
      compliancePct: shouldProduceT > 0 ? (producedT / shouldProduceT) * 100 : 0,
      flaggedFacilities: rows.filter((r) => r.flagged).length,
      outsidePerimeterT,
    };
  }).filter((s) => s.facilities > 0);

  // --- instrument roll-up (the government channels we can push into) -----
  const instrumentMap = new Map<string, IndiaInstrumentRollup>();
  for (const row of live) {
    let entry = instrumentMap.get(row.instrumentKey);
    if (!entry) {
      entry = {
        key: row.instrumentKey,
        label: row.instrumentLabel,
        authority: row.instrumentAuthority,
        return: row.instrumentReturn,
        registry: row.instrumentRegistry,
        url: row.instrumentUrl,
        facilities: 0,
        reportedT: 0,
        observedT: 0,
        shouldProduceT: 0,
        deficitT: 0,
        deficitValueINR: 0,
        flaggedFacilities: 0,
      };
      instrumentMap.set(row.instrumentKey, entry);
    }
    entry.facilities += 1;
    entry.reportedT += row.reportedEmissionsT;
    entry.observedT += row.observedCo2eT;
    entry.shouldProduceT += row.shouldProduceT;
    entry.deficitT += row.shouldProduceT;
    entry.deficitValueINR += row.shouldProduceT * creditPriceINR;
    if (row.flagged) entry.flaggedFacilities += 1;
  }
  const instruments = Array.from(instrumentMap.values()).sort(
    (a, b) => b.shouldProduceT - a.shouldProduceT
  );

  const totals: {
    facilities: number;
    reportedT: number;
    observedT: number;
    shouldProduceT: number;
    producedT: number;
    flagged: number;
    outsidePerimeterT: number;
    deficitT: number;
    deficitValueINR: number;
  } = {
    facilities: live.length,
    reportedT: live.reduce((s, r) => s + r.reportedEmissionsT, 0),
    observedT: live.reduce((s, r) => s + r.observedCo2eT, 0),
    shouldProduceT: live.reduce((s, r) => s + r.shouldProduceT, 0),
    producedT: INDUSTRIES.reduce((s, i) => s + i.actualCreditsT, 0),
    flagged: live.filter((r) => r.flagged).length,
    outsidePerimeterT: live
      .filter((r) => r.reportedEmissionsT <= 0)
      .reduce((s, r) => s + r.observedCo2eT, 0),
    deficitT: 0,
    deficitValueINR: 0,
  };
  totals.deficitT = Math.max(0, totals.shouldProduceT - totals.producedT);
  totals.deficitValueINR = totals.deficitT * creditPriceINR;

  const payload = {
    ok: true,
    observedAt,
    feedError,
    generatedAt: new Date().toISOString(),
    source: {
      live: "Open-Meteo Air Quality API (CAMS ENSEMBLE reanalysis + forecast)",
      register: INDIA_FACILITY_SOURCES,
    },
    model: {
      zoneAreaKm2: EMISSION_MODEL.zoneAreaKm2,
      mixingHeightM: EMISSION_MODEL.mixingHeightM,
      co2ePerKgPm: EMISSION_MODEL.co2ePerKgPm,
      pmCombustionFraction: EMISSION_MODEL.pmCombustionFraction,
      defaultAbatementPct: EMISSION_MODEL.defaultAbatementPct,
      averageWindowHours: AVG_WINDOW_HOURS,
    },
    creditPrice: {
      price: creditPriceINR,
      live: livePrice,
      fetchedAt: fetchedPrice.fetchedAt,
    },
    marketPriceINR: fetchedPrice.price,
    creditPriceLive: livePrice,
    totals,
    sectors: sectorRollup,
    instruments,
    facilities: live.sort((a, b) => b.shouldProduceT - a.shouldProduceT),
  };

  cache.set(cacheKey, { at: Date.now(), payload });

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
