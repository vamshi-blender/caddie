import type { ChartSpec, ValueFormat } from "./spec";

// Charts follow the same Indian numbering convention the agent uses in prose
// (see the answer rules in lib/agents/caddie-agent.ts), so a value read off an
// axis matches the value written in the answer beside it.

const DEFAULT_CURRENCY = "INR";
const LAKH = 100_000;
const CRORE = 10_000_000;

function trimZeros(value: string): string {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/**
 * Compact Indian-system label for axis ticks, where horizontal space is the
 * binding constraint: 12,34,567 becomes "12.3L".
 */
export function compactIndian(value: number): string {
  const magnitude = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (magnitude >= CRORE) {
    return `${sign}${trimZeros((magnitude / CRORE).toFixed(2))}Cr`;
  }
  if (magnitude >= LAKH) {
    return `${sign}${trimZeros((magnitude / LAKH).toFixed(2))}L`;
  }
  if (magnitude >= 1_000) {
    return `${sign}${trimZeros((magnitude / 1_000).toFixed(1))}K`;
  }
  return `${sign}${trimZeros(magnitude.toFixed(2))}`;
}

/** Full-precision Indian grouping (12,34,567.89) for tooltips and the table. */
export function formatIndian(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits,
  }).format(value);
}

function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value ?? "";
  } catch {
    return "";
  }
}

export interface ChartFormatter {
  /** Short form for axis ticks and in-bar value labels. */
  compact(value: number): string;
  /** Full precision for tooltips and the table view. */
  full(value: number): string;
}

export function createFormatter(spec: ChartSpec): ChartFormatter {
  const format: ValueFormat = spec.valueFormat ?? "number";

  if (format === "percent") {
    return {
      compact: (value) => `${trimZeros(value.toFixed(1))}%`,
      full: (value) => `${formatIndian(value)}%`,
    };
  }

  if (format === "currency") {
    const symbol = currencySymbol(spec.currency ?? DEFAULT_CURRENCY);
    return {
      compact: (value) => `${symbol}${compactIndian(value)}`,
      full: (value) => `${symbol}${formatIndian(value)}`,
    };
  }

  return { compact: compactIndian, full: (value) => formatIndian(value) };
}
