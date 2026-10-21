/**
 * Delhi NCR AQI data pipeline.
 *
 * Pulls hourly air-quality observations for every CPCB reference monitoring
 * location in the Delhi NCR from the Open-Meteo Air Quality API (CAMS global
 * reanalysis + ENSEMBLE forecast, free and key-less), then derives the two
 * comparison time points used by the dashboard:
 *
 *   02:30  -> Night / Off-Peak
 *   17:59  -> Evening Peak Hour
 *
 * Outputs
 *   data/aqi-delhi-ncr.json          full dataset consumed by the web dashboard
 *   data/aqi-delhi-ncr.csv           wide table for direct Power BI import
 *   data/aqi-delhi-ncr-long.csv      long (Location x TimeSlot) table
 *   data/aqi-timeslots.csv           disconnected time-slicer dimension table
 *
 * Usage: node scripts/fetch-aqi.mjs
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STATIONS, TIME_POINTS } from "./aqi-stations.mjs";
import {
  aqiCategory,
  buildHourlyIndex,
  interpolateAt,
  kgPerDay,
  POLLUTANT_LABEL,
  round,
  subIndex,
  ugm3ToPpb,
  ugm3ToPpm,
  varianceBand,
  VARIANCE_BANDS,
  CO2E_PER_KG_PM,
  CARBON_PRICE_INR_PER_TCO2E,
} from "./aqi-core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data");

const API = "https://air-quality-api.open-meteo.com/v1/air-quality";
const HOURLY_VARS = [
  "pm2_5",
  "pm10",
  "nitrogen_dioxide",
  "sulphur_dioxide",
  "ozone",
  "carbon_monoxide",
  "us_aqi",
];
const PAST_DAYS = 30;
const CONCURRENCY = 5;

const T1 = { hour: 2, minute: 30, ...TIME_POINTS.t1 };
const T2 = { hour: 17, minute: 59, ...TIME_POINTS.t2 };

async function fetchStation(station) {
  const params = new URLSearchParams({
    latitude: String(station.lat),
    longitude: String(station.lng),
    hourly: HOURLY_VARS.join(","),
    timezone: "Asia/Kolkata",
    past_days: String(PAST_DAYS),
    forecast_days: "2",
  });
  const res = await fetch(`${API}?${params.toString()}`, {
    headers: { "User-Agent": "delhi-aqi-dashboard/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${station.locationName}`);
  return res.json();
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function pollutantBlock(row) {
  if (!row) return null;
  const pm25 = num(row.pm2_5);
  const pm10 = num(row.pm10);
  const no2 = num(row.nitrogen_dioxide);
  const so2 = num(row.sulphur_dioxide);
  const o3 = num(row.ozone);
  const co = num(row.carbon_monoxide);
  return {
    pm25: round(pm25, 1),
    pm10: round(pm10, 1),
    no2: round(no2, 1),
    so2: round(so2, 1),
    o3: round(o3, 1),
    co: round(co, 1),
  };
}

function dominantPollutant(block) {
  if (!block) return null;
  const candidates = {
    pm25: subIndex("pm25", block.pm25),
    pm10: subIndex("pm10", block.pm10),
    no2: subIndex("no2", ugm3ToPpb(block.no2, "no2")),
    so2: subIndex("so2", ugm3ToPpb(block.so2, "so2")),
    o3: subIndex("o3", ugm3ToPpb(block.o3, "o3")),
    co: subIndex("co", ugm3ToPpm(block.co, "co")),
  };
  let best = null;
  for (const [k, v] of Object.entries(candidates)) {
    if (v === null) continue;
    if (!best || v > best.value) best = { key: k, value: v };
  }
  return best ? { key: best.key, label: POLLUTANT_LABEL[best.key], subIndex: round(best.value, 0) } : null;
}

function stats(values) {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return { mean: null, median: null, stdDev: null, min: null, max: null, samples: 0 };
  const sorted = [...v].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const stdDev = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  return {
    mean: round(mean, 1),
    median: round(median, 1),
    stdDev: round(stdDev, 1),
    min: round(sorted[0], 1),
    max: round(sorted[sorted.length - 1], 1),
    samples: v.length,
  };
}

function buildRecord(station, payload) {
  const hourly = payload.hourly;
  if (!hourly?.time?.length) throw new Error(`no hourly data for ${station.locationName}`);

  const idx = buildHourlyIndex(hourly);
  const dates = [...new Set(hourly.time.map((t) => t.slice(0, 10)))].sort();
  const referenceDate = dates[dates.length - 1];

  const t1 = interpolateAt(idx, referenceDate, T1.hour, T1.minute);
  const t2 = interpolateAt(idx, referenceDate, T2.hour, T2.minute);

  // --- 30 day climatological baseline at the same clock times -------------
  const histDates = dates.filter((d) => d < referenceDate);
  const t1Hist = [];
  const t2Hist = [];
  for (const d of histDates) {
    const a = interpolateAt(idx, d, T1.hour, T1.minute);
    const b = interpolateAt(idx, d, T2.hour, T2.minute);
    if (a && num(a.us_aqi) !== null) t1Hist.push(a.us_aqi);
    if (b && num(b.us_aqi) !== null) t2Hist.push(b.us_aqi);
  }
  const base1 = stats(t1Hist);
  const base2 = stats(t2Hist);

  // --- whole day profile for the reference date ---------------------------
  const dayRows = hourly.time
    .filter((t) => t.startsWith(referenceDate))
    .map((t) => idx.get(t));
  const dayPm10 = dayRows.map((r) => num(r?.pm10)).filter((v) => v !== null);
  const dayPm25 = dayRows.map((r) => num(r?.pm2_5)).filter((v) => v !== null);
  const dailyMeanPm10 = dayPm10.length ? dayPm10.reduce((a, b) => a + b, 0) / dayPm10.length : null;
  const dailyMeanPm25 = dayPm25.length ? dayPm25.reduce((a, b) => a + b, 0) / dayPm25.length : null;

  const aqi1 = Math.round(num(t1?.us_aqi) ?? 0);
  const aqi2 = Math.round(num(t2?.us_aqi) ?? 0);
  const netDiff = aqi2 - aqi1;
  const diffPct = aqi1 > 0 ? (netDiff / aqi1) * 100 : 0;

  const p1 = pollutantBlock(t1);
  const p2 = pollutantBlock(t2);
  const dom1 = dominantPollutant(p1);
  const dom2 = dominantPollutant(p2);

  // --- emission baseline + carbon credit potential ------------------------
  const zoneAreaKm2 = station.zoneAreaKm2 ?? 25;
  const pmBaselineKgPerDay = dailyMeanPm10 !== null ? round(kgPerDay(dailyMeanPm10, zoneAreaKm2), 1) : null;
  const pmSwingUgM3 =
    p1 && p2 && p1.pm25 !== null && p2.pm25 !== null ? round(Math.abs(p2.pm25 - p1.pm25), 1) : null;
  const avoidablePmKgPerDay = pmSwingUgM3 !== null ? round(kgPerDay(pmSwingUgM3, zoneAreaKm2), 1) : null;

  const band = varianceBand(netDiff, diffPct);
  const reductionPct = VARIANCE_BANDS[band].reductionPct;
  const tco2eAnnual =
    avoidablePmKgPerDay !== null
      ? round((avoidablePmKgPerDay * (reductionPct / 100) * CO2E_PER_KG_PM * 365) / 1000, 2)
      : null;
  const creditValueInr = tco2eAnnual !== null ? Math.round(tco2eAnnual * CARBON_PRICE_INR_PER_TCO2E) : null;

  // composite variance index 0-100 ----------------------------------------
  const absDiff = Math.abs(netDiff);
  const absPct = Math.abs(diffPct);
  const dev1 = base1.mean !== null ? aqi1 - base1.mean : 0;
  const dev2 = base2.mean !== null ? aqi2 - base2.mean : 0;
  const maxDev = Math.max(Math.abs(dev1), Math.abs(dev2));
  const varianceIndex = Math.round(
    Math.min(100, (0.5 * (absDiff / 25) + 0.3 * (absPct / 12) + 0.2 * (maxDev / 20)) * 100),
  );

  return {
    id: station.id,
    locationName: station.locationName,
    region: station.region,
    state: station.state,
    latitude: station.lat,
    longitude: station.lng,
    zoneAreaKm2,
    referenceDate,
    aqi0230: aqi1,
    aqi1759: aqi2,
    netAqiDifference: netDiff,
    aqiDiffPct: round(diffPct, 1),
    aqiCategory0230: aqiCategory(aqi1).label,
    aqiCategory1759: aqiCategory(aqi2).label,
    aqiColor0230: aqiCategory(aqi1).color,
    aqiColor1759: aqiCategory(aqi2).color,
    dominantPollutant0230: dom1?.label ?? null,
    dominantPollutant1759: dom2?.label ?? null,
    pollutants0230: p1,
    pollutants1759: p2,
    baseline0230: base1,
    baseline1759: base2,
    baselineDeviation0230: round(dev1, 1),
    baselineDeviation1759: round(dev2, 1),
    dailyMeanPm25: round(dailyMeanPm25, 1),
    dailyMeanPm10: round(dailyMeanPm10, 1),
    pmBaselineKgPerDay: pmBaselineKgPerDay,
    pmSwingUgM3: pmSwingUgM3,
    avoidablePmKgPerDay: avoidablePmKgPerDay,
    reductionPct,
    tco2eAnnual,
    creditValueInr,
    varianceBand: band,
    varianceIndex,
  };
}

// ---------------------------------------------------------------------------
// CSV writers
// ---------------------------------------------------------------------------
const csvEscape = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function toCsv(headers, rows) {
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  return lines.join("\n");
}

function wideRow(s) {
  return {
    "Location Name": s.locationName,
    Latitude: s.latitude,
    Longitude: s.longitude,
    "AQI at 02:30": s.aqi0230,
    "AQI at 17:59": s.aqi1759,
    "Net AQI Difference": s.netAqiDifference,
    Region: s.region,
    State: s.state,
    "AQI Category 02:30": s.aqiCategory0230,
    "AQI Category 17:59": s.aqiCategory1759,
    "Dominant Pollutant 02:30": s.dominantPollutant0230,
    "Dominant Pollutant 17:59": s.dominantPollutant1759,
    "PM2.5 at 02:30": s.pollutants0230?.pm25 ?? "",
    "PM2.5 at 17:59": s.pollutants1759?.pm25 ?? "",
    "PM10 at 02:30": s.pollutants0230?.pm10 ?? "",
    "PM10 at 17:59": s.pollutants1759?.pm10 ?? "",
    "NO2 at 17:59": s.pollutants1759?.no2 ?? "",
    "SO2 at 17:59": s.pollutants1759?.so2 ?? "",
    "O3 at 17:59": s.pollutants1759?.o3 ?? "",
    "CO at 17:59": s.pollutants1759?.co ?? "",
    "30-Day Baseline 02:30": s.baseline0230.mean ?? "",
    "30-Day Baseline 17:59": s.baseline1759.mean ?? "",
    "Baseline Deviation 17:59": s.baselineDeviation1759,
    "Variance %": s.aqiDiffPct,
    "Variance Band": s.varianceBand,
    "Variance Index": s.varianceIndex,
    "Daily Mean PM10": s.dailyMeanPm10,
    "Emission Baseline (kg/day)": s.pmBaselineKgPerDay,
    "Avoidable PM2.5 (kg/day)": s.avoidablePmKgPerDay,
    "Reduction Potential %": s.reductionPct,
    "tCO2e/yr Potential": s.tco2eAnnual,
    "Credit Value (INR/yr)": s.creditValueInr,
  };
}

function longRow(s) {
  const base = {
    "Location Name": s.locationName,
    Latitude: s.latitude,
    Longitude: s.longitude,
    Region: s.region,
    State: s.state,
  };
  return [
    {
      ...base,
      "Time Slot": T1.label,
      Period: T1.period,
      AQI: s.aqi0230,
      "AQI Category": s.aqiCategory0230,
      "Dominant Pollutant": s.dominantPollutant0230,
      "PM2.5": s.pollutants0230?.pm25 ?? "",
      PM10: s.pollutants0230?.pm10 ?? "",
      "Net AQI Difference": s.netAqiDifference,
    },
    {
      ...base,
      "Time Slot": T2.label,
      Period: T2.period,
      AQI: s.aqi1759,
      "AQI Category": s.aqiCategory1759,
      "Dominant Pollutant": s.dominantPollutant1759,
      "PM2.5": s.pollutants1759?.pm25 ?? "",
      PM10: s.pollutants1759?.pm10 ?? "",
      "Net AQI Difference": s.netAqiDifference,
    },
  ];
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`[aqi] fetching ${STATIONS.length} Delhi NCR monitoring locations...`);
  const payloads = await pool(STATIONS, CONCURRENCY, async (station) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const data = await fetchStation(station);
        console.log(`[aqi]  ok  ${station.locationName}`);
        return { station, data };
      } catch (err) {
        if (attempt === 3) {
          console.error(`[aqi]  FAIL ${station.locationName}: ${err.message}`);
          return { station, data: null };
        }
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
    return { station, data: null };
  });

  const records = [];
  for (const { station, data } of payloads) {
    if (!data) continue;
    try {
      records.push(buildRecord(station, data));
    } catch (err) {
      console.error(`[aqi]  build failed for ${station.locationName}: ${err.message}`);
    }
  }

  if (!records.length) {
    console.error("[aqi] no records produced - aborting");
    process.exit(1);
  }

  // rank carbon credit opportunities
  records.sort((a, b) => (b.tco2eAnnual ?? 0) - (a.tco2eAnnual ?? 0));
  records.forEach((r, i) => {
    r.priorityRank = i + 1;
  });

  const referenceDate = records[0].referenceDate;
  const avg1 = records.reduce((a, r) => a + r.aqi0230, 0) / records.length;
  const avg2 = records.reduce((a, r) => a + r.aqi1759, 0) / records.length;
  const totalTco2e = records.reduce((a, r) => a + (r.tco2eAnnual ?? 0), 0);
  const totalValue = records.reduce((a, r) => a + (r.creditValueInr ?? 0), 0);
  const worst = records.reduce((a, r) => (r.aqi1759 > a.aqi1759 ? r : a), records[0]);
  const best = records.reduce((a, r) => (r.aqi1759 < a.aqi1759 ? r : a), records[0]);
  const maxVariance = records.reduce((a, r) => (Math.abs(r.netAqiDifference) > Math.abs(a.netAqiDifference) ? r : a), records[0]);

  const dataset = {
    title: "Delhi NCR Regional AQI - Night (02:30) vs Evening Peak (17:59)",
    generatedAt: new Date().toISOString(),
    referenceDate,
    source: "Open-Meteo Air Quality API (CAMS) - US EPA AQI | stations: CPCB/CAAQMS reference locations",
    timePoints: { t1: T1, t2: T2 },
    methodology: {
      aqiStandard: "US EPA AQI (as published by the Open-Meteo Air Quality API)",
      interpolation:
        "02:30 and 17:59 are linearly interpolated between the neighbouring hourly model steps (02:00/03:00 and 17:00/18:00 IST).",
      baseline: `Mean of the ${PAST_DAYS} preceding days at the same clock times.`,
      emissionModel: {
        mixingHeightM: 300,
        zoneAreaKm2: 25,
        formula: "kg/day = concentration(ug/m3) x 1e-6 x mixingHeight(m) x zoneArea(m2) x 1 turnover/day / 1000",
      },
      carbonModel: {
        co2ePerKgPm: CO2E_PER_KG_PM,
        priceInrPerTco2e: CARBON_PRICE_INR_PER_TCO2E,
        formula:
          "tCO2e/yr = avoidablePM2.5(kg/day) x reductionPotential x 2.7 kgCO2e/kgPM x 365 / 1000",
      },
    },
    summary: {
      stations: records.length,
      avgAqi0230: round(avg1, 1),
      avgAqi1759: round(avg2, 1),
      avgNetDifference: round(avg2 - avg1, 1),
      avgDiffPct: round(((avg2 - avg1) / avg1) * 100, 1),
      worstStation: worst.locationName,
      worstAqi: worst.aqi1759,
      cleanestStation: best.locationName,
      cleanestAqi: best.aqi1759,
      maxVarianceStation: maxVariance.locationName,
      maxVariance: maxVariance.netAqiDifference,
      totalTco2ePotential: round(totalTco2e, 2),
      totalCreditValueInr: totalValue,
      bandCounts: records.reduce((acc, r) => {
        acc[r.varianceBand] = (acc[r.varianceBand] ?? 0) + 1;
        return acc;
      }, {}),
    },
    stations: records,
  };

  await mkdir(DATA_DIR, { recursive: true });

  await writeFile(resolve(DATA_DIR, "aqi-delhi-ncr.json"), JSON.stringify(dataset, null, 2), "utf8");

  const wideHeaders = Object.keys(wideRow(records[0]));
  await writeFile(
    resolve(DATA_DIR, "aqi-delhi-ncr.csv"),
    toCsv(wideHeaders, records.map(wideRow)),
    "utf8",
  );

  const flatLong = records.flatMap(longRow);
  const longHeaders = Object.keys(flatLong[0]);
  await writeFile(
    resolve(DATA_DIR, "aqi-delhi-ncr-long.csv"),
    toCsv(longHeaders, flatLong),
    "utf8",
  );

  await writeFile(
    resolve(DATA_DIR, "aqi-timeslots.csv"),
    toCsv(
      ["Time Slot", "Period", "Sort Order", "Is Peak"],
      [
        { "Time Slot": T1.label, Period: T1.period, "Sort Order": 1, "Is Peak": "No" },
        { "Time Slot": T2.label, Period: T2.period, "Sort Order": 2, "Is Peak": "Yes" },
      ],
    ),
    "utf8",
  );

  console.log(`[aqi] wrote ${records.length} stations for ${referenceDate}`);
  console.log(`[aqi] avg AQI  02:30=${round(avg1, 1)}  17:59=${round(avg2, 1)}  net=${round(avg2 - avg1, 1)}`);
  console.log(`[aqi] total tCO2e potential = ${round(totalTco2e, 2)}  (INR ${totalValue.toLocaleString("en-IN")}/yr)`);
  console.log(`[aqi] bands: ${JSON.stringify(dataset.summary.bandCounts)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
