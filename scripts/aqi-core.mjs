/**
 * Core AQI + emission/carbon-credit math for the Delhi NCR dashboard.
 *
 * AQI values come from the Open-Meteo Air Quality API (CAMS reanalysis /
 * forecast) which publishes a US-EPA AQI index directly. The breakpoint tables
 * below are the US-EPA AQI technical assistance document tables and are used
 * to determine the *dominant pollutant* for each station/timestamp.
 */

// ---------------------------------------------------------------------------
// US EPA AQI breakpoints
// ---------------------------------------------------------------------------
export const BREAKPOINTS = {
  pm25: [
    { cLow: 0, cHigh: 12.0, iLow: 0, iHigh: 50 },
    { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
    { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
    { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
    { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
    { cLow: 250.5, cHigh: 350.4, iLow: 301, iHigh: 400 },
    { cLow: 350.5, cHigh: 500.4, iLow: 401, iHigh: 500 },
    { cLow: 500.5, cHigh: 10000.4, iLow: 501, iHigh: 600 },
  ],
  pm10: [
    { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
    { cLow: 55, cHigh: 154, iLow: 51, iHigh: 100 },
    { cLow: 155, cHigh: 254, iLow: 101, iHigh: 150 },
    { cLow: 255, cHigh: 354, iLow: 151, iHigh: 200 },
    { cLow: 355, cHigh: 424, iLow: 201, iHigh: 300 },
    { cLow: 425, cHigh: 504, iLow: 301, iHigh: 400 },
    { cLow: 505, cHigh: 604, iLow: 401, iHigh: 500 },
    { cLow: 605, cHigh: 10000.4, iLow: 501, iHigh: 600 },
  ],
  o3: [
    { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
    { cLow: 55, cHigh: 70, iLow: 51, iHigh: 100 },
    { cLow: 71, cHigh: 85, iLow: 101, iHigh: 150 },
    { cLow: 86, cHigh: 105, iLow: 151, iHigh: 200 },
    { cLow: 106, cHigh: 200, iLow: 201, iHigh: 300 },
    { cLow: 201, cHigh: 300, iLow: 301, iHigh: 400 },
    { cLow: 301, cHigh: 400, iLow: 401, iHigh: 500 },
    { cLow: 401, cHigh: 500, iLow: 501, iHigh: 600 },
  ],
  no2: [
    { cLow: 0, cHigh: 53, iLow: 0, iHigh: 50 },
    { cLow: 54, cHigh: 100, iLow: 51, iHigh: 100 },
    { cLow: 101, cHigh: 360, iLow: 101, iHigh: 150 },
    { cLow: 361, cHigh: 649, iLow: 151, iHigh: 200 },
    { cLow: 650, cHigh: 1249, iLow: 201, iHigh: 300 },
    { cLow: 1250, cHigh: 1649, iLow: 301, iHigh: 400 },
    { cLow: 1650, cHigh: 2049, iLow: 401, iHigh: 500 },
    { cLow: 2050, cHigh: 10000.4, iLow: 501, iHigh: 600 },
  ],
  so2: [
    { cLow: 0, cHigh: 35, iLow: 0, iHigh: 50 },
    { cLow: 36, cHigh: 75, iLow: 51, iHigh: 100 },
    { cLow: 76, cHigh: 185, iLow: 101, iHigh: 150 },
    { cLow: 186, cHigh: 304, iLow: 151, iHigh: 200 },
    { cLow: 305, cHigh: 604, iLow: 201, iHigh: 300 },
    { cLow: 605, cHigh: 804, iLow: 301, iHigh: 400 },
    { cLow: 805, cHigh: 1004, iLow: 401, iHigh: 500 },
    { cLow: 1005, cHigh: 10000.4, iLow: 501, iHigh: 600 },
  ],
  co: [
    { cLow: 0, cHigh: 4.4, iLow: 0, iHigh: 50 },
    { cLow: 4.5, cHigh: 9.4, iLow: 51, iHigh: 100 },
    { cLow: 9.5, cHigh: 12.4, iLow: 101, iHigh: 150 },
    { cLow: 12.5, cHigh: 15.4, iLow: 151, iHigh: 200 },
    { cLow: 15.5, cHigh: 30.4, iLow: 201, iHigh: 300 },
    { cLow: 30.5, cHigh: 40.4, iLow: 301, iHigh: 400 },
    { cLow: 40.5, cHigh: 50.4, iLow: 401, iHigh: 500 },
    { cLow: 50.5, cHigh: 10000.4, iLow: 501, iHigh: 600 },
  ],
};

export const POLLUTANT_LABEL = {
  pm25: "PM2.5",
  pm10: "PM10",
  o3: "O3",
  no2: "NO2",
  so2: "SO2",
  co: "CO",
};

/** Linear interpolation between the two EPA breakpoint rows that bracket `c`. */
export function subIndex(pollutant, c) {
  if (c === null || c === undefined || Number.isNaN(c)) return null;
  const rows = BREAKPOINTS[pollutant];
  if (!rows) return null;
  if (c > rows[rows.length - 1].cHigh) return rows[rows.length - 1].iHigh;
  for (const r of rows) {
    if (c >= r.cLow && c <= r.cHigh) {
      return ((r.iHigh - r.iLow) / (r.cHigh - r.cLow)) * (c - r.cLow) + r.iLow;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Unit conversion (API returns ug/m3 for gases, ppm for CO)
// ---------------------------------------------------------------------------
export const M3_PER_MOLE = 24.45; // at 25 C, 1013 hPa
export const MW = { o3: 48.0, no2: 46.0055, so2: 64.066, co: 28.0101 };

export const ugm3ToPpb = (v, species) => (v === null || v === undefined ? null : (v * M3_PER_MOLE) / MW[species]);
export const ugm3ToPpm = (v, species) => (v === null || v === undefined ? null : (v * M3_PER_MOLE) / MW[species]);

// ---------------------------------------------------------------------------
// AQI categories (US EPA)
// ---------------------------------------------------------------------------
export const AQI_CATEGORIES = [
  { max: 50, label: "Good", color: "#00E400", short: "Good" },
  { max: 100, label: "Moderate", color: "#FFFF00", short: "Moderate" },
  { max: 150, label: "Unhealthy for Sensitive Groups", color: "#FF7E00", short: "USG" },
  { max: 200, label: "Unhealthy", color: "#FF0000", short: "Unhealthy" },
  { max: 300, label: "Very Unhealthy", color: "#8F3F97", short: "Very Unhealthy" },
  { max: 500, label: "Hazardous", color: "#7E0023", short: "Hazardous" },
  { max: Infinity, label: "Extremely Hazardous", color: "#6A0DAD", short: "Extreme" },
];

export function aqiCategory(aqi) {
  const v = Number(aqi) || 0;
  return AQI_CATEGORIES.find((c) => v <= c.max) ?? AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
}

// ---------------------------------------------------------------------------
// Variance bands + carbon credit model
// ---------------------------------------------------------------------------
export const VARIANCE_BANDS = {
  Severe: { color: "#E11D48", reductionPct: 25, weight: 4 },
  High: { color: "#F97316", reductionPct: 18, weight: 3 },
  Moderate: { color: "#FACC15", reductionPct: 10, weight: 2 },
  Low: { color: "#22C55E", reductionPct: 4, weight: 1 },
};

export function varianceBand(netDiff, diffPct) {
  const abs = Math.abs(netDiff);
  const absPct = Math.abs(diffPct);
  if (abs >= 25 || absPct >= 15) return "Severe";
  if (abs >= 12 || absPct >= 8) return "High";
  if (abs >= 6 || absPct >= 3) return "Moderate";
  return "Low";
}

/**
 * Emission and carbon-credit model constants.
 *
 *  - Column mass: c(ug/m3) x 1e-6 (g/ug) x mixingHeight (m) x zoneArea (m2)
 *    -> grams resident in the mixing layer; x1 column turnover per day -> kg/day.
 *  - PM -> CO2e: 2.7 kg CO2e per kg of combustion related PM2.5 (road transport
 *    PM/CO2 emission factor range 2.3-3.1 kg CO2e/kg PM2.5).
 */
export const MIXING_HEIGHT_M = 300;
export const CO2E_PER_KG_PM = 2.7;
export const CARBON_PRICE_INR_PER_TCO2E = 1800;

export function kgPerDay(concUgM3, zoneAreaKm2) {
  return (concUgM3 * 1e-6 * MIXING_HEIGHT_M * zoneAreaKm2 * 1e6) / 1000;
}

/** Linear interpolation of a value at an arbitrary clock time from hourly data. */
export function interpolateAt(hourlyIndex, dateStr, hour, minute) {
  const a = hourlyIndex.get(`${dateStr}T${String(hour).padStart(2, "0")}:00`);
  const b = hourlyIndex.get(`${dateStr}T${String(hour + 1).padStart(2, "0")}:00`);
  const f = minute / 60;
  if (a === undefined || b === undefined) {
    return a !== undefined ? a : b !== undefined ? b : null;
  }
  const out = {};
  for (const k of Object.keys(a)) {
    if (typeof a[k] !== "number" || typeof b[k] !== "number") {
      out[k] = null;
      continue;
    }
    out[k] = a[k] + (b[k] - a[k]) * f;
  }
  return out;
}

export function buildHourlyIndex(hourly) {
  const idx = new Map();
  const times = hourly.time || [];
  for (let i = 0; i < times.length; i++) {
    const row = {};
    for (const k of Object.keys(hourly)) {
      if (k === "time") continue;
      row[k] = Array.isArray(hourly[k]) ? hourly[k][i] : null;
    }
    idx.set(times[i], row);
  }
  return idx;
}

export const round = (v, d = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d;
