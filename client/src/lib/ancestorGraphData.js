/**
 * Normalizes API ancestor-tree payloads into the graph shape used by
 * AncestorTree (2D) and ResearchGraph3D (3D). Keep in sync with tree semantics.
 */

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

  const pushLink = (source, target, kind = "context", branchType = "applied_supporting") => {
    if (!source || !target || source === target) return;
    const key = `${source}->${target}`;
    if (seenPairs.has(key)) return;
    seenPairs.add(key);
    nextLinks.push({ source, target, kind, branchType });
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
      const bt = node.branchType || "applied_supporting";
      pushLink(node.id, descendant.id, coreIds.has(node.id) ? "lineage" : "context", bt);
    });

  return nextLinks.length > 0 ? nextLinks : rawLinks;
}

export function normalizeGraphData(data) {
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

  const branchMap = new Map();

  if (guide && Array.isArray(guide.recommendedOrder)) {
    guide.recommendedOrder.forEach((item, index) => {
      reasonMap.set(item.id, item.reason || "");
      roleMap.set(item.id, item.role || "");
      routeIndexMap.set(item.id, index);
      if (!stageMap.has(item.id)) {
        stageMap.set(item.id, index === 0 ? "start_here" : "optional_supporting");
      }
      if (item.branchType) {
        branchMap.set(item.id, {
          branchType: item.branchType,
          branchLabel: item.branchLabel || "",
          branchReason: item.branchReason || ""
        });
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

  const mappedNodes = nodes.map((node, index) => {
    const fromGuide = branchMap.get(node.id);
    return {
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
      routeIndex: index === 0 ? -1 : routeIndexMap.has(node.id) ? routeIndexMap.get(node.id) : null,
      branchType: node.branchType || fromGuide?.branchType || null,
      branchLabel: node.branchLabel || fromGuide?.branchLabel || "",
      branchReason: node.branchReason || fromGuide?.branchReason || ""
    };
  });

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
