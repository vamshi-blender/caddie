import { tool } from "@openai/agents";
import { z } from "zod";
import { CHART_LIMITS, type ChartSpec } from "@/lib/charts/spec";
import type { CaddieRunContext } from "../caddie-agent";

// One chart per response keeps the answer focused and bounds the payload the
// stream has to carry.
export const MAX_CHARTS_PER_RESPONSE = 1;

const seriesSchema = z
  .object({
    name: z.string().trim().min(1).max(CHART_LIMITS.maxLabelLength),
    values: z
      .array(z.number().finite().nullable())
      .min(1)
      .max(CHART_LIMITS.maxCategories),
  })
  .strict();

// The union has one member today. Adding a chart type means adding a member
// here and to ChartSpec in lib/charts/spec.ts — the discriminator keeps the
// runtime schema and the compile-time type in step.
const barChartSchema = z
  .object({
    type: z.literal("bar"),
    title: z.string().trim().min(1).max(CHART_LIMITS.maxTitleLength),
    subtitle: z.string().trim().max(CHART_LIMITS.maxSubtitleLength).nullable(),
    categories: z
      .array(z.string().trim().min(1).max(CHART_LIMITS.maxLabelLength))
      .min(1)
      .max(CHART_LIMITS.maxCategories),
    series: z.array(seriesSchema).min(1).max(CHART_LIMITS.maxSeries),
    orientation: z.enum(["vertical", "horizontal"]).nullable(),
    grouping: z.enum(["grouped", "stacked", "stacked100"]).nullable(),
    categoryAxisLabel: z.string().trim().max(CHART_LIMITS.maxLabelLength).nullable(),
    valueAxisLabel: z.string().trim().max(CHART_LIMITS.maxLabelLength).nullable(),
    valueFormat: z.enum(["number", "percent", "currency"]).nullable(),
    currency: z.string().trim().length(3).nullable(),
    showValueLabels: z.boolean().nullable(),
  })
  .strict();

const chartParameters = z
  .object({
    chart: barChartSchema,
  })
  .strict();

/**
 * Strip the nulls the tool schema requires (the Responses API needs every
 * property present) down to the optional-field shape ChartSpec declares.
 */
function toChartSpec(chart: z.infer<typeof barChartSchema>): ChartSpec {
  return {
    type: "bar",
    title: chart.title,
    ...(chart.subtitle ? { subtitle: chart.subtitle } : {}),
    categories: chart.categories,
    series: chart.series,
    ...(chart.orientation ? { orientation: chart.orientation } : {}),
    ...(chart.grouping ? { grouping: chart.grouping } : {}),
    ...(chart.categoryAxisLabel
      ? { categoryAxisLabel: chart.categoryAxisLabel }
      : {}),
    ...(chart.valueAxisLabel ? { valueAxisLabel: chart.valueAxisLabel } : {}),
    ...(chart.valueFormat ? { valueFormat: chart.valueFormat } : {}),
    ...(chart.currency ? { currency: chart.currency } : {}),
    ...(chart.showValueLabels !== null
      ? { showValueLabels: chart.showValueLabels }
      : {}),
  };
}

export const renderChart = tool<typeof chartParameters, CaddieRunContext>({
  name: "render_chart",
  description:
    "Display a chart in the response, above the written answer. Use it when a visual comparison genuinely helps: comparing a measure across categories, or a trend across ordered time buckets. Only bar charts are supported. Every value must come from a query result, never from an estimate. Call this at most once per response, and still write the answer text: the chart supplements it and never replaces it.",
  parameters: chartParameters,
  isEnabled: ({ runContext }) =>
    runContext.context.chartsRendered < MAX_CHARTS_PER_RESPONSE,
  async execute({ chart }, runContext) {
    if (!runContext) {
      return JSON.stringify({
        ok: false,
        error: "The chart tool is missing its server context.",
      });
    }

    const context = runContext.context;
    if (context.chartsRendered >= MAX_CHARTS_PER_RESPONSE) {
      return JSON.stringify({
        ok: false,
        error: `Only ${MAX_CHARTS_PER_RESPONSE} chart can be shown per response.`,
      });
    }

    // A series whose length does not match the category axis would misalign
    // every bar past the mismatch, so reject it instead of rendering it wrong.
    const misaligned = chart.series.find(
      (series) => series.values.length !== chart.categories.length,
    );
    if (misaligned) {
      return JSON.stringify({
        ok: false,
        error: `Series "${misaligned.name}" has ${misaligned.values.length} values but there are ${chart.categories.length} categories. Every series needs exactly one value per category (use null for a genuine gap).`,
      });
    }

    const duplicateName = chart.series.find(
      (series, index) =>
        chart.series.findIndex(
          (candidate) => candidate.name === series.name,
        ) !== index,
    );
    if (duplicateName) {
      return JSON.stringify({
        ok: false,
        error: `Two series share the name "${duplicateName.name}". Series names are legend labels and must be unique.`,
      });
    }

    const spec = toChartSpec(chart);
    context.chartsRendered += 1;
    // The stream reads this off the context and emits it as a chart.rendered
    // event; the tool's own return value only tells the model what happened.
    context.charts.push(spec);

    return JSON.stringify({
      ok: true,
      message:
        "The chart is now displayed to the user. Write the answer text without repeating every plotted number.",
    });
  },
});
