"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-[#1a1f2e] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[.06]">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</span>
      </div>
      <div className="flex-1 p-2">{children}</div>
    </div>
  );
}

const DARK = { bg: "#1a1f2e", text: "#94a3b8", grid: "#1e293b", accent: "#818cf8" };
const H = 220;

// ── seeded random so charts are stable on re-render ──────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── Histogram ────────────────────────────────────────────────────────────────
function Histogram() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const rng = mulberry32(1);
    const data = Array.from({ length: 300 }, () => {
      let u = 0, v = 0;
      while (u === 0) u = rng();
      while (v === 0) v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 15 + 50;
    });
    const svg = d3.select(ref.current!);
    svg.selectAll("*").remove();
    const W = ref.current!.clientWidth || 340;
    const m = { t: 10, r: 12, b: 30, l: 36 };
    const w = W - m.l - m.r, h = H - m.t - m.b;
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const x = d3.scaleLinear().domain([0, 100]).range([0, w]);
    const bins = d3.bin().domain(x.domain() as [number,number]).thresholds(20)(data);
    const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)!]).range([h, 0]);
    g.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(8)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("line").attr("stroke", DARK.grid); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 10); });
    g.append("g").call(d3.axisLeft(y).ticks(4)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("line").attr("stroke", DARK.grid); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 10); });
    g.selectAll("rect").data(bins).join("rect")
      .attr("x", d => x(d.x0!) + 1).attr("width", d => Math.max(0, x(d.x1!) - x(d.x0!) - 2))
      .attr("y", d => y(d.length)).attr("height", d => h - y(d.length))
      .attr("fill", "#818cf8").attr("opacity", 0.85);
  }, []);
  return <svg ref={ref} width="100%" height={H} />;
}

// ── Box Plot ──────────────────────────────────────────────────────────────────
function BoxPlot() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const rng = mulberry32(2);
    const groups = ["Q1","Q2","Q3","Q4"];
    const datasets = groups.map(() =>
      Array.from({ length: 60 }, () => {
        let u = 0, v = 0;
        while (u === 0) u = rng(); while (v === 0) v = rng();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 12 + 50;
      }).sort(d3.ascending)
    );
    const stats = datasets.map(d => ({
      q1: d3.quantile(d, 0.25)!,
      median: d3.quantile(d, 0.5)!,
      q3: d3.quantile(d, 0.75)!,
      min: d[0], max: d[d.length - 1]
    }));
    const svg = d3.select(ref.current!);
    svg.selectAll("*").remove();
    const W = ref.current!.clientWidth || 340;
    const m = { t: 10, r: 12, b: 30, l: 36 };
    const w = W - m.l - m.r, h = H - m.t - m.b;
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const x = d3.scaleBand().domain(groups).range([0, w]).padding(0.4);
    const y = d3.scaleLinear().domain([10, 90]).range([h, 0]);
    g.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 11); });
    g.append("g").call(d3.axisLeft(y).ticks(5)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("line").attr("stroke", DARK.grid); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 10); });
    const colors = ["#818cf8","#34d399","#fb923c","#f472b6"];
    stats.forEach((s, i) => {
      const cx = x(groups[i])! + x.bandwidth() / 2;
      const bw = x.bandwidth();
      const col = colors[i];
      g.append("line").attr("x1", cx).attr("x2", cx).attr("y1", y(s.min)).attr("y2", y(s.max)).attr("stroke", col).attr("stroke-width", 1.5).attr("stroke-dasharray", "3,2");
      g.append("rect").attr("x", x(groups[i])!).attr("width", bw).attr("y", y(s.q3)).attr("height", y(s.q1) - y(s.q3)).attr("fill", col).attr("fill-opacity", 0.25).attr("stroke", col).attr("stroke-width", 1.5);
      g.append("line").attr("x1", x(groups[i])!).attr("x2", x(groups[i])! + bw).attr("y1", y(s.median)).attr("y2", y(s.median)).attr("stroke", col).attr("stroke-width", 2.5);
      [[s.min],[s.max]].forEach(([v]) => g.append("line").attr("x1", cx - bw * 0.3).attr("x2", cx + bw * 0.3).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", col).attr("stroke-width", 1.5));
    });
  }, []);
  return <svg ref={ref} width="100%" height={H} />;
}

// ── Violin Plot ───────────────────────────────────────────────────────────────
function ViolinPlot() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const rng = mulberry32(3);
    const groups = ["A","B","C"];
    const datasets = groups.map(() =>
      Array.from({ length: 80 }, () => {
        let u = 0, v = 0;
        while (u === 0) u = rng(); while (v === 0) v = rng();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 10 + 50;
      })
    );
    const svg = d3.select(ref.current!);
    svg.selectAll("*").remove();
    const W = ref.current!.clientWidth || 340;
    const m = { t: 10, r: 12, b: 30, l: 36 };
    const w = W - m.l - m.r, h = H - m.t - m.b;
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const x = d3.scaleBand().domain(groups).range([0, w]).padding(0.3);
    const y = d3.scaleLinear().domain([10, 90]).range([h, 0]);
    g.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 11); });
    g.append("g").call(d3.axisLeft(y).ticks(5)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("line").attr("stroke", DARK.grid); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 10); });
    const colors = ["#818cf8","#34d399","#fb923c"];
    datasets.forEach((data, i) => {
      const bw = x.bandwidth();
      const kde = (kernel: (v: number) => number, thresholds: number[], vals: number[]) =>
        thresholds.map(t => [t, d3.mean(vals, v => kernel(t - v))!] as [number, number]);
      const epanechnikov = (bw2: number) => (v: number) => Math.abs(v /= bw2) <= 1 ? 0.75 * (1 - v * v) / bw2 : 0;
      const thresholds = d3.range(10, 91, 2);
      const density = kde(epanechnikov(7), thresholds, data);
      const maxDensity = d3.max(density, d => d[1])!;
      const xViol = d3.scaleLinear().domain([-maxDensity, maxDensity]).range([0, bw]);
      const area = d3.area<[number, number]>()
        .x0(d => xViol(-d[1])).x1(d => xViol(d[1]))
        .y(d => y(d[0])).curve(d3.curveCatmullRom);
      g.append("path")
        .datum(density)
        .attr("transform", `translate(${x(groups[i])!},0)`)
        .attr("d", area)
        .attr("fill", colors[i]).attr("fill-opacity", 0.4)
        .attr("stroke", colors[i]).attr("stroke-width", 1.5);
    });
  }, []);
  return <svg ref={ref} width="100%" height={H} />;
}

// ── Chord Diagram ─────────────────────────────────────────────────────────────
function ChordDiagram() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const matrix = [
      [0, 12, 8, 5],
      [9, 0, 15, 3],
      [6, 11, 0, 14],
      [4, 7, 10, 0],
    ];
    const names = ["North","South","East","West"];
    const colors = ["#818cf8","#34d399","#fb923c","#f472b6"];
    const svg = d3.select(ref.current!);
    svg.selectAll("*").remove();
    const W = ref.current!.clientWidth || 340;
    const size = Math.min(W, H);
    const r = size / 2 - 30;
    const g = svg.attr("width", W).attr("height", H)
      .append("g").attr("transform", `translate(${W/2},${H/2})`);
    const chord = d3.chord().padAngle(0.04).sortSubgroups(d3.descending);
    const chords = chord(matrix);
    const arc = d3.arc<d3.ChordGroup>().innerRadius(r - 16).outerRadius(r);
    const ribbon = d3.ribbon<d3.Chord, d3.ChordSubgroup>().radius(r - 16);
    g.append("g").selectAll("g").data(chords.groups).join("g")
      .call(g2 => {
        g2.append("path").attr("d", arc).attr("fill", d => colors[d.index]).attr("stroke", d => d3.color(colors[d.index])!.darker().toString()).attr("opacity", 0.85);
        g2.append("text")
          .each(d => { (d as d3.ChordGroup & { angle: number }).angle = (d.startAngle + d.endAngle) / 2; })
          .attr("transform", (d: d3.ChordGroup & { angle?: number }) => `rotate(${((d.angle ?? 0) * 180 / Math.PI - 90)}) translate(${r + 4}) ${(d.angle ?? 0) > Math.PI ? "rotate(180)" : ""}`)
          .attr("text-anchor", (d: d3.ChordGroup & { angle?: number }) => (d.angle ?? 0) > Math.PI ? "end" : "start")
          .attr("fill", DARK.text).attr("font-size", 11)
          .text(d => names[d.index]);
      });
    g.append("g").attr("fill-opacity", 0.45)
      .selectAll("path").data(chords).join("path")
      .attr("d", ribbon as unknown as (d: d3.Chord) => string)
      .attr("fill", d => colors[d.source.index])
      .attr("stroke", d => d3.color(colors[d.source.index])!.darker().toString());
  }, []);
  return <svg ref={ref} width="100%" height={H} />;
}

// ── Streamgraph ───────────────────────────────────────────────────────────────
function Streamgraph() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const rng = mulberry32(4);
    const keys = ["Alpha","Beta","Gamma","Delta","Epsilon"];
    const n = 20;
    const data = Array.from({ length: n }, (_, i) => {
      const row: Record<string, number> = { x: i };
      keys.forEach(k => { row[k] = Math.max(0, rng() * 80 + 20 + Math.sin(i * 0.5) * 20); });
      return row;
    });
    const svg = d3.select(ref.current!);
    svg.selectAll("*").remove();
    const W = ref.current!.clientWidth || 340;
    const m = { t: 10, r: 12, b: 24, l: 12 };
    const w = W - m.l - m.r, h = H - m.t - m.b;
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const x = d3.scaleLinear().domain([0, n - 1]).range([0, w]);
    const stack = d3.stack<Record<string,number>>().keys(keys).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut);
    const series = stack(data);
    const y = d3.scaleLinear().domain([d3.min(series, l => d3.min(l, d => d[0]))!, d3.max(series, l => d3.max(l, d => d[1]))!]).range([h, 0]);
    const colors = ["#818cf8","#34d399","#fb923c","#f472b6","#38bdf8"];
    const area = d3.area<d3.SeriesPoint<Record<string,number>>>().x(d => x(d.data.x)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveCatmullRom);
    g.selectAll("path").data(series).join("path")
      .attr("d", area).attr("fill", (_, i) => colors[i % colors.length]).attr("opacity", 0.8);
    g.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(5)).call(a => { a.select(".domain").remove(); a.selectAll("line").remove(); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 10); });
  }, []);
  return <svg ref={ref} width="100%" height={H} />;
}

// ── Bump Chart ────────────────────────────────────────────────────────────────
function BumpChart() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const teams = ["Alpha","Beta","Gamma","Delta","Epsilon"];
    const rounds = [1,2,3,4,5,6];
    const rankings: Record<string, number[]> = {
      Alpha:   [1,2,1,3,2,1],
      Beta:    [3,1,3,1,4,3],
      Gamma:   [2,3,2,2,1,2],
      Delta:   [5,4,5,4,3,4],
      Epsilon: [4,5,4,5,5,5],
    };
    const colors = ["#818cf8","#34d399","#fb923c","#f472b6","#facc15"];
    const svg = d3.select(ref.current!);
    svg.selectAll("*").remove();
    const W = ref.current!.clientWidth || 340;
    const m = { t: 16, r: 60, b: 24, l: 60 };
    const w = W - m.l - m.r, h = H - m.t - m.b;
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const x = d3.scalePoint().domain(rounds.map(String)).range([0, w]).padding(0.2);
    const y = d3.scalePoint().domain(["1","2","3","4","5"]).range([0, h]).padding(0.3);
    g.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).tickFormat(d => `R${d}`)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 10); });
    g.append("g").call(d3.axisLeft(y).tickFormat(d => `#${d}`)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 10); });
    teams.forEach((t, i) => {
      const pts = rounds.map((r, j) => ({ x: x(String(r))!, y: y(String(rankings[t][j]))! }));
      const line = d3.line<{x:number,y:number}>().x(d => d.x).y(d => d.y).curve(d3.curveBumpX);
      g.append("path").datum(pts).attr("d", line).attr("fill","none").attr("stroke", colors[i]).attr("stroke-width", 2.5).attr("opacity", 0.85);
      g.selectAll(`.dot-${i}`).data(pts).join("circle").attr("class", `dot-${i}`).attr("cx", d => d.x).attr("cy", d => d.y).attr("r", 5).attr("fill", colors[i]).attr("stroke","#1a1f2e").attr("stroke-width", 2);
      g.append("text").attr("x", pts[pts.length-1].x + 8).attr("y", pts[pts.length-1].y + 4).attr("fill", colors[i]).attr("font-size", 11).text(t);
    });
  }, []);
  return <svg ref={ref} width="100%" height={H} />;
}

// ── Lollipop Chart ────────────────────────────────────────────────────────────
function LollipopChart() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const data = [
      {label:"TypeScript",value:90},{label:"Rust",value:85},{label:"Go",value:80},
      {label:"Python",value:75},{label:"Swift",value:70},{label:"Kotlin",value:65},{label:"Java",value:58}
    ];
    const svg = d3.select(ref.current!);
    svg.selectAll("*").remove();
    const W = ref.current!.clientWidth || 340;
    const m = { t: 10, r: 16, b: 30, l: 80 };
    const w = W - m.l - m.r, h = H - m.t - m.b;
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const x = d3.scaleLinear().domain([0, 100]).range([0, w]);
    const y = d3.scaleBand().domain(data.map(d => d.label)).range([0, h]).padding(0.4);
    g.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(5)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("line").attr("stroke", DARK.grid); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 10); });
    g.append("g").call(d3.axisLeft(y)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("line").remove(); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 11); });
    g.selectAll(".lol-line").data(data).join("line").attr("class","lol-line")
      .attr("x1", 0).attr("x2", d => x(d.value))
      .attr("y1", d => y(d.label)! + y.bandwidth() / 2).attr("y2", d => y(d.label)! + y.bandwidth() / 2)
      .attr("stroke","#334155").attr("stroke-width", 2);
    g.selectAll(".lol-dot").data(data).join("circle").attr("class","lol-dot")
      .attr("cx", d => x(d.value)).attr("cy", d => y(d.label)! + y.bandwidth() / 2)
      .attr("r", 7).attr("fill","#818cf8").attr("stroke","#1a1f2e").attr("stroke-width", 2);
  }, []);
  return <svg ref={ref} width="100%" height={H} />;
}

// ── Beeswarm Plot ─────────────────────────────────────────────────────────────
function BeeswarmPlot() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const rng = mulberry32(5);
    interface BeeNode extends d3.SimulationNodeDatum { value: number; group: number; }
    const data: BeeNode[] = Array.from({ length: 120 }, () => ({
      value: rng() * 100,
      group: Math.floor(rng() * 3)
    }));
    const colors = ["#818cf8","#34d399","#fb923c"];
    const svg = d3.select(ref.current!);
    svg.selectAll("*").remove();
    const W = ref.current!.clientWidth || 340;
    const m = { t: 20, r: 12, b: 30, l: 36 };
    const w = W - m.l - m.r, h = H - m.t - m.b;
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const x = d3.scaleLinear().domain([0, 100]).range([0, w]);
    const y = d3.scaleOrdinal<number, number>().domain([0,1,2]).range([h*0.2, h*0.5, h*0.8]);
    g.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(6)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("line").attr("stroke", DARK.grid); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 10); });
    ["Alpha","Beta","Gamma"].forEach((label, i) => {
      g.append("text").attr("x", -8).attr("y", y(i)).attr("text-anchor","end").attr("dominant-baseline","middle").attr("fill", colors[i]).attr("font-size", 11).text(label);
    });
    const sim = d3.forceSimulation<BeeNode>(data)
      .force("x", d3.forceX<BeeNode>(d => x(d.value)).strength(1))
      .force("y", d3.forceY<BeeNode>(d => y(d.group)).strength(0.6))
      .force("collide", d3.forceCollide<BeeNode>(5))
      .stop();
    for (let i = 0; i < 120; i++) sim.tick();
    g.selectAll("circle").data(data).join("circle")
      .attr("cx", d => d.x ?? 0)
      .attr("cy", d => d.y ?? 0)
      .attr("r", 4).attr("fill", d => colors[d.group]).attr("opacity", 0.75).attr("stroke","#1a1f2e").attr("stroke-width", 0.5);
  }, []);
  return <svg ref={ref} width="100%" height={H} />;
}

// ── Arc Diagram ───────────────────────────────────────────────────────────────
function ArcDiagram() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const nodes = ["Alice","Bob","Carol","Dave","Eve","Frank","Grace","Heidi"];
    const links = [{s:0,t:1},{s:0,t:2},{s:1,t:3},{s:2,t:3},{s:3,t:4},{s:4,t:5},{s:5,t:6},{s:6,t:7},{s:2,t:6},{s:1,t:5},{s:0,t:7}];
    const svg = d3.select(ref.current!);
    svg.selectAll("*").remove();
    const W = ref.current!.clientWidth || 340;
    const m = { t: 10, r: 20, b: 30, l: 20 };
    const w = W - m.l - m.r;
    const cy = H * 0.55;
    const g = svg.append("g").attr("transform", `translate(${m.l},0)`);
    const x = d3.scalePoint().domain(nodes).range([0, w]).padding(0.1);
    const colors = d3.schemeTableau10;
    links.forEach((l) => {
      const x1 = x(nodes[l.s])!, x2 = x(nodes[l.t])!;
      const mid = (x1 + x2) / 2;
      const rad = Math.abs(x2 - x1) / 2;
      g.append("path").attr("d", `M ${x1} ${cy} A ${rad} ${rad} 0 0 1 ${x2} ${cy}`).attr("fill","none").attr("stroke","#4f46e5").attr("stroke-width", 1.5).attr("opacity", 0.5);
      void mid;
    });
    nodes.forEach((n, i) => {
      g.append("circle").attr("cx", x(n)!).attr("cy", cy).attr("r", 7).attr("fill", colors[i % 10]).attr("stroke","#1a1f2e").attr("stroke-width", 2);
      g.append("text").attr("x", x(n)!).attr("y", cy + 20).attr("text-anchor","middle").attr("fill", DARK.text).attr("font-size", 10).text(n);
    });
  }, []);
  return <svg ref={ref} width="100%" height={H} />;
}

// ── Circle Packing ────────────────────────────────────────────────────────────
function CirclePacking() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const data = {
      name:"root",children:[
        {name:"Frontend",children:[{name:"React",value:30},{name:"Vue",value:18},{name:"Svelte",value:12},{name:"Angular",value:20}]},
        {name:"Backend",children:[{name:"Node",value:25},{name:"Django",value:15},{name:"Rails",value:10},{name:"FastAPI",value:14}]},
        {name:"Mobile",children:[{name:"Flutter",value:22},{name:"RN",value:18},{name:"Swift",value:12}]},
        {name:"Data",children:[{name:"Pandas",value:16},{name:"Spark",value:20},{name:"dbt",value:10}]},
      ]
    };
    const svg = d3.select(ref.current!);
    svg.selectAll("*").remove();
    const W = ref.current!.clientWidth || 340;
    const size = Math.min(W, H) - 4;
    const root = d3.pack<typeof data>().size([size, size]).padding(4)(
      d3.hierarchy(data).sum(d => (d as {value?:number}).value ?? 0).sort((a,b) => (b.value ?? 0) - (a.value ?? 0))
    );
    const g = svg.append("g").attr("transform", `translate(${(W - size) / 2 + 2},2)`);
    const color = d3.scaleOrdinal(["#818cf8","#34d399","#fb923c","#f472b6"]);
    const node = g.selectAll("g").data(root.descendants()).join("g").attr("transform", d => `translate(${d.x},${d.y})`);
    node.append("circle")
      .attr("r", d => d.r)
      .attr("fill", d => d.children ? color(d.data.name) : d3.color(color((d.parent?.data.name ?? "")))!.brighter(0.5).toString())
      .attr("fill-opacity", d => d.depth === 0 ? 0 : d.children ? 0.2 : 0.6)
      .attr("stroke", d => d.children ? color(d.data.name) : "none")
      .attr("stroke-width", 1.5);
    node.filter(d => !d.children && d.r > 10).append("text")
      .attr("text-anchor","middle").attr("dominant-baseline","middle")
      .attr("fill","#e2e8f0").attr("font-size", d => Math.min(d.r * 0.5, 11))
      .text(d => d.data.name);
  }, []);
  return <svg ref={ref} width="100%" height={H} />;
}

// ── Dumbbell Chart ────────────────────────────────────────────────────────────
function DumbbellChart() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const data = [
      {label:"TypeScript",before:60,after:90},{label:"Go",before:55,after:80},
      {label:"Rust",before:40,after:85},{label:"Python",before:70,after:75},
      {label:"Java",before:65,after:68},{label:"C++",before:50,after:72}
    ];
    const svg = d3.select(ref.current!);
    svg.selectAll("*").remove();
    const W = ref.current!.clientWidth || 340;
    const m = { t: 10, r: 16, b: 30, l: 80 };
    const w = W - m.l - m.r, h = H - m.t - m.b;
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const x = d3.scaleLinear().domain([30, 100]).range([0, w]);
    const y = d3.scaleBand().domain(data.map(d => d.label)).range([0, h]).padding(0.45);
    g.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(5)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("line").attr("stroke", DARK.grid); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 10); });
    g.append("g").call(d3.axisLeft(y)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("line").remove(); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 11); });
    data.forEach(d => {
      const cy = y(d.label)! + y.bandwidth() / 2;
      g.append("line").attr("x1", x(d.before)).attr("x2", x(d.after)).attr("y1", cy).attr("y2", cy).attr("stroke","#334155").attr("stroke-width", 2);
      g.append("circle").attr("cx", x(d.before)).attr("cy", cy).attr("r", 6).attr("fill","#f472b6").attr("stroke","#1a1f2e").attr("stroke-width", 2);
      g.append("circle").attr("cx", x(d.after)).attr("cy", cy).attr("r", 6).attr("fill","#34d399").attr("stroke","#1a1f2e").attr("stroke-width", 2);
    });
  }, []);
  return <svg ref={ref} width="100%" height={H} />;
}

// ── Slope Chart ───────────────────────────────────────────────────────────────
function SlopeChart() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const data = [
      {label:"Product A",v1:42,v2:78},{label:"Product B",v1:70,v2:55},
      {label:"Product C",v1:35,v2:90},{label:"Product D",v1:60,v2:62},{label:"Product E",v1:80,v2:40}
    ];
    const colors = ["#818cf8","#34d399","#fb923c","#f472b6","#facc15"];
    const svg = d3.select(ref.current!);
    svg.selectAll("*").remove();
    const W = ref.current!.clientWidth || 340;
    const m = { t: 20, r: 70, b: 20, l: 70 };
    const w = W - m.l - m.r, h = H - m.t - m.b;
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const y = d3.scaleLinear().domain([20, 100]).range([h, 0]);
    ["2022","2023"].forEach((yr, i) => {
      g.append("line").attr("x1", i * w).attr("x2", i * w).attr("y1", 0).attr("y2", h).attr("stroke", DARK.grid).attr("stroke-width", 1);
      g.append("text").attr("x", i * w).attr("y", -8).attr("text-anchor","middle").attr("fill", DARK.text).attr("font-size", 11).text(yr);
    });
    data.forEach((d, i) => {
      g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y(d.v1)).attr("y2", y(d.v2)).attr("stroke", colors[i]).attr("stroke-width", 2).attr("opacity", 0.85);
      g.append("circle").attr("cx", 0).attr("cy", y(d.v1)).attr("r", 5).attr("fill", colors[i]);
      g.append("circle").attr("cx", w).attr("cy", y(d.v2)).attr("r", 5).attr("fill", colors[i]);
      g.append("text").attr("x", -8).attr("y", y(d.v1) + 4).attr("text-anchor","end").attr("fill", colors[i]).attr("font-size", 10).text(d.label);
      g.append("text").attr("x", w + 8).attr("y", y(d.v2) + 4).attr("fill", colors[i]).attr("font-size", 10).text(d.label);
    });
  }, []);
  return <svg ref={ref} width="100%" height={H} />;
}

// ── Dendrogram ────────────────────────────────────────────────────────────────
function Dendrogram() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const data = {name:"Root",children:[
      {name:"Mammals",children:[{name:"Dogs",children:[{name:"Lab"},{name:"Poodle"}]},{name:"Cats",children:[{name:"Tabby"},{name:"Siamese"}]}]},
      {name:"Birds",children:[{name:"Raptors",children:[{name:"Eagle"},{name:"Hawk"}]},{name:"Song",children:[{name:"Robin"},{name:"Finch"}]}]},
      {name:"Reptiles",children:[{name:"Lizards"},{name:"Snakes"}]}
    ]};
    const svg = d3.select(ref.current!);
    svg.selectAll("*").remove();
    const W = ref.current!.clientWidth || 340;
    const m = { t: 10, r: 60, b: 10, l: 16 };
    const w = W - m.l - m.r, h = H - m.t - m.b;
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const root = d3.cluster<typeof data>().size([h, w])(d3.hierarchy(data));
    type PNode = d3.HierarchyPointNode<typeof data>;
    g.selectAll(".link").data(root.links()).join("path").attr("class","link")
      .attr("d", (l) => {
        const s = l.source as PNode, t = l.target as PNode;
        return `M${s.y},${s.x}C${(s.y+t.y)/2},${s.x} ${(s.y+t.y)/2},${t.x} ${t.y},${t.x}`;
      })
      .attr("fill","none").attr("stroke","#334155").attr("stroke-width", 1.5);
    const node = g.selectAll(".node").data(root.descendants() as PNode[]).join("g").attr("class","node")
      .attr("transform", (d) => `translate(${d.y},${d.x})`);
    node.append("circle").attr("r", 4).attr("fill", d => d.children ? "#818cf8" : "#34d399").attr("stroke","#1a1f2e").attr("stroke-width", 2);
    node.append("text").attr("dy","0.31em").attr("x", d => d.children ? -8 : 8).attr("text-anchor", d => d.children ? "end" : "start").attr("fill", DARK.text).attr("font-size", 10).text(d => d.data.name);
  }, []);
  return <svg ref={ref} width="100%" height={H} />;
}

// ── Scatter with Regression ───────────────────────────────────────────────────
function ScatterRegression() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const rng = mulberry32(6);
    const data = Array.from({ length: 60 }, () => {
      const x = rng() * 100;
      return { x, y: x * 0.7 + rng() * 30 - 5 };
    });
    const svg = d3.select(ref.current!);
    svg.selectAll("*").remove();
    const W = ref.current!.clientWidth || 340;
    const m = { t: 10, r: 16, b: 30, l: 36 };
    const w = W - m.l - m.r, h = H - m.t - m.b;
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    const x = d3.scaleLinear().domain([0, 100]).range([0, w]);
    const y = d3.scaleLinear().domain([0, 100]).range([h, 0]);
    g.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(x).ticks(5)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("line").attr("stroke", DARK.grid); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 10); });
    g.append("g").call(d3.axisLeft(y).ticks(5)).call(a => { a.select(".domain").attr("stroke", DARK.grid); a.selectAll("line").attr("stroke", DARK.grid); a.selectAll("text").attr("fill", DARK.text).attr("font-size", 10); });
    // linear regression
    const n = data.length;
    const mx = d3.mean(data, d => d.x)!, my = d3.mean(data, d => d.y)!;
    const slope = d3.sum(data, d => (d.x - mx) * (d.y - my)) / d3.sum(data, d => (d.x - mx) ** 2);
    const intercept = my - slope * mx;
    g.append("line").attr("x1", x(0)).attr("y1", y(intercept)).attr("x2", x(100)).attr("y2", y(slope * 100 + intercept)).attr("stroke","#f472b6").attr("stroke-width", 2).attr("stroke-dasharray","6,3");
    void n;
    g.selectAll("circle").data(data).join("circle").attr("cx", d => x(d.x)).attr("cy", d => y(d.y)).attr("r", 4).attr("fill","#818cf8").attr("opacity", 0.65);
  }, []);
  return <svg ref={ref} width="100%" height={H} />;
}

export default function D3Panel() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <Card title="Histogram"><Histogram /></Card>
      <Card title="Box Plot"><BoxPlot /></Card>
      <Card title="Violin Plot"><ViolinPlot /></Card>
      <Card title="Chord Diagram"><ChordDiagram /></Card>
      <Card title="Streamgraph"><Streamgraph /></Card>
      <Card title="Bump Chart (Rankings)"><BumpChart /></Card>
      <Card title="Lollipop Chart"><LollipopChart /></Card>
      <Card title="Beeswarm Plot"><BeeswarmPlot /></Card>
      <Card title="Arc Diagram"><ArcDiagram /></Card>
      <Card title="Circle Packing"><CirclePacking /></Card>
      <Card title="Dumbbell Chart"><DumbbellChart /></Card>
      <Card title="Slope Chart"><SlopeChart /></Card>
      <Card title="Dendrogram"><Dendrogram /></Card>
      <Card title="Scatter + Regression"><ScatterRegression /></Card>
    </div>
  );
}
