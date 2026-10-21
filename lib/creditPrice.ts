/**
 * Shared live carbon-credit price.
 *
 * Sourced from the same on-chain market the rest of the hub uses, with a
 * server-side TTL cache so every route quotes an identical price.
 */

import { DEFAULT_CREDIT_PRICE_INR, setCreditPriceINR } from "./carbonRates";

export interface CreditPrice {
  price: number;
  live: boolean;
  fetchedAt: string;
}

const TOKEN_ID = "toucan-protocol-nature-carbon-tonne";
const TOKEN_LABEL = "NCT (Nature Carbon Tonne)";
const TTL_MS = 10 * 60 * 1000;

let cached: CreditPrice & { ts: number } = {
  price: DEFAULT_CREDIT_PRICE_INR,
  live: false,
  fetchedAt: "",
  ts: 0,
};

export const CREDIT_TOKEN = { id: TOKEN_ID, label: TOKEN_LABEL };

/**
 * Resolve the credit price for a request.
 *
 * - `?price=live`      -> the fetched on-chain market price
 * - `?price=<number>`  -> an explicit custom rate
 * - `?price=reference` -> the platform reference rate (default)
 *
 * Defaulting to the platform reference keeps every route on the hub quoting
 * the same rate as the marketplace, while `marketPriceINR` still exposes the
 * untouched on-chain price.
 */
export function resolveCreditPrice(
  searchParams: URLSearchParams,
  fetched: CreditPrice
): number {
  const raw = (searchParams.get("price") ?? "").trim().toLowerCase();
  if (raw === "live") return fetched.price || DEFAULT_CREDIT_PRICE_INR;
  if (raw === "reference" || raw === "") return DEFAULT_CREDIT_PRICE_INR;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  return DEFAULT_CREDIT_PRICE_INR;
}

/** True when the resolved price is the live on-chain market price. */
export function isLivePrice(
  searchParams: URLSearchParams,
  fetched: CreditPrice
): boolean {
  const raw = (searchParams.get("price") ?? "").trim().toLowerCase();
  if (raw !== "live") return false;
  return fetched.live;
}

export async function getCreditPrice(): Promise<CreditPrice> {
  const now = Date.now();
  if (cached.ts && now - cached.ts < TTL_MS) {
    return { price: cached.price, live: cached.live, fetchedAt: cached.fetchedAt };
  }
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${TOKEN_ID}&vs_currencies=inr`,
      { cache: "no-store", signal: AbortSignal.timeout(12_000) }
    );
    if (res.ok) {
      const data = await res.json();
      const inr = Number(data?.[TOKEN_ID]?.inr);
      if (inr > 0) {
        setCreditPriceINR(inr);
        cached = {
          price: inr,
          live: true,
          fetchedAt: new Date().toLocaleTimeString("en-IN", { hour12: false }),
          ts: now,
        };
        return { price: cached.price, live: cached.live, fetchedAt: cached.fetchedAt };
      }
    }
  } catch {
    /* fall through to the cached/default price */
  }
  cached = {
    price: cached.price || DEFAULT_CREDIT_PRICE_INR,
    live: false,
    fetchedAt: new Date().toLocaleTimeString("en-IN", { hour12: false }),
    ts: now,
  };
  return { price: cached.price, live: cached.live, fetchedAt: cached.fetchedAt };
}
