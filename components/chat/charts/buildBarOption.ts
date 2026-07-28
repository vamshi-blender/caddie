import type { EChartsOption } from "echarts";
import { createFormatter } from "@/lib/charts/format";
import { CHART_INK, seriesColor, type ChartMode } from "@/lib/charts/palette";
import type { BarChartSpec } from "@/lib/charts/spec";

// Mark specs from the data-viz method: thin bars capped at 24px, a 4px rounded
// data-end squared at the baseline, hairline solid gridlines one step off the
// surface, and a 2px surface gap separating touching fills.
const MAX_BAR_WIDTH = 24;
const BAR_END_RADIUS = 4;
const STACK_GAP = 2;
// Past this many categories, rotated tick labels stop being legible.
const ROTATE_LABELS_ABOVE = 8;
const LONG_LABEL_CHARS = 12;

type BarRadius = [number, number, number, number];

/**
 * Rounded corners on the growth end only, so every bar stays visually anchored
 * to its baseline. In a stack only the outermost segment is rounded.
 */
function barRadius(
  horizontal: boolean,
  negative: boolean,
  rounded: boolean,
): BarRadius {
  if (!rounded) return [0, 0, 0, 0];
  const r = BAR_END_RADIUS;
  if (horizontal) {
    return negative ? [r, 0, 0, r] : [0, r, r, 0];
  }
  return negative ? [0, 0, r, r] : [r, r, 0, 0];
}

export function buildBarOption(
  spec: BarChartSpec,
  mode: ChartMode,
): EChartsOption {
  const ink = CHART_INK[mode];
  const format = createFormatter(spec);
  const horizontal = spec.orientation === "horizontal";
  const grouping = spec.series.length > 1 ? spec.grouping ?? "grouped" : "grouped";
  const stacked = grouping === "stacked" || grouping === "stacked100";
  const isPercentStack = grouping === "stacked100";
  // A legend restates the title when there is only one series.
  const showLegend = spec.series.length > 1;

  // stacked100 normalizes each category to 100%, so totals drive the maths.
  const categoryTotals = spec.categories.map((_, index) =>
    spec.series.reduce(
      (total, series) => total + Math.abs(series.values[index] ?? 0),
      0,
    ),
  );

  const displayValue = (raw: number | null, index: number): number | null => {
    if (raw === null) return null;
    if (!isPercentStack) return raw;
    const total = categoryTotals[index];
    return total === 0 ? null : (raw / total) * 100;
  };

  const percentFormat = { compact: (v: number) => `${v.toFixed(0)}%`, full: (v: number) => `${v.toFixed(1)}%` };
  const axisFormat = isPercentStack ? percentFormat : format;

  const longLabels = spec.categories.some(
    (category) => category.length > LONG_LABEL_CHARS,
  );
  const rotateLabels =
    !horizontal &&
    (spec.categories.length > ROTATE_LABELS_ABOVE || longLabels);

  const categoryAxis = {
    type: "category" as const,
    data: spec.categories,
    ...(spec.categoryAxisLabel
      ? {
          name: spec.categoryAxisLabel,
          nameLocation: "middle" as const,
          nameGap: rotateLabels ? 68 : 32,
          nameTextStyle: { color: ink.textSecondary, fontSize: 12 },
        }
      : {}),
    // Category axes get a visible baseline but never gridlines.
    axisLine: { show: true, lineStyle: { color: ink.baseline, width: 1 } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: {
      color: ink.axis,
      fontSize: 12,
      // Horizontal bars read top-down, which is the reverse of the y-axis's
      // natural bottom-up order, so the data is reversed to compensate.
      ...(horizontal ? {} : { rotate: rotateLabels ? 35 : 0 }),
      ...(rotateLabels ? { align: "right" as const } : {}),
      hideOverlap: true,
      // Category names on a horizontal chart get real room before truncating;
      // containLabel then reserves the width they actually use.
      width: horizontal ? 200 : undefined,
      overflow: horizontal ? ("truncate" as const) : undefined,
    },
  };

  const valueAxis = {
    type: "value" as const,
    ...(isPercentStack ? { max: 100 } : {}),
    ...(spec.valueAxisLabel
      ? {
          name: spec.valueAxisLabel,
          nameLocation: "middle" as const,
          nameGap: horizontal ? 32 : 52,
          nameTextStyle: { color: ink.textSecondary, fontSize: 12 },
        }
      : {}),
    axisLine: { show: false },
    axisTick: { show: false },
    // Hairline, solid, recessive — never dashed.
    splitLine: { show: true, lineStyle: { color: ink.gridline, width: 1, type: "solid" as const } },
    axisLabel: {
      color: ink.axis,
      fontSize: 12,
      formatter: (value: number) => axisFormat.compact(value),
    },
  };

  const series = spec.series.map((entry, seriesIndex) => {
    const color = seriesColor(mode, seriesIndex);
    const values = entry.values.map((value, index) =>
      displayValue(value, index),
    );
    // In a stack only the last segment carrying a value gets the rounded end.
    const topIndexPerCategory = spec.categories.map((_, categoryIndex) => {
      for (let i = spec.series.length - 1; i >= 0; i -= 1) {
        const value = spec.series[i].values[categoryIndex];
        if (value !== null && value !== 0) return i;
      }
      return -1;
    });

    return {
      name: entry.name,
      type: "bar" as const,
      // Set on the series, not only per-item: the legend swatch reads the
      // series color, so per-item-only colors leave the legend on the
      // ECharts default palette while the bars render correctly.
      color,
      ...(stacked ? { stack: "total" } : {}),
      barMaxWidth: MAX_BAR_WIDTH,
      // A 2px surface gap separates adjacent bars in a group; stacked segments
      // get theirs from the border below.
      ...(stacked ? {} : { barGap: "10%" as const }),
      barCategoryGap: "35%" as const,
      data: values.map((value, index) => ({
        value,
        itemStyle: {
          color,
          borderRadius: barRadius(
            horizontal,
            (value ?? 0) < 0,
            !stacked || topIndexPerCategory[index] === seriesIndex,
          ),
          // The gap is drawn in the surface color, never as a contrasting
          // stroke — a border would add ink that isn't data.
          ...(stacked
            ? { borderColor: ink.surface, borderWidth: STACK_GAP }
            : {}),
        },
      })),
      label: {
        show: Boolean(spec.showValueLabels) && !stacked,
        position: horizontal ? ("right" as const) : ("top" as const),
        color: ink.textSecondary,
        fontSize: 12,
        formatter: (params: { value: number | null }) =>
          params.value === null ? "" : axisFormat.compact(params.value),
      },
      emphasis: { focus: "series" as const },
    };
  });

  return {
    // The chart surface is transparent so the message bubble shows through.
    backgroundColor: "transparent",
    animationDuration: 400,
    grid: {
      top: showLegend ? 40 : 16,
      right: 20,
      bottom: rotateLabels ? 24 : 8,
      left: 8,
      containLabel: true,
    },
    ...(showLegend
      ? {
          legend: {
            type: "scroll" as const,
            top: 0,
            left: 0,
            itemWidth: 10,
            itemHeight: 10,
            itemGap: 16,
            icon: "roundRect",
            // Legend text wears a text token, never the series color.
            textStyle: { color: ink.textSecondary, fontSize: 12 },
            pageTextStyle: { color: ink.textSecondary },
            pageIconColor: ink.axis,
            pageIconInactiveColor: ink.gridline,
          },
        }
      : {}),
    tooltip: {
      trigger: "axis" as const,
      axisPointer: {
        type: "shadow" as const,
        shadowStyle: {
          color: mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
        },
      },
      backgroundColor: ink.tooltipSurface,
      borderColor: ink.tooltipBorder,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: ink.textPrimary, fontSize: 13 },
      extraCssText: "border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.12);",
      formatter: (params: unknown) => {
        const points = Array.isArray(params) ? params : [params];
        if (points.length === 0) return "";
        const first = points[0] as { axisValueLabel?: string; name?: string };
        const heading = first.axisValueLabel ?? first.name ?? "";
        const rows = points
          .map((point) => {
            const entry = point as {
              seriesName?: string;
              value?: number | null;
              color?: string;
              seriesIndex?: number;
            };
            if (entry.value === null || entry.value === undefined) return "";
            // Show the true value in the tooltip; a 100% stack's axis is
            // normalized but the underlying number is what the user asked for.
            const raw =
              isPercentStack && typeof entry.seriesIndex === "number"
                ? spec.series[entry.seriesIndex]?.values[
                    spec.categories.indexOf(heading)
                  ]
                : entry.value;
            const shown =
              isPercentStack && typeof raw === "number"
                ? `${format.full(raw)} (${percentFormat.full(entry.value)})`
                : format.full(entry.value);
            const swatch = `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${entry.color};margin-right:6px;"></span>`;
            const label = showLegend
              ? `${swatch}${escapeHtml(entry.seriesName ?? "")}: `
              : swatch;
            return `<div style="display:flex;align-items:center;gap:4px;margin-top:2px;">${label}<strong>${escapeHtml(shown)}</strong></div>`;
          })
          .filter(Boolean)
          .join("");
        return `<div style="font-weight:600;">${escapeHtml(heading)}</div>${rows}`;
      },
    },
    // Horizontal bars put the category on y and reverse it so the first
    // category sits at the top, matching reading order.
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? { ...categoryAxis, inverse: true } : valueAxis,
    series,
  } as EChartsOption;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
