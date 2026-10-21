/**
 * Emission-load -> carbon-credit liability model.
 *
 * What we measure at the reference station is a concentration. To turn that into
 * a carbon-credit number we model the atmospheric column above the zone:
 *
 *   load (kg/day) = conc (ug/m3) x 1e-6 (g/ug) x mixingHeight (m) x area (m2) / 1000
 *
 * with one full column turnover per day. Particulate matter is then linked to
 * CO2 through a combustion emission factor, and CO through the molecular weight
 * ratio CO2/CO. NO2 / SO2 / O3 are not greenhouse gases, so they are reported
 * as an acidification + secondary-aerosol load rather than being silently
 * converted into CO2e.
 *
 * Every constant used here is exported so the dashboard can show its working.
 */

import { aqiToConcentration } from "./aqiBreakpoints";

export const EMISSION_MODEL = {
  /** Air quality zone modelled around the station, in km2. */
  zoneAreaKm2: 25,
  /** Mixing height used for the Delhi winter boundary layer, in metres. */
  mixingHeightM: 300,
  /** Column turnovers per day (ventilation of the mixing layer). */
  turnoversPerDay: 1,
  /** kg CO2e emitted per kg of combustion-attributable particulate matter. */
  co2ePerKgPm: 2.7,
  /** kg CO2 per kg CO (molecular weight ratio 44/28). */
  co2PerKgCo: 44 / 28,
  /** Share of fine PM that is combustion-attributable (transport + industry). */
  pmCombustionFraction: 0.55,
  /** Share of coarse PM (PM10 - PM2.5) linked to combustion. */
  coarsePmCombustionFraction: 0.15,
  /** Share of CO that is combustion related (the rest is background). */
  coCombustionFraction: 0.9,
  /** Acidification / secondary aerosol equivalent factors. */
  so2Equivalent: 1.0,
  no2Equivalent: 0.5,
  /** Minimum abatement the cluster must achieve for the credits to be "owed". */
  defaultAbatementPct: 35,
  /** Days per year used for annualisation. */
  daysPerYear: 365,
} as const;

export interface ConcentrationSet {
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  o3: number | null;
  /** carbon monoxide in ug/m3 */
  co: number | null;
}

export interface CarbonLiability {
  zoneAreaKm2: number;
  mixingHeightM: number;
  /** kg/day of each pollutant resident in the modelled column. */
  loads: ConcentrationSet;
  totalPollutantKgPerDay: number;
  pmKgPerDay: number;
  gasKgPerDay: number;
  /** kg CO2e/day */
  pmCo2eKgPerDay: number;
  coCo2eKgPerDay: number;
  totalCo2eKgPerDay: number;
  totalCo2eTPerYear: number;
  /** kg/day of acid gases expressed as SO2-equivalent */
  acidGasSo2EqKgPerDay: number;
  /** tonnes of CO2e that must be compensated after the abatement target */
  abatementPct: number;
  requiredCreditsTPerYear: number;
  /** kg/day of PM2.5 that is technically avoidable with control technology */
  avoidablePm25KgPerDay: number;
  creditPriceINR: number;
  requiredValueINR: number;
}

export function zoneLoadKgPerDay(
  concUgM3: number | null | undefined,
  zoneAreaKm2: number = EMISSION_MODEL.zoneAreaKm2,
  mixingHeightM: number = EMISSION_MODEL.mixingHeightM
): number {
  if (!concUgM3 || concUgM3 <= 0) return 0;
  const areaM2 = zoneAreaKm2 * 1e6;
  return (concUgM3 * 1e-6 * mixingHeightM * areaM2 * EMISSION_MODEL.turnoversPerDay) / 1000;
}

export function computeCarbonLiability(
  conc: ConcentrationSet,
  options: {
    zoneAreaKm2?: number;
    mixingHeightM?: number;
    abatementPct?: number;
    creditPriceINR?: number;
  } = {}
): CarbonLiability {
  const zoneAreaKm2 = options.zoneAreaKm2 ?? EMISSION_MODEL.zoneAreaKm2;
  const mixingHeightM = options.mixingHeightM ?? EMISSION_MODEL.mixingHeightM;
  const abatementPct = options.abatementPct ?? EMISSION_MODEL.defaultAbatementPct;
  const creditPriceINR = options.creditPriceINR ?? 1800;

  const pm25Kg = zoneLoadKgPerDay(conc.pm25, zoneAreaKm2, mixingHeightM);
  const pm10Kg = zoneLoadKgPerDay(conc.pm10, zoneAreaKm2, mixingHeightM);
  const no2Kg = zoneLoadKgPerDay(conc.no2, zoneAreaKm2, mixingHeightM);
  const so2Kg = zoneLoadKgPerDay(conc.so2, zoneAreaKm2, mixingHeightM);
  const o3Kg = zoneLoadKgPerDay(conc.o3, zoneAreaKm2, mixingHeightM);
  const coKg = zoneLoadKgPerDay(conc.co, zoneAreaKm2, mixingHeightM);

  const coarsePmKg = Math.max(0, pm10Kg - pm25Kg);
  const combustionPmKg =
    pm25Kg * EMISSION_MODEL.pmCombustionFraction +
    coarsePmKg * EMISSION_MODEL.coarsePmCombustionFraction;
  const pmCo2eKg = combustionPmKg * EMISSION_MODEL.co2ePerKgPm;
  const coCo2eKg = coKg * EMISSION_MODEL.coCombustionFraction * EMISSION_MODEL.co2PerKgCo;

  const totalCo2eKg = pmCo2eKg + coCo2eKg;
  const totalCo2eTPerYear = (totalCo2eKg * EMISSION_MODEL.daysPerYear) / 1000;
  const requiredCreditsTPerYear = (totalCo2eTPerYear * abatementPct) / 100;

  const loads: ConcentrationSet = {
    pm25: pm25Kg,
    pm10: pm10Kg,
    no2: no2Kg,
    so2: so2Kg,
    o3: o3Kg,
    co: coKg,
  };

  return {
    zoneAreaKm2,
    mixingHeightM,
    loads,
    totalPollutantKgPerDay:
      pm25Kg + pm10Kg + no2Kg + so2Kg + o3Kg + coKg,
    pmKgPerDay: pm25Kg + pm10Kg,
    gasKgPerDay: no2Kg + so2Kg + o3Kg + coKg,
    pmCo2eKgPerDay: pmCo2eKg,
    coCo2eKgPerDay: coCo2eKg,
    totalCo2eKgPerDay: totalCo2eKg,
    totalCo2eTPerYear,
    acidGasSo2EqKgPerDay:
      so2Kg * EMISSION_MODEL.so2Equivalent + no2Kg * EMISSION_MODEL.no2Equivalent,
    abatementPct,
    requiredCreditsTPerYear,
    avoidablePm25KgPerDay: pm25Kg * 0.35,
    creditPriceINR,
    requiredValueINR: requiredCreditsTPerYear * creditPriceINR,
  };
}

/** ppm -> ug/m3 at 25 C, 1013 hPa. */
export function ppmToUgm3(ppm: number | null | undefined): number | null {
  if (ppm === null || ppm === undefined || Number.isNaN(ppm)) return null;
  return (ppm * 24.45 * 1000) / 28.01;
}

export interface AqicnPollutantAqi {
  key: string;
  aqi: number | null;
}

/**
 * Rebuild a concentration set from the per-pollutant AQI sub-indices published
 * by AQICN, by inverting the EPA breakpoint mapping.
 */
export function concentrationsFromAqicn(
  pollutants: AqicnPollutantAqi[]
): ConcentrationSet {
  const find = (key: string) =>
    pollutants.find((p) => p.key === key)?.aqi ?? null;

  const coPpm = aqiToConcentration("co", find("co"));

  return {
    pm25: aqiToConcentration("pm25", find("pm25")),
    pm10: aqiToConcentration("pm10", find("pm10")),
    no2: aqiToConcentration("no2", find("no2")),
    so2: aqiToConcentration("so2", find("so2")),
    o3: aqiToConcentration("o3", find("o3")),
    co: ppmToUgm3(coPpm),
  };
}

/** Concentration set straight from an Open-Meteo hourly point (CO already ug/m3). */
export function concentrationsFromPoint(p: {
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  o3: number | null;
  co: number | null;
}): ConcentrationSet {
  return {
    pm25: p.pm25,
    pm10: p.pm10,
    no2: p.no2,
    so2: p.so2,
    o3: p.o3,
    co: p.co,
  };
}
