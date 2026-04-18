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

const COMMON_QUERY_TERMS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "into",
  "is",
  "of",
  "on",
  "or",
  "paper",
  "papers",
  "read",
  "research",
  "study",
  "that",
  "the",
  "their",
  "this",
  "to",
  "topic",
  "want",
  "with"
]);

const SURVEY_HINTS = ["survey", "review", "overview", "tutorial", "introduction", "primer", "systematic"];
const CANONICAL_QUERY_SUFFIXES = ["survey", "review", "overview", "introduction"];

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

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !COMMON_QUERY_TERMS.has(token) && token.length > 1);
}

function uniqueTokens(text) {
  return [...new Set(tokenize(text))];
}

function countTokenOverlap(leftText, rightText) {
  const leftTokens = new Set(uniqueTokens(leftText));
  const rightTokens = uniqueTokens(rightText);
  let matches = 0;

  for (const token of rightTokens) {
    if (leftTokens.has(token)) matches += 1;
  }

  return matches;
}

function coverageRatio(text, queryProfile) {
  const tokenCount = Math.max(queryProfile.tokens.length, 1);
  return countTokenOverlap(text, queryProfile.normalized) / tokenCount;
}

function hasSurveyHint(text) {
  const lowered = String(text || "").toLowerCase();
  return SURVEY_HINTS.some((hint) => lowered.includes(hint));
}

function importantTopicTokens(queryProfile) {
  return queryProfile.tokens.filter((token) => token.length >= 4).slice(0, 4);
}

function countImportantTokenMatches(text, queryProfile) {
  const importantTokens = importantTopicTokens(queryProfile);
  if (importantTokens.length === 0) return 0;
  const textTokens = new Set(uniqueTokens(text));
  let matches = 0;

  for (const token of importantTokens) {
    if (textTokens.has(token)) matches += 1;
  }

  return matches;
}

function isOffDomainOverviewCandidate(paper, queryProfile) {
  if (!queryProfile?.broadTopic) return false;

  const title = String(paper.title || "");
  if (!hasSurveyHint(title)) return false;

  const titleCoverage = coverageRatio(title, queryProfile);
  const abstractCoverage = coverageRatio(paper.abstract || "", queryProfile);
  const importantMatches = countImportantTokenMatches(`${paper.title || ""} ${paper.abstract || ""}`, queryProfile);

  return titleCoverage < 0.3 && abstractCoverage < 0.3 && importantMatches < 2;
}

function classifyPaperRole(paper, queryProfile, context = {}) {
  const title = String(paper.title || "");
  const titleCoverage = coverageRatio(title, queryProfile);
  const influence = Number(paper.influenceScore || 0);
  const depth = Number(context.depth ?? paper.depth ?? 0);
  const year = Number(paper.year || 0);
  const rootYear = Number(context.rootYear || 0);
  const ageGap = rootYear > 0 && year > 0 ? rootYear - year : 0;

  if (isOffDomainOverviewCandidate(paper, queryProfile)) {
    return {
      role: "supporting",
      roleLabel: "Supporting Paper",
      roleReason: "This is somewhat related, but it does not cover enough of your topic to be treated as a true overview."
    };
  }

  if (hasSurveyHint(title) && !isOffDomainOverviewCandidate(paper, queryProfile)) {
    return {
      role: "overview",
      roleLabel: "Overview Paper",
      roleReason: "This looks like a survey, review, or introduction that can quickly build context."
    };
  }

  if (depth > 0 && ageGap >= 8) {
    return {
      role: "seminal",
      roleLabel: "Seminal Paper",
      roleReason: "This appears to be older foundational work that likely shaped later research in the area."
    };
  }

  if (queryProfile.exactishTitle || queryProfile.directIdentifier) {
    return {
      role: "seed",
      roleLabel: "Seed Paper",
      roleReason: "This is the main paper that best matches the specific title or identifier you entered."
    };
  }

  if (titleCoverage >= 0.6 || influence >= 50 || depth === 0) {
    return {
      role: "starting_point",
      roleLabel: "Best Starting Paper",
      roleReason: "This is a strong first paper to begin reading before branching outward."
    };
  }

  return {
    role: "supporting",
    roleLabel: "Supporting Paper",
    roleReason: "This adds useful context, but it is probably not the first paper to read."
  };
}

function readingStageConfig(stage) {
  if (stage === "start_here") {
    return {
      stage,
      label: "Start Here",
      description: "Read these first to get oriented quickly."
    };
  }

  if (stage === "foundational_background") {
    return {
      stage,
      label: "Foundational Background",
      description: "Older or core papers that shaped the area."
    };
  }

  if (stage === "broader_overview") {
    return {
      stage,
      label: "Broader Overview",
      description: "Surveys and reviews that help you zoom out."
    };
  }

  return {
    stage: "optional_supporting",
    label: "Optional Supporting Reads",
    description: "Useful supporting context once you have the basics."
  };
}

function stageForRole(role, index = 0, options = {}) {
  const queryProfile = options.queryProfile || null;

  if (queryProfile?.broadTopic) {
    if (index === 0 && (role === "overview" || role === "starting_point")) return "start_here";
    if (role === "overview") return "broader_overview";
    if (role === "seminal") return "foundational_background";
    if (role === "starting_point") return "optional_supporting";
    return "optional_supporting";
  }

  if (index === 0 || role === "seed" || role === "starting_point") return "start_here";
  if (role === "seminal") return "foundational_background";
  if (role === "overview") return "broader_overview";
  return "optional_supporting";
}

function buildReadingPlan(items, options = {}) {
  const queryProfile = options.queryProfile || null;
  const grouped = new Map();

  for (const [index, item] of items.entries()) {
    let stage = stageForRole(item.role, index, { queryProfile });

    if (queryProfile?.exactishTitle && index > 0 && item.role === "seed") {
      stage = "optional_supporting";
    }

    if (!grouped.has(stage)) {
      grouped.set(stage, {
        ...readingStageConfig(stage),
        items: []
      });
    }

    grouped.get(stage).items.push(item);
  }

  return [
    grouped.get("start_here"),
    grouped.get("foundational_background"),
    grouped.get("broader_overview"),
    grouped.get("optional_supporting")
  ]
    .filter(Boolean)
    .map((section) => {
      if (section.stage === "start_here" && queryProfile?.exactishTitle) {
        return {
          ...section,
          items: section.items.slice(0, 1)
        };
      }

      return section;
    });
}

function classifyQuery(query) {
  const rawQuery = String(query || "").trim();
  const normalized = extractIdentifierFromQuery(rawQuery);
  const tokens = uniqueTokens(normalized);
  const lowered = normalized.toLowerCase();
  const hasQuotedTitle = /["“”]/.test(rawQuery);
  const originalWords = rawQuery.split(/\s+/).filter(Boolean);
  const titleCaseLikeWords = originalWords.filter((word) => /^[A-Z][A-Za-z0-9-]*$/.test(word));
  const titleCaseRatio = originalWords.length > 0 ? titleCaseLikeWords.length / originalWords.length : 0;
  const exactishTitle =
    tokens.length > 0 &&
    tokens.length <= 8 &&
    !looksLikeIdentifier(normalized) &&
    (hasQuotedTitle || titleCaseRatio >= 0.6);
  const broadTopic =
    !looksLikeIdentifier(normalized) &&
    !hasQuotedTitle &&
    !exactishTitle &&
    (tokens.length >= 3 || /\b(topic|overview|introduction|basics|fundamentals)\b/.test(lowered));

  return {
    normalized,
    lowered,
    tokens,
    broadTopic,
    directIdentifier: looksLikeIdentifier(normalized),
    exactishTitle
  };
}

function toTitleCase(token) {
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function buildCandidateQueries(queryProfile) {
  const base = queryProfile.normalized.trim();
  if (!base) return [];

  const queries = [base];

  if (queryProfile.exactishTitle) {
    queries.push(`"${base}"`);
    queries.push(`${base} paper`);
  }

  if (queryProfile.broadTopic) {
    for (const suffix of CANONICAL_QUERY_SUFFIXES) {
      queries.push(`${base} ${suffix}`);
    }

    const compactTopic = queryProfile.tokens.slice(0, 5).join(" ");
    if (compactTopic && compactTopic !== base.toLowerCase()) {
      queries.push(compactTopic);
    }
  }

  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
}

function inferMatchReason(paper, queryProfile) {
  const title = String(paper.title || "");
  const titleOverlap = countTokenOverlap(title, queryProfile.normalized);
  const titleCoverage = coverageRatio(title, queryProfile);

  if (queryProfile.directIdentifier) return "Direct identifier match";
  if (hasSurveyHint(title) && queryProfile.broadTopic && !isOffDomainOverviewCandidate(paper, queryProfile)) {
    return "Strong overview paper for a broad topic";
  }
  if (titleCoverage >= 0.75 || titleOverlap >= Math.max(2, Math.ceil(queryProfile.tokens.length / 2))) {
    return "Title closely matches your topic";
  }
  if (titleCoverage >= 0.5 && countTokenOverlap(paper.abstract || "", queryProfile.normalized) >= 2) {
    return "Abstract strongly matches your topic";
  }

  return "Promising seed paper for this research direction";
}

function scoreSeedPaper(paper, queryProfile) {
  const title = String(paper.title || "");
  const abstract = String(paper.abstract || "");
  const titleLower = title.toLowerCase();
  const queryLower = queryProfile.lowered;
  const titleOverlap = countTokenOverlap(title, queryProfile.normalized);
  const abstractOverlap = countTokenOverlap(abstract, queryProfile.normalized);
  const titleCoverage = coverageRatio(title, queryProfile);
  const abstractCoverage = coverageRatio(abstract, queryProfile);
  const influence = Number(paper.influenceScore || 0);
  const year = Number(paper.year || 0);

  let score = 0;

  if (queryProfile.directIdentifier) {
    if (paper.paperId || paper.doi || paper.id) score += 500;
    if (titleOverlap > 0) score += 20;
  } else {
    if (titleLower === queryLower) score += 220;
    if (titleLower.includes(queryLower) && queryLower.length > 6) score += 120;
    if (queryProfile.exactishTitle && titleLower.startsWith(queryLower)) score += 80;
    if (queryProfile.exactishTitle && titleLower.endsWith(queryLower)) score += 50;
    if (queryProfile.exactishTitle && titleLower.includes("all you need") && titleLower !== queryLower) score -= 45;
    score += titleOverlap * (queryProfile.broadTopic ? 26 : 34);
    score += abstractOverlap * (queryProfile.broadTopic ? 10 : 6);
    score += titleCoverage * (queryProfile.broadTopic ? 90 : 60);
  }

  if (queryProfile.broadTopic) {
    if (hasSurveyHint(title) && !isOffDomainOverviewCandidate(paper, queryProfile)) score += 90;
    if (isOffDomainOverviewCandidate(paper, queryProfile)) score -= 110;
    if (titleCoverage >= 0.8) score += 60;
    else if (titleCoverage >= 0.6) score += 25;

    if (titleCoverage < 0.4 && !hasSurveyHint(title)) {
      score -= 80;
    } else if (titleCoverage < 0.6 && !hasSurveyHint(title)) {
      score -= 35;
    }

    if (titleCoverage < 0.4 && abstractCoverage > 0.5) {
      score -= 20;
    }
    score += Math.min(influence, 120);
    if (year >= 2018) score += 8;
  } else {
    score += Math.min(influence, 80);
    if (year >= 2015) score += 6;
  }

  if (paper.source === "semantic_scholar") score += 12;
  if (paper.doi) score += 10;
  if (Array.isArray(paper.authors) && paper.authors.length > 0) score += 4;

  return score;
}

function scoreAncestorNode(node, rootNode, queryProfile) {
  const titleOverlap = countTokenOverlap(node.title, queryProfile.normalized || rootNode.title);
  const authorWeight = Array.isArray(node.authors) ? Math.min(node.authors.length, 4) : 0;
  const year = Number(node.year || 0);
  let score = 0;

  score += titleOverlap * 18;
  score += node.depth === 1 ? 30 : Math.max(6, 24 - node.depth * 8);
  score += authorWeight * 2;

  if (year > 0 && rootNode.year > 0) {
    const ageGap = rootNode.year - year;
    if (ageGap >= 1 && ageGap <= 12) score += 18;
    else if (ageGap > 12) score += 10;
  }

  if (hasSurveyHint(node.title)) score += 12;

  return score;
}

function scoreAncestorForStage(node, rootNode, queryProfile, stage) {
  const baseScore = scoreAncestorNode(node, rootNode, queryProfile);
  const roleMeta = classifyPaperRole(node, queryProfile, { depth: node.depth, rootYear: rootNode.year });

  if (stage === "foundational_background") {
    return baseScore + (roleMeta.role === "seminal" ? 60 : 0) + (node.depth > 1 ? 10 : 0);
  }

  if (stage === "broader_overview") {
    return baseScore + (roleMeta.role === "overview" ? 70 : 0);
  }

  if (stage === "optional_supporting") {
    return baseScore + (roleMeta.role === "supporting" ? 30 : 0);
  }

  return baseScore;
}

function buildAncestorReadingPlan(prioritized, rootNode, queryProfile) {
  const startHere = prioritized.slice(0, 1);
  const remaining = prioritized.slice(1);

  const foundational = remaining
    .filter((item) => item.role === "seminal")
    .sort((left, right) => scoreAncestorForStage(right, rootNode, queryProfile, "foundational_background") -
      scoreAncestorForStage(left, rootNode, queryProfile, "foundational_background"))
    .slice(0, 2);

  const overview = remaining
    .filter((item) => item.role === "overview")
    .sort((left, right) => scoreAncestorForStage(right, rootNode, queryProfile, "broader_overview") -
      scoreAncestorForStage(left, rootNode, queryProfile, "broader_overview"))
    .slice(0, 2);

  const supportingIds = new Set([
    ...startHere.map((item) => item.id),
    ...foundational.map((item) => item.id),
    ...overview.map((item) => item.id)
  ]);

  const supporting = remaining
    .filter((item) => !supportingIds.has(item.id))
    .sort((left, right) => scoreAncestorForStage(right, rootNode, queryProfile, "optional_supporting") -
      scoreAncestorForStage(left, rootNode, queryProfile, "optional_supporting"))
    .slice(0, 3);

  return [
    startHere.length > 0 ? { ...readingStageConfig("start_here"), items: startHere } : null,
    foundational.length > 0 ? { ...readingStageConfig("foundational_background"), items: foundational } : null,
    overview.length > 0 ? { ...readingStageConfig("broader_overview"), items: overview } : null,
    supporting.length > 0 ? { ...readingStageConfig("optional_supporting"), items: supporting } : null
  ].filter(Boolean);
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
  const queryProfile = classifyQuery(topic);
  const candidateQueries = buildCandidateQueries(queryProfile);
  const perQueryLimit = queryProfile.broadTopic ? Math.min(Math.max(limit, 5), 8) : Math.min(limit, 20);

  const settledGroups = await Promise.all(
    candidateQueries.map(async (query) => {
      const [semanticResult, arxivResult] = await Promise.allSettled([
        fetchSemanticScholar(query, perQueryLimit),
        fetchArxiv(query, perQueryLimit)
      ]);

      return [
        ...(semanticResult.status === "fulfilled" ? semanticResult.value : []),
        ...(arxivResult.status === "fulfilled" ? arxivResult.value : [])
      ];
    })
  );

  const merged = settledGroups.flat();
  const seen = new Set();
  const deduped = merged.filter((item) => {
    const key = `${item.title}`.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped
    .map((item) => {
      const score = scoreSeedPaper(item, queryProfile);
      const roleMeta = classifyPaperRole(item, queryProfile, { depth: 0 });
      return {
        ...item,
        recommendationScore: Number(score.toFixed(2)),
        matchReason: inferMatchReason(item, queryProfile),
        role: roleMeta.role,
        roleLabel: roleMeta.roleLabel,
        roleReason: roleMeta.roleReason
      };
    })
    .sort((left, right) => {
      const scoreGap = right.recommendationScore - left.recommendationScore;
      if (scoreGap !== 0) return scoreGap;
      return String(left.title).localeCompare(String(right.title));
    })
    .slice(0, limit)
    .map((item, index) =>
      queryProfile.exactishTitle && index > 0 && item.role === "seed"
        ? {
            ...item,
            role: "supporting",
            roleLabel: "Supporting Paper",
            roleReason: "This is related to the exact title you searched for, but it is not the main seed paper."
          }
        : item
    );
}

async function fetchSemanticScholarPaper(identifier) {
  const url =
    "https://api.semanticscholar.org/graph/v1/paper/" +
    encodeURIComponent(identifier) +
    "?fields=paperId,title,abstract,year,authors,externalIds,citationCount,references.paperId,references.title,references.abstract,references.year,references.authors,references.externalIds,references.citationCount";

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
  const doi = item?.externalIds?.DOI || item?.doi || null;
  const paperId = item.paperId || item.externalId || item.id || item.title;
  const citationCount = Number.isFinite(Number(item?.citationCount)) ? Number(item.citationCount) : 0;
  const authors = Array.isArray(item.authors)
    ? item.authors.map((author) => author.name || author).filter(Boolean)
    : [];
  const abstract = typeof item?.abstract === "string" ? item.abstract.trim() : "";

  return {
    id: paperId || doi,
    title: item.title || "Untitled paper",
    label: item.title || "Untitled paper",
    year: item.year ?? null,
    authors,
    abstract,
    citationCount,
    influenceScore: citationCount,
    doi,
    paperId,
    source: item?.source || "semantic_scholar",
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
  const queryProfile = classifyQuery(paper?.query || paper?.title || "");
  const suggestedAncestors = [
    {
      id: `${rootId}-ancestor-1`,
      title: `Foundational work behind ${rootTitle}`,
      role: "seminal",
      roleLabel: "Seminal Paper",
      reason: "Likely foundational background"
    },
    {
      id: `${rootId}-ancestor-2`,
      title: `Earlier survey related to ${rootTitle}`,
      role: "overview",
      roleLabel: "Overview Paper",
      reason: "Helpful overview while live citation data is unavailable"
    },
    {
      id: `${rootId}-ancestor-3`,
      title: `Supporting methodology cited by ${rootTitle}`,
      role: "supporting",
      roleLabel: "Supporting Paper",
      reason: "Suggested supporting context"
    }
  ];

  const nodes = [{
    id: rootId,
    title: rootTitle,
    label: rootTitle,
    depth: 0,
    abstract: typeof paper?.abstract === "string" ? paper.abstract : "",
    citationCount: Number.isFinite(Number(paper?.citationCount)) ? Number(paper.citationCount) : 0,
    influenceScore: Number.isFinite(Number(paper?.citationCount)) ? Number(paper.citationCount) : 0,
    doi: paper?.doi || null,
    paperId: paper?.paperId || paper?.externalId || rootId,
    source: paper?.source || "fallback",
    authors: Array.isArray(paper?.authors) ? paper.authors : []
  }];
  const links = [];

  suggestedAncestors.forEach((item) => {
    nodes.push({
      id: item.id,
      title: item.title,
      label: item.title,
      depth: 1,
      abstract: item.reason,
      citationCount: 0,
      influenceScore: 0,
      doi: null,
      paperId: item.id,
      source: "fallback",
      authors: []
    });
    links.push({ source: rootId, target: item.id });
  });

  const readingPlan = buildReadingPlan(suggestedAncestors, { queryProfile });
  const companionResources = buildCompanionResources(
    {
      id: rootId,
      title: rootTitle,
      query: paper?.query || paper?.title || rootTitle
    },
    suggestedAncestors,
    queryProfile
  );

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
          recommendedOrder: suggestedAncestors,
          readingPlan,
          companionResources
        },
        note: "Live citation data was unavailable, so a placeholder ancestor view was generated."
      }
    }
  };
}

function buildCompanionResources(rootNode, prioritized = [], queryProfile = null) {
  const baseTopic = String(queryProfile?.normalized || rootNode?.query || rootNode?.title || "").trim();
  const seedTitle = String(rootNode?.title || baseTopic || "paper").trim();
  const firstBackground = prioritized[0]?.title ? String(prioritized[0].title).trim() : "";
  const seedUrl = rootNode?.url || (rootNode?.doi ? `https://doi.org/${rootNode.doi}` : "");

  if (!baseTopic && !seedTitle) return [];

  const resources = [
    seedUrl
      ? {
          id: "seed-source",
          type: "paper",
          group: "read",
          label: "Open current seed paper",
          description: "Jump straight to the seed paper source before branching into companion material.",
          url: seedUrl,
          audience: "core"
        }
      : null,
    {
      id: "youtube-overview",
      type: "video",
      group: "watch",
      label: "YouTube overview",
      description: "A quick explainer video to build intuition before diving into the papers.",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${baseTopic || seedTitle} explained`)}`,
      audience: "beginner"
    },
    {
      id: "youtube-paper",
      type: "video",
      group: "watch",
      label: "Paper walkthrough",
      description: "Search for talks, lectures, or explainers focused on the seed paper itself.",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${seedTitle} paper explained`)}`,
      audience: "guided"
    },
    {
      id: "course-lecture",
      type: "video",
      group: "watch",
      label: "Lecture or course clip",
      description: "Find a university-style lecture that teaches the topic more slowly and systematically.",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${baseTopic || seedTitle} lecture course`)}`,
      audience: "beginner"
    },
    {
      id: "google-scholar",
      type: "search",
      group: "explore",
      label: "Google Scholar",
      description: "Broaden the reading list with citation trails, related work, and follow-up papers.",
      url: `https://scholar.google.com/scholar?q=${encodeURIComponent(seedTitle)}`,
      audience: "academic"
    },
    {
      id: "wiki-context",
      type: "reference",
      group: "reference",
      label: "Background reference",
      description: "A quick general reference pass to orient yourself around the core topic.",
      url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(baseTopic || seedTitle)}`,
      audience: "context"
    },
    {
      id: "arxiv-topic",
      type: "search",
      group: "explore",
      label: "arXiv topic search",
      description: "Find more recent preprints, surveys, and tutorials around the same topic.",
      url: `https://arxiv.org/search/?query=${encodeURIComponent(baseTopic || seedTitle)}&searchtype=all&abstracts=show&order=-announced_date_first&size=25`,
      audience: "advanced"
    },
    {
      id: "semantic-scholar-related",
      type: "search",
      group: "explore",
      label: "Semantic Scholar related work",
      description: "Use Semantic Scholar to branch into citations, references, and related papers from the same area.",
      url: `https://www.semanticscholar.org/search?q=${encodeURIComponent(seedTitle)}`,
      audience: "academic"
    }
  ].filter(Boolean);

  if (firstBackground) {
    resources.splice(2, 0, {
      id: "background-video",
      type: "video",
      group: "watch",
      label: "Background concept video",
      description: "Use the top background paper title as a cue for a more focused explainer search.",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${firstBackground} lecture`)}`,
      audience: "guided"
    });
  }

  const deduped = [];
  const seenUrls = new Set();
  for (const resource of resources) {
    if (!resource?.url || seenUrls.has(resource.url)) continue;
    seenUrls.add(resource.url);
    deduped.push(resource);
  }

  return deduped.slice(0, 7);
}

function buildGuide(nodes, rootNode) {
  const queryProfile = classifyQuery(rootNode.query || rootNode.title || "");
  const ancestorNodes = nodes.filter((node) => node.id !== rootNode.id);
  const prioritized = ancestorNodes
    .slice()
    .sort((left, right) => scoreAncestorNode(right, rootNode, queryProfile) - scoreAncestorNode(left, rootNode, queryProfile))
    .slice(0, 4)
    .map((node, index) => {
      const roleMeta = classifyPaperRole(node, queryProfile, { depth: node.depth, rootYear: rootNode.year });
      const storyStage =
        roleMeta.role === "overview"
          ? "broader_overview"
          : roleMeta.role === "seminal"
            ? "foundational_background"
            : index === 0
              ? "start_here"
              : node.depth === 1
                ? "foundational_background"
                : "optional_supporting";
      return {
        id: node.id,
        title: node.title,
        year: node.year ?? null,
        role: roleMeta.role,
        roleLabel: roleMeta.roleLabel,
        citationCount: node.citationCount ?? 0,
        authors: Array.isArray(node.authors) ? node.authors : [],
        abstract: node.abstract || "",
        stage: storyStage,
        reason:
          index === 0
            ? "Best first background read before the seed paper"
            : roleMeta.role === "overview"
              ? "Helpful overview that fills in missing context"
              : roleMeta.role === "seminal"
                ? "Foundational older work that likely shaped the area"
                : node.depth === 1
                  ? "Direct influence on the selected topic"
                  : "Earlier context to deepen understanding"
      };
    });

  const readingPlan = buildAncestorReadingPlan(prioritized, rootNode, queryProfile);
  const companionResources = buildCompanionResources(rootNode, prioritized, queryProfile);

  return {
    title: `Start with ${rootNode.title}`,
    summary:
      prioritized.length > 0
        ? `PaperTrail found earlier papers that likely shaped ${rootNode.title}. Read the top recommendations in order, then return to the seed paper with more context.`
        : `PaperTrail identified ${rootNode.title} as the best seed paper, but did not find enough cited ancestors to rank a fuller reading path yet.`,
    recommendedOrder: prioritized,
    readingPlan,
    companionResources
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
      title: seedPaper?.title || seedPaper?.query || "Selected paper",
      year: seedPaper?.year ?? null
    };
    rootNode.query = seedPaper?.query || seedPaper?.title || "";

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
  const queryProfile = classifyQuery(query);
  const results = await fetchExternalPapers(query, limit);
  return {
    data: results,
    meta: {
      readingPlan: buildReadingPlan(results, { queryProfile })
    }
  };
}

module.exports = {
  fetchExternalPapers: searchPapersByQuery,
  fetchAncestorTree,
  __private: {
    buildCompanionResources,
    buildCandidateQueries,
    buildGuide,
    buildNode,
    buildReadingPlan,
    classifyQuery,
    classifyPaperRole,
    inferMatchReason,
    scoreAncestorNode,
    scoreSeedPaper
  }
};
