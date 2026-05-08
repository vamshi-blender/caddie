import { Suspense } from "react";
import DashboardChart from "@/components/DashboardChart";

function StatCard({ label, value, delta }: { label: string; value: string; delta: string }) {
  const positive = delta.startsWith("+");
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[#e8e3d9] bg-white px-5 py-4">
      <span className="text-xs font-medium uppercase tracking-wide text-[#9e9688]">{label}</span>
      <span className="text-2xl font-semibold text-[#3d3929]">{value}</span>
      <span
        className={`text-xs font-medium ${positive ? "text-[#5a7a52]" : "text-[#a05252]"}`}
      >
        {delta} vs last year
      </span>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#faf8f4] font-sans">
      <div className="mx-auto max-w-5xl px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[#3d3929]">Financial Overview</h1>
          <p className="mt-1 text-sm text-[#9e9688]">Revenue & expenses · Jan – Dec 2024</p>
        </div>

        {/* Stat cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Revenue" value="$818k" delta="+14.2%" />
          <StatCard label="Total Expenses" value="$540k" delta="+10.8%" />
          <StatCard label="Net Profit" value="$278k" delta="+19.6%" />
          <StatCard label="Profit Margin" value="34%" delta="+1.6pp" />
        </div>

        {/* Chart card */}
        <div className="rounded-xl border border-[#e8e3d9] bg-white px-6 py-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#3d3929]">Revenue vs Expenses</h2>
              <p className="text-xs text-[#9e9688]">Monthly breakdown</p>
            </div>
          </div>
          <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-[#f0ece4]" />}>
            <div className="h-72">
              <DashboardChart />
            </div>
          </Suspense>
        </div>
      </div>
    </div>
  );
}
