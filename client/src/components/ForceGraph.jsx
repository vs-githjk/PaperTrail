import { useEffect, useRef } from "react";
import * as d3 from "d3";

function normalizeGraph(data) {
  if (!data) return { nodes: [], links: [] };

  const nodes = Array.isArray(data.nodes)
    ? data.nodes
    : Array.isArray(data.data?.nodes)
      ? data.data.nodes
      : [];

  const links = Array.isArray(data.links)
    ? data.links
    : Array.isArray(data.data?.links)
      ? data.data.links
      : [];

  return { nodes, links };
}

export default function ForceGraph({ data }) {
  const svgRef = useRef(null);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { nodes, links } = normalizeGraph(data);
    if (!nodes.length) return;

    const width = 900;
    const height = 520;

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(90)
      )
      .force("charge", d3.forceManyBody().strength(-240))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", "var(--pt-graph-link-stroke)")
      .attr("stroke-width", 1.2);

    const node = svg
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("r", 7)
      .attr("fill", "var(--pt-graph-node-fill)")
      .call(
        d3
          .drag()
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

    node.append("title").text((d) => d.title || d.label || d.id);

    const labels = svg
      .append("g")
      .selectAll("text")
      .data(nodes)
      .enter()
      .append("text")
      .text((d) => d.year ? `${d.title} (${d.year})` : (d.title || d.label || d.id))
      .attr("font-size", 11)
      .attr("fill", "var(--pt-graph-label-fill)")
      .attr("dx", 10)
      .attr("dy", 4);

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      labels.attr("x", (d) => d.x).attr("y", (d) => d.y);
    });

    return () => simulation.stop();
  }, [data]);

  return <svg ref={svgRef} width="900" height="520" aria-label="Ancestor graph" />;
}
