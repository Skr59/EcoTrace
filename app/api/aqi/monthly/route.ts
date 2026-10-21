import { NextResponse } from "next/server";
import { getStation } from "@/lib/aqicn";
import { daysAgo, fetchAirQualitySeries, isoDate } from "@/lib/openMeteo";
import { monthlySeries } from "@/lib/aqiAggregations";
import { getCreditPrice, isLivePrice, resolveCreditPrice } from "@/lib/creditPrice";
import type { MonthlyResponse } from "@/lib/aqiTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const station = getStation(searchParams.get("station"));
  const months = Math.min(24, Math.max(3, Number(searchParams.get("months") ?? 12) || 12));

  const end = isoDate(new Date());
  const start = daysAgo(months * 30 + 32);

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
        months: [],
        labels: [],
        creditPriceINR: priceINR,
        marketPriceINR: fetchedPrice.price,
        fetchedAt: new Date().toISOString(),
        error: series.error,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  const monthsData = monthlySeries(series.points).slice(-months);

  const body: MonthlyResponse = {
    ok: true,
    stationSlug: station.slug,
    stationName: station.name,
    months: monthsData,
    labels: monthsData.map((m) => m.label),
    creditPriceINR: priceINR,
    marketPriceINR: fetchedPrice.price,
    creditPriceLive: isLivePrice(searchParams, fetchedPrice),
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
