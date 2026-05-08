"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface Node extends d3.SimulationNodeDatum {
  id: string;
  group: number;
  radius: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  value: number;
}

const palette = ["#a78bfa", "#60a5fa", "#34d399", "#f472b6", "#fb923c", "#facc15"];

const nodes: Node[] = [
  { id: "Core", group: 0, radius: 28 },
  { id: "Data", group: 1, radius: 20 },
  { id: "Auth", group: 2, radius: 20 },
  { id: "API", group: 3, radius: 20 },
  { id: "Cache", group: 4, radius: 16 },
  { id: "Queue", group: 1, radius: 16 },
  { id: "Search", group: 5, radius: 16 },
  { id: "Metrics", group: 0, radius: 14 },
  { id: "Logs", group: 0, radius: 14 },
  { id: "Storage", group: 1, radius: 14 },
  { id: "CDN", group: 3, radius: 14 },
  { id: "Workers", group: 4, radius: 14 },
  { id: "Mail", group: 2, radius: 12 },
  { id: "Notify", group: 5, radius: 12 },
  { id: "Billing", group: 2, radius: 12 },
  { id: "Reports", group: 5, radius: 12 },
];

const links: Link[] = [
  { source: "Core", target: "Data", value: 3 },
  { source: "Core", target: "Auth", value: 3 },
  { source: "Core", target: "API", value: 3 },
  { source: "Core", target: "Queue", value: 2 },
  { source: "Core", target: "Metrics", value: 2 },
  { source: "Core", target: "Logs", value: 2 },
  { source: "Data", target: "Cache", value: 2 },
  { source: "Data", target: "Storage", value: 2 },
  { source: "Data", target: "Queue", value: 1 },
  { source: "API", target: "CDN", value: 2 },
  { source: "API", target: "Search", value: 2 },
  { source: "API", target: "Cache", value: 1 },
  { source: "Auth", target: "Mail", value: 1 },
  { source: "Auth", target: "Billing", value: 2 },
  { source: "Queue", target: "Workers", value: 2 },
  { source: "Workers", target: "Mail", value: 1 },
  { source: "Workers", target: "Notify", value: 1 },
  { source: "Search", target: "Reports", value: 1 },
  { source: "Metrics", target: "Reports", value: 1 },
  { source: "Logs", target: "Reports", value: 1 },
  { source: "Billing", target: "Notify", value: 1 },
];

export default function ForceGraph() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const { width, height } = el.getBoundingClientRect();
    const W = width || 800;
    const H = height || 600;

    const svg = d3.select(el);
    svg.selectAll("*").remove();

    // Defs: glow filter + arrow marker
    const defs = svg.append("defs");

    defs
      .append("filter")
      .attr("id", "glow")
      .call((f) => {
        f.append("feGaussianBlur").attr("stdDeviation", "3.5").attr("result", "blur");
        const merge = f.append("feMerge");
        merge.append("feMergeNode").attr("in", "blur");
        merge.append("feMergeNode").attr("in", "SourceGraphic");
      });

    defs
      .append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", 8)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .attr("fill", "#475569");

    // Subtle grid
    const gridG = svg.append("g").attr("opacity", 0.07);
    const gridStep = 40;
    for (let x = 0; x < W; x += gridStep)
      gridG.append("line").attr("x1", x).attr("y1", 0).attr("x2", x).attr("y2", H).attr("stroke", "#94a3b8").attr("stroke-width", 0.5);
    for (let y = 0; y < H; y += gridStep)
      gridG.append("line").attr("x1", 0).attr("y1", y).attr("x2", W).attr("y2", y).attr("stroke", "#94a3b8").attr("stroke-width", 0.5);

    const nodesCopy: Node[] = nodes.map((n) => ({ ...n, x: W / 2, y: H / 2 }));
    const linksCopy: Link[] = links.map((l) => ({ ...l }));

    const simulation = d3
      .forceSimulation<Node>(nodesCopy)
      .force(
        "link",
        d3
          .forceLink<Node, Link>(linksCopy)
          .id((d) => d.id)
          .distance((d) => 80 + (d.value ?? 1) * 20)
          .strength(0.6)
      )
      .force("charge", d3.forceManyBody().strength(-320))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide<Node>().radius((d) => d.radius + 10));

    // Links
    const linkG = svg.append("g");
    const linkSel = linkG
      .selectAll<SVGLineElement, Link>("line")
      .data(linksCopy)
      .join("line")
      .attr("stroke", "#334155")
      .attr("stroke-width", (d) => Math.sqrt(d.value ?? 1) * 1.2)
      .attr("marker-end", "url(#arrow)")
      .attr("opacity", 0.7);

    // Node groups
    const nodeG = svg.append("g");
    const nodeSel = nodeG
      .selectAll<SVGGElement, Node>("g")
      .data(nodesCopy)
      .join("g")
      .attr("cursor", "grab")
      .call(
        d3
          .drag<SVGGElement, Node>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Outer glow ring
    nodeSel
      .append("circle")
      .attr("r", (d) => d.radius + 6)
      .attr("fill", "none")
      .attr("stroke", (d) => palette[d.group % palette.length])
      .attr("stroke-width", 1)
      .attr("opacity", 0.25)
      .attr("filter", "url(#glow)");

    // Main circle
    nodeSel
      .append("circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => {
        const c = palette[d.group % palette.length];
        return d3
          .color(c)!
          .copy({ opacity: 0.15 })
          .formatRgb();
      })
      .attr("stroke", (d) => palette[d.group % palette.length])
      .attr("stroke-width", 1.5)
      .attr("filter", "url(#glow)")
      .on("mouseover", function (_, d) {
        d3.select(this).transition().duration(150).attr("r", d.radius + 4).attr("stroke-width", 2.5);
        // Highlight connected links
        linkSel
          .transition()
          .duration(150)
          .attr("opacity", (l) => {
            const s = l.source as Node;
            const t = l.target as Node;
            return s.id === d.id || t.id === d.id ? 1 : 0.1;
          })
          .attr("stroke", (l) => {
            const s = l.source as Node;
            const t = l.target as Node;
            return s.id === d.id || t.id === d.id ? palette[d.group % palette.length] : "#334155";
          });
      })
      .on("mouseout", function (_, d) {
        d3.select(this).transition().duration(150).attr("r", d.radius).attr("stroke-width", 1.5);
        linkSel.transition().duration(150).attr("opacity", 0.7).attr("stroke", "#334155");
      });

    // Labels
    nodeSel
      .append("text")
      .text((d) => d.id)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#e2e8f0")
      .attr("font-size", (d) => Math.max(9, d.radius * 0.55))
      .attr("font-family", "var(--font-geist-sans), system-ui, sans-serif")
      .attr("font-weight", "500")
      .attr("pointer-events", "none")
      .attr("user-select", "none");

    simulation.on("tick", () => {
      linkSel
        .attr("x1", (d) => (d.source as Node).x!)
        .attr("y1", (d) => (d.source as Node).y!)
        .attr("x2", (d) => {
          const s = d.source as Node;
          const t = d.target as Node;
          const dx = t.x! - s.x!;
          const dy = t.y! - s.y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          return t.x! - (dx / dist) * (t.radius + 10);
        })
        .attr("y2", (d) => {
          const s = d.source as Node;
          const t = d.target as Node;
          const dx = t.x! - s.x!;
          const dy = t.y! - s.y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          return t.y! - (dy / dist) * (t.radius + 10);
        });

      nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, []);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      style={{ display: "block" }}
    />
  );
}
