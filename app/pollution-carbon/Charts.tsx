"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { aqiCategory } from "@/lib/aqicn";
import type { HistoryResponse, MonthlyResponse } from "@/lib/aqiTypes";

export type ChartView =
  | "live"
  | "daily"
  | "monthly"
  | "hourOfDay"
  | "dayOfWeek"
  | "dayParts"
  | "pollutants";

export interface ChartPanelProps {
  view: ChartView;
  history: HistoryResponse | null;
  monthly: MonthlyResponse | null;
  liveAqi: number | null;
}

const AXIS = { fontSize: 11, fill: "#64748b" };

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "10-05 18:00" -> "05 May, 18:00" */
function hourLabel(raw: unknown): string {
  const s = String(raw ?? "");
  const m = s.match(/^(\d{2})-(\d{2})\s+(\d{2}:\d{2})$/);
  if (!m) return s;
  return `${m[2]} ${MONTH_SHORT[Number(m[1]) - 1] ?? ""}, ${m[3]}`;
}

/** "10-05 18:00" -> "05 18:00" (compact axis label) */
function hourTick(raw: unknown): string {
  const s = String(raw ?? "");
  const m = s.match(/^\d{2}-(\d{2})\s+(\d{2}:\d{2})$/);
  return m ? `${m[1]} ${m[2]}` : s;
}

function TooltipBox({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-xl backdrop-blur">
      {label !== undefined && (
        <p className="mb-1 text-[11px] font-semibold text-slate-500">{label}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color ?? "#0ea5e9" }}
          />
          <span className="text-slate-500">{p.name}</span>
          <span className="ml-auto font-black">
            {typeof p.value === "number" ? p.value.toFixed(1) : p.value}
            {unit ?? ""}
          </span>
        </p>
      ))}
    </div>
  );
}

function AqiBands() {
  return (
    <>
      <ReferenceArea y1={0} y2={50} fill="#00e400" fillOpacity={0.05} />
      <ReferenceArea y1={50} y2={100} fill="#f2c744" fillOpacity={0.05} />
      <ReferenceArea y1={100} y2={150} fill="#ff7e00" fillOpacity={0.05} />
      <ReferenceArea y1={150} y2={200} fill="#ff0000" fillOpacity={0.05} />
      <ReferenceArea y1={200} y2={300} fill="#8f3f97" fillOpacity={0.05} />
      <ReferenceArea y1={300} y2={500} fill="#7e0023" fillOpacity={0.05} />
      <ReferenceLine y={50} stroke="#00a000" strokeDasharray="3 4" strokeOpacity={0.5} />
      <ReferenceLine y={100} stroke="#c99a00" strokeDasharray="3 4" strokeOpacity={0.6} />
      <ReferenceLine y={150} stroke="#e06a00" strokeDasharray="3 4" strokeOpacity={0.6} />
      <ReferenceLine y={200} stroke="#cc0000" strokeDasharray="3 4" strokeOpacity={0.7} />
      <ReferenceLine y={300} stroke="#7a3590" strokeDasharray="3 4" strokeOpacity={0.7} />
    </>
  );
}

export default function ChartPanel({ view, history, monthly, liveAqi }: ChartPanelProps) {
  const hourly = useMemo(
    () =>
      (history?.hourly ?? []).map((h) => ({
        ...h,
        aqi: h.aqi ?? 0,
      })),
    [history]
  );

  const daily = useMemo(
    () =>
      (history?.daily ?? []).map((d) => ({
        ...d,
        meanAqi: d.meanAqi,
        pm25: d.pm25,
      })),
    [history]
  );

  const months = monthly?.months ?? [];

  if (view === "live") {
    return (
      <ResponsiveContainer width="100%" height={340}>
        <AreaChart data={hourly} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <defs>
            <linearGradient id="liveAqi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={AXIS}
            interval="preserveStartEnd"
            minTickGap={38}
            tickLine={false}
            tickFormatter={hourTick}
          />
          <YAxis tick={AXIS} width={44} tickLine={false} axisLine={false} />
          <Tooltip
            content={<TooltipBox unit=" AQI" />}
            labelFormatter={hourLabel}
          />
          <AqiBands />
          <Area
            type="monotone"
            dataKey="aqi"
            name="AQI"
            stroke="#0284c7"
            strokeWidth={2.4}
            fill="url(#liveAqi)"
            dot={false}
            activeDot={{ r: 4, fill: "#0284c7" }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (view === "daily") {
    return (
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={daily} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={AXIS}
            interval="preserveStartEnd"
            minTickGap={30}
            tickLine={false}
          />
          <YAxis yAxisId="left" tick={AXIS} width={44} tickLine={false} axisLine={false} />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={AXIS}
            width={48}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<TooltipBox />}
            labelFormatter={(l) => `Day ${l}`}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
          <AqiBands />
          <Bar
            yAxisId="right"
            dataKey="pm25"
            name="PM2.5 mean (µg/m³)"
            fill="#f97316"
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
            fillOpacity={0.8}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="meanAqi"
            name="Mean AQI"
            stroke="#dc2626"
            strokeWidth={2.4}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (view === "monthly") {
    return (
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={months} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} />
          <YAxis tick={AXIS} width={44} tickLine={false} axisLine={false} />
          <YAxis
            orientation="right"
            tick={AXIS}
            width={48}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<TooltipBox />} />
          <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
          <AqiBands />
          <Bar
            yAxisId="right"
            dataKey="pm25"
            name="PM2.5 mean (µg/m³)"
            fill="#fdba74"
            radius={[4, 4, 0, 0]}
            maxBarSize={34}
          />
          <Line
            type="monotone"
            dataKey="meanAqi"
            name="Monthly mean AQI"
            stroke="#dc2626"
            strokeWidth={2.6}
            dot={{ r: 3, fill: "#dc2626" }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="maxAqi"
            name="Monthly peak AQI"
            stroke="#7c3aed"
            strokeWidth={1.6}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (view === "hourOfDay") {
    const data = history?.hourOfDay ?? [];
    const mean = history?.stats?.meanAqi ?? 0;
    return (
      <ResponsiveContainer width="100%" height={340}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <defs>
            <linearGradient id="hourProfile" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} interval={1} />
          <YAxis tick={AXIS} width={44} tickLine={false} axisLine={false} />
          <Tooltip content={<TooltipBox unit=" AQI" />} />
          <AqiBands />
          <ReferenceLine
            y={mean}
            stroke="#0f172a"
            strokeDasharray="5 4"
            label={{ value: `mean ${mean}`, position: "right", fontSize: 10, fill: "#475569" }}
          />
          <Area
            type="monotone"
            dataKey="meanAqi"
            name="Mean AQI by hour"
            stroke="#7c3aed"
            strokeWidth={2.4}
            fill="url(#hourProfile)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (view === "dayOfWeek") {
    const data = (history?.dayOfWeek ?? []).filter((d) => d.samples > 0);
    return (
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="short" tick={AXIS} tickLine={false} />
          <YAxis tick={AXIS} width={44} tickLine={false} axisLine={false} />
          <Tooltip content={<TooltipBox unit=" AQI" />} />
          <AqiBands />
          <Bar dataKey="meanAqi" name="Mean AQI" radius={[6, 6, 0, 0]} maxBarSize={52}>
            {data.map((d) => (
              <Cell key={d.dow} fill={aqiCategory(d.meanAqi).color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (view === "dayParts") {
    const data = history?.dayParts ?? [];
    return (
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ ...AXIS, fontSize: 10 }} tickLine={false} />
          <YAxis tick={AXIS} width={44} tickLine={false} axisLine={false} />
          <Tooltip content={<TooltipBox unit=" AQI" />} />
          <AqiBands />
          <Bar dataKey="meanAqi" name="Mean AQI" radius={[6, 6, 0, 0]} maxBarSize={70}>
            {data.map((d) => (
              <Cell key={d.key} fill={aqiCategory(d.meanAqi).color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // pollutants
  const pollutantData = (history?.hourly ?? []).map((h) => ({
    label: h.label,
    pm25: h.pm25 ?? 0,
    pm10: h.pm10 ?? 0,
    no2: h.no2 ?? 0,
    so2: h.so2 ?? 0,
    o3: h.o3 ?? 0,
    co: h.co ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={pollutantData} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="label"
          tick={AXIS}
          interval="preserveStartEnd"
          minTickGap={38}
          tickLine={false}
          tickFormatter={hourTick}
        />
        <YAxis tick={AXIS} width={48} tickLine={false} axisLine={false} />
        <Tooltip content={<TooltipBox unit=" µg/m³" />} labelFormatter={hourLabel} />
        <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
        <Line type="monotone" dataKey="pm25" name="PM2.5" stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="pm10" name="PM10" stroke="#f59e0b" strokeWidth={1.8} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="no2" name="NO2" stroke="#0ea5e9" strokeWidth={1.6} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="so2" name="SO2" stroke="#8b5cf6" strokeWidth={1.4} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="o3" name="O3" stroke="#10b981" strokeWidth={1.4} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SectorDeficitChart({
  data,
}: {
  data: Array<{ label: string; deficit: number; color: string }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} />
        <YAxis type="category" dataKey="label" tick={{ ...AXIS, fontSize: 11 }} width={130} tickLine={false} />
        <Tooltip content={<TooltipBox unit=" tCO2e" />} />
        <Bar dataKey="deficit" name="Credit deficit" radius={[0, 5, 5, 0]} maxBarSize={26}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
