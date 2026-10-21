/**
 * US-EPA AQI breakpoint tables (EPA Technical Assistance Document).
 *
 * Used in both directions:
 *   - `subIndex()` converts a measured concentration into an AQI sub-index
 *   - `aqiToConcentration()` inverts it, which lets us turn the per-pollutant
 *     AQI sub-indices published by AQICN back into real concentrations
 *     (ug/m3) so they can be fed into the carbon-credit emission model.
 */

export interface BreakpointRow {
  cLow: number;
  cHigh: number;
  iLow: number;
  iHigh: number;
}

export const BREAKPOINTS: Record<string, BreakpointRow[]> = {
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

/** Concentration (ug/m3, or ppm for CO) -> AQI sub-index. */
export function subIndex(pollutant: string, c: number | null | undefined): number | null {
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

/**
 * AQI sub-index -> concentration (ug/m3, or ppm for CO).
 * Inverse of the piecewise-linear EPA mapping; returns null when unknown.
 */
export function aqiToConcentration(
  pollutant: string,
  aqi: number | null | undefined
): number | null {
  if (aqi === null || aqi === undefined || Number.isNaN(aqi)) return null;
  const rows = BREAKPOINTS[pollutant];
  if (!rows) return null;
  const i = aqi;
  if (i < 0) return null;
  for (const r of rows) {
    if (i >= r.iLow && i <= r.iHigh) {
      if (r.iHigh === r.iLow) return r.cLow;
      return r.cLow + ((i - r.iLow) * (r.cHigh - r.cLow)) / (r.iHigh - r.iLow);
    }
  }
  return null;
}
