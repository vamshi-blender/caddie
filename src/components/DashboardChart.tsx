"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { CallbackDataParams } from "echarts/types/dist/shared";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const data = {
  revenue: [42000, 38000, 55000, 61000, 49000, 72000, 68000, 80000, 74000, 91000, 85000, 103000],
  expenses: [30000, 28000, 35000, 40000, 33000, 48000, 45000, 52000, 49000, 58000, 55000, 67000],
};

export default function DashboardChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    chartRef.current = echarts.init(containerRef.current, undefined, { renderer: "svg" });

    const option: echarts.EChartsOption = {
      backgroundColor: "transparent",
      textStyle: {
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
        color: "#3d3929",
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#ffffff",
        borderColor: "#e8e3d9",
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: "#3d3929", fontSize: 13 },
        axisPointer: { type: "line", lineStyle: { color: "#d4c9b0", width: 1, type: "dashed" } },
        formatter: (raw) => {
          const params = (Array.isArray(raw) ? raw : [raw]) as CallbackDataParams[];
          const items = params
            .map(
              (p) =>
                `<div style="display:flex;align-items:center;gap:8px;margin:2px 0">
                  <span style="width:8px;height:8px;border-radius:50%;background:${p.color};display:inline-block"></span>
                  <span style="color:#6b6659">${p.seriesName}</span>
                  <span style="font-weight:600;margin-left:auto;padding-left:16px">$${Number(p.value).toLocaleString()}</span>
                </div>`
            )
            .join("");
          return `<div style="font-size:12px"><div style="font-weight:600;margin-bottom:6px;color:#3d3929">${params[0]?.name ?? ""}</div>${items}</div>`;
        },
      },
      legend: {
        data: ["Revenue", "Expenses"],
        top: 0,
        right: 0,
        itemWidth: 12,
        itemHeight: 12,
        borderRadius: 6,
        textStyle: { color: "#6b6659", fontSize: 13 },
        icon: "circle",
      },
      grid: { top: 40, right: 16, bottom: 48, left: 16, containLabel: true },
      xAxis: {
        type: "category",
        data: months,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#e8e3d9" } },
        axisTick: { show: false },
        axisLabel: { color: "#9e9688", fontSize: 12, margin: 12 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#f0ece4", type: "solid" } },
        axisLabel: {
          color: "#9e9688",
          fontSize: 12,
          formatter: (v: number) => `$${v / 1000}k`,
        },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          name: "Revenue",
          type: "line",
          data: data.revenue,
          smooth: 0.4,
          symbol: "circle",
          symbolSize: 6,
          showSymbol: false,
          emphasis: { scale: true, focus: "series" },
          lineStyle: { color: "#d4a843", width: 2.5 },
          itemStyle: { color: "#d4a843", borderColor: "#fff", borderWidth: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(212,168,67,0.18)" },
              { offset: 1, color: "rgba(212,168,67,0)" },
            ]),
          },
        },
        {
          name: "Expenses",
          type: "line",
          data: data.expenses,
          smooth: 0.4,
          symbol: "circle",
          symbolSize: 6,
          showSymbol: false,
          emphasis: { scale: true, focus: "series" },
          lineStyle: { color: "#8b7355", width: 2.5 },
          itemStyle: { color: "#8b7355", borderColor: "#fff", borderWidth: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(139,115,85,0.12)" },
              { offset: 1, color: "rgba(139,115,85,0)" },
            ]),
          },
        },
      ],
    };

    chartRef.current.setOption(option);

    const observer = new ResizeObserver(() => chartRef.current?.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chartRef.current?.dispose();
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
