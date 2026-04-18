import { useEffect, useMemo, useRef, useState } from "react";

function normalizeGraphData(data) {
  const guide = data?.data?.meta?.guide || data?.meta?.guide || null;
  const stageMap = new Map();
  const reasonMap = new Map();
  const roleMap = new Map();
  const routeIndexMap = new Map();

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
      routeIndexMap.set(item.id, index);
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
    storyRole: roleMap.get(node.id) || null,
    routeIndex: index === 0 ? -1 : routeIndexMap.has(node.id) ? routeIndexMap.get(node.id) : null
  }));

  const mappedLinks = links.map((edge) => ({
    source: typeof edge.source === "object" ? edge.source.id : edge.source,
    target: typeof edge.target === "object" ? edge.target.id : edge.target,
    kind: "citation"
  }));

  return {
    nodes: mappedNodes,
    links: buildLineageLinks(mappedNodes, mappedLinks, guide)
  };
}

function buildLineageLinks(nodes, rawLinks, guide) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const rootNode = nodes.find((node) => node.kind === "seed") || nodes[0] || null;
  if (!rootNode) return rawLinks;

  const recommendedIds = Array.isArray(guide?.recommendedOrder)
    ? guide.recommendedOrder
      .map((item) => item.id)
      .filter((id) => id && id !== rootNode.id && byId.has(id))
    : [];

  const uniqueRecommendedIds = [...new Set(recommendedIds)];
  const attachedIds = new Set([rootNode.id]);
  const nextLinks = [];
  const seenPairs = new Set();

  const pushLink = (source, target, kind = "lineage") => {
    if (!source || !target || source === target) return;
    const key = `${source}->${target}`;
    if (seenPairs.has(key)) return;
    seenPairs.add(key);
    nextLinks.push({ source, target, kind });
    attachedIds.add(target);
  };

  if (uniqueRecommendedIds.length > 0) {
    for (let index = 1; index < uniqueRecommendedIds.length; index += 1) {
      pushLink(uniqueRecommendedIds[index - 1], uniqueRecommendedIds[index], "lineage");
    }
    pushLink(uniqueRecommendedIds[uniqueRecommendedIds.length - 1], rootNode.id, "lineage");
  }

  for (const node of nodes) {
    if (node.id === rootNode.id || attachedIds.has(node.id)) continue;

    const rawParent = rawLinks.find((link) => link.target === node.id && byId.has(link.source) && attachedIds.has(link.source));
    if (rawParent) {
      pushLink(rawParent.source, node.id, "context");
      continue;
    }

    const candidates = [...attachedIds]
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((left, right) => {
        const depthDelta = (right.depth || 0) - (left.depth || 0);
        if (depthDelta !== 0) return depthDelta;
        return (right.year || 0) - (left.year || 0);
      });

    const stageMatched = candidates.find((candidate) => (candidate.depth || 0) < (node.depth || 0));
    pushLink((stageMatched || byId.get(uniqueRecommendedIds[uniqueRecommendedIds.length - 1]) || rootNode).id, node.id, "context");
  }

  return nextLinks.length > 0 ? nextLinks : rawLinks;
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

function getRouteBadge(node) {
  if (!node) return null;
  if (node.kind === "seed") return "S";
  if (Number.isInteger(node.routeIndex) && node.routeIndex >= 0) return String(node.routeIndex + 1);
  return null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildTreeLayout(graph, width, height) {
  const rootNode = graph.nodes.find((node) => node.kind === "seed") || graph.nodes[0] || null;
  if (!rootNode) return { cards: [], edges: [] };

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const routeNodes = graph.nodes
    .filter((node) => Number.isInteger(node.routeIndex) && node.routeIndex >= 0)
    .sort((left, right) => left.routeIndex - right.routeIndex);
  const trunk = [...routeNodes, rootNode];

  const trunkIds = new Set(trunk.map((node) => node.id));
  const parentMap = new Map();
  for (const link of graph.links) {
    parentMap.set(link.target, { source: link.source, kind: link.kind });
  }

  const cards = [];
  const positions = new Map();
  const safeWidth = Math.max(width, 320);
  const topPadding = 28;
  const bottomPadding = 36;
  const centerX = safeWidth / 2;
  const trunkGap = clamp((height - topPadding - bottomPadding) / Math.max(trunk.length - 1, 1), 96, 132);

  const addCard = (node, x, y, variant = "context") => {
    const dims = variant === "seed"
      ? { width: clamp(safeWidth * 0.34, 190, 320), height: 84 }
      : variant === "route"
        ? { width: clamp(safeWidth * 0.28, 170, 268), height: 72 }
        : { width: clamp(safeWidth * 0.24, 150, 220), height: 58 };

    const card = {
      ...node,
      variant,
      x,
      y,
      width: dims.width,
      height: dims.height
    };
    cards.push(card);
    positions.set(node.id, card);
    return card;
  };

  trunk.forEach((node, index) => {
    const isSeed = node.id === rootNode.id;
    const routeLean = isSeed ? 0 : (index % 2 === 0 ? -18 : 18);
    addCard(node, centerX + routeLean, topPadding + index * trunkGap, isSeed ? "seed" : "route");
  });

  const contextByParent = new Map();
  for (const node of graph.nodes) {
    if (trunkIds.has(node.id)) continue;
    const parentId = parentMap.get(node.id)?.source || rootNode.id;
    if (!contextByParent.has(parentId)) contextByParent.set(parentId, []);
    contextByParent.get(parentId).push(node);
  }

  for (const [parentId, items] of contextByParent.entries()) {
    const parentCard = positions.get(parentId);
    if (!parentCard) continue;

    items.forEach((node, index) => {
      const side = index % 2 === 0 ? -1 : 1;
      const branchRank = Math.floor(index / 2);
      const xOffset = clamp(safeWidth * 0.21, 96, 190) + branchRank * clamp(safeWidth * 0.08, 32, 68);
      const yOffset = branchRank * 18;
      const branchBaseY = parentCard.y + (parentCard.variant === "seed" ? -26 : 10) + yOffset;
      const x = clamp(parentCard.x + side * xOffset, 120, safeWidth - 120);
      const y = clamp(branchBaseY, topPadding + 30, height - 70);
      addCard(node, x, y, "context");
    });
  }

  const edges = graph.links
    .map((link) => {
      const source = positions.get(link.source);
      const target = positions.get(link.target);
      if (!source || !target) return null;
      return { ...link, source, target };
    })
    .filter(Boolean);

  return { cards, edges };
}

function linkPath(edge) {
  const source = edge.source;
  const target = edge.target;
  const sourceBottomY = source.y + source.height / 2;
  const targetTopY = target.y - target.height / 2;
  const startX = source.x;
  const startY = sourceBottomY;
  const endX = target.x;
  const endY = targetTopY;
  const midY = startY + (endY - startY) * 0.52;
  const controlSpread = Math.abs(endX - startX) * 0.28;

  return `M ${startX} ${startY} C ${startX} ${midY}, ${endX - Math.sign(endX - startX || 1) * controlSpread} ${midY}, ${endX} ${endY}`;
}

function renderCardLabel(title) {
  const words = String(title || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= 26) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

export default function AncestorTree({ data, onNodeSelect, selectedNodeId }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(260);
  const [height] = useState(560);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect?.width) {
        setWidth(Math.max(260, Math.floor(entry.contentRect.width)));
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const graph = useMemo(() => normalizeGraphData(data), [data]);
  const hasGraph = graph.nodes.length > 0;
  const focalNode = hasGraph
    ? graph.nodes.find((node) => node.id === selectedNodeId)
      || graph.nodes.find((node) => node.kind === "seed")
      || graph.nodes[0]
    : null;

  useEffect(() => {
    onNodeSelect?.(focalNode || null);
  }, [focalNode, onNodeSelect]);

  const layout = useMemo(() => buildTreeLayout(graph, width, height), [graph, width, height]);

  return (
    <div className="ancestor-tree-stack">
      <div ref={containerRef} className="ancestor-canvas-shell">
        {hasGraph ? (
          <div className="ancestor-tree-surface" style={{ minHeight: height }}>
            <svg className="ancestor-tree-svg" viewBox={`0 0 ${Math.max(width, 720)} ${height}`} aria-hidden="true">
              {layout.edges.map((edge) => (
                <path
                  key={`${edge.source.id}-${edge.target.id}`}
                  d={linkPath(edge)}
                  className={edge.kind === "lineage" ? "ancestor-link ancestor-link-lineage" : "ancestor-link ancestor-link-context"}
                />
              ))}
            </svg>

            <div className="ancestor-tree-card-layer">
              {layout.cards.map((card) => {
                const isSelected = card.id === selectedNodeId;
                const badge = getRouteBadge(card);
                const lines = renderCardLabel(card.title);
                const style = {
                  width: `${card.width}px`,
                  minHeight: `${card.height}px`,
                  left: `${card.x}px`,
                  top: `${card.y}px`,
                  transform: "translate(-50%, -50%)"
                };

                const className = [
                  "tree-node-card",
                  card.variant === "seed" ? "tree-node-card-seed" : "",
                  card.variant === "route" ? "tree-node-card-route" : "",
                  card.variant === "context" ? "tree-node-card-context" : "",
                  isSelected ? "tree-node-card-selected" : ""
                ].filter(Boolean).join(" ");

                return (
                  <button
                    key={card.id}
                    type="button"
                    className={className}
                    style={style}
                    onClick={() => onNodeSelect?.(graph.nodes.find((node) => node.id === card.id) || null)}
                  >
                    {badge ? <span className="tree-node-badge">{badge}</span> : null}
                    <div className="tree-node-copy">
                      {lines.map((line, index) => (
                        <span key={`${card.id}-${index}`}>{line}</span>
                      ))}
                      {card.year ? <small>{card.year}</small> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
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
            ? "The central trunk is the main route through the literature. Branches off the trunk are supporting context you can explore when you need more background."
            : "Lineage details will appear here once a tree is built from a paper."}
        </p>
      </div>
    </div>
  );
}
