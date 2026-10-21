import { NextResponse } from "next/server";
import { getStation } from "@/lib/aqicn";
import { daysAgo, fetchAirQualitySeries, isoDate } from "@/lib/openMeteo";
import {
  dailySeries,
  dayOfWeekProfile,
  dayPartProfile,
  hourOfDayProfile,
  seriesStats,
} from "@/lib/aqiAggregations";
import {
  concentrationsFromPoint,
  computeCarbonLiability,
} from "@/lib/carbonFromAqi";
import { getCreditPrice, isLivePrice, resolveCreditPrice } from "@/lib/creditPrice";
import type { HistoryResponse, HourlyPoint } from "@/lib/aqiTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const station = getStation(searchParams.get("station"));
  const days = Math.min(180, Math.max(3, Number(searchParams.get("days") ?? 30) || 30));
  const hours = Math.min(24 * 14, Math.max(24, Number(searchParams.get("hours") ?? 72) || 72));

  const end = isoDate(new Date());
  const start = daysAgo(days - 1);

  const [series, fetchedPrice] = await Promise.all([
    fetchAirQualitySeries(station.lat, station.lng, start, end),
    getCreditPrice(),
  ]);

  const priceINR = resolveCreditPrice(searchParams, fetchedPrice);

  if (!series.ok) {
    return NextResponse.json(
      {
        ok: false,
        stationSlug: station.slug,
        stationName: station.name,
        lat: station.lat,
        lng: station.lng,
        window: { start, end, days },
        hourly: [],
        daily: [],
        hourOfDay: [],
        dayOfWeek: [],
        dayParts: [],
        stats: null,
        current: null,
        average: null,
      creditPriceINR: priceINR,
      marketPriceINR: fetchedPrice.price,
      fetchedAt: new Date().toISOString(),
      error: series.error,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  const points = series.points;
  const hourlyWindow = points.slice(-hours);

  const hourly: HourlyPoint[] = hourlyWindow.map((p) => {
    const liability = computeCarbonLiability(concentrationsFromPoint(p), {
      creditPriceINR: priceINR,
    });
    return {
      time: p.time,
      label: p.time.slice(5).replace("T", " "),
      aqi: p.aqi,
      pm25: p.pm25,
      pm10: p.pm10,
      no2: p.no2,
      so2: p.so2,
      o3: p.o3,
      co: p.co,
      co2eKg: Math.round(liability.totalCo2eKgPerDay / 24 * 100) / 100,
    };
  });

  const daily = dailySeries(points);
  const last = points[points.length - 1];
  const current = last
    ? computeCarbonLiability(concentrationsFromPoint(last), { creditPriceINR: priceINR })
    : null;

  const meanConc = {
    pm25: avg(points.map((p) => p.pm25)),
    pm10: avg(points.map((p) => p.pm10)),
    no2: avg(points.map((p) => p.no2)),
    so2: avg(points.map((p) => p.so2)),
    o3: avg(points.map((p) => p.o3)),
    co: avg(points.map((p) => p.co)),
  };
  const average = computeCarbonLiability(meanConc, { creditPriceINR: priceINR });

  const body: HistoryResponse = {
    ok: true,
    stationSlug: station.slug,
    stationName: station.name,
    lat: station.lat,
    lng: station.lng,
    window: { start, end, days },
    hourly,
    daily,
    hourOfDay: hourOfDayProfile(points),
    dayOfWeek: dayOfWeekProfile(points),
    dayParts: dayPartProfile(points),
    stats: seriesStats(points),
    current,
    average,
    creditPriceINR: priceINR,
    marketPriceINR: fetchedPrice.price,
    creditPriceLive: isLivePrice(searchParams, fetchedPrice),
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v !== null && v !== undefined);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
