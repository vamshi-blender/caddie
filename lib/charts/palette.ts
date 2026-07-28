// Categorical chart palette.
//
// These eight hues are a fixed, validated ORDER, not a pool: slot 1 is always
// the first series, slot 2 the second, and so on. The ordering is the
// colorblind-safety mechanism (adjacent slots are the pairs a reader compares),
// so do not reorder, cycle, or generate a 9th hue — CHART_LIMITS.maxSeries
// caps series at 8 for exactly this reason.
//
// Validated against this app's real surfaces (light --surface-canvas #fcfcfc,
// dark #000000) rather than generic defaults:
//   light: lightness band PASS, chroma floor PASS, worst adjacent CVD ΔE 9.1,
//          worst adjacent normal-vision ΔE 19.6, contrast WARN on aqua/yellow/
//          magenta (< 3:1) — discharged by the built-in table view.
//   dark:  every check PASS, worst adjacent CVD ΔE 8.4, contrast all >= 3:1.
// Re-run scripts/validate_palette.js from the dataviz skill if these change.

export const CHART_SERIES_COLORS = {
  light: [
    "#2a78d6", // blue
    "#eb6834", // orange
    "#1baf7a", // aqua
    "#eda100", // yellow
    "#e87ba4", // magenta
    "#008300", // green
    "#4a3aa7", // violet
    "#e34948", // red
  ],
  dark: [
    "#3987e5",
    "#d95926",
    "#199e70",
    "#c98500",
    "#d55181",
    "#008300",
    "#9085e9",
    "#e66767",
  ],
} as const;

/** Chart chrome. Ink stays in text tokens; marks carry the series color. */
export const CHART_INK = {
  light: {
    surface: "#fcfcfc",
    textPrimary: "#0d0d0d",
    textSecondary: "#5d5d5d",
    axis: "#8e8e8e",
    gridline: "#e1e0d9",
    baseline: "#c3c2b7",
    tooltipSurface: "#ffffff",
    tooltipBorder: "rgba(0, 0, 0, 0.1)",
  },
  dark: {
    surface: "#000000",
    textPrimary: "#ffffff",
    textSecondary: "#b4b4b4",
    axis: "#8e8e8e",
    gridline: "#2c2c2a",
    baseline: "#383835",
    tooltipSurface: "#212121",
    tooltipBorder: "rgba(255, 255, 255, 0.12)",
  },
} as const;

export type ChartMode = keyof typeof CHART_SERIES_COLORS;

/**
 * Color for series `index`. Colors follow the entity's position in the spec,
 * never its rank, so re-sorting or filtering never repaints the survivors.
 */
export function seriesColor(mode: ChartMode, index: number): string {
  const colors = CHART_SERIES_COLORS[mode];
  return colors[index % colors.length];
}
