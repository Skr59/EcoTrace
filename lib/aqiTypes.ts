/**
 * Shared response shapes for the pollution / carbon-credit API.
 * Imported by both the Next.js route handlers and the dashboard client.
 */

import type { AqicnLive } from "./aqicn";
import type { CarbonLiability } from "./carbonFromAqi";
import type { LandCarbonEstimate } from "./carbonEstimate";
import type {
  DailyPoint,
  DayProfile,
  HourProfile,
  PeriodProfile,
  SeriesStats,
} from "./aqiAggregations";
import type { LedgerRow, LedgerSummary } from "./industries";

export interface AqiCategoryInfo {
  label: string;
  color: string;
}

export interface LiveResponse {
  ok: boolean;
  live: AqicnLive;
  category: AqiCategoryInfo;
  liability: CarbonLiability;
  land: LandCarbonEstimate;
  creditPriceINR: number;
  /** Untouched market price, so the UI can switch between live and reference rates. */
  marketPriceINR: number;
  creditPriceLive: boolean;
  netPositionT: number;
  netPositionValueINR: number;
  fetchedAt: string;
  error?: string;
}

export interface HourlyPoint {
  time: string;
  label: string;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  o3: number | null;
  co: number | null;
  co2eKg: number | null;
}

export interface HistoryResponse {
  ok: boolean;
  stationSlug: string;
  stationName: string;
  lat: number;
  lng: number;
  window: { start: string; end: string; days: number };
  hourly: HourlyPoint[];
  daily: DailyPoint[];
  hourOfDay: HourProfile[];
  dayOfWeek: DayProfile[];
  dayParts: PeriodProfile[];
  stats: SeriesStats | null;
  current: CarbonLiability | null;
  average: CarbonLiability | null;
  creditPriceINR: number;
  /** Untouched market price, so the UI can switch between live and reference rates. */
  marketPriceINR: number;
  creditPriceLive: boolean;
  fetchedAt: string;
  error?: string;
}

export interface MonthlyResponse {
  ok: boolean;
  stationSlug: string;
  stationName: string;
  months: Array<{
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
  }>;
  labels: string[];
  creditPriceINR: number;
  /** Untouched market price, so the UI can switch between live and reference rates. */
  marketPriceINR: number;
  creditPriceLive: boolean;
  fetchedAt: string;
  error?: string;
}

export interface IndustriesResponse {
  ok: boolean;
  stationSlug: string;
  stationName: string;
  aqi: number | null;
  category: AqiCategoryInfo;
  observedAt: string | null;
  liability: CarbonLiability;
  rows: LedgerRow[];
  summary: LedgerSummary;
  creditPriceINR: number;
  /** Untouched market price, so the UI can switch between live and reference rates. */
  marketPriceINR: number;
  creditPriceLive: boolean;
  fetchedAt: string;
  error?: string;
}
