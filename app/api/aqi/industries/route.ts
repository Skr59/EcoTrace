import { NextResponse } from "next/server";
import { fetchAqicnLive, getStation, aqiCategory } from "@/lib/aqicn";
import { concentrationsFromAqicn, computeCarbonLiability } from "@/lib/carbonFromAqi";
import { computeIndustryLedger } from "@/lib/industries";
import { getCreditPrice, isLivePrice, resolveCreditPrice } from "@/lib/creditPrice";

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
  const liability = computeCarbonLiability(conc, { creditPriceINR: priceINR });
  const { rows, summary } = computeIndustryLedger({
    liabilityTPerYear: liability.requiredCreditsTPerYear,
    creditPriceINR: priceINR,
  });

  return NextResponse.json(
    {
      ok: live.ok,
      stationSlug: station.slug,
      stationName: station.name,
      aqi: live.aqi,
      category: aqiCategory(live.aqi),
      observedAt: live.observedAt,
      liability,
      rows,
      summary,
      creditPriceINR: priceINR,
      marketPriceINR: fetchedPrice.price,
      creditPriceLive: isLivePrice(searchParams, fetchedPrice),
      fetchedAt: new Date().toISOString(),
      error: live.error,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
