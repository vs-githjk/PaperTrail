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
const BROAD_SINGLETONS = new Set(["llm", "llms", "ai", "iot", "nlp", "rag", "agents", "transformers"]);
const QUERY_ALIASES = {
  llm: ["large language models"],
  llms: ["large language models"],
  rag: ["retrieval augmented generation", "retrieval-augmented generation"],
  iot: ["internet of things"],
  nlp: ["natural language processing"]
};
const CLARIFICATION_TERMS = {
  focus: {
    foundations: ["foundations", "fundamentals", "theory", "origins"],
    reasoning: ["reasoning", "chain of thought", "inference"],
    agents: ["agents", "agent planning", "autonomous agents"],
    rag: ["rag", "retrieval augmented generation", "retrieval"],
    applications: ["applications", "systems", "use cases"]
  },
  material: {
    survey: ["survey", "review", "overview", "introduction"],
    seminal: ["foundational", "seminal", "classic"],
    practical: ["practical", "system", "implementation"],
    recent: ["recent", "latest", "state of the art"]
  },
  goal: {
    understand: ["introduction", "from scratch", "beginner"],
    build: ["practical", "applied", "implementation"],
    research: ["research", "advanced", "foundational"]
  }
};

/** Extra retrieval phrases per goal (broad-topic second stage). */
const GOAL_RETRIEVAL_PHRASES = {
  understand: ["tutorial", "primer", "basics", "lecture notes", "explained"],
  build: ["benchmark", "implementation", "deployment", "code", "system design"],
  research: ["state of the art", "advances", "open problems", "analysis"]
};

/** Extra retrieval phrases per material (paired with base topic). */
const MATERIAL_RETRIEVAL_PHRASES = {
  survey: ["systematic review", "literature review"],
  seminal: ["historical impact", "classic paper"],
  practical: ["engineering", "real world", "case study"],
  recent: ["2024", "2023", "emerging"]
};

const BROAD_MERGED_POOL_CAP = 110;
const BROAD_QUERY_CAP = 20;
const BROAD_PER_QUERY_LIMIT = 7;

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

function normalizeClarification(input) {
  if (!input || typeof input !== "object") {
    return { focus: "", material: "", goal: "" };
  }

  const normalized = {
    focus: typeof input.focus === "string" ? input.focus.trim().toLowerCase() : "",
    material: typeof input.material === "string" ? input.material.trim().toLowerCase() : "",
    goal: typeof input.goal === "string" ? input.goal.trim().toLowerCase() : ""
  };

  return {
    focus: CLARIFICATION_TERMS.focus[normalized.focus] ? normalized.focus : "",
    material: CLARIFICATION_TERMS.material[normalized.material] ? normalized.material : "",
    goal: CLARIFICATION_TERMS.goal[normalized.goal] ? normalized.goal : ""
  };
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

const BRANCH_METHOD_HINTS =
  /\b(benchmark|dataset|training|architecture|model|transformer|lstm|cnn|gan|diffusion|optimization|gradient|loss function|ablation|hyperparameter|encoder|decoder|fine-?tuning|pretrain|neural|backprop|inference|evaluation metric)\b/i;
const BRANCH_THEORY_HINTS =
  /\b(theorem|proof|bound|complexity|convergence|information theory|statistical learning|generalization|probabilistic model|bayesian|vc dimension|minimax|regret)\b/i;
const BRANCH_APPLIED_HINTS =
  /\b(clinical|hospital|iot|industry|deployment|real-?world|application|user study|production|robotics|autonomous|sensor|edge device|federated)\b/i;

/**
 * Semantic branch type for guided-map teaching (deterministic heuristics).
 * @returns {{ branchType: string, branchLabel: string, branchReason: string }}
 */
function inferBranchSemantics(paper, queryProfile, context = {}) {
  const depth = Number(context.depth ?? paper.depth ?? 0);
  const title = String(paper.title || "");
  const abstract = String(paper.abstract || "");
  const text = `${title} ${abstract}`;
  const rootYear = Number(context.rootYear || 0);
  const year = Number(paper.year || 0);
  const ageGap = rootYear > 0 && year > 0 ? rootYear - year : 0;
  const roleMeta = classifyPaperRole(paper, queryProfile, { depth, rootYear });

  if (depth <= 0) {
    return {
      branchType: "current",
      branchLabel: "Current paper",
      branchReason: "The seed paper this map is built around."
    };
  }

  if (roleMeta.role === "overview" || hasSurveyHint(title)) {
    if (queryProfile?.broadTopic && isOffDomainOverviewCandidate(paper, queryProfile)) {
      return {
        branchType: "applied_supporting",
        branchLabel: "Related read",
        branchReason: roleMeta.roleReason
      };
    }
    return {
      branchType: "overview",
      branchLabel: "Overview branch",
      branchReason: "Surveys and framing papers that orient you across the topic."
    };
  }

  if (BRANCH_METHOD_HINTS.test(text)) {
    return {
      branchType: "methodology",
      branchLabel: "Methods branch",
      branchReason: "Models, training, and experimental machinery that later work builds on."
    };
  }

  if (roleMeta.role === "seminal" || ageGap >= 10 || BRANCH_THEORY_HINTS.test(text)) {
    return {
      branchType: "foundational_theory",
      branchLabel: "Foundational theory",
      branchReason: "Older or theoretical work that shapes assumptions up the lineage."
    };
  }

  if (BRANCH_APPLIED_HINTS.test(text)) {
    return {
      branchType: "applied_supporting",
      branchLabel: "Applied context",
      branchReason: "Applied or domain-specific angles that sit beside the main technical spine."
    };
  }

  if (roleMeta.role === "supporting" || depth >= 2) {
    return {
      branchType: "applied_supporting",
      branchLabel: "Supporting branch",
      branchReason: roleMeta.roleReason || "Supporting papers that round out the story without defining the core spine."
    };
  }

  return {
    branchType: "foundational_theory",
    branchLabel: "Lineage backbone",
    branchReason: "Direct influences on the path toward your seed paper."
  };
}

function attachBranchSemantics(nodes, rootNode, queryProfile) {
  const rootYear = rootNode?.year ?? null;
  return nodes.map((node) => {
    const depth = Number.isFinite(Number(node.depth)) ? Number(node.depth) : 0;
    const sem = inferBranchSemantics(node, queryProfile, { depth, rootYear });
    return { ...node, ...sem };
  });
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
    (tokens.length >= 3 || BROAD_SINGLETONS.has(lowered) || /\b(topic|overview|introduction|basics|fundamentals)\b/.test(lowered));

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

function expandBaseAliases(base) {
  const aliases = [base];
  const aliasTerms = QUERY_ALIASES[base.toLowerCase()] || [];
  return [...new Set([...aliases, ...aliasTerms])];
}

function buildClarificationPhrases(clarification) {
  const phrases = [];

  for (const groupKey of ["focus", "material", "goal"]) {
    const value = clarification[groupKey];
    if (value && CLARIFICATION_TERMS[groupKey][value]) {
      phrases.push(...CLARIFICATION_TERMS[groupKey][value]);
    }
  }

  return [...new Set(phrases.filter(Boolean))];
}

function hasClarificationFields(clarification) {
  const c = normalizeClarification(clarification);
  return Boolean(c.focus || c.material || c.goal);
}

function capBroadTopicQueries(queries, queryProfile, clarificationInput, max = BROAD_QUERY_CAP) {
  if (!queryProfile.broadTopic || queries.length <= max) return queries;
  const c = normalizeClarification(clarificationInput);
  if (!hasClarificationFields(c)) {
    return queries.slice(0, max);
  }

  const baseSet = new Set(
    expandBaseAliases(queryProfile.normalized.trim())
      .map((variant) => variant.toLowerCase().trim())
      .filter(Boolean)
  );

  const focusTerms = (c.focus ? CLARIFICATION_TERMS.focus[c.focus] : []).filter((t) => t.length >= 3);
  const materialTerms = c.material ? CLARIFICATION_TERMS.material[c.material] || [] : [];
  const goalTerms = c.goal ? CLARIFICATION_TERMS.goal[c.goal] || [] : [];

  const scored = queries.map((q) => {
    const lower = q.toLowerCase().trim();
    let priority = 0;
    if (baseSet.has(lower)) priority += 520;
    for (const t of focusTerms) {
      if (t.length >= 4 && lower.includes(t)) priority += 120;
      else if (lower.includes(t)) priority += 70;
    }
    for (const t of materialTerms) {
      if (t.length >= 4 && lower.includes(t)) priority += 45;
    }
    for (const t of goalTerms) {
      if (t.length >= 4 && lower.includes(t)) priority += 35;
    }
    if (c.goal) {
      for (const phrase of GOAL_RETRIEVAL_PHRASES[c.goal] || []) {
        if (phrase.length >= 3 && lower.includes(phrase.toLowerCase())) priority += 110;
      }
    }
    if (c.material) {
      for (const phrase of MATERIAL_RETRIEVAL_PHRASES[c.material] || []) {
        if (phrase.length >= 3 && lower.includes(phrase.toLowerCase())) priority += 95;
      }
    }
    if (lower.includes(String(queryProfile.normalized).toLowerCase())) priority += 25;
    priority -= q.split(/\s+/).length * 2;
    return { q, priority };
  });

  scored.sort((a, b) => b.priority - a.priority || a.q.length - b.q.length);
  const ordered = [];
  const seen = new Set();
  for (const { q } of scored) {
    const key = q.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(q.trim());
    if (ordered.length >= max) break;
  }
  return ordered;
}

function mergeDedupeKey(item) {
  const id = String(item.paperId || item.doi || "").trim().toLowerCase();
  if (id) return `id:${id}`;
  return `t:${String(item.title || "").toLowerCase().trim()}`;
}

function titleTokenJaccard(leftPaper, rightPaper) {
  const A = new Set(uniqueTokens(`${leftPaper.title || ""} ${leftPaper.abstract || ""}`));
  const B = new Set(uniqueTokens(`${rightPaper.title || ""} ${rightPaper.abstract || ""}`));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) {
    if (B.has(t)) inter += 1;
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function diversifyPapersByTitle(papers, limit, maxNeighborSim = 0.58) {
  if (!Array.isArray(papers) || papers.length <= limit) return papers;
  const picked = [];
  const pickedIds = new Set();

  for (const paper of papers) {
    if (picked.length >= limit) break;
    const key = mergeDedupeKey(paper);
    if (pickedIds.has(key)) continue;
    const tooSimilar = picked.some((existing) => titleTokenJaccard(existing, paper) >= maxNeighborSim);
    if (tooSimilar) continue;
    picked.push(paper);
    pickedIds.add(key);
  }

  if (picked.length < limit) {
    for (const paper of papers) {
      if (picked.length >= limit) break;
      const key = mergeDedupeKey(paper);
      if (pickedIds.has(key)) continue;
      picked.push(paper);
      pickedIds.add(key);
    }
  }

  return picked;
}

function buildCandidateQueries(queryProfile, clarificationInput = null) {
  const base = queryProfile.normalized.trim();
  if (!base) return [];
  const clarification = normalizeClarification(clarificationInput);
  const clarifiedPhrases = buildClarificationPhrases(clarification);
  const baseVariants = expandBaseAliases(base);

  const queries = [...baseVariants];

  if (queryProfile.exactishTitle) {
    queries.push(`"${base}"`);
    queries.push(`${base} paper`);
  }

  if (queryProfile.broadTopic) {
    for (const variant of baseVariants) {
      for (const suffix of CANONICAL_QUERY_SUFFIXES) {
        queries.push(`${variant} ${suffix}`);
      }
    }

    const compactTopic = queryProfile.tokens.slice(0, 5).join(" ");
    if (compactTopic && compactTopic !== base.toLowerCase()) {
      queries.push(compactTopic);
    }

    if (hasClarificationFields(clarification)) {
      const goalPhrases = clarification.goal ? GOAL_RETRIEVAL_PHRASES[clarification.goal] || [] : [];
      const materialPhrases = clarification.material ? MATERIAL_RETRIEVAL_PHRASES[clarification.material] || [] : [];

      for (const variant of baseVariants) {
        for (const phrase of goalPhrases) {
          queries.push(`${variant} ${phrase}`);
        }
        for (const phrase of materialPhrases) {
          queries.push(`${variant} ${phrase}`);
        }
        if (clarification.focus && clarification.material) {
          const mTerms = CLARIFICATION_TERMS.material[clarification.material] || [];
          const anchor = mTerms[0] || clarification.material;
          queries.push(`${variant} ${clarification.focus} ${anchor}`);
        }
        if (clarification.focus && clarification.goal) {
          const gTerms = CLARIFICATION_TERMS.goal[clarification.goal] || [];
          const anchor = gTerms[0] || clarification.goal;
          queries.push(`${variant} ${clarification.focus} ${anchor}`);
        }
      }
    }
  }

  if (clarifiedPhrases.length > 0) {
    for (const variant of baseVariants) {
      for (const phrase of clarifiedPhrases) {
        queries.push(`${variant} ${phrase}`);
      }

      if (clarification.focus && clarification.material) {
        queries.push(`${variant} ${clarification.focus} ${clarification.material}`);
      }

      if (clarification.focus && clarification.goal) {
        queries.push(`${variant} ${clarification.focus} ${clarification.goal}`);
      }
    }
  }

  const uniq = [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
  return capBroadTopicQueries(uniq, queryProfile, clarificationInput);
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

function scoreClarificationFit(paper, clarification) {
  const normalized = normalizeClarification(clarification);
  const haystack = `${paper.title || ""} ${paper.abstract || ""} ${paper.role || ""}`.toLowerCase();
  let score = 0;

  for (const groupKey of ["focus", "material", "goal"]) {
    const value = normalized[groupKey];
    if (!value) continue;
    for (const token of CLARIFICATION_TERMS[groupKey][value]) {
      if (haystack.includes(token)) score += groupKey === "focus" ? 14 : 10;
    }
  }

  if (normalized.material === "survey" && hasSurveyHint(paper.title)) score += 40;
  if (normalized.material === "seminal" && Number(paper.year || 0) > 0 && Number(paper.year || 0) <= 2019) score += 22;
  if (normalized.material === "recent" && Number(paper.year || 0) >= 2023) score += 18;
  if (normalized.goal === "understand" && hasSurveyHint(`${paper.title || ""} ${paper.abstract || ""}`)) score += 24;
  if (normalized.goal === "build" && /system|framework|application|deployment|implementation/i.test(`${paper.title || ""} ${paper.abstract || ""}`)) score += 22;

  return score;
}

function clarificationFocusPhraseHits(paper, clarification) {
  const c = normalizeClarification(clarification);
  if (!c.focus) return 1;
  const haystack = `${paper.title || ""} ${paper.abstract || ""}`.toLowerCase();
  const terms = CLARIFICATION_TERMS.focus[c.focus] || [];
  let hits = 0;
  for (const token of terms) {
    if (token.length >= 4 && haystack.includes(token)) hits += 1;
  }
  return hits;
}

function passesClarifiedBroadTopicGate(paper, queryProfile, clarification) {
  if (!queryProfile.broadTopic) return true;
  const c = normalizeClarification(clarification);
  if (!hasClarificationFields(c)) return true;

  const fit = scoreClarificationFit(paper, c);
  const focusHits = clarificationFocusPhraseHits(paper, c);

  if (c.focus) {
    if (focusHits >= 1) return true;
    if (fit >= 16) return true;
    if (c.material === "survey" && hasSurveyHint(`${paper.title || ""} ${paper.abstract || ""}`) && fit >= 8) {
      return true;
    }
    return false;
  }

  if (fit >= 9) return true;
  const hay = `${paper.title || ""} ${paper.abstract || ""}`.toLowerCase();
  let materialOrGoalHit = 0;
  if (c.material) {
    for (const t of CLARIFICATION_TERMS.material[c.material] || []) {
      if (t.length >= 4 && hay.includes(t)) materialOrGoalHit += 1;
    }
  }
  if (c.goal) {
    for (const t of CLARIFICATION_TERMS.goal[c.goal] || []) {
      if (t.length >= 4 && hay.includes(t)) materialOrGoalHit += 1;
    }
  }
  return materialOrGoalHit >= 1 || fit >= 6;
}

function scoreSeedPaper(paper, queryProfile, clarification = null) {
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
  const hasStructuredIdentifier = Boolean(paper.paperId || paper.doi);
  const citationSignal = Math.min(
    Number.isFinite(Number(paper.citationCount)) ? Number(paper.citationCount) : influence * 1000,
    500
  );

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
    score += citationSignal * 0.05;
    if (hasStructuredIdentifier) score += 18;
    if (!hasStructuredIdentifier && paper.source !== "semantic_scholar") score -= 35;
    if (year >= 2018) score += 8;
  } else {
    score += Math.min(influence, 80);
    score += citationSignal * 0.03;
    if (hasStructuredIdentifier) score += 10;
    if (year >= 2015) score += 6;
  }

  if (paper.source === "semantic_scholar") score += 12;
  if (paper.doi) score += 10;
  if (Array.isArray(paper.authors) && paper.authors.length > 0) score += 4;
  score += scoreClarificationFit(paper, clarification);

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

function referenceBreadthForDepth(depth, baseBreadth) {
  const normalizedBase = Math.max(1, Number(baseBreadth) || 1);
  if (depth <= 0) return normalizedBase;
  if (depth === 1) return Math.max(2, normalizedBase - 1);
  return Math.max(1, normalizedBase - 2);
}

function scoreReferenceCandidate(reference, rootNode, queryProfile, depth) {
  const node = buildNode(reference, depth);
  const roleMeta = classifyPaperRole(node, queryProfile, { depth, rootYear: rootNode.year });
  let score = scoreAncestorNode(node, rootNode, queryProfile);

  score += Math.min(Number(node.citationCount || 0), 400) * 0.08;
  if (roleMeta.role === "overview") score += 40;
  if (roleMeta.role === "seminal") score += 34;
  if (depth === 1) score += 16;
  if (node.doi) score += 6;
  if (node.source === "semantic_scholar") score += 4;

  return score;
}

function selectReferenceCandidates(references, rootNode, queryProfile, depth, limit) {
  return dedupeByTitle(Array.isArray(references) ? references : [])
    .map((reference) => ({
      ...reference,
      __score: scoreReferenceCandidate(reference, rootNode, queryProfile, depth)
    }))
    .sort((left, right) => {
      const scoreGap = right.__score - left.__score;
      if (scoreGap !== 0) return scoreGap;
      return String(left.title || "").localeCompare(String(right.title || ""));
    })
    .slice(0, Math.max(1, limit))
    .map(({ __score, ...reference }) => reference);
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

async function fetchExternalPapers(topic, limit = 20, clarification = null) {
  const queryProfile = classifyQuery(topic);
  const normalizedClarification = normalizeClarification(clarification);
  const candidateQueries = buildCandidateQueries(queryProfile, normalizedClarification);
  const perQueryLimit = queryProfile.broadTopic
    ? Math.min(Math.max(limit, 5), BROAD_PER_QUERY_LIMIT)
    : Math.min(limit, 20);

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
    const key = mergeDedupeKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let pool = deduped;
  if (queryProfile.broadTopic && pool.length > BROAD_MERGED_POOL_CAP) {
    pool = pool.slice(0, BROAD_MERGED_POOL_CAP);
  }

  let workingPool = pool.filter((item) =>
    passesClarifiedBroadTopicGate(item, queryProfile, normalizedClarification)
  );
  if (
    workingPool.length === 0 &&
    queryProfile.broadTopic &&
    hasClarificationFields(normalizedClarification) &&
    pool.length > 0
  ) {
    workingPool = pool;
  }

  const scored = workingPool
    .map((item) => {
      const score = scoreSeedPaper(item, queryProfile, normalizedClarification);
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
    });

  const diversified = queryProfile.broadTopic ? diversifyPapersByTitle(scored, limit) : scored;

  return diversified
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

async function hydratePaperForExpansion(paper, cache) {
  const identifier = pickIdentifier(paper);
  if (!identifier) return paper;

  if (cache.has(identifier)) {
    return cache.get(identifier);
  }

  try {
    const hydrated = await fetchSemanticScholarPaper(identifier);
    cache.set(identifier, hydrated);
    if (hydrated?.paperId) cache.set(hydrated.paperId, hydrated);
    if (hydrated?.externalIds?.DOI) cache.set(hydrated.externalIds.DOI, hydrated);
    return hydrated;
  } catch (error) {
    cache.set(identifier, paper);
    return paper;
  }
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

function buildSupplementalAncestorCandidates(results, existingNodes, rootNode, queryProfile, maxCandidates = 6) {
  const seenIds = new Set(existingNodes.map((node) => String(node.id || "").trim()).filter(Boolean));
  const seenTitles = new Set(existingNodes.map((node) => String(node.title || "").toLowerCase().trim()).filter(Boolean));

  const candidates = (Array.isArray(results) ? results : [])
    .filter((item) => {
      const id = String(item.id || item.paperId || item.externalId || "").trim();
      const titleKey = String(item.title || "").toLowerCase().trim();
      if (!titleKey) return false;
      if (id && seenIds.has(id)) return false;
      if (seenTitles.has(titleKey)) return false;
      return true;
    })
    .map((item) => {
      const roleMeta = classifyPaperRole(item, queryProfile, { depth: 1, rootYear: rootNode.year });
      const depth =
        roleMeta.role === "seminal"
          ? 2
          : roleMeta.role === "overview"
            ? 1
            : 1;

      return {
        id: item.paperId || item.id || item.doi || item.title,
        title: item.title || "Untitled paper",
        label: item.title || "Untitled paper",
        year: item.year ?? null,
        authors: Array.isArray(item.authors) ? item.authors : [],
        abstract: item.abstract || roleMeta.roleReason,
        citationCount: Number.isFinite(Number(item.citationCount)) ? Number(item.citationCount) : 0,
        influenceScore: Number.isFinite(Number(item.influenceScore)) ? Number(item.influenceScore) : 0,
        doi: item.doi || null,
        paperId: item.paperId || item.externalId || item.id || null,
        source: item.source || "semantic_scholar",
        depth,
        role: roleMeta.role,
        roleLabel: roleMeta.roleLabel,
        roleReason: roleMeta.roleReason
      };
    })
    .sort((left, right) => {
      const leftRoleBoost = left.role === "overview" ? 2 : left.role === "seminal" ? 1 : 0;
      const rightRoleBoost = right.role === "overview" ? 2 : right.role === "seminal" ? 1 : 0;
      const roleGap = rightRoleBoost - leftRoleBoost;
      if (roleGap !== 0) return roleGap;
      return (right.influenceScore || 0) - (left.influenceScore || 0);
    })
    .slice(0, Math.max(0, maxCandidates));

  const bridgeNode =
    existingNodes
      .filter((node) => node.id !== rootNode.id)
      .sort((left, right) => {
        const leftRole = classifyPaperRole(left, queryProfile, { depth: left.depth, rootYear: rootNode.year }).role;
        const rightRole = classifyPaperRole(right, queryProfile, { depth: right.depth, rootYear: rootNode.year }).role;
        const leftBoost = leftRole === "overview" ? 2 : leftRole === "seminal" ? 1 : 0;
        const rightBoost = rightRole === "overview" ? 2 : rightRole === "seminal" ? 1 : 0;
        const boostGap = rightBoost - leftBoost;
        if (boostGap !== 0) return boostGap;
        return (right.influenceScore || 0) - (left.influenceScore || 0);
      })[0] || rootNode;

  return candidates.map((candidate, index) => {
    const attachToId =
      candidate.role === "seminal" && bridgeNode && bridgeNode.id !== rootNode.id
        ? bridgeNode.id
        : rootNode.id;

    return {
      ...candidate,
      depth: attachToId === rootNode.id ? 1 : Math.max(2, candidate.depth || 2),
      attachToId,
      order: index
    };
  });
}

async function supplementSparseLineage({ rootNode, nodes, links, queryProfile, totalNodeLimit }) {
  const remainingSlots = Math.max(0, totalNodeLimit - nodes.length);
  if (remainingSlots === 0) return { nodes, links };

  try {
    const searchResults = await fetchExternalPapers(rootNode.query || rootNode.title || "", Math.min(12, remainingSlots + 6));
    const supplementalNodes = buildSupplementalAncestorCandidates(
      searchResults,
      nodes,
      rootNode,
      queryProfile,
      Math.min(remainingSlots, 6)
    );

    if (supplementalNodes.length === 0) return { nodes, links };

    const nextNodes = [...nodes];
    const nextLinks = [...links];
    const seenLinks = new Set(links.map((link) => `${link.source}->${link.target}`));

    for (const candidate of supplementalNodes) {
      nextNodes.push(candidate);
      const linkKey = `${candidate.attachToId}->${candidate.id}`;
      if (!seenLinks.has(linkKey)) {
        seenLinks.add(linkKey);
        nextLinks.push({ source: candidate.attachToId, target: candidate.id });
      }
    }

    return { nodes: nextNodes, links: nextLinks };
  } catch (error) {
    return { nodes, links };
  }
}

function makeFallbackNode({ id, title, role, reason, depth, source = "fallback", authors = [], year = null, abstract = "", doi = null, paperId = null, influenceScore = 0, citationCount = 0 }) {
  const roleMeta = {
    role,
    roleLabel:
      role === "overview"
        ? "Overview Paper"
        : role === "seminal"
          ? "Seminal Paper"
          : role === "starting_point"
            ? "Best Starting Paper"
            : "Supporting Paper"
  };

  return {
    id,
    title,
    label: title,
    role: roleMeta.role,
    roleLabel: roleMeta.roleLabel,
    reason,
    depth,
    abstract: abstract || reason,
    citationCount,
    influenceScore,
    doi,
    paperId: paperId || id,
    source,
    authors,
    year
  };
}

function buildTemplateFallbackAncestors(rootId, rootTitle) {
  return [
    makeFallbackNode({
      id: `${rootId}-overview`,
      title: `Survey and orientation for ${rootTitle}`,
      role: "overview",
      reason: "Start here to get the landscape before diving into specialized papers.",
      depth: 1
    }),
    makeFallbackNode({
      id: `${rootId}-foundation`,
      title: `Foundational work behind ${rootTitle}`,
      role: "seminal",
      reason: "Older background that likely shaped the field.",
      depth: 1
    }),
    makeFallbackNode({
      id: `${rootId}-methodology`,
      title: `Core methodology related to ${rootTitle}`,
      role: "starting_point",
      reason: "A practical technical bridge into the methods used in this area.",
      depth: 1
    }),
    makeFallbackNode({
      id: `${rootId}-overview-detail`,
      title: `Broader overview connected to ${rootTitle}`,
      role: "overview",
      reason: "Useful context once the first orientation pass is complete.",
      depth: 2
    }),
    makeFallbackNode({
      id: `${rootId}-theory`,
      title: `Earlier theory that supports ${rootTitle}`,
      role: "seminal",
      reason: "A deeper conceptual ancestor for building intuition from scratch.",
      depth: 2
    }),
    makeFallbackNode({
      id: `${rootId}-application`,
      title: `Applied paper that grounds ${rootTitle}`,
      role: "supporting",
      reason: "A concrete application that makes the topic easier to understand.",
      depth: 2
    }),
    makeFallbackNode({
      id: `${rootId}-adjacent`,
      title: `Adjacent supporting context for ${rootTitle}`,
      role: "supporting",
      reason: "Optional context to round out your understanding.",
      depth: 2
    })
  ];
}

function pickFallbackPrimaryAnchors(candidates, rootId, rootTitle) {
  const templates = buildTemplateFallbackAncestors(rootId, rootTitle);
  const overview = candidates.find((item) => item.role === "overview") || templates[0];
  const foundation = candidates.find((item) => item.role === "seminal") || templates[1];
  const methodology =
    candidates.find((item) => item.role === "starting_point" || item.role === "supporting") || templates[2];

  return { overview, foundation, methodology, templates };
}

function synthesizeFallbackHierarchy(rootNode, candidates = []) {
  const rootId = rootNode.id;
  const rootTitle = rootNode.title;
  const { overview, foundation, methodology, templates } = pickFallbackPrimaryAnchors(candidates, rootId, rootTitle);
  const primaryIds = new Set([overview.id, foundation.id, methodology.id]);
  const remaining = candidates.filter((item) => !primaryIds.has(item.id));

  const overviewChildren = remaining.filter((item) => item.role === "overview").slice(0, 1);
  const foundationChildren = remaining.filter((item) => item.role === "seminal").slice(0, 2);
  const methodologyChildren = remaining
    .filter((item) => item.role === "starting_point" || item.role === "supporting")
    .slice(0, 3);

  const fallbackChildren = [
    overviewChildren[0] || templates[3],
    foundationChildren[0] || templates[4],
    methodologyChildren[0] || templates[5],
    methodologyChildren[1] || templates[6]
  ];

  const primaryNodes = [
    { ...overview, depth: 1, attachToId: rootId },
    { ...foundation, depth: 1, attachToId: rootId },
    { ...methodology, depth: 1, attachToId: rootId }
  ];

  const secondaryNodes = [
    { ...(overviewChildren[0] || templates[3]), depth: 2, attachToId: overview.id },
    { ...(foundationChildren[0] || templates[4]), depth: 2, attachToId: foundation.id },
    { ...(methodologyChildren[0] || templates[5]), depth: 2, attachToId: methodology.id },
    { ...(methodologyChildren[1] || templates[6]), depth: 2, attachToId: methodology.id }
  ];

  return dedupeByTitle([...primaryNodes, ...secondaryNodes]).slice(0, 8);
}

async function buildFallbackTree(paper) {
  const rootTitle = paper?.title || paper?.query || "Selected paper";
  const rootId = pickIdentifier(paper) || rootTitle;
  const queryProfile = classifyQuery(paper?.query || paper?.title || "");
  let guidedCandidates = [];

  try {
    const externalCandidates = await fetchExternalPapers(paper?.query || paper?.title || rootTitle, 10);
    guidedCandidates = externalCandidates.map((item) =>
      makeFallbackNode({
        id: item.paperId || item.id || item.doi || item.title,
        title: item.title || "Untitled paper",
        role: item.role || "supporting",
        reason: item.matchReason || item.roleReason || "Suggested supporting context",
        depth: item.role === "seminal" ? 2 : 1,
        source: item.source || "semantic_scholar",
        authors: Array.isArray(item.authors) ? item.authors : [],
        year: item.year ?? null,
        abstract: item.abstract || "",
        doi: item.doi || null,
        paperId: item.paperId || item.externalId || item.id || null,
        influenceScore: Number.isFinite(Number(item.influenceScore)) ? Number(item.influenceScore) : 0,
        citationCount: Number.isFinite(Number(item.citationCount)) ? Number(item.citationCount) : 0
      })
    );
  } catch (error) {
    guidedCandidates = [];
  }

  const suggestedAncestors = synthesizeFallbackHierarchy(
    {
      id: rootId,
      title: rootTitle
    },
    guidedCandidates
  );

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
      depth: item.depth || 1,
      abstract: item.abstract || item.reason,
      citationCount: Number.isFinite(Number(item.citationCount)) ? Number(item.citationCount) : 0,
      influenceScore: Number.isFinite(Number(item.influenceScore)) ? Number(item.influenceScore) : 0,
      doi: item.doi || null,
      paperId: item.paperId || item.id,
      source: item.source || "fallback",
      authors: Array.isArray(item.authors) ? item.authors : [],
      year: item.year ?? null
    });
    links.push({ source: item.attachToId || rootId, target: item.id });
  });

  const graphNodes = attachBranchSemantics(nodes, nodes[0], queryProfile);

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

  const byGraphId = new Map(graphNodes.map((n) => [n.id, n]));
  const recommendedOrderWithBranches = suggestedAncestors.map((item) => {
    const g = byGraphId.get(item.id);
    if (!g) return item;
    return {
      ...item,
      branchType: g.branchType,
      branchLabel: g.branchLabel,
      branchReason: g.branchReason
    };
  });

  return {
    data: {
      nodes: graphNodes,
      links,
      meta: {
        source: "fallback",
        rootId,
        rootTitle,
        guide: {
          title: `Start with ${rootTitle}`,
          summary:
            "PaperTrail could not fetch live citation ancestry for this seed, so it synthesized a broader guided learning tree from related papers and topic context.",
          recommendedOrder: recommendedOrderWithBranches,
          readingPlan,
          companionResources
        },
        note: "Live citation ancestry was unavailable for this seed, so PaperTrail generated a guided fallback tree from related papers and topic context."
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
    .slice(0, 8)
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
        branchType: node.branchType,
        branchLabel: node.branchLabel,
        branchReason: node.branchReason,
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

function referenceHasStableId(reference) {
  if (!reference || typeof reference !== "object") return false;
  return Boolean(
    reference.paperId ||
    reference.doi ||
    reference.externalIds?.DOI
  );
}

/**
 * Lineage strength from resolved Semantic Scholar payload only (capped).
 * Clarification is applied separately so it cannot max out depth by itself.
 */
function computeStructureLineageScore(rootPaper) {
  const refs = Array.isArray(rootPaper?.references) ? rootPaper.references : [];
  const refCount = refs.length;
  const refWithId = refs.filter(referenceHasStableId).length;
  let structure = 0;
  structure += Math.min(refCount * 5, 35);
  structure += Math.min(refWithId * 4, 28);
  const citationCount = Number(rootPaper?.citationCount ?? 0);
  if (Number.isFinite(citationCount) && citationCount > 0) {
    structure += Math.min(citationCount / 12, 32);
  }
  if (rootPaper?.paperId) structure += 8;
  if (rootPaper?.doi || rootPaper?.externalIds?.DOI) structure += 8;
  const abstractText = String(rootPaper?.abstract || "").trim();
  if (abstractText.length > 120) structure += 6;

  return {
    structureScore: Math.min(88, Math.round(structure)),
    refCount,
    refWithId,
    citationCount: Number.isFinite(citationCount) ? citationCount : 0
  };
}

function clarificationLineageBump(seedPaper) {
  const c = normalizeClarification(seedPaper?.clarification);
  let bump = 0;
  if (c.focus) bump += 4;
  if (c.material) bump += 3;
  if (c.goal) bump += 3;
  return Math.min(12, bump);
}

/**
 * Maps structure + light clarification context to depth / breadth / node cap.
 * Depth 4 requires both a decent quality score and enough identified references.
 */
function computeAdaptiveTreeBudget(rootPaper, seedPaper = {}) {
  const { structureScore, refCount, refWithId, citationCount } = computeStructureLineageScore(rootPaper);
  const clarificationBump = clarificationLineageBump(seedPaper);
  const qualityScore = Math.min(100, structureScore + clarificationBump);
  const queryProfile = classifyQuery(seedPaper?.query || seedPaper?.title || rootPaper?.title || "");

  const graphReadyForDeep =
    refCount >= 5 &&
    refWithId >= 3 &&
    (structureScore >= 52 || (citationCount >= 100 && refWithId >= 4));
  const exceptionalGraph =
    refCount >= 3 &&
    refWithId >= 2 &&
    (citationCount >= 320 || structureScore >= 80);

  let qualityTier = "standard";
  let budgetReason = "Balanced tree: citation graph looks usable but not exceptionally rich.";
  let depthLimit = 3;
  let breadthLimit = 4;
  let totalNodeLimit = 18;

  if (qualityScore >= 74 && graphReadyForDeep) {
    qualityTier = "strong";
    budgetReason =
      "Deeper tree: many identified references and strong metadata support expanding another generation.";
    depthLimit = 4;
    breadthLimit = 5;
    totalNodeLimit = queryProfile.broadTopic ? 22 : 20;
  } else if (exceptionalGraph && qualityScore >= 70) {
    qualityTier = "strong";
    budgetReason =
      "Deeper tree: very high influence or dense reference metadata supports an extra layer.";
    depthLimit = 4;
    breadthLimit = 5;
    totalNodeLimit = queryProfile.broadTopic ? 22 : 20;
  } else if (qualityScore < 34) {
    qualityTier = "sparse";
    budgetReason =
      "Shallow tree: few references or weak identifiers from the source; limiting depth avoids empty branches.";
    depthLimit = 2;
    breadthLimit = 3;
    totalNodeLimit = 13;
  }

  return {
    depthLimit,
    breadthLimit,
    totalNodeLimit,
    adaptiveBudget: {
      qualityScore,
      structureScore,
      clarificationBump,
      qualityTier,
      budgetReason,
      refCount,
      refWithId
    }
  };
}

function chooseTreeBudget(rootPaper, options = {}, seedPaper = {}) {
  const explicitDepth = Number(options.depth);
  const explicitBreadth = Number(options.breadth);
  const explicitMaxNodes = Number(options.maxNodes);

  if (Number.isFinite(explicitDepth) || Number.isFinite(explicitBreadth) || Number.isFinite(explicitMaxNodes)) {
    return {
      depthLimit: Math.max(1, Math.min(explicitDepth || 3, 4)),
      breadthLimit: Math.max(1, Math.min(explicitBreadth || 4, 6)),
      totalNodeLimit: Math.max(6, Math.min(explicitMaxNodes || 18, 28)),
      adaptiveBudget: {
        qualityTier: "explicit",
        budgetReason: "Using request depth, breadth, or maxNodes instead of automatic quality-based limits."
      }
    };
  }

  return computeAdaptiveTreeBudget(rootPaper, seedPaper);
}

async function fetchAncestorTree(seedPaper, options = {}) {
  try {
    const rootPaper = await resolvePaperSeed(seedPaper);
    const { depthLimit, breadthLimit, totalNodeLimit, adaptiveBudget } = chooseTreeBudget(
      rootPaper,
      options,
      seedPaper
    );
    const queryProfile = classifyQuery(seedPaper?.query || seedPaper?.title || rootPaper?.title || "");
    const scoringRoot = buildNode(rootPaper, 0);
    scoringRoot.query = seedPaper?.query || seedPaper?.title || rootPaper?.title || "";
    const nodes = [];
    const links = [];
    const linkKeys = new Set();
    const queue = [{ paper: rootPaper, depth: 0 }];
    const visited = new Set();
    const paperCache = new Map();

    const rootIdentifier = pickIdentifier(rootPaper);
    if (rootIdentifier) paperCache.set(rootIdentifier, rootPaper);
    if (rootPaper?.paperId) paperCache.set(rootPaper.paperId, rootPaper);
    if (rootPaper?.externalIds?.DOI) paperCache.set(rootPaper.externalIds.DOI, rootPaper);

    while (queue.length > 0 && nodes.length < totalNodeLimit) {
      const current = queue.shift();
      const expandedPaper =
        current.depth === 0 || current.depth >= depthLimit
          ? current.paper
          : await hydratePaperForExpansion(current.paper, paperCache);
      const currentNode = buildNode(expandedPaper, current.depth);
      if (!currentNode.id || visited.has(currentNode.id)) continue;
      visited.add(currentNode.id);
      nodes.push(currentNode);

      if (current.depth >= depthLimit) continue;

      const references = selectReferenceCandidates(
        Array.isArray(expandedPaper.references) ? expandedPaper.references : [],
        scoringRoot,
        queryProfile,
        current.depth + 1,
        referenceBreadthForDepth(current.depth, breadthLimit)
      );

      for (const reference of references) {
        const childNode = buildNode(reference, current.depth + 1);
        if (!childNode.id) continue;

        const linkKey = `${currentNode.id}->${childNode.id}`;
        if (!linkKeys.has(linkKey)) {
          linkKeys.add(linkKey);
          links.push({ source: currentNode.id, target: childNode.id });
        }

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

    const desiredMinimumNodes = Math.min(totalNodeLimit, 9);
    const maybeSupplemented =
      nodes.length < desiredMinimumNodes
        ? await supplementSparseLineage({
            rootNode,
            nodes,
            links,
            queryProfile,
            totalNodeLimit
          })
        : { nodes, links };

    const graphNodes = attachBranchSemantics(maybeSupplemented.nodes, rootNode, queryProfile);

    return {
      data: {
        nodes: graphNodes,
        links: maybeSupplemented.links,
        meta: {
          source: "semantic_scholar",
          rootId: rootNode.id,
          rootTitle: rootNode.title,
          depthLimit,
          breadthLimit,
          adaptiveBudget,
          guide: buildGuide(graphNodes, rootNode)
        }
      }
    };
  } catch (error) {
    return buildFallbackTree(seedPaper);
  }
}

async function searchPapersByQuery(query, limit = 20) {
  const queryProfile = classifyQuery(query);
  let clarification = null;
  if (arguments.length >= 3) {
    clarification = arguments[2];
  }
  const results = await fetchExternalPapers(query, limit, clarification);
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
    buildSupplementalAncestorCandidates,
    buildCandidateQueries,
    buildGuide,
    buildNode,
    buildReadingPlan,
    attachBranchSemantics,
    inferBranchSemantics,
    classifyQuery,
    classifyPaperRole,
    chooseTreeBudget,
    computeAdaptiveTreeBudget,
    computeStructureLineageScore,
    inferMatchReason,
    normalizeClarification,
    referenceBreadthForDepth,
    scoreClarificationFit,
    passesClarifiedBroadTopicGate,
    diversifyPapersByTitle,
    capBroadTopicQueries,
    hasClarificationFields,
    mergeDedupeKey,
    selectReferenceCandidates,
    scoreAncestorNode,
    scoreSeedPaper
  }
};
