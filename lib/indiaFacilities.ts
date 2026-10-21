/**
 * India-wide register of polluting facilities and their government reporting.
 *
 * The register answers one question for every facility:
 *
 *   "How much does this plant tell the government it emits, and how much does
 *    the live atmosphere over its fence actually show?"
 *
 * Three pieces make that possible:
 *
 *  1. A facility register (position, sector, capacity, owner) built from
 *     - data/india-power-stations.json  (197 power stations, Wikipedia)
 *     - data/india-major-industries.json (curated non-power plants)
 *
 *  2. The government instrument each facility reports through (CCTS, CPCB
 *     consent, CAQM, BEE PAT, CBCM, SBM, ...). This is the channel we can
 *     actually push a verified number into.
 *
 *  3. A *reported basis*: the tCO2e/yr the plant is expected to declare,
 *     derived from its published capacity x the official benchmark intensity
 *     for that sector (CEA CO2 Baseline Database for power, sector benchmark
 *     factors elsewhere). Anything the regulator publishes per-plant can be
 *     pasted over this number in the dashboard.
 *
 * The live side is measured separately (see app/api/pollution/india) from
 * CAMS reanalysis over the facility's own dispersion footprint, so the two
 * numbers stay independent and can be compared.
 */

import { SECTOR_LABELS, SECTOR_ORDER, type SectorKey } from "./industries";

export type { SectorKey };

export interface Instrument {
  /** Short code used in the UI. */
  key: string;
  /** Full name of the reporting channel. */
  label: string;
  /** Who runs the scheme. */
  authority: string;
  /** What the facility actually files. */
  return: string;
  /** Public registry / where the filed number lands. */
  registry: string;
  url: string;
}

/**
 * The reporting channel per facility type. Everything in this map is a
 * statutory or scheme-mandated return that an Indian facility already files.
 */
export const INSTRUMENTS: Record<string, Instrument> = {
  ccts: {
    key: "ccts",
    label: "Carbon Credit Trading Scheme (CCTS)",
    authority: "Ministry of Power, Government of India",
    return: "Annual CO2 emission return (plant + auxiliary) against the CEA CO2 Baseline Database",
    registry: "CCTS Registry (Grid Controller of India / PGCIL)",
    url: "https://powermin.gov.in/en/content/carbon-credit-trading-scheme",
  },
  ccts_nonpower: {
    key: "ccts_nonpower",
    label: "CCTS - Non-Power Sector (from 2026)",
    authority: "Ministry of Power / Bureau of Energy Efficiency",
    return: "Sector CO2 return once the non-power obligation is notified",
    registry: "CCTS Registry (PGCIL)",
    url: "https://powermin.gov.in/en/content/carbon-credit-trading-scheme",
  },
  cea_baseline: {
    key: "cea_baseline",
    label: "CEA CO2 Baseline Database",
    authority: "Central Electricity Authority",
    return: "Plant-level emission intensity baseline used to compute the compliance obligation",
    registry: "CEA CO2 Baseline Database (Version 20)",
    url: "https://powermin.gov.in/en/content/power-sector-co2-baseline-database",
  },
  cpcb_consent: {
    key: "cpcb_consent",
    label: "CPCB Consent to Establish / Operate + Annual Returns",
    authority: "Central Pollution Control Board",
    return: "Form XI (consent), Form XIV/ XV annual return of emissions, stack monitoring data",
    registry: "CPCB Consent Management Scheme",
    url: "https://cpcb.nic.in",
  },
  caqm: {
    key: "caqm",
    label: "CAQM Non-Power Sector Targets",
    authority: "Centre for Air Quality Management",
    return: "Sector-specific emission reduction target against the 2009 base",
    registry: "CAQM (NCAA portal)",
    url: "https://caqm.nic.in",
  },
  bee_pat: {
    key: "bee_pat",
    label: "BEE Perform, Achieve, Trade (PAT)",
    authority: "Bureau of Energy Efficiency",
    return: "Energy audit + PAT obligation (or PAT target for the sector)",
    registry: "BEE PAT Registry",
    url: "https://beeindia.gov.in/en/pat",
  },
  cbcm: {
    key: "cbcm",
    label: "CBCM (Coal Mines Conservation & Development Act)",
    authority: "Ministry of Coal / State Directorate of Mines",
    return: "Mine-wise production, washery and compliance returns",
    registry: "CBCM / Mine Portal",
    url: "https://coalmines.gov.in",
  },
  cpcb_brick: {
    key: "cpcb_brick",
    label: "CPCB Brick Kiln Guidelines + State Action",
    authority: "CPCB / State Pollution Control Boards",
    return: "Kiln registration, zig-zag furnace conversion and monthly stack/fugitive reporting",
    registry: "CPCB Brick Kiln database",
    url: "https://cpcb.nic.in",
  },
  sbm: {
    key: "sbm",
    label: "Swachh Bharat Mission (SBM) + CPCB",
    authority: "Ministry of Housing & Urban Affairs / CPCB",
    return: "Waste processed, landfill methane and WtE daily reporting",
    registry: "SBM-U / CPCB waste portal",
    url: "https://swachhbharatmission.gov.in",
  },
  dgca: {
    key: "dgca",
    label: "DGCA / BEE Energy Audit (Transport)",
    authority: "Directorate General of Civil Aviation / BEE",
    return: "Terminal energy consumption, ground-handling equipment and carbon reporting",
    registry: "DGCA / BEE transport portal",
    url: "https://www.digitalsky.dgca.gov.in",
  },
  port_authority: {
    key: "port_authority",
    label: "Port Authority Consent + BEE",
    authority: "Major Port Authorities / CPCB",
    return: "Consent conditions, cargo handling emission inventory and annual returns",
    registry: "Port Authority / CPCB",
    url: "https://cpcb.nic.in",
  },
  epr: {
    key: "epr",
    label: "MoEFCC EPR (Extended Producer Responsibility)",
    authority: "Ministry of Environment, Forest and Climate Change",
    return: "Plastic packaging / battery / e-waste import and recycling obligations",
    registry: "SRoCCI ( CPCB portal)",
    url: "https://cpcb.nic.in",
  },
};

export interface Benchmark {
  /** tCO2e per unit of the facility's capacity. */
  factor: number;
  /** What one capacity unit is. */
  unit: string;
  /** Where the factor comes from. */
  source: string;
  /** Multiplier applied to convert the facility's capacity into benchmark units. */
  scale: number;
}

/**
 * Official / published emission intensities used to derive the *reported*
 * figure for a facility from its published capacity.
 */
export const BENCHMARKS: Record<string, Benchmark> = {
  // Power - CEA CO2 Baseline Database values (tCO2 per MWh sent out).
  coal: {
    factor: 0.96,
    unit: "tCO2 / MWh",
    source: "CEA CO2 Baseline Database (supercritical coal benchmark)",
    scale: 1,
  },
  lignite: {
    factor: 1.05,
    unit: "tCO2 / MWh",
    source: "CEA CO2 Baseline Database (lignite benchmark)",
    scale: 1,
  },
  gas: {
    factor: 0.42,
    unit: "tCO2 / MWh",
    source: "CEA CO2 Baseline Database (combined cycle gas benchmark)",
    scale: 1,
  },
  diesel: {
    factor: 0.81,
    unit: "tCO2 / MWh",
    source: "CEA CO2 Baseline Database (diesel benchmark)",
    scale: 1,
  },
  nuclear: {
    factor: 0.0,
    unit: "tCO2 / MWh",
    source: "NPCIL - no operational CO2 declared under CCTS",
    scale: 1,
  },
  hydro: {
    factor: 0.0,
    unit: "tCO2 / MWh",
    source: "Non-fossil, outside the CCTS compliance perimeter",
    scale: 1,
  },
  solar: {
    factor: 0.0,
    unit: "tCO2 / MWh",
    source: "Non-fossil, outside the CCTS compliance perimeter",
    scale: 1,
  },
  wind: {
    factor: 0.0,
    unit: "tCO2 / MWh",
    source: "Non-fossil, outside the CCTS compliance perimeter",
    scale: 1,
  },
  // Materials
  cement: {
    factor: 0.66,
    unit: "tCO2 / t cement",
    source: "GCCA / Indian industry CO2 reporting (process + thermal)",
    scale: 1_000_000,
  },
  steel: {
    factor: 1.9,
    unit: "tCO2 / t steel",
    source: "BF-BOF route benchmark used in Indian GHG inventories",
    scale: 1_000_000,
  },
  iron_sponge: {
    factor: 0.85,
    unit: "tCO2 / t sponge iron",
    source: "Indian sponge iron / DRI route benchmark",
    scale: 1_000_000,
  },
  aluminium: {
    factor: 15.5,
    unit: "tCO2 / kt aluminium",
    source: "Indian grid emission intensity applied to smelter load",
    scale: 1,
  },
  nonferrous: {
    factor: 1.6,
    unit: "tCO2 / kt metal",
    source: "Indian non-ferrous smelting benchmark",
    scale: 1,
  },
  glass: {
    factor: 0.6,
    unit: "tCO2 / t glass",
    source: "Indian float / container glass benchmark",
    scale: 1_000_000,
  },
  // Chemicals & petroleum
  refinery: {
    factor: 0.22,
    unit: "tCO2 / t crude processed",
    source: "Indian refinery process + fuel benchmark (CPCB / OEF inventory)",
    scale: 1_000_000,
  },
  petrochemical: {
    factor: 1.4,
    unit: "tCO2 / t product",
    source: "Indian petrochemical complex benchmark",
    scale: 1_000_000,
  },
  chemical: {
    factor: 1.6,
    unit: "tCO2 / t product",
    source: "Indian basic / specialty chemical benchmark",
    scale: 1_000_000,
  },
  fertiliser: {
    factor: 1.9,
    unit: "tCO2 / t fertiliser",
    source: "Ammonia-based fertiliser benchmark (coal feedstock)",
    scale: 1_000_000,
  },
  // Mining & fugitive
  coal_mine: {
    factor: 0.0,
    unit: "tCO2 / t coal",
    source: "Mine methane reported under CBCM, not as CO2",
    scale: 1_000_000,
  },
  iron_mine: {
    factor: 0.0,
    unit: "tCO2 / t ore",
    source: "Haulage diesel reported under CBCM, not as CO2",
    scale: 1_000_000,
  },
  brick_kiln: {
    factor: 0.08,
    unit: "tCO2 / t brick",
    source: "Fixed-kiln clinker substitution benchmark (CPCB kiln guidelines)",
    scale: 1_000_000,
  },
  // Manufacturing
  paper: {
    factor: 0.85,
    unit: "tCO2 / t paper",
    source: "Integrated pulp and paper benchmark",
    scale: 1_000_000,
  },
  textile: {
    factor: 0.35,
    unit: "tCO2 / t textile",
    source: "Spinning / dyeing / processing benchmark",
    scale: 1_000_000,
  },
  sugar: {
    factor: 0.3,
    unit: "tCO2 / t sugar",
    source: "Sugar mill (boiler + cogeneration) benchmark",
    scale: 1_000_000,
  },
  // Transport & waste
  port: {
    factor: 0.0,
    unit: "tCO2 / t cargo",
    source: "No point-source CO2; Scope 1 reported under consent conditions",
    scale: 1_000_000,
  },
  airport: {
    factor: 0.0,
    unit: "tCO2 / t cargo",
    source: "No point-source CO2; ground operations reported to DGCA / BEE",
    scale: 1_000_000,
  },
  msw: {
    factor: 0.35,
    unit: "tCO2e / t waste",
    source: "Landfill methane (fugitive) reported under SBM / CPCB",
    scale: 1_000_000,
  },
  wtw: {
    factor: 0.1,
    unit: "tCO2e / t waste",
    source: "Waste-to-energy residual emissions; biogenic CO2 excluded",
    scale: 1_000_000,
  },
};

/** Dispersion footprint radius (km) used when sampling live air quality. */
export const ZONE_RADIUS_KM: Record<string, number> = {
  power: 15,
  cement: 12,
  steel: 12,
  iron_sponge: 10,
  aluminium: 12,
  nonferrous: 12,
  refinery: 14,
  petrochemical: 12,
  chemical: 10,
  fertiliser: 10,
  coal_mine: 15,
  iron_mine: 12,
  brick_kiln: 8,
  paper: 8,
  textile: 6,
  sugar: 8,
  glass: 10,
  port: 12,
  airport: 10,
  msw: 8,
  wtw: 8,
};

export interface IndiaFacility {
  id: string;
  name: string;
  subType: string;
  sector: SectorKey;
  sectorLabel: string;
  state: string;
  lat: number;
  lng: number;
  owner: string;
  /** Installed capacity, with the unit it is expressed in. */
  capacity: number | null;
  capacityUnit: string;
  /** Fuel for power stations. */
  fuel: string | null;
  instrument: Instrument;
  /**
   * Where the facility sits relative to India's carbon-credit perimeter.
   *  - in_perimeter     : has a statutory crediting obligation today
   *  - outside_perimeter: emits, but no crediting obligation is attached
   *  - non_emitting     : no point-source emissions of its own
   */
  perimeter: "in_perimeter" | "outside_perimeter" | "non_emitting";
  /** Radius of the dispersion footprint used for the live reading. */
  zoneRadiusKm: number;
  /** tCO2e/yr the facility is expected to declare to the regulator. */
  reportedEmissionsT: number;
  /** How the reported figure was derived. */
  reportedBasis: string;
  /** The benchmark intensity used. */
  benchmark: Benchmark | null;
}

interface PowerStationFile {
  source: string;
  retrievedAt: string;
  count: number;
  facilities: {
    name: string;
    state: string;
    lat: number;
    lng: number;
    capacityMW: number | null;
    owner: string;
    fuel: string;
  }[];
}

interface MajorIndustryFile {
  source: string;
  facilities: {
    name: string;
    subType: string;
    sector: string;
    state: string;
    lat: number;
    lng: number;
    capacity: number | null;
    capacityUnit: string;
    owner: string;
  }[];
}

/* eslint-disable @typescript-eslint/no-var-requires */
const powerFile = require("../data/india-power-stations.json") as PowerStationFile;
const majorFile = require("../data/india-major-industries.json") as MajorIndustryFile;
/* eslint-enable @typescript-eslint/no-var-requires */

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const FUEL_TO_SUBTYPE: Record<string, string> = {
  Coal: "coal",
  Lignite: "lignite",
  Gas: "gas",
  Diesel: "diesel",
  Nuclear: "nuclear",
  Hydro: "hydro",
  Solar: "solar",
  "Solar thermal": "solar",
  Wind: "wind",
};

const POWER_INSTRUMENT: Record<string, string> = {
  coal: "ccts",
  lignite: "ccts",
  gas: "ccts",
  diesel: "cpcb_consent",
  nuclear: "cea_baseline",
  hydro: "cea_baseline",
  solar: "cea_baseline",
  wind: "cea_baseline",
};

const SUBTYPE_INSTRUMENT: Record<string, string> = {
  cement: "caqm",
  steel: "caqm",
  iron_sponge: "caqm",
  aluminium: "caqm",
  nonferrous: "caqm",
  glass: "caqm",
  refinery: "ccts_nonpower",
  petrochemical: "ccts_nonpower",
  chemical: "cpcb_consent",
  fertiliser: "cpcb_consent",
  coal_mine: "cbcm",
  iron_mine: "cbcm",
  brick_kiln: "cpcb_brick",
  paper: "bee_pat",
  textile: "bee_pat",
  sugar: "bee_pat",
  port: "port_authority",
  airport: "dgca",
  msw: "sbm",
  wtw: "sbm",
};

/** Capacity to benchmark units for a power station (MW -> MWh/yr at 75% PLF). */
const PLF = 0.75;
const HOURS_PER_YEAR = 8760;

function reportedFor(
  subType: string,
  capacity: number | null,
  capacityUnit: string,
  capacityMW: number | null
): { tonnes: number; basis: string; benchmark: Benchmark | null } {
  const benchmark = BENCHMARKS[subType] ?? null;
  if (!benchmark) {
    return {
      tonnes: 0,
      basis: "No published benchmark intensity for this facility type",
      benchmark: null,
    };
  }

  if (capacityMW) {
    // MW x hours = MWh (the benchmark is quoted per MWh sent out).
    const mwh = capacityMW * HOURS_PER_YEAR * PLF;
    const tonnes = mwh * benchmark.factor;
    return {
      tonnes,
      basis: `${capacityMW.toLocaleString("en-IN")} MW x ${HOURS_PER_YEAR} h x ${(PLF * 100).toFixed(0)}% PLF x ${benchmark.factor} ${benchmark.unit} (${benchmark.source})`,
      benchmark,
    };
  }

  if (capacity && capacity > 0) {
    const units = capacity * benchmark.scale;
    const tonnes = units * benchmark.factor;
    return {
      tonnes,
      basis: `${capacity} ${capacityUnit} x ${benchmark.factor} ${benchmark.unit} (${benchmark.source})`,
      benchmark,
    };
  }

  return {
    tonnes: 0,
    basis: `No published capacity for this facility - reported figure pending from the ${INSTRUMENTS[SUBTYPE_INSTRUMENT[subType] ?? "cpcb_consent"].authority}`,
    benchmark,
  };
}

/**
 * Facility types with no point-source emissions of their own. Their live
 * footprint is regional background, so they are never flagged.
 */
const NON_EMITTING = new Set(["nuclear", "hydro", "solar", "wind"]);

/**
 * Facility types that emit but have no carbon-credit obligation attached to
 * them today. Their observed footprint is carbon with no compliance home.
 */
const OUTSIDE_PERIMETER = new Set([
  "port",
  "airport",
  "coal_mine",
  "iron_mine",
  "msw",
  "wtw",
  "brick_kiln",
  "textile",
  "sugar",
  "glass",
  "iron_sponge",
]);

function perimeterFor(subType: string, instrumentKey: string): IndiaFacility["perimeter"] {
  if (NON_EMITTING.has(subType)) return "non_emitting";
  if (OUTSIDE_PERIMETER.has(subType)) return "outside_perimeter";
  if (instrumentKey === "cbcm" || instrumentKey === "cpcb_brick") return "outside_perimeter";
  return "in_perimeter";
}

function buildFacilities(): IndiaFacility[] {
  const out: IndiaFacility[] = [];

  for (const p of powerFile.facilities) {
    const subType = FUEL_TO_SUBTYPE[p.fuel] ?? "coal";
    const instrumentKey = POWER_INSTRUMENT[subType] ?? "ccts";
    const { tonnes, basis, benchmark } = reportedFor(
      subType,
      null,
      "MW",
      p.capacityMW
    );
    out.push({
      id: `pwr-${slugify(p.name)}`,
      name: p.name,
      subType,
      sector: "power",
      sectorLabel: SECTOR_LABELS.power,
      state: p.state,
      lat: p.lat,
      lng: p.lng,
      owner: p.owner,
      capacity: p.capacityMW,
      capacityUnit: "MW",
      fuel: p.fuel,
      instrument: INSTRUMENTS[instrumentKey],
      perimeter: perimeterFor(subType, instrumentKey),
      zoneRadiusKm: ZONE_RADIUS_KM.power,
      reportedEmissionsT: tonnes,
      reportedBasis: basis,
      benchmark,
    });
  }

  for (const f of majorFile.facilities) {
    const subType = f.subType;
    const sector = (SECTOR_ORDER as string[]).includes(f.sector)
      ? (f.sector as SectorKey)
      : "manufacturing";
    const instrumentKey = SUBTYPE_INSTRUMENT[subType] ?? "cpcb_consent";
    const { tonnes, basis, benchmark } = reportedFor(
      subType,
      f.capacity,
      f.capacityUnit,
      null
    );
    out.push({
      id: `ind-${slugify(f.name)}`,
      name: f.name,
      subType,
      sector,
      sectorLabel: SECTOR_LABELS[sector],
      state: f.state,
      lat: f.lat,
      lng: f.lng,
      owner: f.owner,
      capacity: f.capacity,
      capacityUnit: f.capacityUnit,
      fuel: null,
      instrument: INSTRUMENTS[instrumentKey],
      perimeter: perimeterFor(subType, instrumentKey),
      zoneRadiusKm: ZONE_RADIUS_KM[subType] ?? 10,
      reportedEmissionsT: tonnes,
      reportedBasis: basis,
      benchmark,
    });
  }

  return out;
}

export const INDIA_FACILITIES: IndiaFacility[] = buildFacilities();

export const INDIA_FACILITY_SOURCES = {
  power: powerFile.source,
  powerRetrievedAt: powerFile.retrievedAt,
  other: majorFile.source,
};

/** Count of facilities by sector. */
export function indiaSectorCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of INDIA_FACILITIES) {
    counts[f.sector] = (counts[f.sector] ?? 0) + 1;
  }
  return counts;
}

/** Human label for a facility subtype. */
export const SUBTYPE_LABELS: Record<string, string> = {
  coal: "Coal power",
  lignite: "Lignite power",
  gas: "Gas power",
  diesel: "Diesel power",
  nuclear: "Nuclear power",
  hydro: "Hydro power",
  solar: "Solar power",
  wind: "Wind power",
  cement: "Cement plant",
  steel: "Integrated steel plant",
  iron_sponge: "Sponge iron plant",
  aluminium: "Aluminium smelter",
  nonferrous: "Non-ferrous smelter",
  glass: "Glass plant",
  refinery: "Oil refinery",
  petrochemical: "Petrochemical complex",
  chemical: "Chemical plant",
  fertiliser: "Fertiliser plant",
  coal_mine: "Coal mine / washery",
  iron_mine: "Iron ore mine",
  brick_kiln: "Brick kiln cluster",
  paper: "Paper mill",
  textile: "Textile / dyeing cluster",
  sugar: "Sugar mill / distillery",
  port: "Port",
  airport: "Airport",
  msw: "Landfill / solid waste",
  wtw: "Waste-to-energy plant",
};
