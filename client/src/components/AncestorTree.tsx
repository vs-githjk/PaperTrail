import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";

function normalizeGraphData(data) {
  const nodes = Array.isArray(data?.data?.nodes)
    ? data.data.nodes
    : Array.isArray(data?.nodes)
      ? data.nodes
      : [];

  const links = Array.isArray(data?.data?.links)
    ? data.data.links
    : Array.isArray(data?.links)
      ? data.links
      : [];

  if (!nodes.length) {
    return { nodes: [], links: [] };
  }

  const mappedNodes = nodes.map((node, index) => ({
    id: node.id ?? node.paperId ?? `node-${index}`,
    title: node.title || node.label || "Untitled paper",
    year: node.year || null,
    kind: index === 0 ? "seed" : "ancestor"
  }));

  const mappedLinks = links.map((edge) => ({
    source: typeof edge.source === "object" ? edge.source.id : edge.source,
    target: typeof edge.target === "object" ? edge.target.id : edge.target
  }));

  return {
    nodes: mappedNodes,
    links: mappedLinks
  };
}

export default function AncestorTree({ data }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(260);
  const [height] = useState(420);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect?.width) {
        setWidth(Math.max(220, Math.floor(entry.contentRect.width)));
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const graph = useMemo(() => normalizeGraphData(data), [data]);
  const hasGraph = graph.nodes.length > 0;
  const focalNode = hasGraph
    ? graph.nodes.find((node) => node.kind === "seed") || graph.nodes[0]
    : null;

  return (
    <div className="ancestor-tree-stack">
      <div ref={containerRef} className="ancestor-canvas-shell">
        {hasGraph ? (
          <ForceGraph2D
            width={width}
            height={height}
            graphData={graph}
            backgroundColor="#f1f4f6"
            cooldownTicks={120}
            nodeLabel={(node) => `${node.title}${node.year ? ` (${node.year})` : ""}`}
            linkColor={() => "#bcc5cf"}
            linkWidth={1}
            linkCurvature={0.14}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const radius = node.kind === "seed" ? 6.5 : 4;
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
              ctx.fillStyle = node.kind === "seed" ? "#455f88" : "#9faab5";
              ctx.fill();
              ctx.strokeStyle = "#f8f9fa";
              ctx.lineWidth = node.kind === "seed" ? 1.2 : 1;
              ctx.stroke();

              if (node.kind === "seed") {
                const fontSize = 11 / globalScale;
                ctx.font = `${fontSize}px Inter, sans-serif`;
                ctx.fillStyle = "#2b3437";
                ctx.fillText(node.title || "Seed", node.x + 10, node.y + 4);
              }
            }}
            onNodeClick={(node) => {
              // Placeholder for future "Promote to Seed" behavior.
              console.log("Ancestor node clicked:", node);
            }}
          />
        ) : (
          <div className="ancestor-tree-empty" style={{ minHeight: height }}>
            <p>Click a paper in the results to build its ancestor tree, or use &ldquo;Build Tree From Top Match&rdquo; after searching.</p>
          </div>
        )}
      </div>

      <div className="focus-node-card">
        <p className="meta-label">Current Focal Node</p>
        <p>{focalNode?.title || "No paper selected yet"}</p>
      </div>

      <div className="insight-card">
        <p className="insight-title">Knowledge Insight</p>
        <p>
          {hasGraph
            ? `${graph.links.length} related branches found in this lineage preview. Click a node to inspect its upstream context.`
            : "Lineage details will appear here once a tree is built from a paper."}
        </p>
      </div>
    </div>
  );
}
