import { useEffect, useMemo, useRef, useState } from "react";

const TREE_LEFT_GUTTER = 288;
const TREE_RIGHT_GUTTER = 90;

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

  const coreIds = new Set(
    Array.isArray(guide?.recommendedOrder)
      ? guide.recommendedOrder.map((item) => item.id).filter((id) => id && id !== rootNode.id && byId.has(id))
      : []
  );

  const orientCandidate = (link, node) => {
    if (link.source === node.id && byId.has(link.target)) {
      return { descendantId: link.target };
    }
    if (link.target === node.id && byId.has(link.source)) {
      return { descendantId: link.source };
    }
    return null;
  };

  const nextLinks = [];
  const seenPairs = new Set();

  const pushLink = (source, target, kind = "context") => {
    if (!source || !target || source === target) return;
    const key = `${source}->${target}`;
    if (seenPairs.has(key)) return;
    seenPairs.add(key);
    nextLinks.push({ source, target, kind });
  };

  const chooseDescendant = (node) => {
    const candidates = rawLinks
      .map((link) => orientCandidate(link, node))
      .filter(Boolean)
      .map(({ descendantId }) => byId.get(descendantId))
      .filter(Boolean)
      .filter((candidate) => candidate.id !== node.id)
      .filter((candidate) => (candidate.depth || 0) < (node.depth || 0));

    if (candidates.length > 0) {
      candidates.sort((left, right) => {
        const depthDelta = (left.depth || 0) - (right.depth || 0);
        if (depthDelta !== 0) return depthDelta;
        const coreDelta = Number(coreIds.has(right.id)) - Number(coreIds.has(left.id));
        if (coreDelta !== 0) return coreDelta;
        return (right.influenceScore || 0) - (left.influenceScore || 0);
      });
      return candidates[0];
    }

    const previousDepth = nodes
      .filter((candidate) => candidate.id !== node.id)
      .filter((candidate) => (candidate.depth || 0) === Math.max((node.depth || 1) - 1, 0))
      .sort((left, right) => {
        const coreDelta = Number(coreIds.has(right.id)) - Number(coreIds.has(left.id));
        if (coreDelta !== 0) return coreDelta;
        return (right.influenceScore || 0) - (left.influenceScore || 0);
      });

    return previousDepth[0] || rootNode;
  };

  nodes
    .filter((node) => node.id !== rootNode.id)
    .sort((left, right) => {
      const depthDelta = (left.depth || 0) - (right.depth || 0);
      if (depthDelta !== 0) return depthDelta;
      const coreDelta = Number(coreIds.has(right.id)) - Number(coreIds.has(left.id));
      if (coreDelta !== 0) return coreDelta;
      return (right.influenceScore || 0) - (left.influenceScore || 0);
    })
    .forEach((node) => {
      const descendant = chooseDescendant(node);
      pushLink(node.id, descendant.id, coreIds.has(node.id) ? "lineage" : "context");
    });

  return nextLinks.length > 0 ? nextLinks : rawLinks;
}

function getStageColor(stage, isSeed = false) {
  if (isSeed) return "#6d28d9";
  switch (stage) {
    case "start_here":
      return "#8b5cf6";
    case "foundational_background":
      return "#7c3aed";
    case "broader_overview":
      return "#a78bfa";
    default:
      return "#c4b5fd";
  }
}

function getRouteBadge(node) {
  if (!node) return "◦";
  if (node.kind === "seed") return "★";
  if (Number.isInteger(node.routeIndex) && node.routeIndex >= 0) return "●";
  return "◦";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function labelForDepth(depth) {
  if (depth <= 0) return "Current paper";
  if (depth === 1) return "Direct foundations";
  if (depth === 2) return "Earlier foundations";
  return `Generation ${depth}`;
}

/** Collapsed on-canvas hitbox (badge); edges anchor to this so paths stay visible between nodes. */
const ANCHOR_SIZE = 40;

function buildTreeLayout(graph, width, height) {
  const rootNode = graph.nodes.find((node) => node.kind === "seed") || graph.nodes[0] || null;
  if (!rootNode) return { cards: [], edges: [] };

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const ancestorsByDescendant = new Map();
  for (const link of graph.links) {
    if (!ancestorsByDescendant.has(link.target)) ancestorsByDescendant.set(link.target, []);
    const ancestor = byId.get(link.source);
    if (ancestor) ancestorsByDescendant.get(link.target).push(ancestor);
  }

  for (const entries of ancestorsByDescendant.values()) {
    entries.sort((left, right) => {
      const coreDelta = Number(Number.isInteger(right.routeIndex) && right.routeIndex >= 0) - Number(Number.isInteger(left.routeIndex) && left.routeIndex >= 0);
      if (coreDelta !== 0) return coreDelta;
      const depthDelta = (left.depth || 0) - (right.depth || 0);
      if (depthDelta !== 0) return depthDelta;
      return (right.influenceScore || 0) - (left.influenceScore || 0);
    });
  }

  const cards = [];
  const positions = new Map();
  const safeWidth = Math.max(width, 320);
  const maxDepth = Math.max(...graph.nodes.map((node) => Number(node.depth) || 0), 0);
  const leftGutter = TREE_LEFT_GUTTER;
  const rightGutter = TREE_RIGHT_GUTTER;
  const topPadding = 74;
  const bottomPadding = 76;
  const usableWidth = Math.max(220, safeWidth - leftGutter - rightGutter);
  const centerX = leftGutter + usableWidth / 2;
  const levelGap =
    maxDepth > 0
      ? clamp((height - topPadding - bottomPadding) / maxDepth, 116, 220)
      : 0;
  const siblingGap = clamp(safeWidth * 0.11, 42, 96);
  const leafSpan = clamp(safeWidth * 0.2, 132, 240);
  const layerLabels = Array.from({ length: maxDepth + 1 }, (_, depth) => ({
    depth,
    label: labelForDepth(depth),
    y: height - bottomPadding - depth * levelGap
  }));

  const addCard = (node, x, y, variant, popoverSide) => {
    const popoverWidth =
      variant === "seed"
        ? clamp(safeWidth * 0.34, 190, 320)
        : variant === "route"
          ? clamp(safeWidth * 0.28, 170, 268)
          : clamp(safeWidth * 0.24, 150, 220);

    const card = {
      ...node,
      variant,
      x,
      y,
      width: ANCHOR_SIZE,
      height: ANCHOR_SIZE,
      popoverWidth,
      popoverSide
    };
    cards.push(card);
    positions.set(node.id, card);
    return card;
  };

  const subtreeWidthMemo = new Map();
  const measureSubtree = (nodeId) => {
    if (subtreeWidthMemo.has(nodeId)) return subtreeWidthMemo.get(nodeId);
    const ancestors = ancestorsByDescendant.get(nodeId) || [];
    if (!ancestors.length) {
      subtreeWidthMemo.set(nodeId, leafSpan);
      return leafSpan;
    }

    const total = ancestors.reduce((sum, ancestor, index) => {
      const next = measureSubtree(ancestor.id);
      return sum + next + (index > 0 ? siblingGap : 0);
    }, 0);

    const widthNeeded = Math.max(leafSpan, total);
    subtreeWidthMemo.set(nodeId, widthNeeded);
    return widthNeeded;
  };

  const placeTree = (nodeId, center, level = 0) => {
    const node = byId.get(nodeId);
    if (!node || positions.has(nodeId)) return;

    const y = height - bottomPadding - level * levelGap;
    const variant =
      node.kind === "seed"
        ? "seed"
        : Number.isInteger(node.routeIndex) && node.routeIndex >= 0
          ? "route"
          : "context";
    const popSide = center < safeWidth / 2 - 20 ? "right" : center > safeWidth / 2 + 20 ? "left" : "right";
    addCard(node, center, y, variant, popSide);

    const ancestors = ancestorsByDescendant.get(nodeId) || [];
    if (!ancestors.length) return;

    const totalWidth = ancestors.reduce((sum, ancestor, index) => {
      return sum + measureSubtree(ancestor.id) + (index > 0 ? siblingGap : 0);
    }, 0);

    let cursor = center - totalWidth / 2;
    ancestors.forEach((ancestor) => {
      const branchWidth = measureSubtree(ancestor.id);
      const nextCenter = clamp(cursor + branchWidth / 2, leftGutter, safeWidth - rightGutter);
      placeTree(ancestor.id, nextCenter, level + 1);
      cursor += branchWidth + siblingGap;
    });
  };

  placeTree(rootNode.id, centerX, 0);

  const edges = graph.links
    .map((link) => {
      const source = positions.get(link.source);
      const target = positions.get(link.target);
      if (!source || !target) return null;
      return { ...link, source, target };
    })
    .filter(Boolean);

  return { cards, edges, layerLabels, maxDepth };
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
  const midY = startY + (endY - startY) * 0.54;

  return `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
}

export default function AncestorTree({ data, onNodeSelect, selectedNodeId }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(260);

  const graph = useMemo(() => normalizeGraphData(data), [data]);
  const height = useMemo(() => {
    const count = graph.nodes.length;
    if (count <= 4) return 640;
    if (count <= 7) return 700;
    return 760;
  }, [graph.nodes.length]);
  const hasGraph = graph.nodes.length > 0;
  const focalNode = hasGraph
    ? graph.nodes.find((node) => node.id === selectedNodeId)
      || graph.nodes.find((node) => node.kind === "seed")
      || graph.nodes[0]
    : null;

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

  useEffect(() => {
    onNodeSelect?.(focalNode || null);
  }, [focalNode, onNodeSelect]);

  const layout = useMemo(() => buildTreeLayout(graph, width, height), [graph, width, height]);
  const nodeCount = graph.nodes.length;

  return (
    <div className="ancestor-tree-stack">
      <div ref={containerRef} className="ancestor-canvas-shell">
        {hasGraph ? (
          <div className="ancestor-tree-surface" style={{ minHeight: height }}>
            <div className="ancestor-tree-summary">
              <span>{nodeCount} papers mapped</span>
              <span>{layout.maxDepth + 1} learning layers</span>
            </div>
            <div className="ancestor-tree-layers" aria-hidden="true">
              {layout.layerLabels.map((layer) => (
                <div
                  key={layer.depth}
                  className="ancestor-tree-layer"
                  style={{ top: `${layer.y}px`, "--ancestor-label-gutter": `${TREE_LEFT_GUTTER - 28}px` }}
                >
                  <span className="ancestor-tree-layer-label">{layer.label}</span>
                </div>
              ))}
            </div>
            <div className="ancestor-tree-card-layer">
              {layout.cards.map((card) => {
                const isSelected = card.id === selectedNodeId;
                const marker = getRouteBadge(card);
                const graphNode = graph.nodes.find((node) => node.id === card.id) || null;
                const badgeAria =
                  card.variant === "seed"
                    ? `Your starting paper: ${card.title || "Untitled paper"}`
                    : card.variant === "context"
                      ? `Supporting context: ${card.title || "Untitled paper"}`
                      : card.title
                        ? `Core ancestor: ${card.title}`
                        : "Paper node";
                const popoverClass = [
                  "tree-node-popover",
                  "tree-node-card",
                  card.variant === "seed" ? "tree-node-card-seed" : "",
                  card.variant === "route" ? "tree-node-card-route" : "",
                  card.variant === "context" ? "tree-node-card-context" : "",
                  isSelected ? "tree-node-card-selected" : ""
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div
                    key={card.id}
                    className={`tree-node-anchor tree-node-anchor-${card.variant} tree-node-popover-at-${card.popoverSide}${isSelected ? " is-selected" : ""}`}
                    style={{
                      left: `${card.x}px`,
                      top: `${card.y}px`,
                      "--tree-popover-width": `${card.popoverWidth}px`
                    }}
                  >
                    <button
                      type="button"
                      className="tree-node-badge-btn"
                      aria-label={badgeAria}
                      title={card.variant === "seed" ? "Your starting paper (the one you searched)" : undefined}
                      onClick={() => onNodeSelect?.(graphNode)}
                    >
                      {marker}
                    </button>
                    <div
                      className={popoverClass}
                      role="presentation"
                      onClick={() => onNodeSelect?.(graphNode)}
                    >
                      <div className="tree-node-copy">
                        <p className="tree-node-title">{card.title || "Untitled paper"}</p>
                        {card.year ? <small>{card.year}</small> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <svg className="ancestor-tree-svg" viewBox={`0 0 ${Math.max(width, 720)} ${height}`} aria-hidden="true">
              {layout.edges.map((edge) => (
                <path
                  key={`${edge.source.id}-${edge.target.id}`}
                  d={linkPath(edge)}
                  className={edge.kind === "lineage" ? "ancestor-link ancestor-link-lineage" : "ancestor-link ancestor-link-context"}
                />
              ))}
            </svg>
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
            ? "The ★ marker is your current paper. Filled markers show core ancestors near the center of the lineage; hollow markers show supporting branches. Hover a marker to read the paper title."
            : "Lineage details will appear here once a tree is built from a paper."}
        </p>
      </div>
    </div>
  );
}
