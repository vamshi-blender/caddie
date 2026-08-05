"use client";

import "./ChartCard.css";

const PLACEHOLDER_BARS = [38, 62, 47, 78, 56, 88, 69];

export default function ChartPlaceholder() {
  return (
    <figure
      className="chart-card chart-card--placeholder"
      aria-busy="true"
      aria-label="Preparing chart"
    >
      <div className="chart-card-header" aria-hidden="true">
        <div className="chart-card-titles">
          <span className="chart-placeholder-line chart-placeholder-line--title" />
          <span className="chart-placeholder-line chart-placeholder-line--subtitle" />
        </div>
        <div className="chart-placeholder-toggle">
          <span />
          <span />
        </div>
      </div>

      <div className="chart-placeholder-plot" aria-hidden="true">
        <div className="chart-placeholder-grid" />
        <div className="chart-placeholder-bars">
          {PLACEHOLDER_BARS.map((height, index) => (
            <span
              key={`${height}-${index}`}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>
      <span className="sr-only">Preparing chart…</span>
    </figure>
  );
}
