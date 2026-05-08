import { Suspense } from "react";
import ForceGraph from "@/components/ForceGraph";

const legend = [
  { label: "Platform", color: "#a78bfa" },
  { label: "Data", color: "#60a5fa" },
  { label: "Auth / Billing", color: "#34d399" },
  { label: "API / CDN", color: "#fb923c" },
  { label: "Workers / Cache", color: "#facc15" },
  { label: "Search / Notify", color: "#f472b6" },
];

export default function Test1Page() {
  return (
    <div className="min-h-screen bg-[#0b0f1a] font-sans flex flex-col">
      {/* Header */}
      <header className="px-8 py-6 border-b border-white/[.06]">
        <h1 className="text-xl font-semibold text-slate-100 tracking-tight">
          System Architecture
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Force-directed graph · drag nodes to explore
        </p>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph */}
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
            </div>
          }
        >
          <div className="flex-1">
            <ForceGraph />
          </div>
        </Suspense>

        {/* Sidebar */}
        <aside className="w-52 shrink-0 border-l border-white/[.06] px-5 py-6 flex flex-col gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3">
              Service Groups
            </p>
            <ul className="flex flex-col gap-2.5">
              {legend.map(({ label, color }) => (
                <li key={label} className="flex items-center gap-2.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
                  />
                  <span className="text-sm text-slate-400">{label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-auto">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3">
              Interactions
            </p>
            <ul className="flex flex-col gap-2 text-xs text-slate-500">
              <li>Hover node to highlight edges</li>
              <li>Drag nodes to rearrange</li>
              <li>Release to resume physics</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
