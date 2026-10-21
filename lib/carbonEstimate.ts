/**
 * Deterministic land carbon-credit estimator.
 *
 * The original `/carbon-credit` page computed vegetation / soil / water scores
 * with `Math.random()`, which meant two visits to the same location never
 * agreed and the numbers could not be compared against anything. This module
 * keeps the same scoring model but derives every "random" factor from the
 * coordinate itself, so the same location always returns the same result and
 * the pollution dashboard can quote the exact same figure.
 */

import { getCreditsPerHa } from "./carbonRates";

export interface LandCarbonEstimate {
  lat: number;
  lng: number;
  /** tCO2e/ha/yr */
  vegetation: number;
  soil: number;
  water: number;
  /** negative contribution */
  urban: number;
  totalCredits: number;
  confidence: number;
  /** raw 0..1 scores */
  scores: {
    vegetation: number;
    soil: number;
    water: number;
    urban: number;
  };
  recommendations: string[];
}

/** FNV-1a hash -> 0..1 */
function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** Deterministic PRNG (mulberry32) seeded from the coordinate. */
function seeded(seed: string): () => number {
  let a = Math.floor(hash01(seed) * 4294967296);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function estimateLandCarbon(
  lat: number,
  lng: number,
  vegetationType?: string
): LandCarbonEstimate {
  const rand = seeded(`${lat.toFixed(5)}:${lng.toFixed(5)}:${vegetationType ?? ""}`);
  const absLat = Math.abs(lat);

  let vegetationScore: number;
  let soilScore: number;
  let waterScore: number;

  if (absLat < 10) {
    vegetationScore = 0.7 + rand() * 0.25;
    soilScore = 0.6 + rand() * 0.2;
    waterScore = 0.5 + rand() * 0.3;
  } else if (absLat < 25) {
    vegetationScore = 0.5 + rand() * 0.3;
    soilScore = 0.5 + rand() * 0.25;
    waterScore = 0.3 + rand() * 0.3;
  } else if (absLat < 40) {
    vegetationScore = 0.4 + rand() * 0.3;
    soilScore = 0.4 + rand() * 0.3;
    waterScore = 0.2 + rand() * 0.3;
  } else {
    vegetationScore = 0.2 + rand() * 0.3;
    soilScore = 0.3 + rand() * 0.2;
    waterScore = 0.1 + rand() * 0.2;
  }

  // Urbanisation signal: dense, deterministic wobble around a hotspot.
  const urbanBand = hash01(`urban:${lat.toFixed(3)}:${lng.toFixed(3)}`);
  let urbanScore = 0;
  if (urbanBand > 0.7) {
    urbanScore = 0.3 + rand() * 0.4;
    vegetationScore *= 0.5;
  } else if (urbanBand > 0.5) {
    urbanScore = 0.1 + rand() * 0.2;
  }

  vegetationScore = clamp01(vegetationScore);
  soilScore = clamp01(soilScore);
  waterScore = clamp01(waterScore);
  urbanScore = clamp01(urbanScore);

  const vegCredits = vegetationScore * 15;
  const soilCredits = soilScore * 8;
  const waterCredits = waterScore * 5;
  const urbanPenalty = urbanScore * 3;
  const totalCredits = Math.max(0, vegCredits + soilCredits + waterCredits - urbanPenalty);

  const recommendations: string[] = [];
  if (vegetationScore < 0.5) {
    recommendations.push("Plant more trees to increase vegetation cover");
    recommendations.push("Consider agroforestry projects");
  }
  if (soilScore < 0.4) {
    recommendations.push("Implement soil conservation practices");
    recommendations.push("Use cover crops to improve soil carbon");
  }
  if (waterScore < 0.3) {
    recommendations.push("Create water bodies or wetlands");
    recommendations.push("Implement watershed management");
  }
  if (urbanScore > 0.3) {
    recommendations.push("Urban areas have lower carbon credit potential");
    recommendations.push("Consider green building or urban forestry projects");
  }
  if (totalCredits > 50) {
    recommendations.push("Excellent carbon credit potential!");
  }
  if (recommendations.length === 0) {
    recommendations.push("Maintain current land use for optimal carbon storage");
    recommendations.push("Consider certified carbon offset programmes");
  }

  return {
    lat,
    lng,
    vegetation: vegCredits,
    soil: soilCredits,
    water: waterCredits,
    urban: urbanPenalty,
    totalCredits,
    confidence: 65 + rand() * 20,
    scores: {
      vegetation: vegetationScore,
      soil: soilScore,
      water: waterScore,
      urban: urbanScore,
    },
    recommendations,
  };
}

/**
 * Market value of a land-carbon estimate for a given area.
 * Uses the same per-hectare rate table as the farmer hub.
 */
export function landCarbonValueINR(
  estimate: LandCarbonEstimate,
  areaHa: number,
  vegetationType?: string,
  creditPriceINR: number = 1800
): number {
  const perHa = getCreditsPerHa(vegetationType);
  return areaHa * perHa * creditPriceINR;
}
