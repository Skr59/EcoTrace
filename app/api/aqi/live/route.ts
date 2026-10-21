import { NextResponse } from "next/server";
import {
  fetchAqicnLive,
  getStation,
  aqiCategory,
} from "@/lib/aqicn";
import {
  concentrationsFromAqicn,
  computeCarbonLiability,
} from "@/lib/carbonFromAqi";
import { estimateLandCarbon } from "@/lib/carbonEstimate";
import { getCreditPrice, isLivePrice, resolveCreditPrice } from "@/lib/creditPrice";
import type { LiveResponse } from "@/lib/aqiTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const station = getStation(searchParams.get("station"));

  const [live, fetchedPrice] = await Promise.all([
    fetchAqicnLive(station),
    getCreditPrice(),
  ]);

  const priceINR = resolveCreditPrice(searchParams, fetchedPrice);

  const conc = concentrationsFromAqicn(live.pollutants);
  const liability = computeCarbonLiability(conc, {
    creditPriceINR: priceINR,
  });

  const land = estimateLandCarbon(station.lat, station.lng);

  // The pollution liability is a cluster-wide number (25 km2 zone), so it is
  // compared against the land credits for an equivalent 25 km2 of land.
  const equivalentLandCredits =
    land.totalCredits * liability.zoneAreaKm2;

  const netPositionT = equivalentLandCredits - liability.requiredCreditsTPerYear;

  const body: LiveResponse = {
    ok: live.ok,
    live,
    category: aqiCategory(live.aqi),
    liability,
    land,
    creditPriceINR: priceINR,
    marketPriceINR: fetchedPrice.price,
    creditPriceLive: isLivePrice(searchParams, fetchedPrice),
    netPositionT,
    netPositionValueINR: netPositionT * priceINR,
    fetchedAt: new Date().toISOString(),
    error: live.error,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
