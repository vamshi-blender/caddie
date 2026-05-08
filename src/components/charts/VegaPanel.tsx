"use client";

import { useEffect, useRef } from "react";
import embed, { VisualizationSpec } from "vega-embed";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-[#1a1f2e] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[.06]">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</span>
      </div>
      <div className="flex-1 p-2 flex items-center justify-center">{children}</div>
    </div>
  );
}

const darkConfig = {
  background: "transparent",
  view: { stroke: "transparent" },
  axis: {
    domainColor: "#334155", gridColor: "#1e293b", tickColor: "#334155",
    labelColor: "#94a3b8", titleColor: "#94a3b8", labelFontSize: 10, titleFontSize: 11,
  },
  legend: { labelColor: "#94a3b8", titleColor: "#94a3b8", labelFontSize: 10 },
  title: { color: "#e2e8f0", fontSize: 12 },
  range: {
    category: ["#818cf8","#34d399","#fb923c","#f472b6","#38bdf8","#facc15","#a78bfa","#6ee7b7"],
    heatmap: ["#1e3a5f","#2563eb","#818cf8","#c4b5fd"],
    ramp: ["#1e293b","#818cf8"],
    diverging: ["#ef4444","#f8fafc","#22c55e"],
  },
};

function VegaChart({ spec, h = 240 }: { spec: VisualizationSpec; h?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let view: { finalize: () => void } | null = null;
    embed(ref.current, spec, {
      actions: false,
      config: darkConfig,
      renderer: "svg",
    }).then(r => { view = r.view; });
    return () => { view?.finalize(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={ref} style={{ width: "100%", maxHeight: h }} />;
}

// seeded random
function seeded(seed: number) {
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  return rng;
}

// ── data helpers ──────────────────────────────────────────────────────────────
const rng1 = seeded(42);
const normalSamples = (mean: number, sd: number, n: number, rng: () => number) =>
  Array.from({ length: n }, () => {
    let u = 0, v = 0;
    while (u === 0) u = rng(); while (v === 0) v = rng();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  });

const scatterData = Array.from({ length: 80 }, () => ({ x: rng1() * 100, y: rng1() * 100, cat: ["A","B","C"][Math.floor(rng1() * 3)] }));
const stripData = [
  ...normalSamples(40, 8, 40, seeded(10)).map(v => ({ group: "Q1", value: v })),
  ...normalSamples(55, 10, 40, seeded(11)).map(v => ({ group: "Q2", value: v })),
  ...normalSamples(48, 7, 40, seeded(12)).map(v => ({ group: "Q3", value: v })),
  ...normalSamples(65, 9, 40, seeded(13)).map(v => ({ group: "Q4", value: v })),
];
const errorData = [
  {x:"Mon",y:42,lo:35,hi:50},{x:"Tue",y:58,lo:50,hi:67},{x:"Wed",y:37,lo:30,hi:45},
  {x:"Thu",y:72,lo:65,hi:80},{x:"Fri",y:55,lo:46,hi:63},{x:"Sat",y:80,lo:71,hi:88},{x:"Sun",y:63,lo:55,hi:72}
];
const connectedScatterData = [
  {x:0,y:0,t:"Jan"},{x:10,y:20,t:"Feb"},{x:30,y:15,t:"Mar"},{x:25,y:40,t:"Apr"},
  {x:50,y:35,t:"May"},{x:45,y:60,t:"Jun"},{x:70,y:55,t:"Jul"},{x:65,y:80,t:"Aug"},
  {x:85,y:70,t:"Sep"},{x:80,y:90,t:"Oct"},{x:95,y:85,t:"Nov"},{x:100,y:100,t:"Dec"}
];
const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const horizonData = [
  ...months.map((m, i) => ({ month: m, series: "Alpha", value: 20 + Math.sin(i * 0.8) * 15 + seeded(20)() * 10 })),
  ...months.map((m, i) => ({ month: m, series: "Beta",  value: 30 + Math.cos(i * 0.7) * 12 + seeded(21)() * 10 })),
  ...months.map((m, i) => ({ month: m, series: "Gamma", value: 15 + Math.sin(i * 1.1) * 18 + seeded(22)() * 8  })),
];
const dotPlotData = [
  {label:"Node.js",value:88},{label:"Python",value:82},{label:"Go",value:76},
  {label:"Rust",value:71},{label:"TypeScript",value:94},{label:"Java",value:65},{label:"C#",value:70}
];

const rngSPLOM = seeded(30);
const splomData = Array.from({ length: 60 }, () => ({
  sepal_length: 4.5 + rngSPLOM() * 3.5,
  sepal_width:  2 + rngSPLOM() * 2.5,
  petal_length: 1 + rngSPLOM() * 5.5,
  species: ["setosa","versicolor","virginica"][Math.floor(rngSPLOM() * 3)]
}));

export default function VegaPanel() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

      {/* 1. Scatter */}
      <Card title="Scatter Plot">
        <VegaChart spec={{
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          data: { values: scatterData },
          mark: { type: "point", filled: true, size: 60, opacity: 0.7 },
          encoding: {
            x: { field: "x", type: "quantitative" },
            y: { field: "y", type: "quantitative" },
            color: { field: "cat", type: "nominal" },
          },
          width: "container", height: 200,
        }}/>
      </Card>

      {/* 2. Strip Plot */}
      <Card title="Strip Plot">
        <VegaChart spec={{
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          data: { values: stripData },
          mark: { type: "tick", thickness: 2, opacity: 0.6 },
          encoding: {
            x: { field: "value", type: "quantitative", title: "Value" },
            y: { field: "group", type: "nominal", title: null },
            color: { field: "group", type: "nominal", legend: null },
          },
          width: "container", height: 200,
        }}/>
      </Card>

      {/* 3. Error Bars */}
      <Card title="Error Bars">
        <VegaChart spec={{
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          data: { values: errorData },
          layer: [
            {
              mark: { type: "rule", strokeWidth: 2 },
              encoding: {
                x: { field: "x", type: "nominal" },
                y: { field: "lo", type: "quantitative", title: "Value" },
                y2: { field: "hi" },
                color: { value: "#818cf8" },
              }
            },
            {
              mark: { type: "point", filled: true, size: 60 },
              encoding: {
                x: { field: "x", type: "nominal" },
                y: { field: "y", type: "quantitative" },
                color: { value: "#34d399" },
              }
            }
          ],
          width: "container", height: 200,
        }}/>
      </Card>

      {/* 4. Connected Scatter */}
      <Card title="Connected Scatter">
        <VegaChart spec={{
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          data: { values: connectedScatterData },
          layer: [
            {
              mark: { type: "line", color: "#818cf8", strokeWidth: 1.5 },
              encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
                order: { field: "t", type: "nominal" },
              }
            },
            {
              mark: { type: "point", filled: true, size: 60, color: "#fb923c" },
              encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
              }
            },
            {
              mark: { type: "text", dy: -10, fontSize: 9, color: "#94a3b8" },
              encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
                text: { field: "t", type: "nominal" },
              }
            }
          ],
          width: "container", height: 200,
        }}/>
      </Card>

      {/* 5. Dot Plot */}
      <Card title="Dot Plot">
        <VegaChart spec={{
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          data: { values: dotPlotData },
          mark: { type: "point", filled: true, size: 100 },
          encoding: {
            x: { field: "value", type: "quantitative", scale: { domain: [50, 100] } },
            y: { field: "label", type: "nominal", sort: "-x", title: null },
            color: { field: "value", type: "quantitative", scale: { scheme: "purples" }, legend: null },
          },
          width: "container", height: 200,
        }}/>
      </Card>

      {/* 6. Horizon Chart (small multiples) */}
      <Card title="Horizon / Small Multiples">
        <VegaChart spec={{
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          data: { values: horizonData },
          mark: { type: "area", opacity: 0.7 },
          encoding: {
            x: { field: "month", type: "nominal", sort: months, axis: { labelAngle: -45, labelFontSize: 9 } },
            y: { field: "value", type: "quantitative", title: null },
            color: { field: "series", type: "nominal", legend: null },
            row: { field: "series", type: "nominal", header: { labelColor: "#94a3b8", labelFontSize: 11, title: null } },
          },
          width: "container", height: 60,
        }} h={280}/>
      </Card>

      {/* 7. Scatter Plot Matrix (SPLOM) */}
      <Card title="Scatter Matrix (SPLOM)">
        <VegaChart spec={{
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          data: { values: splomData },
          repeat: { row: ["sepal_length","sepal_width","petal_length"], column: ["petal_length","sepal_width","sepal_length"] },
          spec: {
            mark: { type: "point", filled: true, size: 20, opacity: 0.6 },
            encoding: {
              x: { field: { repeat: "column" }, type: "quantitative", axis: { labelFontSize: 8, title: null } },
              y: { field: { repeat: "row" }, type: "quantitative", axis: { labelFontSize: 8, title: null } },
              color: { field: "species", type: "nominal", legend: { labelFontSize: 9, symbolSize: 50 } },
            },
          },
          width: 70, height: 70,
        }} h={300}/>
      </Card>

      {/* 8. Heatmap (correlation matrix) */}
      <Card title="Correlation Heatmap">
        <VegaChart spec={{
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          data: { values: (() => {
            const fields = ["Rev","Exp","Margin","Units","Returns"];
            const rows: {x:string,y:string,v:number}[] = [];
            fields.forEach((a,i) => fields.forEach((b,j) => {
              rows.push({ x: a, y: b, v: i === j ? 1 : +(Math.cos((i + j) * 0.8) * 0.9).toFixed(2) });
            }));
            return rows;
          })() },
          mark: "rect",
          encoding: {
            x: { field: "x", type: "nominal", sort: null, title: null },
            y: { field: "y", type: "nominal", sort: null, title: null },
            color: { field: "v", type: "quantitative", scale: { scheme: "blueorange", domain: [-1, 1] }, legend: { labelFontSize: 9 } },
          },
          width: "container", height: 200,
        }}/>
      </Card>

      {/* 9. Bar + Mean Rule (layered) */}
      <Card title="Bar + Mean Annotation">
        <VegaChart spec={{
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          data: { values: [
            {cat:"A",v:42},{cat:"B",v:78},{cat:"C",v:55},{cat:"D",v:90},
            {cat:"E",v:33},{cat:"F",v:67},{cat:"G",v:81}
          ]},
          layer: [
            {
              mark: { type: "bar", color: "#6366f1", opacity: 0.8 },
              encoding: {
                x: { field: "cat", type: "nominal", title: null },
                y: { field: "v", type: "quantitative", title: "Value" },
              }
            },
            {
              mark: { type: "rule", color: "#f472b6", strokeWidth: 2, strokeDash: [6, 3] },
              encoding: {
                y: { aggregate: "mean", field: "v", type: "quantitative" },
              }
            }
          ],
          width: "container", height: 200,
        }}/>
      </Card>

      {/* 10. Stacked Bar 100% */}
      <Card title="100% Stacked Bar">
        <VegaChart spec={{
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          data: { values: [
            ...["Q1","Q2","Q3","Q4"].flatMap(q => [
              {quarter:q,cat:"Direct",value:seeded(q.charCodeAt(0))() * 40 + 10},
              {quarter:q,cat:"Email", value:seeded(q.charCodeAt(0)+1)() * 30 + 10},
              {quarter:q,cat:"Ads",   value:seeded(q.charCodeAt(0)+2)() * 20 + 5},
            ])
          ]},
          mark: "bar",
          encoding: {
            x: { field: "quarter", type: "nominal", title: null },
            y: { field: "value", type: "quantitative", stack: "normalize", axis: { format: "%" } },
            color: { field: "cat", type: "nominal" },
          },
          width: "container", height: 200,
        }}/>
      </Card>

      {/* 11. Multi-series Line */}
      <Card title="Multi-series Line">
        <VegaChart spec={{
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          data: { values: [
            ...months.flatMap((m, i) => [
              { month: m, series: "Revenue", value: 42 + i * 5 + seeded(50+i)() * 10 },
              { month: m, series: "Expenses", value: 30 + i * 3 + seeded(60+i)() * 8 },
              { month: m, series: "Profit", value: 12 + i * 2 + seeded(70+i)() * 6 },
            ])
          ]},
          mark: { type: "line", point: { filled: true, size: 40 } },
          encoding: {
            x: { field: "month", type: "nominal", sort: months },
            y: { field: "value", type: "quantitative" },
            color: { field: "series", type: "nominal" },
          },
          width: "container", height: 200,
        }}/>
      </Card>

      {/* 12. Boxplot (Vega-Lite native) */}
      <Card title="Boxplot (native)">
        <VegaChart spec={{
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          data: { values: stripData },
          mark: { type: "boxplot", extent: "min-max", median: { color: "#f472b6" } },
          encoding: {
            x: { field: "group", type: "nominal", title: null },
            y: { field: "value", type: "quantitative", title: "Value" },
            color: { field: "group", type: "nominal", legend: null },
          },
          width: "container", height: 200,
        }}/>
      </Card>

    </div>
  );
}
