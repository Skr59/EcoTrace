/**
 * Live Air Quality Index reader for the World Air Quality Index project (aqicn.org).
 *
 * The public AQICN feed API needs a personal token, but every station page
 * embeds the exact same payload inside a `setWidgetAqiGraphModel({...})` call,
 * so we read that JSON straight off the station page. The page also renders a
 * plain-text summary ("overall air quality index is 160 - PM2.5 AQI is 160 ...")
 * which we use as a fallback when the widget payload shape changes.
 *
 * Mandir Marg, Delhi is the reference station for the whole dashboard.
 */

export interface AqicnStation {
  /** aqicn.org path segment, e.g. "mandir-marg" -> /city/delhi/mandir-marg/ */
  slug: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
}

export const AQICN_STATIONS: AqicnStation[] = [
  { slug: "mandir-marg", name: "Mandir Marg", lat: 28.6341, lng: 77.2005, region: "Central Delhi" },
  { slug: "iti-jahangirpuri", name: "ITI Jahangirpuri", lat: 28.7294, lng: 77.1625, region: "North West Delhi" },
  { slug: "jawaharlal-nehru-stadium", name: "Jawaharlal Nehru Stadium", lat: 28.58, lng: 77.2333, region: "Central Delhi" },
  { slug: "sonia-vihar-water-treatment-plant-djb", name: "Sonia Vihar WTP (DJB)", lat: 28.7108, lng: 77.2495, region: "North East Delhi" },
  { slug: "iti-shahdra--jhilmil-industrial-area", name: "ITI Shahdra, Jhilmil", lat: 28.67, lng: 77.29, region: "East Delhi" },
  { slug: "r.k.-puram", name: "R.K. Puram", lat: 28.5645, lng: 77.1855, region: "South Delhi" },
  { slug: "pusa", name: "Pusa", lat: 28.64, lng: 77.145, region: "Central Delhi" },
  { slug: "dite-okhla", name: "DITE Okhla", lat: 28.53, lng: 77.27, region: "South East Delhi" },
  { slug: "sri-auribindo-marg", name: "Sri Auribindo Marg", lat: 28.568, lng: 77.213, region: "South Delhi" },
  { slug: "national-institute-of-malaria-research--sector-8--dwarka", name: "NIMR Sector 8, Dwarka", lat: 28.5921, lng: 77.046, region: "South West Delhi" },
  { slug: "mother-dairy-plant--parparganj", name: "Mother Dairy, Parparganj", lat: 28.6234, lng: 77.2864, region: "East Delhi" },
  { slug: "punjabi-bagh", name: "Punjabi Bagh", lat: 28.6741, lng: 77.131, region: "West Delhi" },
  { slug: "shaheed-sukhdev-college-of-business-studies--rohini", name: "Shaheed Sukhdev College, Rohini", lat: 28.7495, lng: 77.0566, region: "North West Delhi" },
  { slug: "major-dhyan-chand-national-stadium", name: "Major Dhyan Chand Stadium", lat: 28.6111, lng: 77.2374, region: "Central Delhi" },
  { slug: "satyawati-college", name: "Satyawati College", lat: 28.629, lng: 77.243, region: "Central Delhi" },
  { slug: "pgdav-college--sriniwaspuri", name: "PGDAV College, Sriniwaspuri", lat: 28.554, lng: 77.191, region: "South West Delhi" },
  { slug: "anand-vihar", name: "Anand Vihar", lat: 28.6469, lng: 77.3152, region: "East Delhi" },
  { slug: "delhi-institute-of-tool-engineering--wazirpur", name: "DITE Wazirpur", lat: 28.7, lng: 77.165, region: "North Delhi" },
];

export const DEFAULT_STATION: AqicnStation = AQICN_STATIONS[0];

export function getStation(slug?: string | null): AqicnStation {
  if (!slug) return DEFAULT_STATION;
  const found = AQICN_STATIONS.find(
    (s) => s.slug === slug || s.name.toLowerCase() === slug.toLowerCase()
  );
  return found ?? DEFAULT_STATION;
}

export interface PollutantReading {
  key: string;
  label: string;
  /** AQI sub-index for this pollutant */
  aqi: number | null;
  min: number | null;
  max: number | null;
}

export interface AqicnGraph {
  /** pollutant key -> inline data URI of the AQICN-rendered graph */
  dataUri: string;
  label: string;
  aqi: number | null;
}

export interface AqicnNeighbour {
  idx: number;
  name: string;
  lat: number;
  lng: number;
  aqi: number | null;
  observedAt: string | null;
}

export interface AqicnLive {
  ok: boolean;
  stationSlug: string;
  stationName: string;
  region: string;
  lat: number;
  lng: number;
  /** Overall US-EPA AQI reported by AQICN */
  aqi: number | null;
  /** AQICN's internal station index for this location */
  stationIdx: number | null;
  dominantPollutant: string | null;
  pollutants: PollutantReading[];
  /** ISO timestamp of the observation */
  observedAt: string | null;
  /** Local clock string as rendered by AQICN (e.g. "2026/10/21 18:00:00") */
  observedLocal: string | null;
  /** Timestamp of the page generation, used to detect stale reads */
  pageGeneratedAt: string | null;
  /** Data sources listed on the AQICN page */
  sources: string[];
  /** The pollutant sparkline graphs AQICN renders for this station */
  graphs: AqicnGraph[];
  /** Nearby monitoring stations with their current AQI */
  neighbours: AqicnNeighbour[];
  sourceUrl: string;
  mapUrl: string;
  fetchedAt: string;
  error?: string;
}

const POLLUTANT_LABELS: Record<string, string> = {
  pm25: "PM2.5",
  pm10: "PM10",
  o3: "O3",
  no2: "NO2",
  so2: "SO2",
  co: "CO",
};

/**
 * AQICN also ships meteorological channels inside the same widget payload
 * (`p` = pressure, `h` = humidity, `t` = temperature, `w` = wind). They are
 * not pollutants and must never be allowed to drive the AQI, so the payload is
 * filtered down to the six regulated pollutants.
 */
const POLLUTANT_KEYS = ["pm25", "pm10", "no2", "so2", "o3", "co"];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Extract the first balanced `{...}` block that follows `marker`. */
function extractBalancedObject(text: string, marker: string): string | null {
  return extractBalanced(text, marker, "{", "}");
}

/** Extract the first balanced `[...]` block that follows `marker`. */
function extractBalancedArray(text: string, marker: string): string | null {
  return extractBalanced(text, marker, "[", "]");
}

function extractBalanced(
  text: string,
  marker: string,
  openChar: string,
  closeChar: string
): string | null {
  const start = text.indexOf(marker);
  if (start === -1) return null;
  const open = text.indexOf(openChar, start + marker.length);
  if (open === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return null;
}

interface WidgetModel {
  timestamp?: number;
  city?: {
    name?: string;
    url?: string;
    idx?: number;
    id?: string;
    geo?: [string, string] | string[];
  };
  iaqi?: Array<{
    p?: string;
    v?: [number | null, number | null, number | null];
    /** history payload, first entry is the local observation timestamp */
    h?: unknown[];
  }>;
}

function parseWidgetModel(html: string): WidgetModel | null {
  const raw = extractBalancedObject(html, "setWidgetAqiGraphModel(");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WidgetModel;
  } catch {
    return null;
  }
}

/** Plain-text summary fallback: "... overall air quality index is 160 - PM2.5 AQI is 160 ...". */
function parseTextSummary(html: string): {
  aqi: number | null;
  pollutants: PollutantReading[];
  generatedAt: string | null;
} {
  const aqiMatch = html.match(/overall air quality index is\s*(\d+)/i);
  const pollutants: PollutantReading[] = [];
  const patterns: Array<[string, RegExp]> = [
    ["pm25", /PM<sub>2\.5<\/sub>[\s\S]{0,160}?AQI is\s*(\d+)/i],
    ["pm10", /PM<sub>10<\/sub>[\s\S]{0,160}?AQI is\s*(\d+)/i],
    ["no2", /NO<sub>2<\/sub>[\s\S]{0,160}?AQI is\s*(\d+)/i],
    ["so2", /SO<sub>2<\/sub>[\s\S]{0,160}?AQI is\s*(\d+)/i],
    ["o3", /O<sub>3<\/sub>[\s\S]{0,160}?AQI is\s*(\d+)/i],
    ["co", /\bCO \(carbon monoxide\)[\s\S]{0,80}?AQI is\s*(\d+)/i],
  ];
  for (const [key, re] of patterns) {
    const m = html.match(re);
    const value = m ? Number(m[1]) : null;
    pollutants.push({
      key,
      label: POLLUTANT_LABELS[key],
      aqi: Number.isFinite(value as number) ? (value as number) : null,
      min: null,
      max: null,
    });
  }
  const gen = html.match(/This page has been generated on\s*([0-9T:+\-]{20,40})/i);
  return {
    aqi: aqiMatch ? Number(aqiMatch[1]) : null,
    pollutants,
    generatedAt: gen ? gen[1] : null,
  };
}

function parseSources(html: string): string[] {
  const out: string[] = [];
  const re = /The Data sources used for the Air Quality[\s\S]{0,1400}?are coming from:\s*([\s\S]{0,1400}?)<\/div>/i;
  const block = html.match(re);
  if (!block) return out;
  const names = block[1].match(/>([^<>]{4,120})<\/a>/g) ?? [];
  for (const n of names) {
    const clean = n
      .replace(/^>|<\/a>$/g, "")
      .replace(/\s*\((?:https?:\/\/)[^)]*\)\s*$/, "")
      .trim();
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out.slice(0, 8);
}

/**
 * AQICN renders its own per-pollutant sparkline graphs as inline PNGs. They are
 * small (1-3 KB base64 each) so they can be proxied straight through to the
 * dashboard and shown next to our own recharts rendering.
 */
function parseGraphs(html: string, pollutants: PollutantReading[]): AqicnGraph[] {
  const re = /id='td_(\w+)'[^>]*>\s*<img class='aqi-graph-img'[^>]*src='data:image\/png;base64,([A-Za-z0-9+/=]+)'/g;
  const byKey = new Map<string, string>();
  for (const m of Array.from(html.matchAll(re))) {
    const key = m[1];
    if (POLLUTANT_KEYS.includes(key) && !byKey.has(key)) {
      byKey.set(key, `data:image/png;base64,${m[2]}`);
    }
  }
  const out: AqicnGraph[] = [];
  for (const key of POLLUTANT_KEYS) {
    const dataUri = byKey.get(key);
    if (!dataUri) continue;
    out.push({
      dataUri,
      label: POLLUTANT_LABELS[key] ?? key.toUpperCase(),
      aqi: pollutants.find((p) => p.key === key)?.aqi ?? null,
    });
  }
  return out;
}

/** AQICN lists the surrounding monitoring stations with their live AQI. */
function parseNeighbours(html: string): AqicnNeighbour[] {
  const raw = extractBalancedArray(html, '"nearest_v2"');
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as Array<{
      x?: number;
      g?: [number, number];
      t?: string;
      aqi?: string | number;
      name?: string;
    }>;
    if (!Array.isArray(list)) return [];
    return list
      .filter((n) => n && n.x)
      .map((n) => ({
        idx: Number(n.x),
        name: String(n.name ?? "").split(",")[0] ?? "",
        lat: Number(n.g?.[0]) || 0,
        lng: Number(n.g?.[1]) || 0,
        aqi: numeric(n.aqi),
        observedAt: n.t ?? null,
      }))
      .slice(0, 10);
  } catch {
    return [];
  }
}

function isoFromEpoch(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

/** AQICN renders local observation times as "2026/10/21 18:00:00" in IST for Delhi. */
function localFromString(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+05:30`;
}

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, { at: number; value: AqicnLive }>();

export async function fetchAqicnLive(
  station: AqicnStation = DEFAULT_STATION,
  opts: { force?: boolean } = {}
): Promise<AqicnLive> {
  const cacheKey = station.slug;
  const hit = cache.get(cacheKey);
  if (!opts.force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.value;
  }

  const cityUrl = `https://aqicn.org/city/delhi/${station.slug}/`;
  const mapUrl = `https://aqicn.org/map/delhi/${station.slug}/`;

  const base: AqicnLive = {
    ok: false,
    stationSlug: station.slug,
    stationName: station.name,
    region: station.region,
    lat: station.lat,
    lng: station.lng,
    aqi: null,
    stationIdx: null,
    dominantPollutant: null,
    pollutants: [],
    observedAt: null,
    observedLocal: null,
    pageGeneratedAt: null,
    sources: [],
    graphs: [],
    neighbours: [],
    sourceUrl: cityUrl,
    mapUrl,
    fetchedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(cityUrl, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`AQICN responded ${res.status}`);
    const html = await res.text();

    const widget = parseWidgetModel(html);
    const summary = parseTextSummary(html);
    const sources = parseSources(html);

    let pollutants: PollutantReading[] = [];
    let aqi: number | null = null;
    let observedAt: string | null = null;
    let observedLocal: string | null = null;
    let dominant: string | null = null;

    if (widget?.iaqi?.length) {
      pollutants = widget.iaqi
        .filter((p) => p && p.p && POLLUTANT_KEYS.includes(String(p.p)))
        .map((p) => ({
          key: String(p.p),
          label: POLLUTANT_LABELS[String(p.p)] ?? String(p.p).toUpperCase(),
          aqi: numeric(p.v?.[0]),
          min: numeric(p.v?.[1]),
          max: numeric(p.v?.[2]),
        }))
        .sort((a, b) => (b.aqi ?? 0) - (a.aqi ?? 0));

      const geo = widget.city?.geo;
      if (geo?.length === 2) {
        base.lat = Number(geo[0]) || base.lat;
        base.lng = Number(geo[1]) || base.lng;
      }
      if (widget.city?.name) base.stationName = widget.city.name;
      if (widget.city?.idx) base.stationIdx = Number(widget.city.idx) || null;

      const strongest = pollutants.find((p) => (p.aqi ?? 0) > 0);
      aqi = strongest?.aqi ?? null;
      dominant = strongest?.key ?? null;
      observedAt = widget.timestamp ? isoFromEpoch(widget.timestamp) : null;
      observedLocal = localFromString(
        (widget.iaqi.find((p) => p?.h?.[0])?.h?.[0] as string | undefined) ?? null
      );
    }

    if (aqi === null) aqi = summary.aqi;
    if (pollutants.length === 0) pollutants = summary.pollutants;
    if (!observedAt && summary.generatedAt) observedAt = summary.generatedAt;

    const value: AqicnLive = {
      ...base,
      ok: aqi !== null,
      aqi,
      dominantPollutant: dominant,
      pollutants,
      observedAt,
      observedLocal,
      pageGeneratedAt: summary.generatedAt,
      sources,
      graphs: parseGraphs(html, pollutants),
      neighbours: parseNeighbours(html),
    };

    cache.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch (err) {
    const value: AqicnLive = {
      ...base,
      error: err instanceof Error ? err.message : "Unable to reach AQICN",
    };
    cache.set(cacheKey, { at: Date.now(), value });
    return value;
  }
}

function numeric(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const AQI_CATEGORIES = [
  { max: 50, label: "Good", color: "#00E400" },
  { max: 100, label: "Moderate", color: "#F2C744" },
  { max: 150, label: "Unhealthy for Sensitive Groups", color: "#FF7E00" },
  { max: 200, label: "Unhealthy", color: "#FF0000" },
  { max: 300, label: "Very Unhealthy", color: "#8F3F97" },
  { max: 500, label: "Hazardous", color: "#7E0023" },
  { max: Infinity, label: "Extremely Hazardous", color: "#6A0DAD" },
];

export function aqiCategory(aqi: number | null | undefined) {
  const v = Number(aqi) || 0;
  return AQI_CATEGORIES.find((c) => v <= c.max) ?? AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
}

export function pollutantLabel(key: string): string {
  return POLLUTANT_LABELS[key] ?? key.toUpperCase();
}
