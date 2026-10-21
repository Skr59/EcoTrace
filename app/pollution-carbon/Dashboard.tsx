"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  Clock,
  Download,
  Factory,
  Gauge,
  Info,
  Leaf,
  Loader2,
  MapPin,
  RefreshCw,
  Scale,
  Sprout,
  TrendingUp,
  Wind,
  X,
} from "lucide-react";
import { AQICN_STATIONS, aqiCategory, getStation } from "@/lib/aqicn";
import { DEFAULT_CREDIT_PRICE_INR } from "@/lib/carbonRates";
import {
  computeIndustryLedger,
  SECTOR_COLORS,
  SECTOR_LABELS,
  type LedgerRow,
} from "@/lib/industries";
import type {
  HistoryResponse,
  IndustriesResponse,
  LiveResponse,
  MonthlyResponse,
} from "@/lib/aqiTypes";
import type { ChartView } from "./Charts";

const ChartPanel = dynamic(() => import("./Charts"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[340px] items-center justify-center text-sm font-semibold text-slate-400">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading chart…
    </div>
  ),
});

const SectorDeficitChart = dynamic(
  () => import("./Charts").then((m) => m.SectorDeficitChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[300px] items-center justify-center text-sm font-semibold text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading chart…
      </div>
    ),
  }
);

const VIEWS: Array<{ key: ChartView; label: string; hint: string }> = [
  { key: "live", label: "Live 72h", hint: "Hour by hour, last three days" },
  { key: "daily", label: "Daily 30d", hint: "Calendar-day means" },
  { key: "monthly", label: "Monthly 12m", hint: "Twelve-month trend" },
  { key: "hourOfDay", label: "Hour of day", hint: "24-bucket time division" },
  { key: "dayOfWeek", label: "Day of week", hint: "Weekly rhythm" },
  { key: "dayParts", label: "Day parts", hint: "Night / morning / evening" },
  { key: "pollutants", label: "Pollutants", hint: "Raw concentration trends" },
];

const REFRESH_SECONDS = 60;

function AqiGauge({ value, color }: { value: number; color: string }) {
  const r = 54;
  const cx = 70;
  const cy = 70;
  const circumference = Math.PI * r;
  const pct = Math.max(0, Math.min(1, (value || 0) / 300));
  const angle = 180 - 180 * pct;
  const rad = (angle * Math.PI) / 180;
  const nx = cx + r * Math.cos(rad);
  const ny = cy - r * Math.sin(rad);

  return (
    <svg viewBox="0 0 140 96" className="h-28 w-40">
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={13}
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={color}
        strokeWidth={13}
        strokeLinecap="round"
        strokeDasharray={`${circumference * pct} ${circumference}`}
      />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#0f172a" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4.5} fill="#0f172a" />
      <text x={cx - r} y={cy + 16} fontSize="9" fill="#94a3b8" textAnchor="middle">
        0
      </text>
      <text x={cx} y={cy + 16} fontSize="9" fill="#94a3b8" textAnchor="middle">
        150
      </text>
      <text x={cx + r} y={cy + 16} fontSize="9" fill="#94a3b8" textAnchor="middle">
        300+
      </text>
    </svg>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent = "text-slate-600",
  bg = "bg-slate-50",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  bg?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        <span className={`rounded-lg p-1.5 ${bg} ${accent}`}>{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-xl font-black leading-tight text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] font-medium text-slate-500">{sub}</p>}
    </div>
  );
}

function inr(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

function num(n: number | null | undefined, d = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(d);
}

export default function PollutionDashboard() {
  const [stationSlug, setStationSlug] = useState("mandir-marg");
  const [live, setLive] = useState<LiveResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [monthly, setMonthly] = useState<MonthlyResponse | null>(null);
  const [industries, setIndustries] = useState<IndustriesResponse | null>(null);
  const [view, setView] = useState<ChartView>("live");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [showMethod, setShowMethod] = useState(false);
  const [priceMode, setPriceMode] = useState<"reference" | "live" | "custom">("reference");
  const [customPrice, setCustomPrice] = useState(1800);

  const station = getStation(stationSlug);

  // ---------------------------------------------------------- persistence ---
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`pc-actual:${stationSlug}`);
      setOverrides(raw ? (JSON.parse(raw) as Record<string, number>) : {});
    } catch {
      setOverrides({});
    }
  }, [stationSlug]);

  const updateOverride = useCallback(
    (key: string, value: number) => {
      setOverrides((prev) => {
        const next = { ...prev, [key]: value };
        try {
          window.localStorage.setItem(`pc-actual:${stationSlug}`, JSON.stringify(next));
        } catch {
          /* storage unavailable */
        }
        return next;
      });
    },
    [stationSlug]
  );

  const resetOverrides = useCallback(() => {
    setOverrides({});
    try {
      window.localStorage.removeItem(`pc-actual:${stationSlug}`);
    } catch {
      /* storage unavailable */
    }
  }, [stationSlug]);

  // --------------------------------------------------------------- loaders ---
  const loadLive = useCallback(async (slug: string, silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch(`/api/aqi/live?station=${slug}`, { cache: "no-store" });
      const data: LiveResponse = await res.json();
      setLive(data);
      setError(data.live?.error ?? null);
      setLastUpdated(new Date());
    } catch {
      setError("Could not reach the live AQICN feed");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/aqi/history?station=${slug}&days=30&hours=72`, {
        cache: "no-store",
      });
      const data: HistoryResponse = await res.json();
      setHistory(data);
      if (data.error) setError(data.error);
    } catch {
      setError("Could not load the historical series");
    }
  }, []);

  const loadMonthly = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/aqi/monthly?station=${slug}&months=12`, {
        cache: "no-store",
      });
      const data: MonthlyResponse = await res.json();
      setMonthly(data);
    } catch {
      /* monthly view degrades quietly */
    }
  }, []);

  const loadIndustries = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/aqi/industries?station=${slug}`, { cache: "no-store" });
      const data: IndustriesResponse = await res.json();
      setIndustries(data);
    } catch {
      setError("Could not build the industry credit ledger");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHistory(null);
    setMonthly(null);
    setIndustries(null);
    Promise.all([
      loadLive(stationSlug),
      loadHistory(stationSlug),
      loadMonthly(stationSlug),
      loadIndustries(stationSlug),
    ]).catch(() => undefined);
    return () => {
      cancelled = true;
      void cancelled;
    };
  }, [stationSlug, loadLive, loadHistory, loadMonthly, loadIndustries]);

  // auto refresh
  useEffect(() => {
    const id = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          void loadLive(stationSlug, true);
          void loadIndustries(stationSlug);
          return REFRESH_SECONDS;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [stationSlug, loadLive, loadIndustries]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadHistory(stationSlug);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [stationSlug, loadHistory]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadMonthly(stationSlug);
    }, 30 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [stationSlug, loadMonthly]);

  // ------------------------------------------------------------- derived ---
  const category = live ? aqiCategory(live.live.aqi) : aqiCategory(0);

  const marketPrice = live?.marketPriceINR ?? industries?.marketPriceINR ?? 0;
  const effectivePrice =
    priceMode === "live"
      ? marketPrice || DEFAULT_CREDIT_PRICE_INR
      : priceMode === "custom"
        ? customPrice > 0
          ? customPrice
          : DEFAULT_CREDIT_PRICE_INR
        : DEFAULT_CREDIT_PRICE_INR;

  const ledger = useMemo(() => {
    if (!industries) return null;
    return computeIndustryLedger({
      liabilityTPerYear: industries.liability.requiredCreditsTPerYear,
      creditPriceINR: effectivePrice,
      actualOverrides: overrides,
    });
  }, [industries, overrides, effectivePrice]);

  const filteredRows = useMemo<LedgerRow[]>(() => {
    if (!ledger) return [];
    const q = search.trim().toLowerCase();
    return ledger.rows.filter((r) => {
      if (sectorFilter !== "all" && r.sector !== sectorFilter) return false;
      if (!q) return true;
      return `${r.label} ${r.sectorLabel} ${r.pollutants.join(" ")}`
        .toLowerCase()
        .includes(q);
    });
  }, [ledger, sectorFilter, search]);

  const sectorDeficit = useMemo(() => {
    if (!ledger) return [];
    const map = new Map<string, number>();
    for (const r of ledger.rows) {
      map.set(r.sectorLabel, (map.get(r.sectorLabel) ?? 0) + r.deficitT);
    }
    return Array.from(map.entries())
      .map(([label, deficit]) => ({
        label,
        deficit: Math.round(deficit * 100) / 100,
        color:
          SECTOR_COLORS[
            (ledger.rows.find((r) => r.sectorLabel === label)?.sector ??
              "fugitive") as keyof typeof SECTOR_COLORS
          ],
      }))
      .sort((a, b) => b.deficit - a.deficit);
  }, [ledger]);

  const exportCsv = useCallback(() => {
    if (!ledger) return;
    const header = [
      "Industry",
      "Sector",
      "Activity unit",
      "Emission factor (tCO2e/unit)",
      "Liability (tCO2e/yr)",
      "Mandatory required (tCO2e/yr)",
      "Should produce with available tech (tCO2e/yr)",
      "Actually produced (tCO2e)",
      "Deficit (tCO2e)",
      "Deficit value (INR)",
      "Compliance %",
      "Registry status",
      "Abatement technology",
    ];
    const lines = filteredRows.map((r) =>
      [
        r.label,
        r.sectorLabel,
        r.unit,
        r.emissionFactor,
        r.liabilityT.toFixed(3),
        r.requiredT.toFixed(3),
        r.shouldT.toFixed(3),
        r.actualT.toFixed(3),
        r.deficitT.toFixed(3),
        r.deficitValueINR.toFixed(0),
        r.compliancePct.toFixed(1),
        `"${r.registryStatus.replace(/"/g, "'")}"`,
        `"${r.abatementTech.replace(/"/g, "'")}"`,
      ].join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carbon-credit-ledger-${stationSlug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [ledger, filteredRows, stationSlug]);

  const stats = history?.stats;
  const liability = live?.liability;
  const land = live?.land;
  const equivalentZoneCredits = land ? land.totalCredits * (liability?.zoneAreaKm2 ?? 25) : 0;
  const netT = (live?.netPositionT ?? 0);
  const liabilityValueINR = (liability?.requiredCreditsTPerYear ?? 0) * effectivePrice;
  const netValueINR = netT * effectivePrice;
  const zoneValueINR = equivalentZoneCredits * effectivePrice;
  const aqicnUrl = live?.live.sourceUrl ?? `https://aqicn.org/city/delhi/${stationSlug}/`;
  const mapUrl = live?.live.mapUrl ?? `https://aqicn.org/map/delhi/${stationSlug}/`;
  const calculatorHref = `/carbon-credit?lat=${station.lat.toFixed(6)}&lng=${station.lng.toFixed(
    6
  )}&name=${encodeURIComponent(station.name)}`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ------------------------------------------------------------ header */}
      <header className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 22%, rgba(56,189,248,.55) 0 1.5px, transparent 1.6px), radial-gradient(circle at 78% 62%, rgba(129,140,248,.5) 0 1.5px, transparent 1.6px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative mx-auto max-w-[1500px] px-4 py-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                <Wind className="h-4 w-4" /> Live environment intelligence
              </div>
              <h1 className="mt-1.5 text-2xl font-black tracking-tight sm:text-3xl">
                Pollution → Carbon Credit Ledger
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                Live AQI straight from AQICN for {station.name}, Delhi, turned into
                the carbon credits every polluting industry{" "}
                <span className="font-bold text-white">should be producing in real time</span>{" "}
                against what they have actually produced.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-white/20"
              >
                <MapPin className="h-4 w-4" /> AQICN map
              </a>
              <Link
                href={calculatorHref}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-2 text-xs font-black text-slate-950 transition hover:from-emerald-400 hover:to-teal-400"
              >
                <Leaf className="h-4 w-4" /> Our credit calculator
              </Link>
              <button
                onClick={() => {
                  void loadLive(stationSlug);
                  void loadIndustries(stationSlug);
                  setCountdown(REFRESH_SECONDS);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-xs font-black text-slate-900 transition hover:bg-slate-100"
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh ({countdown}s)
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white ring-1 ring-white/15">
              <MapPin className="h-4 w-4 text-cyan-300" />
              <select
                value={stationSlug}
                onChange={(e) => setStationSlug(e.target.value)}
                className="bg-transparent font-bold text-white outline-none"
              >
                {AQICN_STATIONS.map((s) => (
                  <option key={s.slug} value={s.slug} className="text-slate-900">
                    {s.name} — {s.region}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-slate-200 ring-1 ring-white/15">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              AQICN live feed
              {lastUpdated && (
                <span className="font-medium text-slate-400">
                  · updated{" "}
                  {lastUpdated.toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-slate-100 ring-1 ring-white/15">
              <TrendingUp className="h-4 w-4 text-amber-300" />
              <span className="text-slate-300">Valuation rate</span>
              <select
                value={priceMode}
                onChange={(e) => setPriceMode(e.target.value as "reference" | "live" | "custom")}
                className="rounded-lg bg-slate-900/80 px-2 py-1 font-bold text-white outline-none ring-1 ring-white/20"
              >
                <option value="reference" className="text-slate-900">
                  Platform reference ₹{DEFAULT_CREDIT_PRICE_INR}
                </option>
                <option value="live" className="text-slate-900">
                  Live market ₹{marketPrice ? marketPrice.toFixed(0) : "—"}
                </option>
                <option value="custom" className="text-slate-900">
                  Custom rate
                </option>
              </select>
              {priceMode === "custom" && (
                <input
                  type="number"
                  min={1}
                  value={customPrice}
                  onChange={(e) => setCustomPrice(Number(e.target.value) || 0)}
                  className="w-24 rounded-lg bg-slate-900/80 px-2 py-1 font-bold text-white outline-none ring-1 ring-white/20"
                />
              )}
              <span className="font-medium text-slate-300">/ tCO2e</span>
              {priceMode === "live" && !live?.creditPriceLive && (
                <span className="font-medium text-amber-300">(fallback)</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6">
        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              <p className="font-bold text-amber-900">{error}</p>
              <p className="text-amber-800">
                The AQICN station page could not be read this time. Values shown below
                fall back to the modelled series.
              </p>
            </div>
          </div>
        )}

        {loading && !live ? (
          <div className="flex h-64 items-center justify-center text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Reading live AQICN feed…
          </div>
        ) : (
          <div className="space-y-6">
            {/* ------------------------------------------- live AQI + charts */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
              {/* live card */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
                      <Activity className="h-4 w-4 text-cyan-500" /> Live AQI
                    </h2>
                    <p className="mt-1 text-xl font-black text-slate-900">
                      {live?.live.stationName ?? station.name}
                    </p>
                    <p className="text-xs font-medium text-slate-500">
                      {station.region} · {station.lat.toFixed(4)}, {station.lng.toFixed(4)}
                    </p>
                  </div>
                  <a
                    href={aqicnUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-200"
                  >
                    Source ↗
                  </a>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <AqiGauge value={live?.live.aqi ?? 0} color={category.color} />
                  <div>
                    <p
                      className="text-6xl font-black leading-none"
                      style={{ color: category.color }}
                    >
                      {live?.live.aqi ?? "—"}
                    </p>
                    <p
                      className="mt-1 text-xs font-black uppercase tracking-wide"
                      style={{ color: category.color }}
                    >
                      {category.label}
                    </p>
                  </div>
                </div>

                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  Observed {live?.live.observedLocal ?? live?.live.observedAt ?? "—"}
                  {live?.live.dominantPollutant && (
                    <span className="font-bold text-slate-700">
                      · dominant {live.live.dominantPollutant.toUpperCase()}
                    </span>
                  )}
                </p>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {(live?.live.pollutants ?? []).map((p) => {
                    const c = aqiCategory(p.aqi);
                    return (
                      <div
                        key={p.key}
                        className="rounded-xl border p-2.5"
                        style={{ borderColor: `${c.color}55`, background: `${c.color}12` }}
                      >
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                          {p.label}
                        </p>
                        <p className="text-lg font-black" style={{ color: c.color }}>
                          {p.aqi ?? "—"}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {live?.live.sources?.length ? (
                  <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
                    AQICN data sources: {live.live.sources.join(" · ")}
                  </p>
                ) : null}

                {live?.live.graphs?.length ? (
                  <div className="mt-4">
                    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
                      <BarChart3 className="h-3 w-3" /> AQICN&apos;s own live graph
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {live.live.graphs.map((g) => (
                        <a
                          key={g.label}
                          href={aqicnUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group rounded-xl border border-slate-200 bg-white p-2 hover:border-cyan-300"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={g.dataUri}
                            alt={`AQICN ${g.label} graph for ${station.name}`}
                            className="h-auto w-full"
                          />
                          <p className="mt-1 flex items-center justify-between text-[10px] font-black uppercase tracking-wide text-slate-500">
                            {g.label}
                            <span
                              className="font-black"
                              style={{ color: aqiCategory(g.aqi).color }}
                            >
                              {g.aqi ?? "—"}
                            </span>
                          </p>
                        </a>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-400">
                      Rendered by AQICN from the same station feed. Click a graph to
                      open the source page.
                    </p>
                  </div>
                ) : null}
              </section>

              {/* chart card */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
                      <BarChart3 className="h-4 w-4 text-indigo-500" /> Graph analysis
                    </h2>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      {VIEWS.find((v) => v.key === view)?.hint}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {VIEWS.map((v) => (
                      <button
                        key={v.key}
                        onClick={() => setView(v.key)}
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                          view === v.key
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <ChartPanel view={view} history={history} monthly={monthly} liveAqi={live?.live.aqi ?? null} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <MiniStat label="Mean AQI" value={num(stats?.meanAqi)} />
                  <MiniStat label="Peak AQI" value={num(stats?.maxAqi, 0)} />
                  <MiniStat label="Lowest AQI" value={num(stats?.minAqi, 0)} />
                  <MiniStat label="Worst day" value={stats?.worstDay?.date.slice(5) ?? "—"} />
                  <MiniStat label="Unhealthy days" value={`${stats?.daysUnhealthy ?? 0}`} />
                  <MiniStat label="Severe days" value={`${stats?.daysSevere ?? 0}`} />
                </div>
              </section>
            </div>

            {/* ------------------------------------------ neighbouring stations */}
            {live?.live.neighbours?.length ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
                    <MapPin className="h-4 w-4 text-rose-500" /> Neighbouring monitors
                    right now
                  </h2>
                  <p className="text-xs font-medium text-slate-500">
                    Live AQI from the AQICN station network around {station.name}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {live.live.neighbours.map((n) => {
                    const c = aqiCategory(n.aqi);
                    const isSelf = n.idx === live.live.stationIdx;
                    return (
                      <a
                        key={n.idx}
                        href={`https://aqicn.org/city/delhi/?id=${n.idx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`rounded-xl border p-3 transition hover:shadow-md ${
                          isSelf
                            ? "border-cyan-400 bg-cyan-50/60"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <p className="truncate text-[11px] font-bold text-slate-600">
                          {n.name}
                          {isSelf && (
                            <span className="ml-1 rounded bg-cyan-600 px-1 py-0.5 text-[9px] font-black text-white">
                              THIS
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-2xl font-black" style={{ color: c.color }}>
                          {n.aqi ?? "—"}
                        </p>
                        <p className="text-[10px] font-medium text-slate-400">
                          {c.label}
                        </p>
                      </a>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* ------------------------------------------------- carbon impact */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
                <Gauge className="h-4 w-4 text-emerald-500" /> Carbon impact of this
                location right now
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <StatCard
                  icon={<Wind className="h-3.5 w-3.5" />}
                  label="PM load"
                  value={`${num(liability?.loads.pm25, 0)} kg/d`}
                  sub={`PM2.5 column load over ${liability?.zoneAreaKm2 ?? 25} km²`}
                  accent="text-orange-600"
                  bg="bg-orange-50"
                />
                <StatCard
                  icon={<Activity className="h-3.5 w-3.5" />}
                  label="Gross CO2e"
                  value={`${num(liability?.totalCo2eTPerYear, 1)} t/yr`}
                  sub="Combustion-linked CO2e attributed to this zone"
                  accent="text-rose-600"
                  bg="bg-rose-50"
                />
                <StatCard
                  icon={<Scale className="h-3.5 w-3.5" />}
                  label="Credits owed"
                  value={`${num(liability?.requiredCreditsTPerYear, 1)} t/yr`}
                  sub={`After the ${liability?.abatementPct ?? 35}% abatement target`}
                  accent="text-violet-600"
                  bg="bg-violet-50"
                />
                <StatCard
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  label="Market value"
                  value={inr(liabilityValueINR)}
                  sub={`at ₹${num(effectivePrice, 0)} / tCO2e`}
                  accent="text-emerald-600"
                  bg="bg-emerald-50"
                />
                <StatCard
                  icon={<Factory className="h-3.5 w-3.5" />}
                  label="Acid gas load"
                  value={`${num(liability?.acidGasSo2EqKgPerDay, 0)} kg/d`}
                  sub="NO2 + SO2 expressed as SO2-equivalent"
                  accent="text-sky-600"
                  bg="bg-sky-50"
                />
                <StatCard
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                  label="Worst day"
                  value={stats?.worstDay ? `${stats.worstDay.meanAqi}` : "—"}
                  sub={stats?.worstDay?.date ?? "no data"}
                  accent="text-red-600"
                  bg="bg-red-50"
                />
              </div>
            </section>

            {/* ------------------------------- comparison with our own site */}
            <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
                  <Sprout className="h-4 w-4 text-emerald-500" /> What our platform
                  generates here
                </h2>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Same estimate as the Carbon Credit Calculator, computed
                  deterministically from {station.lat.toFixed(5)},{" "}
                  {station.lng.toFixed(5)}.
                </p>
                <div className="mt-4 space-y-2.5">
                  <BarRow
                    label="Vegetation"
                    value={land?.vegetation ?? 0}
                    max={15}
                    color="from-emerald-400 to-emerald-600"
                    suffix=" tCO2e/ha/yr"
                  />
                  <BarRow
                    label="Soil carbon"
                    value={land?.soil ?? 0}
                    max={8}
                    color="from-amber-400 to-amber-600"
                    suffix=" tCO2e/ha/yr"
                  />
                  <BarRow
                    label="Water bodies"
                    value={land?.water ?? 0}
                    max={5}
                    color="from-sky-400 to-sky-600"
                    suffix=" tCO2e/ha/yr"
                  />
                  <BarRow
                    label="Urban penalty"
                    value={land?.urban ?? 0}
                    max={3}
                    color="from-rose-400 to-rose-500"
                    suffix=" tCO2e/ha/yr"
                    negative
                  />
                </div>
                <div className="mt-4 rounded-xl bg-emerald-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                    Land potential
                  </p>
                  <p className="text-2xl font-black text-emerald-800">
                    {num(land?.totalCredits, 1)} tCO2e/ha/yr
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-emerald-700">
                    {num(equivalentZoneCredits, 0)} tCO2e/yr across the equivalent{" "}
                    {liability?.zoneAreaKm2 ?? 25} km² zone ·{" "}
                    {inr(zoneValueINR)}/yr
                  </p>
                </div>
                <Link
                  href={calculatorHref}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white transition hover:bg-slate-800"
                >
                  Open this exact point in the calculator <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
                  <Scale className="h-4 w-4 text-violet-500" /> Pollution liability vs
                  carbon we can bank
                </h2>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Head-to-head at {station.name}. Positive = the zone generates more
                  than it pollutes.
                </p>

                <div className="mt-4 space-y-3">
                  <CompareRow
                    label="Credits our platform can generate"
                    value={`${num(equivalentZoneCredits, 0)} tCO2e/yr`}
                    tone="good"
                  />
                  <CompareRow
                    label="Credits this zone owes in reality"
                    value={`${num(liability?.requiredCreditsTPerYear, 0)} tCO2e/yr`}
                    tone="bad"
                  />
                  <CompareRow
                    label="Credits actually produced today"
                    value={`${num(ledger?.summary.actualT ?? 0, 1)} tCO2e`}
                    tone="bad"
                  />
                </div>

                <div
                  className={`mt-4 rounded-xl p-4 ${
                    netT >= 0 ? "bg-emerald-50" : "bg-rose-50"
                  }`}
                >
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    Net position
                  </p>
                  <p
                    className={`text-3xl font-black ${
                      netT >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {netT >= 0 ? "+" : ""}
                    {num(netT, 0)} tCO2e/yr
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-slate-600">
                    {inr(netValueINR)} per year at the current credit
                    price
                  </p>
                </div>

                {land?.recommendations?.length ? (
                  <ul className="mt-4 space-y-1.5">
                    {land.recommendations.slice(0, 3).map((r, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600"
                      >
                        <Leaf className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        {r}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>

            {/* ------------------------------------------------ industry ledger */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
                    <Building2 className="h-4 w-4 text-indigo-500" /> Industry credit
                    ledger — required vs actually produced
                  </h2>
                  <p className="mt-1 max-w-3xl text-xs font-medium text-slate-500">
                    Every polluting industry is allocated its share of the measured
                    carbon load at this station. “Should produce” is what the sector
                    could deliver right now with technology that already exists.
                    “Produced” is what has actually been issued against it.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={exportCsv}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </button>
                  <button
                    onClick={resetOverrides}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    <X className="h-3.5 w-3.5" /> Reset to registry
                  </button>
                </div>
              </div>

              {/* summary strip */}
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <StatCard
                  icon={<Scale className="h-3.5 w-3.5" />}
                  label="Liability"
                  value={`${num(ledger?.summary.liabilityT ?? 0, 1)} t`}
                  sub="tCO2e/yr attributed to industry"
                  accent="text-slate-700"
                  bg="bg-slate-100"
                />
                <StatCard
                  icon={<Scale className="h-3.5 w-3.5" />}
                  label="Mandatory"
                  value={`${num(ledger?.summary.requiredT ?? 0, 1)} t`}
                  sub="CCTS / CAQM obligation"
                  accent="text-amber-600"
                  bg="bg-amber-50"
                />
                <StatCard
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Should produce"
                  value={`${num(ledger?.summary.shouldT ?? 0, 1)} t`}
                  sub={`${num(ledger?.summary.shouldPerDayT ?? 0, 2)} t per day in real time`}
                  accent="text-sky-600"
                  bg="bg-sky-50"
                />
                <StatCard
                  icon={<Factory className="h-3.5 w-3.5" />}
                  label="Produced"
                  value={`${num(ledger?.summary.actualT ?? 0, 1)} t`}
                  sub={`${ledger?.summary.zeroProductionCount ?? 0} of ${
                    ledger?.summary.sectorCount ?? 0
                  } sectors at zero`}
                  accent="text-rose-600"
                  bg="bg-rose-50"
                />
                <StatCard
                  icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  label="Deficit"
                  value={`${num(ledger?.summary.deficitT ?? 0, 1)} t`}
                  sub={`${num(ledger?.summary.compliancePct ?? 0, 1)}% compliance`}
                  accent="text-red-600"
                  bg="bg-red-50"
                />
                <StatCard
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  label="Deficit value"
                  value={inr(ledger?.summary.deficitValueINR ?? 0)}
                  sub={`per year at ₹${num(effectivePrice, 0)} / tCO2e`}
                  accent="text-violet-600"
                  bg="bg-violet-50"
                />
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-200 p-4 lg:col-span-1">
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                    Deficit by sector
                  </h3>
                  <SectorDeficitChart data={sectorDeficit} />
                </div>

                <div className="lg:col-span-2">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search industries…"
                        className="w-52 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <select
                      value={sectorFilter}
                      onChange={(e) => setSectorFilter(e.target.value)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 outline-none"
                    >
                      <option value="all">All sectors</option>
                      {Object.entries(SECTOR_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] font-bold text-slate-400">
                      {filteredRows.length} industries
                    </span>
                  </div>

                  <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[900px] border-collapse text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-50">
                        <tr className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                          <th className="px-3 py-2.5">Industry</th>
                          <th className="px-3 py-2.5 text-right">Liability</th>
                          <th className="px-3 py-2.5 text-right">Should produce</th>
                          <th className="px-3 py-2.5 text-right">Produced</th>
                          <th className="px-3 py-2.5 text-right">Deficit</th>
                          <th className="px-3 py-2.5 text-right">Deficit value</th>
                          <th className="px-3 py-2.5">Registry status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((r) => (
                          <tr
                            key={r.key}
                            className="border-t border-slate-100 align-top hover:bg-slate-50/70"
                          >
                            <td className="px-3 py-2.5">
                              <div className="flex items-start gap-2">
                                <span
                                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{
                                    background: SECTOR_COLORS[r.sector],
                                  }}
                                />
                                <div>
                                  <p className="font-bold text-slate-800">{r.label}</p>
                                  <p className="text-[10px] font-medium text-slate-400">
                                    {r.sectorLabel} · {r.unit} · {r.pollutants.join(", ")}
                                  </p>
                                  <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                                    Abatement: {r.abatementTech} ({r.abatementReductionPct}%)
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-slate-700">
                              {r.liabilityT.toFixed(1)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-sky-700">
                              {r.shouldT.toFixed(1)}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={overrides[r.key] ?? r.actualT}
                                onChange={(e) =>
                                  updateOverride(r.key, Number(e.target.value) || 0)
                                }
                                className="w-16 rounded-md border border-slate-200 px-1.5 py-1 text-right text-xs font-bold text-slate-700 outline-none focus:border-indigo-400"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right font-black text-red-600">
                              {r.deficitT.toFixed(1)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-slate-600">
                              {inr(r.deficitValueINR)}
                            </td>
                            <td className="max-w-[220px] px-3 py-2.5 text-[10px] font-medium text-slate-500">
                              {r.registryStatus}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

            {/* ------------------------------------------------- methodology */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <button
                onClick={() => setShowMethod((s) => !s)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-500">
                  <Info className="h-4 w-4 text-slate-400" /> Methodology, sources &
                  limitations
                </h2>
                <span className="text-xs font-bold text-indigo-600">
                  {showMethod ? "Hide" : "Show"}
                </span>
              </button>
              {showMethod && (
                <div className="mt-4 grid grid-cols-1 gap-5 text-xs leading-relaxed text-slate-600 md:grid-cols-3">
                  <div>
                    <p className="font-black text-slate-800">Live AQI source</p>
                    <p className="mt-1">
                      The live panel reads the AQICN station page for {station.name} and
                      parses the embedded <code className="rounded bg-slate-100 px-1">setWidgetAqiGraphModel</code>{" "}
                      payload, with a plain-text fallback. The sparkline graphs and the
                      neighbouring-monitor list are the ones AQICN renders for that
                      same page. Refreshes every 60 seconds. AQICN data is provided by
                      CPCB, DPCC and the US Embassy monitors and is explicitly
                      unvalidated at the time of publication.
                    </p>
                  </div>
                  <div>
                    <p className="font-black text-slate-800">Historical series</p>
                    <p className="mt-1">
                      Hourly concentrations come from the Open-Meteo Air Quality API
                      (CAMS reanalysis + forecast, US-EPA AQI) for the station
                      coordinate. Daily, monthly, hour-of-day, day-of-week and
                      day-part divisions are aggregated from that hourly series.
                    </p>
                  </div>
                  <div>
                    <p className="font-black text-slate-800">Carbon model</p>
                    <p className="mt-1">
                      Column load = concentration × mixing height (300 m) × zone area
                      (25 km²) ÷ 1000, one turnover per day. PM is linked to CO2e at
                      2.7 kg CO2e/kg PM (combustion share 55%), CO at 44/28 kg CO2/kg.
                      The credits owed apply a{" "}
                      {live?.liability.abatementPct ?? 35}% abatement target. Money
                      values use the credit rate selected in the header: the platform
                      reference of ₹{DEFAULT_CREDIT_PRICE_INR}/tCO2e, the live
                      on-chain market price, or your own rate.
                    </p>
                  </div>
                  <div>
                    <p className="font-black text-slate-800">Industry allocation</p>
                    <p className="mt-1">
                      Each industry carries a share of the measured local carbon
                      load. “Should produce” applies the sector&apos;s available
                      abatement technology. “Produced” reflects the carbon-credit
                      registry position today and can be edited to model a scenario;
                      edits are stored only in your browser.
                    </p>
                  </div>
                  <div>
                    <p className="font-black text-slate-800">Limitations</p>
                    <p className="mt-1">
                      These are modelled, order-of-magnitude estimates for planning
                      and comparison. They are not a verified inventory, not a
                      regulatory submission, and not a substitute for CPCB station
                      data or a third-party audit.
                    </p>
                  </div>
                  <div>
                    <p className="font-black text-slate-800">Everything else on the hub</p>
                    <p className="mt-1">
                      <Link href="/carbon-credit" className="font-bold text-indigo-600 hover:underline">
                        Carbon Credit Calculator
                      </Link>{" "}
                      ·{" "}
                      <Link href="/carbon-farmer" className="font-bold text-indigo-600 hover:underline">
                        Farmer Carbon Hub
                      </Link>{" "}
                      ·{" "}
                      <Link href="/drone" className="font-bold text-indigo-600 hover:underline">
                        Carbon Drone Survey
                      </Link>
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-[11px] font-medium text-slate-400">
        Built by Shivam Kumar · Kisan Carbon Hub · Live AQI data © World Air Quality
        Index Project (aqicn.org) · Series from Open-Meteo (CAMS)
      </footer>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="text-sm font-black text-slate-800">{value}</p>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
  suffix,
  negative,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  suffix?: string;
  negative?: boolean;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-bold text-slate-600">{label}</span>
        <span className="font-black text-slate-800">
          {negative ? "-" : ""}
          {value.toFixed(2)}
          {suffix}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CompareRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-3">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <span
        className={`text-sm font-black ${
          tone === "good" ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
