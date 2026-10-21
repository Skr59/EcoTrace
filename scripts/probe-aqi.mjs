import { subIndex } from "./aqi-core.mjs";

const MW = { o3: 48.0, no2: 46.0055, so2: 64.066, co: 28.0101 };
const toPpb = (v, s) => (v * 24.45) / (MW[s] * 1000);

const u = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=28.6&longitude=77.2&hourly=pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide,us_aqi&timezone=Asia%2FKolkata&past_days=30&forecast_days=1";
const d = await (await fetch(u)).json();
const h = d.hourly;
const N = h.time.length;

const mean = (arr, from, to) => {
  const w = arr.slice(from, to + 1).filter((v) => typeof v === "number");
  return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
};

/** EPA AQI with standard averaging periods, evaluated at hour i. */
function epaAqi(i) {
  const pm25m = mean(h.pm2_5, Math.max(0, i - 23), i);
  const pm10m = mean(h.pm10, Math.max(0, i - 23), i);
  const o3m = mean(h.ozone, Math.max(0, i - 7), i);
  const com = mean(h.carbon_monoxide, Math.max(0, i - 7), i);
  const parts = {
    pm25: subIndex("pm25", pm25m),
    pm10: subIndex("pm10", pm10m),
    o3: subIndex("o3", toPpb(o3m, "o3")),
    no2: subIndex("no2", toPpb(h.nitrogen_dioxide[i], "no2")),
    so2: subIndex("so2", toPpb(h.sulphur_dioxide[i], "so2")),
    co: subIndex("co", toPpb(com, "co") / 1000),
  };
  const best = Object.entries(parts).sort((a, b) => b[1] - a[1])[0];
  return { aqi: Math.round(best[1]), dom: best[0], parts };
}

let diffs = [];
const rows = [];
for (let i = Math.max(24, N - 14); i < N; i++) {
  const r = epaAqi(i);
  const api = h.us_aqi[i];
  diffs.push(r.aqi - api);
  rows.push(
    `${h.time[i]} api=${String(api).padStart(3)} mine=${String(r.aqi).padStart(3)} dom=${r.dom.padEnd(4)} d=${r.aqi - api}  pm25m=${mean(h.pm2_5, i - 23, i).toFixed(1)} pm10m=${mean(h.pm10, i - 23, i).toFixed(1)} no2=${h.nitrogen_dioxide[i]} co8=${mean(h.carbon_monoxide, i - 7, i).toFixed(0)}`,
  );
}
console.log(rows.join("\n"));
const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
const maxAbs = Math.max(...diffs.map(Math.abs));
console.log(`\nmean diff = ${meanDiff.toFixed(2)}, max |diff| = ${maxAbs}`);
