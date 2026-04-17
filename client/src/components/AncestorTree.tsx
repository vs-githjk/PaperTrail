import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";

function normalizeGraphData(data) {
  const guide = data?.data?.meta?.guide || data?.meta?.guide || null;
  const stageMap = new Map();
  const reasonMap = new Map();
  const roleMap = new Map();

  if (guide && Array.isArray(guide.readingPlan)) {
    for (const section of guide.readingPlan) {
      for (const item of section.items || []) {
        stageMap.set(item.id, section.stage);
      }
    }
  }

  if (guide && Array.isArray(guide.recommendedOrder)) {
    guide.recommendedOrder.forEach((item, index) => {
      reasonMap.set(item.id, item.reason || "");
      roleMap.set(item.id, item.role || "");
      if (!stageMap.has(item.id)) {
        stageMap.set(item.id, index === 0 ? "start_here" : "optional_supporting");
      }
    });
  }

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
    kind: index === 0 ? "seed" : "ancestor",
    doi: node.doi || null,
    paperId: node.paperId || node.externalId || node.id || null,
    source: node.source || null,
    url: node.url || null,
    depth: Number.isFinite(Number(node.depth)) ? Number(node.depth) : index === 0 ? 0 : 1,
    citationCount: Number.isFinite(Number(node.citationCount)) ? Number(node.citationCount) : 0,
    influenceScore: Number.isFinite(Number(node.influenceScore)) ? Number(node.influenceScore) : 0,
    authors: Array.isArray(node.authors) ? node.authors : [],
    abstract: node.abstract || "",
    stage: stageMap.get(node.id) || (index === 0 ? "start_here" : "optional_supporting"),
    storyReason: reasonMap.get(node.id) || "",
    storyRole: roleMap.get(node.id) || null
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

function getStageColor(stage, isSeed = false) {
  if (isSeed) return "#39537c";
  switch (stage) {
    case "start_here":
      return "#5378b2";
    case "foundational_background":
      return "#4d6d63";
    case "broader_overview":
      return "#7b6aa7";
    default:
      return "#a6b3c2";
  }
}

function getNodeHref(node) {
  if (node?.url) return node.url;
  if (node?.doi) return `https://doi.org/${node.doi}`;
  if (node?.source === "arxiv" && node?.paperId) {
    return `https://arxiv.org/abs/${node.paperId}`;
  }
  if (node?.paperId) {
    return `https://www.semanticscholar.org/paper/${node.paperId}`;
  }
  return null;
}

function wrapLabel(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);

  lines.slice(0, 2).forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

export default function AncestorTree({ data, onNodeSelect, selectedNodeId }) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const [width, setWidth] = useState(260);
  const [height] = useState(560);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

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

  useEffect(() => {
    if (!hasGraph) {
      onNodeSelect?.(null);
      return;
    }

    const nextNode = graph.nodes.find((node) => node.id === selectedNodeId) || focalNode;
    onNodeSelect?.(nextNode || null);
  }, [graph, hasGraph, focalNode, onNodeSelect, selectedNodeId]);

  useEffect(() => {
    if (!graphRef.current || !hasGraph) return;
    const timer = setTimeout(() => {
      graphRef.current.zoomToFit(450, 80);
    }, 120);
    return () => clearTimeout(timer);
  }, [hasGraph, graph.nodes.length, graph.links.length]);

  return (
    <div className="ancestor-tree-stack">
      <div ref={containerRef} className="ancestor-canvas-shell">
        {hasGraph ? (
          <ForceGraph2D
            ref={graphRef}
            width={width}
            height={height}
            graphData={graph}
            backgroundColor="#f4f7fb"
            cooldownTicks={160}
            d3AlphaDecay={0.035}
            d3VelocityDecay={0.22}
            onNodeHover={(node) => setHoveredNodeId(node?.id || null)}
            nodeLabel={(node) => `${node.title}${node.year ? ` (${node.year})` : ""}`}
            linkColor={(link) => {
              const targetId = typeof link.target === "object" ? link.target.id : link.target;
              const sourceId = typeof link.source === "object" ? link.source.id : link.source;
              if (sourceId === selectedNodeId || targetId === selectedNodeId) {
                return "rgba(69, 95, 136, 0.55)";
              }
              return "rgba(160, 176, 192, 0.38)";
            }}
            linkWidth={(link) => {
              const sourceId = typeof link.source === "object" ? link.source.id : link.source;
              const targetId = typeof link.target === "object" ? link.target.id : link.target;
              return sourceId === selectedNodeId || targetId === selectedNodeId ? 1.8 : 1;
            }}
            linkCurvature={0.18}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const isSelected = node.id === selectedNodeId;
              const isHovered = node.id === hoveredNodeId;
              const radius = node.kind === "seed" ? 9 : node.depth >= 2 ? 4.5 : 6;

              if (isSelected) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius + 8, 0, 2 * Math.PI, false);
                ctx.fillStyle = "rgba(69, 95, 136, 0.12)";
                ctx.fill();
              }

              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
              ctx.fillStyle = isHovered && !isSelected
                ? "#7d95bb"
                : getStageColor(node.stage, node.kind === "seed");
              ctx.fill();
              ctx.strokeStyle = isSelected ? "#eaf1ff" : "#f8f9fa";
              ctx.lineWidth = isSelected ? 2.2 : node.kind === "seed" ? 1.2 : 1;
              ctx.stroke();

              if (node.kind === "seed" || isSelected || isHovered) {
                const fontSize = (node.kind === "seed" ? 13 : 11) / globalScale;
                const lineHeight = 13 / globalScale;
                const labelX = node.x + radius + 8;
                const labelY = node.y - (node.kind === "seed" ? lineHeight * 0.5 : 0);
                const labelWidth = 150 / globalScale;

                ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
                const textWidth = Math.min(labelWidth, Math.max(70 / globalScale, ctx.measureText(node.title || "Node").width + 16 / globalScale));
                const boxHeight = node.kind === "seed" || isSelected ? 30 / globalScale : 18 / globalScale;
                ctx.fillRect(labelX - 6 / globalScale, labelY - 10 / globalScale, textWidth + 12 / globalScale, boxHeight);

                ctx.font = `${fontSize}px Inter, sans-serif`;
                ctx.fillStyle = "#2b3437";
                wrapLabel(ctx, node.title || "Seed", labelX, labelY, labelWidth, lineHeight);

                if ((node.kind === "seed" || isSelected) && node.year) {
                  ctx.font = `${9 / globalScale}px Inter, sans-serif`;
                  ctx.fillStyle = "#6d7880";
                  ctx.fillText(String(node.year), labelX, labelY + lineHeight * 1.8);
                }
              }
            }}
            onNodeClick={(node) => {
              onNodeSelect?.(node);
            }}
            onNodeDragEnd={(node) => {
              node.fx = node.x;
              node.fy = node.y;
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
