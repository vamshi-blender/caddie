// Canonical chart contract shared by the agent tool (server) and the chart
// renderer (browser), mirroring how lib/agents/protocol.ts is imported by both
// sides instead of hand-duplicated.
//
// Extensibility: `ChartSpec` is a discriminated union on `type`. Bar is the
// only member today. To add a chart type later:
//   1. Add its spec interface and append it to the ChartSpec union.
//   2. Add a matching zod member to chartSpecSchema in
//      lib/agents/tools/render-chart.ts (the union keeps the tool schema and
//      this type in lockstep).
//   3. Add a renderer branch in components/chat/charts/ChartCard.tsx.
// Nothing else in the pipeline is chart-type aware — the stream event, the
// storage layer, and the message plumbing all carry ChartSpec opaquely.

export const CHART_TYPES = ["bar"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

/** Vertical columns (category on x) or horizontal bars (category on y). */
export type BarOrientation = "vertical" | "horizontal";

/**
 * How multiple series share a category slot.
 * - grouped: side-by-side bars, for comparing series against each other.
 * - stacked: absolute segments summing to a total.
 * - stacked100: segments normalized to a percentage of each category's total.
 */
export type BarGrouping = "grouped" | "stacked" | "stacked100";

/** Number formatting applied to axis ticks, tooltips, and value labels. */
export type ValueFormat = "number" | "percent" | "currency";

export interface ChartSeries {
  /** Legend label. Must be unique within a chart. */
  name: string;
  /**
   * One value per category, positionally aligned with `categories`.
   * `null` marks a genuine gap (no data) rather than zero.
   */
  values: (number | null)[];
}

export interface BarChartSpec {
  type: "bar";
  title: string;
  /** Optional context line under the title (units, filters, time range). */
  subtitle?: string;
  /** Category axis tick labels. */
  categories: string[];
  /** One entry for a single-measure chart; more for grouped/stacked. */
  series: ChartSeries[];
  orientation?: BarOrientation;
  /** Ignored for single-series charts. Defaults to "grouped". */
  grouping?: BarGrouping;
  /** Axis titles. Omit when the category names already say it. */
  categoryAxisLabel?: string;
  valueAxisLabel?: string;
  valueFormat?: ValueFormat;
  /** ISO 4217 code used when valueFormat is "currency". Defaults to INR. */
  currency?: string;
  /**
   * Print the value on each bar. Best on a single series with few categories;
   * the renderer suppresses labels that cannot fit their bar.
   */
  showValueLabels?: boolean;
}

export type ChartSpec = BarChartSpec;

/** Upper bounds shared by the tool schema and the runtime guard. */
export const CHART_LIMITS = {
  maxCategories: 60,
  /** Beyond 8 the categorical palette would have to cycle, which it never does. */
  maxSeries: 8,
  maxTitleLength: 120,
  maxSubtitleLength: 200,
  maxLabelLength: 80,
} as const;

/**
 * Structural guard for values crossing a trust boundary (restored from
 * storage, or replayed from a stream). The tool's zod schema validates the
 * model's output on the way in; this validates on the way back out.
 */
export function isChartSpec(value: unknown): value is ChartSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const spec = value as Partial<BarChartSpec>;
  if (spec.type !== "bar") return false;
  if (typeof spec.title !== "string") return false;
  if (!Array.isArray(spec.categories) || spec.categories.length === 0) {
    return false;
  }
  if (!spec.categories.every((category) => typeof category === "string")) {
    return false;
  }
  if (!Array.isArray(spec.series) || spec.series.length === 0) return false;
  if (spec.series.length > CHART_LIMITS.maxSeries) return false;

  return spec.series.every(
    (series) =>
      series &&
      typeof series === "object" &&
      typeof series.name === "string" &&
      Array.isArray(series.values) &&
      // A series shorter or longer than the category axis would silently
      // misalign every bar after the first mismatch.
      series.values.length === spec.categories!.length &&
      series.values.every(
        (value) =>
          value === null || (typeof value === "number" && Number.isFinite(value)),
      ),
  );
}
