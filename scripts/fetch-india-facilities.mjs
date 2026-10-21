/**
 * Build the India-wide power-station facility register.
 *
 * Source: Wikipedia "List of power stations in India" (wikitext via the
 * MediaWiki API). The page carries a coordinate template for every plant, so
 * it gives us a facility-level register with positions, capacity, owner and
 * fuel type without having to guess coordinates.
 *
 * Output: data/india-power-stations.json
 *
 *   node scripts/fetch-india-facilities.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";

const API = "https://en.wikipedia.org/w/api.php";
const PAGE = "List_of_power_stations_in_India";
const UA = "KisanCarbonHub/1.0 (pollution ledger research)";

async function fetchWikitext() {
  const url = `${API}?action=parse&page=${PAGE}&prop=wikitext&format=json&formatversion=2`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`MediaWiki responded ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.info ?? "parse error");
  return data.parse.wikitext;
}

/** Strip <ref>...</ref>, <!-- --> and wiki templates we do not need. */
function cleanCell(cell) {
  return cell
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{cite[^}]*\}\}/g, "")
    .trim();
}

/** "[[Neyveli Thermal Power Station|Neyveli Thermal Power Station I]]" -> "Neyveli Thermal Power Station I" */
function linkText(cell) {
  const cleaned = cleanCell(cell);
  const links = [...cleaned.matchAll(/\[\[([^\]]+)\]\]/g)];
  if (!links.length) return cleaned;
  const last = links[links.length - 1][1];
  const pipe = last.split("|");
  return cleanCell(pipe[pipe.length - 1].trim());
}

/** The link target (before the "|" alias), used when matching owners. */
function linkTarget(cell) {
  const cleaned = cleanCell(cell);
  const links = [...cleaned.matchAll(/\[\[([^\]]+)\]\]/g)];
  if (!links.length) return cleaned;
  const last = links[links.length - 1][1].split("|")[0];
  return cleanCell(last);
}

/** "{{Coord|14|42|14|N|78|27|29|E|name=X}}" -> { lat, lng } */
function parseCoord(cell) {
  const m = cell.match(
    /\{\{\s*[Cc]oord\s*\|\s*(-?[\d.]+)\s*\|\s*(-?[\d.]+)\s*\|\s*(-?[\d.]+)\s*\|\s*([NS])\s*\|\s*(-?[\d.]+)\s*\|\s*(-?[\d.]+)\s*\|\s*(-?[\d.]+)\s*\|\s*([EW])/
  );
  if (!m) return null;
  const lat =
    Math.abs(Number(m[1])) + Math.abs(Number(m[2])) / 60 + Math.abs(Number(m[3])) / 3600;
  const lng =
    Math.abs(Number(m[5])) + Math.abs(Number(m[6])) / 60 + Math.abs(Number(m[7])) / 3600;
  const signedLat = m[4].toUpperCase() === "S" ? -lat : lat;
  const signedLng = m[8].toUpperCase() === "W" ? -lng : lng;
  // Sanity check: the page is India-only, so anything far outside is a parse artefact.
  if (signedLat < 6 || signedLat > 36 || signedLng < 68 || signedLng > 98) return null;
  return { lat: Number(signedLat.toFixed(5)), lng: Number(signedLng.toFixed(5)) };
}

/**
 * "style="text-align:right;" |1,650" -> 1650.
 * Only pure numbers count, so the neighbouring unit column ("6 x 210, 7x 500")
 * is not mistaken for the capacity.
 */
function parseCapacity(cell) {
  const text = cleanCell(cell)
    .replace(/style="[^"]*"/g, "")
    .replace(/^\s*\|/, "")
    .trim();
  if (!/^-?[\d,]+(\.\d+)?$/.test(text)) return null;
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const FUEL_BY_HEADING = {
  coal: "Coal",
  "gas-based": "Gas",
  "diesel-based": "Diesel",
  "nuclear power": "Nuclear",
  hydroelectric: "Hydro",
  "solar photovoltaic": "Solar",
  "solar thermal": "Solar thermal",
  "wind power": "Wind",
};

const REGION_WORDS = /^(northern|southern|eastern|western|central|state|private|central\s*&?\s*state|private\s*&\s*state|state\s*&\s*central)$/i;

const STATE_NAMES =
  "Andhra Pradesh|Arunachal Pradesh|Assam|Bihar|Chhattisgarh|Delhi|Goa|Gujarat|Haryana|Himachal Pradesh|Jammu and Kashmir|Jharkhand|Karnataka|Kerala|Madhya Pradesh|Maharashtra|Manipur|Meghalaya|Mizoram|Nagaland|Odisha|Puducherry|Punjab|Rajasthan|Sikkim|Tamil Nadu|Telangana|Tripura|Uttar Pradesh|Uttarakhand|West Bengal|Andaman and Nicobar|Dadra and Nagar Haveli|Lakshadweep";

const JUNK_NAME =
  /^(the\s+)?(times of india|hindustan times|india today|the economic times|hindu|express|news18|times now|reuters|bloomberg)$/i;

const DATE_LIKE = /^(january|february|march|april|may|june|july|august|september|october|november|december)\b|^\d{1,2}\s+\w{3,}\s+\d{4}$|^\d{4}$/i;

function parse(wikitext) {
  const lines = wikitext.split("\n");
  const facilities = [];
  let heading = "";
  let inTable = false;

  for (const line of lines) {
    const h = line.match(/^(=+)\s*(.+?)\s*\1$/);
    if (h) {
      const name = h[2].trim();
      heading = FUEL_BY_HEADING[name.toLowerCase()] ?? "";
      inTable = false;
      continue;
    }
    if (line.startsWith("{|")) {
      inTable = true;
      continue;
    }
    if (line.startsWith("|}")) {
      inTable = false;
      continue;
    }
    if (!inTable || !line.startsWith("| ") || line.startsWith("|-")) continue;
    if (line.startsWith("| ") && line.includes("||") === false) continue;

    const cells = line.split("||").map((c) => c.replace(/^\|\s*/, "").trim());
    if (cells.length < 6) continue;

    const name = linkText(cells[0]);
    if (!name || name.length < 3) continue;
    if (JUNK_NAME.test(name)) continue;

    let coordIndex = -1;
    let coord = null;
    for (let i = 0; i < cells.length && !coord; i++) {
      const c = parseCoord(cells[i]);
      if (c) {
        coord = c;
        coordIndex = i;
      }
    }
    if (!coord) continue;

    // The state is the first cell that resolves to a well-known state name.
    const stateCell = cells
      .slice(1)
      .map((c) => linkText(c))
      .find((c) => new RegExp(`^(${STATE_NAMES})$`, "i").test(c.trim()));
    const state = stateCell ?? "India";

    // Capacity and owner sit after the coordinate cell in every plant table.
    const after = cells.slice(coordIndex + 1);
    const capacity = after.map(parseCapacity).find((v) => v !== null && v > 0) ?? null;
    const owner =
      after
        .map((c) => ({ text: linkText(c), target: linkTarget(c) }))
        .find(
          ({ text, target }) =>
            text.length > 3 &&
            !REGION_WORDS.test(text) &&
            !/^\d/.test(text) &&
            !DATE_LIKE.test(text) &&
            /Limited|Ltd|LLC|Corporation|Company|Utilities|Power|Energy|Generation|NTPC|BHEL|SJVN|NHPC|NLC|CEGENNA|Coal|Lignite|Board|Authority|Grid|Discom|Ventures|Petroleum|Oil|Iron|Steel|Fertiliser|Cement|Sugar|SPM|BSES|Lanco|Jindal|Torrent|Welspun|Adani|NPCIL|Nigam|Vidyut|Utpadan|SMEL|GEZRA|PCL|Corp|Co\.|&\s/i.test(target)
        )?.text ??
      after
        .map((c) => linkText(c))
        .find(
          (c) =>
            c.length > 3 &&
            !REGION_WORDS.test(c) &&
            !/^\d/.test(c) &&
            !DATE_LIKE.test(c) &&
            /[A-Za-z]{3}/.test(c)
        ) ??
      "";

    let fuel = heading;
    if (!fuel) {
      if (/lignite/i.test(name) || /lignite/i.test(owner)) fuel = "Lignite";
      else if (/solar/i.test(name) || /solar/i.test(owner)) fuel = "Solar";
      else if (/wind/i.test(name) || /wind/i.test(owner)) fuel = "Wind";
      else if (/hydro|dam|bhakra|tehri|sardar|hirakud|ukkai/i.test(name)) fuel = "Hydro";
      else if (/nuclear|atomic|kaiga|rawal|gorakhpur|anuth|chutka|tarapur|kakrapar|madras|rajasthan atomic|kudankulam/i.test(name)) fuel = "Nuclear";
      else fuel = "Other";
    }

    facilities.push({
      name,
      state,
      lat: coord.lat,
      lng: coord.lng,
      capacityMW: capacity,
      owner,
      fuel,
    });
  }

  // Deduplicate on name, keeping the row with the largest installed capacity
  // (the same plant is sometimes listed once per unit).
  const byName = new Map();
  for (const f of facilities) {
    const key = f.name.toLowerCase().replace(/\s+/g, " ").trim();
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, f);
      continue;
    }
    if ((f.capacityMW ?? 0) > (prev.capacityMW ?? 0)) byName.set(key, f);
  }
  return Array.from(byName.values());
}

const wikitext = await fetchWikitext();
const facilities = parse(wikitext);

const byFuel = facilities.reduce((acc, f) => {
  acc[f.fuel] = (acc[f.fuel] ?? 0) + 1;
  return acc;
}, {});
const withCapacity = facilities.filter((f) => f.capacityMW).length;
const totalMW = facilities.reduce((s, f) => s + (f.capacityMW ?? 0), 0);

const outDir = path.resolve(process.cwd(), "data");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "india-power-stations.json");
writeFileSync(
  outFile,
  JSON.stringify(
    {
      source: `https://en.wikipedia.org/wiki/${PAGE}`,
      retrievedAt: new Date().toISOString(),
      count: facilities.length,
      facilities,
    },
    null,
    1
  )
);

console.log(`[india-facilities] ${facilities.length} facilities -> ${path.relative(process.cwd(), outFile)}`);
console.log(`[india-facilities] by fuel: ${JSON.stringify(byFuel)}`);
console.log(`[india-facilities] ${withCapacity} with capacity, total ${totalMW.toLocaleString("en-IN")} MW`);
