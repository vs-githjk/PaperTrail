function normalizeSemanticScholarItem(item) {
  return {
    id: item.paperId || item.externalIds?.DOI || item.title,
    paperId: item.paperId || null,
    title: item.title || "Untitled paper",
    authors: Array.isArray(item.authors) ? item.authors.map((a) => a.name).filter(Boolean) : [],
    year: item.year ?? null,
    doi: item.externalIds?.DOI || null,
    influenceScore:
      typeof item.citationCount === "number"
        ? Number((item.citationCount / 1000).toFixed(3))
        : 0,
    abstract: item.abstract || "",
    source: "semantic_scholar"
  };
}

function normalizeArxivItem(entry) {
  return {
    id: entry.id || entry.title,
    paperId: null,
    title: entry.title || "Untitled paper",
    authors: Array.isArray(entry.authors) ? entry.authors : [],
    year: null,
    doi: null,
    influenceScore: 0,
    abstract: entry.summary || "",
    source: "arxiv"
  };
}

function pickIdentifier(paper) {
  if (!paper || typeof paper !== "object") return "";
  return (
    paper.paperId ||
    paper.doi ||
    paper.id ||
    extractIdentifierFromQuery(paper.url || "") ||
    paper.title ||
    ""
  );
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function xmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

function parseArxivXml(xml) {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  return entries.map((entry) => {
    const title = xmlValue(entry, "title");
    const id = xmlValue(entry, "id");
    const summary = xmlValue(entry, "summary");
    const authorMatches = entry.match(/<name>([\s\S]*?)<\/name>/g) || [];
    const authors = authorMatches
      .map((x) => x.replace(/<\/?name>/g, "").trim())
      .filter(Boolean);
    return { id, title, summary, authors };
  });
}

function extractIdentifierFromQuery(query) {
  if (!query) return "";

  const trimmed = String(query).trim();
  const doiMatch = trimmed.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  if (doiMatch) return doiMatch[0];

  const arxivMatch = trimmed.match(/arxiv\.org\/(?:abs|pdf)\/([^?#]+)|arxiv:([^\s?#]+)/i);
  if (arxivMatch) {
    return (arxivMatch[1] || arxivMatch[2] || "").replace(/\.pdf$/i, "");
  }

  return trimmed;
}

function looksLikeIdentifier(query) {
  return /10\.\d{4,9}\//i.test(query) || /(^|\s)\d{4}\.\d{4,5}(v\d+)?$/i.test(query);
}

async function fetchSemanticScholar(topic, limit) {
  const normalizedTopic = extractIdentifierFromQuery(topic);
  const url =
    "https://api.semanticscholar.org/graph/v1/paper/search?query=" +
    encodeURIComponent(normalizedTopic) +
    `&limit=${limit}&fields=title,authors,abstract,citationCount,externalIds,paperId,year`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Semantic Scholar failed: ${response.status}`);
  }
  const payload = await response.json();
  const data = Array.isArray(payload.data) ? payload.data : [];
  return data.map(normalizeSemanticScholarItem);
}

async function fetchArxiv(topic, limit) {
  const normalizedTopic = extractIdentifierFromQuery(topic);
  const query = looksLikeIdentifier(normalizedTopic) ? `id:${normalizedTopic}` : `all:${normalizedTopic}`;
  const url =
    "https://export.arxiv.org/api/query?search_query=" +
    encodeURIComponent(query) +
    `&start=0&max_results=${limit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`arXiv failed: ${response.status}`);
  }
  const xml = await response.text();
  return parseArxivXml(xml).map(normalizeArxivItem);
}

async function fetchExternalPapers(topic, limit = 20) {
  const [semanticResult, arxivResult] = await Promise.allSettled([
    fetchSemanticScholar(topic, Math.min(limit, 20)),
    fetchArxiv(topic, Math.min(limit, 20))
  ]);

  const semanticItems = semanticResult.status === "fulfilled" ? semanticResult.value : [];
  const arxivItems = arxivResult.status === "fulfilled" ? arxivResult.value : [];

  const merged = [...semanticItems, ...arxivItems];
  const seen = new Set();
  const deduped = merged.filter((item) => {
    const key = `${item.title}`.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.slice(0, limit);
}

async function fetchSemanticScholarPaper(identifier) {
  const url =
    "https://api.semanticscholar.org/graph/v1/paper/" +
    encodeURIComponent(identifier) +
    "?fields=paperId,title,abstract,year,authors,externalIds,citationCount,references.paperId,references.title,references.year,references.authors,references.externalIds";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Semantic Scholar paper lookup failed: ${response.status}`);
  }

  return response.json();
}

async function resolvePaperSeed(paper) {
  const directIdentifier = pickIdentifier(paper);
  if (directIdentifier) {
    try {
      return await fetchSemanticScholarPaper(directIdentifier);
    } catch (error) {
      // Fall through to title search below.
    }
  }

  const title = paper?.title || paper?.query || "";
  if (!title.trim()) {
    throw new Error("Unable to resolve a paper from the provided selection.");
  }

  const matches = await fetchSemanticScholar(title, 1);
  const firstMatch = matches[0];
  if (!firstMatch) {
    throw new Error("No paper match found for ancestor lookup.");
  }

  const fallbackIdentifier = firstMatch.paperId || firstMatch.doi || firstMatch.id;
  return fetchSemanticScholarPaper(fallbackIdentifier);
}

function buildNode(item, depth) {
  return {
    id: item.paperId || item.externalIds?.DOI || item.id || item.title,
    title: item.title || "Untitled paper",
    label: item.title || "Untitled paper",
    year: item.year ?? null,
    authors: Array.isArray(item.authors) ? item.authors.map((author) => author.name || author).filter(Boolean) : [],
    depth
  };
}

function dedupeByTitle(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.title || "").toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildFallbackTree(paper) {
  const rootTitle = paper?.title || paper?.query || "Selected paper";
  const rootId = pickIdentifier(paper) || rootTitle;
  const suggestedAncestors = [
    `Foundational work behind ${rootTitle}`,
    `Earlier survey related to ${rootTitle}`,
    `Seminal methodology cited by ${rootTitle}`
  ];

  const nodes = [{ id: rootId, title: rootTitle, label: rootTitle, depth: 0 }];
  const links = [];

  suggestedAncestors.forEach((title, index) => {
    const id = `${rootId}-ancestor-${index + 1}`;
    nodes.push({ id, title, label: title, depth: 1 });
    links.push({ source: rootId, target: id });
  });

  return {
    data: {
      nodes,
      links,
      meta: {
        source: "fallback",
        rootId,
        rootTitle,
        guide: {
          title: `Start with ${rootTitle}`,
          summary:
            "PaperTrail could not fetch live citation data, so this is a placeholder reading path to keep exploration moving.",
          recommendedOrder: suggestedAncestors.map((title, index) => ({
            id: `${rootId}-ancestor-${index + 1}`,
            title,
            reason: index === 0 ? "Likely foundational background" : "Suggested supporting context"
          }))
        },
        note: "Live citation data was unavailable, so a placeholder ancestor view was generated."
      }
    }
  };
}

function buildGuide(nodes, rootNode) {
  const ancestorNodes = nodes.filter((node) => node.id !== rootNode.id);
  const prioritized = ancestorNodes
    .slice()
    .sort((left, right) => {
      const depthScore = left.depth - right.depth;
      if (depthScore !== 0) return depthScore;
      return String(left.year || 9999).localeCompare(String(right.year || 9999));
    })
    .slice(0, 4)
    .map((node, index) => ({
      id: node.id,
      title: node.title,
      reason:
        index === 0
          ? "Best first background read before the seed paper"
          : node.depth === 1
            ? "Direct influence on the selected topic"
            : "Earlier context to deepen understanding"
    }));

  return {
    title: `Start with ${rootNode.title}`,
    summary:
      prioritized.length > 0
        ? `PaperTrail found earlier papers that likely shaped ${rootNode.title}. Read the top recommendations in order, then return to the seed paper with more context.`
        : `PaperTrail identified ${rootNode.title} as the best seed paper, but did not find enough cited ancestors to rank a fuller reading path yet.`,
    recommendedOrder: prioritized
  };
}

async function fetchAncestorTree(seedPaper, options = {}) {
  const depthLimit = Math.max(1, Math.min(Number(options.depth) || 2, 3));
  const breadthLimit = Math.max(1, Math.min(Number(options.breadth) || 3, 5));
  const totalNodeLimit = Math.max(4, Math.min(Number(options.maxNodes) || 12, 20));

  try {
    const rootPaper = await resolvePaperSeed(seedPaper);
    const nodes = [];
    const links = [];
    const queue = [{ paper: rootPaper, depth: 0 }];
    const visited = new Set();

    while (queue.length > 0 && nodes.length < totalNodeLimit) {
      const current = queue.shift();
      const currentNode = buildNode(current.paper, current.depth);
      if (!currentNode.id || visited.has(currentNode.id)) continue;
      visited.add(currentNode.id);
      nodes.push(currentNode);

      if (current.depth >= depthLimit) continue;

      const references = dedupeByTitle(Array.isArray(current.paper.references) ? current.paper.references : [])
        .slice(0, breadthLimit);

      for (const reference of references) {
        const childNode = buildNode(reference, current.depth + 1);
        if (!childNode.id) continue;

        links.push({ source: currentNode.id, target: childNode.id });

        if (!visited.has(childNode.id) && nodes.length + queue.length < totalNodeLimit) {
          queue.push({ paper: reference, depth: current.depth + 1 });
        }
      }
    }

    const rootNode = nodes[0] || {
      id: pickIdentifier(seedPaper) || "root",
      title: seedPaper?.title || seedPaper?.query || "Selected paper"
    };

    return {
      data: {
        nodes,
        links,
        meta: {
          source: "semantic_scholar",
          rootId: rootNode.id,
          rootTitle: rootNode.title,
          depthLimit,
          breadthLimit,
          guide: buildGuide(nodes, rootNode)
        }
      }
    };
  } catch (error) {
    return buildFallbackTree(seedPaper);
  }
}

async function searchPapersByQuery(query, limit = 20) {
  const normalized = extractIdentifierFromQuery(query);
  const [semanticItems, arxivItems] = await Promise.allSettled([
    fetchSemanticScholar(normalized, Math.min(limit, 20)),
    fetchArxiv(normalized, Math.min(limit, 20))
  ]);

  const merged = [
    ...(semanticItems.status === "fulfilled" ? semanticItems.value : []),
    ...(arxivItems.status === "fulfilled" ? arxivItems.value : [])
  ];

  if (merged.length > 0) {
    const rawQuery = String(query || "").trim();
    const matcher = rawQuery ? new RegExp(escapeRegExp(rawQuery), "i") : null;
    merged.sort((left, right) => {
      const leftMatches = matcher && matcher.test(left.title) ? 1 : 0;
      const rightMatches = matcher && matcher.test(right.title) ? 1 : 0;
      return rightMatches - leftMatches;
    });
  }

  const seen = new Set();
  return merged.filter((item) => {
    const key = `${item.title}`.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

module.exports = { fetchExternalPapers: searchPapersByQuery, fetchAncestorTree };
