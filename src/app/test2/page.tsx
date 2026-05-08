"use client";

import { useState, Suspense } from "react";
import dynamic from "next/dynamic";

const EChartsPanel = dynamic(() => import("@/components/charts/EChartsPanel"), { ssr: false });
const D3Panel      = dynamic(() => import("@/components/charts/D3Panel"),      { ssr: false });
const VegaPanel    = dynamic(() => import("@/components/charts/VegaPanel"),    { ssr: false });

const TABS = [
  { id: "echarts", label: "ECharts", count: 23, color: "#818cf8" },
  { id: "d3",      label: "D3.js",   count: 14, color: "#34d399" },
  { id: "vega",    label: "Vega-Lite",count: 12, color: "#fb923c" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Spinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 rounded-full border-2 border-slate-600 border-t-slate-300 animate-spin" />
    </div>
  );
}

export default function Test2Page() {
  const [tab, setTab] = useState<TabId>("echarts");

  return (
    <div className="min-h-screen bg-[#0b0f1a] font-sans text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0b0f1a]/90 backdrop-blur border-b border-white/[.06] px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight">Chart Gallery</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {TABS.reduce((a, t) => a + t.count, 0)} chart types across ECharts · D3.js · Vega-Lite
            </p>
          </div>
          {/* Tabs */}
          <nav className="flex gap-1 p-1 rounded-xl bg-white/[.04] border border-white/[.06]">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? "bg-white/[.08] text-white"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: t.color, boxShadow: tab === t.id ? `0 0 6px ${t.color}` : "none" }}
                />
                {t.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${tab === t.id ? "bg-white/10 text-slate-300" : "bg-white/[.04] text-slate-600"}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Suspense fallback={<Spinner />}>
          {tab === "echarts" && <EChartsPanel />}
          {tab === "d3"      && <D3Panel />}
          {tab === "vega"    && <VegaPanel />}
        </Suspense>
      </main>
    </div>
  );
}
