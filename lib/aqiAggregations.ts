/**
 * Time-division aggregations over an hourly air-quality series.
 *
 * The dashboard needs the same underlying series sliced several ways:
 *   - by hour of the day   (24 buckets)
 *   - by day of the week   (7 buckets)
 *   - by day / month       (trend lines)
 *   - by day-part          (night / morning / afternoon / evening)
 */

import type { AirQualityPoint } from "./openMeteo";
import { aqiCategory } from "./aqicn";

export interface DailyPoint {
  date: string;
  label: string;
  meanAqi: number;
  maxAqi: number;
  minAqi: number;
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  o3: number;
  co: number;
  hours: number;
  category: string;
  dominant: string;
}

export interface MonthlyPoint {
  month: string;
  label: string;
  meanAqi: number;
  maxAqi: number;
  minAqi: number;
  pm25: number;
  pm10: number;
  days: number;
  hours: number;
  daysUnhealthy: number;
  daysSevere: number;
}

export interface HourProfile {
  hour: number;
  label: string;
  meanAqi: number;
  maxAqi: number;
  pm25: number;
  samples: number;
}

export interface DayProfile {
  dow: number;
  label: string;
  short: string;
  meanAqi: number;
  maxAqi: number;
  pm25: number;
  samples: number;
}

export interface PeriodProfile {
  key: string;
  label: string;
  range: string;
  meanAqi: number;
  maxAqi: number;
  pm25: number;
  samples: number;
  share: number;
}

export interface SeriesStats {
  hours: number;
  days: number;
  meanAqi: number;
  maxAqi: number;
  minAqi: number;
  worstDay: { date: string; meanAqi: number } | null;
  bestDay: { date: string; meanAqi: number } | null;
  daysUnhealthy: number;
  daysSevere: number;
  daysGood: number;
  pm25Mean: number;
  pm10Mean: number;
  no2Mean: number;
  so2Mean: number;
  o3Mean: number;
  coMean: number;
}

const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(v: number, d = 1): number {
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function dominantPollutant(p: {
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  o3: number;
  co: number;
}): string {
  const entries: Array<[string, number]> = [
    ["PM2.5", p.pm25],
    ["PM10", p.pm10],
    ["NO2", p.no2],
    ["SO2", p.so2],
    ["O3", p.o3],
    ["CO", p.co],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/** Group the hourly series into calendar days (local IST timestamps). */
export function dailySeries(points: AirQualityPoint[]): DailyPoint[] {
  const buckets = new Map<string, AirQualityPoint[]>();
  for (const p of points) {
    const date = p.time.slice(0, 10);
    const list = buckets.get(date);
    if (list) list.push(p);
    else buckets.set(date, [p]);
  }

  const out: DailyPoint[] = [];
  for (const [date, list] of Array.from(buckets.entries())) {
    const aqis = list.map((p) => p.aqi).filter((v): v is number => v !== null);
    const pm25 = mean(list.map((p) => p.pm25).filter((v): v is number => v !== null));
    const pm10 = mean(list.map((p) => p.pm10).filter((v): v is number => v !== null));
    const no2 = mean(list.map((p) => p.no2).filter((v): v is number => v !== null));
    const so2 = mean(list.map((p) => p.so2).filter((v): v is number => v !== null));
    const o3 = mean(list.map((p) => p.o3).filter((v): v is number => v !== null));
    const co = mean(list.map((p) => p.co).filter((v): v is number => v !== null));

    const meanAqi = mean(aqis);
    const d = new Date(`${date}T00:00:00+05:30`);
    out.push({
      date,
      label: `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`,
      meanAqi: round(meanAqi),
      maxAqi: round(aqis.length ? Math.max(...aqis) : 0),
      minAqi: round(aqis.length ? Math.min(...aqis) : 0),
      pm25: round(pm25),
      pm10: round(pm10),
      no2: round(no2),
      so2: round(so2),
      o3: round(o3),
      co: round(co),
      hours: aqis.length,
      category: aqiCategory(meanAqi).label,
      dominant: dominantPollutant({ pm25, pm10, no2, so2, o3, co }),
    });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

/** Group the hourly series into calendar months. */
export function monthlySeries(points: AirQualityPoint[]): MonthlyPoint[] {
  const buckets = new Map<string, AirQualityPoint[]>();
  for (const p of points) {
    const month = p.time.slice(0, 7);
    const list = buckets.get(month);
    if (list) list.push(p);
    else buckets.set(month, [p]);
  }

  const daily = dailySeries(points);
  const out: MonthlyPoint[] = [];
  for (const [month, list] of Array.from(buckets.entries())) {
    const aqis = list.map((p) => p.aqi).filter((v): v is number => v !== null);
    const monthDays = daily.filter((d) => d.date.startsWith(month));
    const [y, m] = month.split("-").map(Number);
    out.push({
      month,
      label: `${MONTH_LABELS[(m || 1) - 1]} ${String(y).slice(2)}`,
      meanAqi: round(mean(aqis)),
      maxAqi: round(aqis.length ? Math.max(...aqis) : 0),
      minAqi: round(aqis.length ? Math.min(...aqis) : 0),
      pm25: round(mean(list.map((p) => p.pm25).filter((v): v is number => v !== null))),
      pm10: round(mean(list.map((p) => p.pm10).filter((v): v is number => v !== null))),
      days: monthDays.length,
      hours: aqis.length,
      daysUnhealthy: monthDays.filter((d) => d.meanAqi > 100).length,
      daysSevere: monthDays.filter((d) => d.meanAqi > 200).length,
    });
  }
  out.sort((a, b) => (a.month < b.month ? -1 : 1));
  return out;
}

/** 24-bucket profile of the average pollution for each hour of the day. */
export function hourOfDayProfile(points: AirQualityPoint[]): HourProfile[] {
  const buckets: AirQualityPoint[][] = Array.from({ length: 24 }, () => []);
  for (const p of points) {
    const hour = Number(p.time.slice(11, 13));
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    buckets[hour].push(p);
  }
  return buckets.map((list, hour) => {
    const aqis = list.map((p) => p.aqi).filter((v): v is number => v !== null);
    return {
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      meanAqi: round(mean(aqis)),
      maxAqi: round(aqis.length ? Math.max(...aqis) : 0),
      pm25: round(mean(list.map((p) => p.pm25).filter((v): v is number => v !== null))),
      samples: aqis.length,
    };
  });
}

/** 7-bucket profile of the average pollution for each day of the week. */
export function dayOfWeekProfile(points: AirQualityPoint[]): DayProfile[] {
  const buckets: AirQualityPoint[][] = Array.from({ length: 7 }, () => []);
  for (const p of points) {
    const d = new Date(`${p.time.slice(0, 10)}T00:00:00+05:30`);
    buckets[d.getDay()].push(p);
  }
  return buckets.map((list, dow) => {
    const aqis = list.map((p) => p.aqi).filter((v): v is number => v !== null);
    return {
      dow,
      label: DOW_LABELS[dow],
      short: DOW_SHORT[dow],
      meanAqi: round(mean(aqis)),
      maxAqi: round(aqis.length ? Math.max(...aqis) : 0),
      pm25: round(mean(list.map((p) => p.pm25).filter((v): v is number => v !== null))),
      samples: aqis.length,
    };
  });
}

export const DAY_PARTS: Array<{ key: string; label: string; range: string; from: number; to: number }> = [
  { key: "night", label: "Night / Off-Peak", range: "00:00 - 05:59", from: 0, to: 5 },
  { key: "morning", label: "Morning Peak", range: "06:00 - 11:59", from: 6, to: 11 },
  { key: "afternoon", label: "Afternoon", range: "12:00 - 16:59", from: 12, to: 16 },
  { key: "evening", label: "Evening Peak", range: "17:00 - 20:59", from: 17, to: 20 },
  { key: "late", label: "Late Night", range: "21:00 - 23:59", from: 21, to: 23 },
];

/** Day-part profile: how pollution distributes across a typical 24 hours. */
export function dayPartProfile(points: AirQualityPoint[]): PeriodProfile[] {
  const buckets = new Map<string, AirQualityPoint[]>();
  for (const part of DAY_PARTS) buckets.set(part.key, []);
  for (const p of points) {
    const hour = Number(p.time.slice(11, 13));
    const part = DAY_PARTS.find((d) => hour >= d.from && hour <= d.to);
    if (part) buckets.get(part.key)!.push(p);
  }
  const total = points.length || 1;
  return DAY_PARTS.map((part) => {
    const list = buckets.get(part.key)!;
    const aqis = list.map((p) => p.aqi).filter((v): v is number => v !== null);
    return {
      key: part.key,
      label: part.label,
      range: part.range,
      meanAqi: round(mean(aqis)),
      maxAqi: round(aqis.length ? Math.max(...aqis) : 0),
      pm25: round(mean(list.map((p) => p.pm25).filter((v): v is number => v !== null))),
      samples: aqis.length,
      share: round((list.length / total) * 100),
    };
  });
}

/** Summary statistics for a whole hourly series. */
export function seriesStats(points: AirQualityPoint[]): SeriesStats {
  const aqis = points.map((p) => p.aqi).filter((v): v is number => v !== null);
  const daily = dailySeries(points);
  const worst = daily.reduce<DailyPoint | null>(
    (acc, d) => (!acc || d.meanAqi > acc.meanAqi ? d : acc),
    null
  );
  const best = daily.reduce<DailyPoint | null>(
    (acc, d) => (!acc || d.meanAqi < acc.meanAqi ? d : acc),
    null
  );
  return {
    hours: aqis.length,
    days: daily.length,
    meanAqi: round(mean(aqis)),
    maxAqi: aqis.length ? Math.max(...aqis) : 0,
    minAqi: aqis.length ? Math.min(...aqis) : 0,
    worstDay: worst ? { date: worst.date, meanAqi: worst.meanAqi } : null,
    bestDay: best ? { date: best.date, meanAqi: best.meanAqi } : null,
    daysUnhealthy: daily.filter((d) => d.meanAqi > 100).length,
    daysSevere: daily.filter((d) => d.meanAqi > 200).length,
    daysGood: daily.filter((d) => d.meanAqi <= 100).length,
    pm25Mean: round(mean(points.map((p) => p.pm25).filter((v): v is number => v !== null))),
    pm10Mean: round(mean(points.map((p) => p.pm10).filter((v): v is number => v !== null))),
    no2Mean: round(mean(points.map((p) => p.no2).filter((v): v is number => v !== null))),
    so2Mean: round(mean(points.map((p) => p.so2).filter((v): v is number => v !== null))),
    o3Mean: round(mean(points.map((p) => p.o3).filter((v): v is number => v !== null))),
    coMean: round(mean(points.map((p) => p.co).filter((v): v is number => v !== null))),
  };
}
