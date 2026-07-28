"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ECharts } from "echarts/core";
import { createFormatter } from "@/lib/charts/format";
import { seriesColor, type ChartMode } from "@/lib/charts/palette";
import type { ChartSpec } from "@/lib/charts/spec";
import { buildBarOption } from "./buildBarOption";
import "./ChartCard.css";

// Height of the plot area. The card grows to fit the header and the toggle on
// top of this, so the x-axis band is never cut off into a nested scrollbar.
const PLOT_HEIGHT = 300;
const HORIZONTAL_ROW_HEIGHT = 34;
const HORIZONTAL_MIN_HEIGHT = 200;

function getChartMode(): ChartMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Horizontal bars need height proportional to their category count. */
function plotHeight(spec: ChartSpec): number {
  if (spec.orientation !== "horizontal") return PLOT_HEIGHT;
  const legendBand = spec.series.length > 1 ? 40 : 0;
  return Math.max(
    HORIZONTAL_MIN_HEIGHT,
    spec.categories.length * HORIZONTAL_ROW_HEIGHT + legendBand + 48,
  );
}

function ChartTable({ spec }: { spec: ChartSpec }) {
  const format = useMemo(() => createFormatter(spec), [spec]);
  const mode = getChartMode();

  return (
    <div className="chart-card-table-wrap">
      <table className="chart-card-table">
        <caption className="sr-only">{spec.title}</caption>
        <thead>
          <tr>
            <th scope="col">{spec.categoryAxisLabel ?? "Category"}</th>
            {spec.series.map((series, index) => (
              <th scope="col" key={series.name}>
                <span className="chart-card-table-heading">
                  {spec.series.length > 1 && (
                    <span
                      className="chart-card-swatch"
                      style={{ background: seriesColor(mode, index) }}
                      aria-hidden="true"
                    />
                  )}
                  {series.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.categories.map((category, categoryIndex) => (
            <tr key={category}>
              <th scope="row">{category}</th>
              {spec.series.map((series) => {
                const value = series.values[categoryIndex];
                return (
                  <td key={series.name}>
                    {value === null || value === undefined
                      ? "—"
                      : format.full(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartPlot({ spec, mode }: { spec: ChartSpec; mode: ChartMode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let observer: ResizeObserver | undefined;

    async function renderChart() {
      try {
        // Loaded on demand and tree-shaken to bar-only, so the chat bundle
        // does not carry ECharts until a chart actually appears.
        const [core, charts, components, renderers] = await Promise.all([
          import("echarts/core"),
          import("echarts/charts"),
          import("echarts/components"),
          import("echarts/renderers"),
        ]);
        if (disposed || !containerRef.current) return;

        core.use([
          charts.BarChart,
          components.GridComponent,
          components.TooltipComponent,
          components.LegendComponent,
          renderers.SVGRenderer,
        ]);

        const instance = core.init(containerRef.current, undefined, {
          renderer: "svg",
        });
        chartRef.current = instance;
        instance.setOption(buildBarOption(spec, mode));

        observer = new ResizeObserver(() => instance.resize());
        observer.observe(containerRef.current);
      } catch {
        if (!disposed) setFailed(true);
      }
    }

    void renderChart();

    return () => {
      disposed = true;
      observer?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [spec, mode]);

  if (failed) {
    return (
      <div className="chart-card-fallback">
        This chart could not be drawn. The values are in the table view.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="chart-card-plot"
      style={{ height: plotHeight(spec) }}
      role="img"
      aria-label={`${spec.title}. Bar chart. Switch to the table view for the underlying values.`}
    />
  );
}

export default function ChartCard({ spec }: { spec: ChartSpec }) {
  const [mode, setMode] = useState<ChartMode>(getChartMode);
  const [view, setView] = useState<"chart" | "table">("chart");

  useEffect(() => {
    const observer = new MutationObserver(() => setMode(getChartMode()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <figure className="chart-card">
      <div className="chart-card-header">
        <figcaption className="chart-card-titles">
          <span className="chart-card-title">{spec.title}</span>
          {spec.subtitle && (
            <span className="chart-card-subtitle">{spec.subtitle}</span>
          )}
        </figcaption>
        {/* The table view is the accessible twin: it is how every value stays
            reachable without relying on color or a hover tooltip. */}
        <div className="chart-card-views" role="group" aria-label="Chart view">
          <button
            type="button"
            className={`chart-card-view${view === "chart" ? " chart-card-view--active" : ""}`}
            aria-pressed={view === "chart"}
            onClick={() => setView("chart")}
          >
            Chart
          </button>
          <button
            type="button"
            className={`chart-card-view${view === "table" ? " chart-card-view--active" : ""}`}
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
          >
            Table
          </button>
        </div>
      </div>

      {view === "chart" ? (
        <ChartPlot spec={spec} mode={mode} />
      ) : (
        <ChartTable spec={spec} />
      )}
    </figure>
  );
}
