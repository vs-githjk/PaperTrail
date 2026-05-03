const test = require("node:test");
const assert = require("node:assert/strict");

const { __private } = require("./paper.external");

test("classifyQuery treats multi-word research prompts as broad topics", () => {
  const profile = __private.classifyQuery("transformers for natural language processing");

  assert.equal(profile.broadTopic, true);
  assert.equal(profile.directIdentifier, false);
  assert.ok(profile.tokens.includes("transformers"));
  assert.ok(profile.tokens.includes("natural"));
});

test("classifyQuery treats llms as a broad topic", () => {
  const profile = __private.classifyQuery("llms");

  assert.equal(profile.broadTopic, true);
  assert.equal(profile.directIdentifier, false);
  assert.deepEqual(profile.tokens, ["llms"]);
});

test("broad-topic queries expand into multiple candidate retrieval queries", () => {
  const profile = __private.classifyQuery("graph neural networks for drug discovery");
  const candidateQueries = __private.buildCandidateQueries(profile);

  assert.ok(candidateQueries.includes("graph neural networks for drug discovery"));
  assert.ok(candidateQueries.includes("graph neural networks for drug discovery survey"));
  assert.ok(candidateQueries.includes("graph neural networks for drug discovery review"));
  assert.ok(candidateQueries.length >= 4);
});

test("clarification expands candidate retrieval queries for broad topics", () => {
  const profile = __private.classifyQuery("llms");
  const candidateQueries = __private.buildCandidateQueries(profile, {
    focus: "agents",
    material: "survey",
    goal: "understand"
  });

  assert.ok(candidateQueries.includes("llms"));
  assert.ok(candidateQueries.includes("large language models"));
  assert.ok(candidateQueries.some((query) => query.includes("agents")));
  assert.ok(candidateQueries.some((query) => query.includes("survey")));
  assert.ok(candidateQueries.some((query) => query.includes("from scratch") || query.includes("introduction")));
  assert.ok(candidateQueries.some((query) => /tutorial|primer|basics|lecture notes/i.test(query)));
  assert.ok(candidateQueries.length <= 20);
});

test("broad-topic candidate query list is capped and ranked when clarification is present", () => {
  const raw = Array.from({ length: 40 }, (_, index) => `llms filler-${index}`);
  const profile = __private.classifyQuery("llms");
  const capped = __private.capBroadTopicQueries(raw, profile, { focus: "rag" }, 20);
  assert.equal(capped.length, 20);
});

test("clarification gate drops off-direction papers for broad topics with focus", () => {
  const profile = __private.classifyQuery("rag");
  const clarification = { focus: "rag", material: "survey", goal: "understand" };
  const onDirection = {
    title: "A Survey of Retrieval-Augmented Generation for LLMs",
    abstract: "We review retrieval augmented generation systems."
  };
  const offDirection = {
    title: "Quantum Error Correction with Surface Codes",
    abstract: "We study stabilizer codes and fault tolerance."
  };

  assert.equal(__private.passesClarifiedBroadTopicGate(onDirection, profile, clarification), true);
  assert.equal(__private.passesClarifiedBroadTopicGate(offDirection, profile, clarification), false);
});

test("diversifyPapersByTitle prefers non-redundant titles among top-scored items", () => {
  const papers = [
    { title: "Graph Neural Networks Survey Part One", abstract: "Overview of gnns.", recommendationScore: 100 },
    { title: "Graph Neural Networks Survey Part Two", abstract: "Another overview of gnns.", recommendationScore: 99 },
    { title: "Molecular Property Prediction with GNNs", abstract: "Drug discovery application.", recommendationScore: 50 }
  ];
  const picked = __private.diversifyPapersByTitle(papers, 2);
  assert.equal(picked.length, 2);
  assert.ok(picked.some((paper) => paper.title.includes("Molecular")));
});

test("specific paper lookups do not over-expand candidate retrieval queries", () => {
  const profile = __private.classifyQuery("Attention Is All You Need");
  const candidateQueries = __private.buildCandidateQueries(profile);

  assert.deepEqual(candidateQueries, [
    "Attention Is All You Need",
    "\"Attention Is All You Need\"",
    "Attention Is All You Need paper"
  ]);
});

test("seed scoring prefers survey-style papers for broad topics", () => {
  const profile = __private.classifyQuery("graph neural networks for drug discovery");
  const surveyPaper = {
    title: "A Survey of Graph Neural Networks for Drug Discovery",
    abstract: "An overview of graph neural network methods for molecules and drug discovery.",
    influenceScore: 18,
    year: 2023,
    source: "semantic_scholar",
    authors: ["A. Researcher"]
  };
  const narrowPaper = {
    title: "Fast Graph Neural Network Layer for Molecular Property Prediction",
    abstract: "A new layer for molecular prediction.",
    influenceScore: 35,
    year: 2024,
    source: "semantic_scholar",
    authors: ["B. Researcher"]
  };

  assert.ok(__private.scoreSeedPaper(surveyPaper, profile) > __private.scoreSeedPaper(narrowPaper, profile));
  assert.equal(__private.inferMatchReason(surveyPaper, profile), "Strong overview paper for a broad topic");
  assert.equal(__private.classifyPaperRole(surveyPaper, profile).role, "overview");
});

test("seed scoring prefers citation-backed structured papers when topical match is similar", () => {
  const profile = __private.classifyQuery("internet of things");
  const structuredPaper = {
    title: "Internet of Things (IoT): A vision, architectural elements, and future directions",
    abstract: "A broad treatment of the internet of things, architecture, and future directions.",
    influenceScore: 68,
    citationCount: 420,
    year: 2013,
    source: "semantic_scholar",
    paperId: "structured-paper",
    doi: "10.1000/structured",
    authors: ["Structured Author"]
  };
  const weaklyGroundedPaper = {
    title: "Internet of Things for Smart Environments",
    abstract: "A related internet of things topic paper.",
    influenceScore: 70,
    citationCount: 0,
    year: 2024,
    source: "arxiv",
    authors: ["Weak Author"]
  };

  assert.ok(__private.scoreSeedPaper(structuredPaper, profile) > __private.scoreSeedPaper(weaklyGroundedPaper, profile));
});

test("clarification scoring prefers papers that match the chosen direction", () => {
  const focusedPaper = {
    title: "A Survey of LLM Agents and Planning",
    abstract: "An introduction to agent planning with large language models.",
    role: "overview",
    year: 2024
  };
  const mismatchedPaper = {
    title: "Quantization of LLMs for Edge Devices",
    abstract: "Practical methods for quantized deployment.",
    role: "starting_point",
    year: 2024
  };

  const clarification = { focus: "agents", material: "survey", goal: "understand" };

  assert.ok(
    __private.scoreClarificationFit(focusedPaper, clarification) >
      __private.scoreClarificationFit(mismatchedPaper, clarification)
  );
});

test("adaptive tree budget allows deeper trees for strong seeds", () => {
  const budget = __private.chooseTreeBudget(
    {
      paperId: "seed-paper",
      doi: "10.1000/seed",
      citationCount: 240,
      references: Array.from({ length: 8 }, (_, index) => ({ paperId: `ref-${index}` })),
      title: "Large Language Models for Planning"
    },
    {},
    {
      query: "llms",
      clarification: { focus: "agents", material: "survey", goal: "understand" }
    }
  );

  assert.equal(budget.depthLimit, 4);
  assert.ok(budget.totalNodeLimit >= 20);
  assert.equal(budget.adaptiveBudget.qualityTier, "strong");
  assert.ok(budget.adaptiveBudget.structureScore >= 52);
});

test("adaptive tree budget stays shallow when only clarification is strong", () => {
  const budget = __private.chooseTreeBudget(
    {
      title: "Obscure Workshop Abstract",
      citationCount: 2,
      references: [],
      paperId: "weak-1"
    },
    {},
    {
      query: "llms",
      clarification: { focus: "agents", material: "survey", goal: "understand" }
    }
  );

  assert.equal(budget.depthLimit, 2);
  assert.equal(budget.adaptiveBudget.qualityTier, "sparse");
  assert.ok(budget.adaptiveBudget.clarificationBump > 0);
});

test("adaptive tree budget uses standard depth for middling citation graphs", () => {
  const budget = __private.chooseTreeBudget(
    {
      paperId: "mid-1",
      citationCount: 55,
      references: [
        { paperId: "r1" },
        { paperId: "r2" },
        { paperId: "r3" },
        { title: "Unknown predecessor" }
      ],
      title: "Reasonable but not landmark paper"
    },
    {},
    { query: "some niche topic" }
  );

  assert.equal(budget.depthLimit, 3);
  assert.equal(budget.adaptiveBudget.qualityTier, "standard");
  assert.equal(budget.totalNodeLimit, 18);
});

test("explicit depth options bypass quality scoring labels", () => {
  const budget = __private.chooseTreeBudget(
    { paperId: "x", references: [], citationCount: 0 },
    { depth: 2, breadth: 3, maxNodes: 10 },
    {}
  );

  assert.equal(budget.depthLimit, 2);
  assert.equal(budget.adaptiveBudget.qualityTier, "explicit");
});

test("seed scoring prefers exact title matches for specific paper lookups", () => {
  const profile = __private.classifyQuery("Attention Is All You Need");
  const exactPaper = {
    title: "Attention Is All You Need",
    abstract: "The Transformer model is introduced.",
    influenceScore: 75,
    year: 2017,
    source: "semantic_scholar",
    authors: ["Ashish Vaswani"]
  };
  const relatedPaper = {
    title: "Understanding Transformer Models for Sequence Learning",
    abstract: "A related analysis paper.",
    influenceScore: 90,
    year: 2020,
    source: "semantic_scholar",
    authors: ["Another Author"]
  };

  assert.ok(__private.scoreSeedPaper(exactPaper, profile) > __private.scoreSeedPaper(relatedPaper, profile));
});

test("broad-topic scoring penalizes partial-topic matches", () => {
  const profile = __private.classifyQuery("graph neural networks for drug discovery");
  const strongTopicPaper = {
    title: "Graph Neural Networks for Drug Discovery: A Review",
    abstract: "A review of graph neural network methods for molecular modeling and drug discovery.",
    influenceScore: 15,
    year: 2023,
    source: "semantic_scholar",
    authors: ["Topic Author"]
  };
  const partialMatchPaper = {
    title: "RAG-Enhanced Collaborative LLM Agents for Drug Discovery",
    abstract: "A retrieval-augmented generation system for scientific drug discovery workflows.",
    influenceScore: 22,
    year: 2025,
    source: "arxiv",
    authors: ["Agent Author"]
  };

  assert.ok(__private.scoreSeedPaper(strongTopicPaper, profile) > __private.scoreSeedPaper(partialMatchPaper, profile));
  assert.equal(__private.inferMatchReason(partialMatchPaper, profile), "Promising seed paper for this research direction");
});

test("off-domain overview candidates do not get overview treatment", () => {
  const profile = __private.classifyQuery("graph neural networks for drug discovery");
  const noisyOverview = {
    title: "A Review on Neural Network Models of Schizophrenia and Autism Spectrum Disorder",
    abstract:
      "This survey reviews neural network models for psychiatry and cognitive disorders across autism and schizophrenia.",
    influenceScore: 12,
    year: 2019,
    source: "arxiv",
    authors: ["Review Author"]
  };

  assert.equal(__private.classifyPaperRole(noisyOverview, profile).role, "supporting");
  assert.equal(__private.inferMatchReason(noisyOverview, profile), "Promising seed paper for this research direction");
});

test("guide ranking prefers direct background papers over deeper context", () => {
  const rootNode = {
    id: "root",
    title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
    year: 2019,
    query: "transformers for language understanding"
  };
  const guide = __private.buildGuide(
    [
      rootNode,
      {
        id: "survey",
        title: "A Survey of Transformer Models for Natural Language Processing",
        year: 2020,
        depth: 1,
        authors: ["Survey Author"]
      },
      {
        id: "direct",
        title: "Semi-Supervised Sequence Modeling with Cross-View Training",
        year: 2018,
        depth: 1,
        authors: ["Direct Author"]
      },
      {
        id: "deep",
        title: "Neural Language Modeling Foundations",
        year: 2014,
        depth: 2,
        authors: ["Foundations Author"]
      }
    ],
    rootNode
  );

  assert.equal(guide.recommendedOrder[0].id, "survey");
  assert.equal(guide.recommendedOrder[1].id, "direct");
  assert.equal(guide.recommendedOrder[0].role, "overview");
});

test("role classification distinguishes seed, starting point, and seminal papers", () => {
  const exactProfile = __private.classifyQuery("Attention Is All You Need");
  const broadProfile = __private.classifyQuery("graph neural networks for drug discovery");

  const seedRole = __private.classifyPaperRole(
    {
      title: "Attention Is All You Need",
      influenceScore: 100,
      year: 2017
    },
    exactProfile,
    { depth: 0 }
  );

  const startingRole = __private.classifyPaperRole(
    {
      title: "Graph Neural Network Approaches for Drug-Target Interactions",
      influenceScore: 22,
      year: 2022
    },
    broadProfile,
    { depth: 0 }
  );

  const seminalRole = __private.classifyPaperRole(
    {
      title: "Foundations of Molecular Graph Learning",
      influenceScore: 5,
      year: 2009,
      depth: 1
    },
    broadProfile,
    { depth: 1, rootYear: 2024 }
  );

  assert.equal(seedRole.role, "seed");
  assert.equal(startingRole.role, "starting_point");
  assert.equal(seminalRole.role, "seminal");
});

test("reading plan groups papers into staged sections", () => {
  const readingPlan = __private.buildReadingPlan([
    { id: "seed", title: "Best Starting Paper", role: "starting_point", roleLabel: "Best Starting Paper" },
    { id: "seminal", title: "Older Foundational Work", role: "seminal", roleLabel: "Seminal Paper" },
    { id: "overview", title: "Survey of the Area", role: "overview", roleLabel: "Overview Paper" },
    { id: "support", title: "Helpful Supporting Paper", role: "supporting", roleLabel: "Supporting Paper" }
  ]);

  assert.equal(readingPlan[0].stage, "start_here");
  assert.equal(readingPlan[1].stage, "foundational_background");
  assert.equal(readingPlan[2].stage, "broader_overview");
  assert.equal(readingPlan[3].stage, "optional_supporting");
  assert.equal(readingPlan[0].items[0].id, "seed");
});

test("exact-title reading plans keep only one item in Start Here", () => {
  const queryProfile = __private.classifyQuery("Attention Is All You Need");
  const readingPlan = __private.buildReadingPlan(
    [
      { id: "seed-main", title: "Attention Is All You Need", role: "seed", roleLabel: "Seed Paper" },
      { id: "seed-variant", title: "Element-wise Attention Is All You Need", role: "seed", roleLabel: "Seed Paper" },
      { id: "support", title: "Transformer Follow-up", role: "supporting", roleLabel: "Supporting Paper" }
    ],
    { queryProfile }
  );

  assert.equal(readingPlan[0].stage, "start_here");
  assert.equal(readingPlan[0].items.length, 1);
  assert.equal(readingPlan[0].items[0].id, "seed-main");
});

test("broad-topic reading plans keep a single deliberate first read", () => {
  const queryProfile = __private.classifyQuery("graph neural networks for drug discovery");
  const readingPlan = __private.buildReadingPlan(
    [
      { id: "overview-main", title: "A Survey of Graph Neural Networks for Drug Discovery", role: "overview", roleLabel: "Overview Paper" },
      { id: "starter", title: "Graph Neural Network Approaches for Drug-Target Interactions", role: "starting_point", roleLabel: "Best Starting Paper" },
      { id: "seminal", title: "Foundations of Molecular Graph Learning", role: "seminal", roleLabel: "Seminal Paper" }
    ],
    { queryProfile }
  );

  assert.equal(readingPlan[0].stage, "start_here");
  assert.equal(readingPlan[0].items.length, 1);
  assert.equal(readingPlan[0].items[0].id, "overview-main");
  assert.equal(readingPlan[1].stage, "foundational_background");
  assert.equal(readingPlan[2].stage, "optional_supporting");
  assert.equal(readingPlan[2].items[0].id, "starter");
});

test("fallback ancestor guide includes staged reading-plan metadata", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("network unavailable");
  };

  try {
    const result = await require("./paper.external").fetchAncestorTree({
      title: "Attention Is All You Need",
      query: "Attention Is All You Need"
    });

    assert.equal(result.data.meta.source, "fallback");
    assert.ok(result.data.nodes.length >= 6);
    assert.ok(result.data.nodes.some((node) => node.depth >= 2));
    const guide = result.data.meta.guide;
    assert.ok(Array.isArray(guide.recommendedOrder));
    assert.ok(Array.isArray(guide.readingPlan));
    assert.equal(guide.readingPlan[0].stage, "start_here");
    const stages = guide.readingPlan.map((section) => section.stage);
    assert.ok(stages.includes("broader_overview"));
    assert.ok(stages.includes("optional_supporting"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("live ancestor guide separates overview and foundational stages", () => {
  const rootNode = {
    id: "root",
    title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
    year: 2019,
    query: "transformers for language understanding"
  };

  const guide = __private.buildGuide(
    [
      rootNode,
      {
        id: "survey",
        title: "A Survey of Transformer Models for Natural Language Processing",
        year: 2020,
        depth: 1,
        authors: ["Survey Author"]
      },
      {
        id: "seminal",
        title: "Foundations of Neural Language Modeling",
        year: 2008,
        depth: 2,
        authors: ["Foundations Author"]
      },
      {
        id: "support",
        title: "Sequence Modeling with Semi-Supervised Objectives",
        year: 2018,
        depth: 1,
        authors: ["Support Author"]
      }
    ],
    rootNode
  );

  const stages = guide.readingPlan.map((section) => section.stage);
  assert.equal(stages[0], "start_here");
  assert.ok(stages.includes("foundational_background"));

  const startHereSection = guide.readingPlan.find((section) => section.stage === "start_here");
  const overviewSection = guide.readingPlan.find((section) => section.stage === "broader_overview");

  assert.equal(startHereSection.items[0].role, "overview");
  if (overviewSection) {
    assert.ok(overviewSection.items.every((item) => item.role === "overview"));
  }
});

test("buildNode preserves richer metadata for graph inspection", () => {
  const node = __private.buildNode(
    {
      paperId: "paper-123",
      title: "Test Paper",
      abstract: "A short abstract for graph inspection.",
      year: 2021,
      authors: [{ name: "Ada Lovelace" }, { name: "Alan Turing" }],
      externalIds: { DOI: "10.1000/test-doi" },
      citationCount: 42
    },
    1
  );

  assert.equal(node.id, "paper-123");
  assert.equal(node.doi, "10.1000/test-doi");
  assert.equal(node.citationCount, 42);
  assert.equal(node.abstract, "A short abstract for graph inspection.");
  assert.deepEqual(node.authors, ["Ada Lovelace", "Alan Turing"]);
});

test("guide includes companion learning resources beyond papers", () => {
  const rootNode = {
    id: "root",
    title: "Quantum Computing in the NISQ Era and Beyond",
    year: 2018,
    query: "quantum computing"
  };

  const guide = __private.buildGuide(
    [
      rootNode,
      {
        id: "overview",
        title: "Quantum Computing: Vision and Challenges",
        year: 2017,
        depth: 1,
        authors: ["Overview Author"]
      }
    ],
    rootNode
  );

  assert.ok(Array.isArray(guide.companionResources));
  assert.ok(guide.companionResources.length >= 4);
  assert.ok(guide.companionResources.some((resource) => resource.type === "video"));
  assert.ok(guide.companionResources.some((resource) => resource.label === "Google Scholar"));
});

test("reference breadth narrows as PaperTrail goes deeper into the lineage", () => {
  assert.equal(__private.referenceBreadthForDepth(0, 4), 4);
  assert.equal(__private.referenceBreadthForDepth(1, 4), 3);
  assert.equal(__private.referenceBreadthForDepth(2, 4), 2);
  assert.equal(__private.referenceBreadthForDepth(3, 4), 2);
});

test("reference candidate selection prefers stronger overview and foundational ancestors", () => {
  const rootNode = {
    id: "root",
    title: "Internet of Things Security for Adaptive Systems",
    year: 2024,
    query: "iot security adaptive systems"
  };
  const queryProfile = __private.classifyQuery(rootNode.query);

  const references = __private.selectReferenceCandidates(
    [
      {
        paperId: "overview",
        title: "A Survey of IoT Security for Adaptive Systems",
        abstract: "A review of IoT security, adaptive learning, and system design.",
        year: 2022,
        authors: [{ name: "Overview Author" }],
        citationCount: 180,
        source: "semantic_scholar"
      },
      {
        paperId: "seminal",
        title: "Foundations of Secure Distributed Device Coordination",
        abstract: "Foundational device coordination for secure distributed systems.",
        year: 2012,
        authors: [{ name: "Seminal Author" }],
        citationCount: 240,
        source: "semantic_scholar"
      },
      {
        paperId: "weak",
        title: "An Edge Cache Policy for Mobile Devices",
        abstract: "A weakly related edge caching paper.",
        year: 2023,
        authors: [{ name: "Weak Author" }],
        citationCount: 15,
        source: "semantic_scholar"
      }
    ],
    rootNode,
    queryProfile,
    1,
    2
  );

  assert.equal(references.length, 2);
  assert.equal(references[0].paperId, "overview");
  assert.equal(references[1].paperId, "seminal");
});

test("supplemental ancestor candidates enrich sparse trees with broader context", () => {
  const rootNode = {
    id: "root",
    title: "Quantum Computing in the NISQ Era and Beyond",
    year: 2018,
    query: "quantum computing"
  };
  const queryProfile = __private.classifyQuery(rootNode.query);
  const candidates = __private.buildSupplementalAncestorCandidates(
    [
      {
        paperId: "overview",
        title: "Quantum Computing: An Overview",
        abstract: "A broad review of quantum computing.",
        year: 2021,
        authors: ["Overview Author"],
        influenceScore: 72,
        source: "semantic_scholar"
      },
      {
        paperId: "seminal",
        title: "Foundations of Quantum Information Theory",
        abstract: "Foundational principles behind quantum information and computing.",
        year: 2001,
        authors: ["Seminal Author"],
        influenceScore: 95,
        source: "semantic_scholar"
      },
      {
        paperId: "starter",
        title: "Practical Quantum Algorithms for Near-Term Devices",
        abstract: "A practical starting paper for near-term quantum devices.",
        year: 2020,
        authors: ["Starter Author"],
        influenceScore: 44,
        source: "semantic_scholar"
      }
    ],
    [
      {
        id: "root",
        title: "Quantum Computing in the NISQ Era and Beyond",
        depth: 0,
        influenceScore: 0
      }
    ],
    rootNode,
    queryProfile,
    3
  );

  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].role, "overview");
  assert.ok(candidates.some((candidate) => candidate.role === "seminal"));
  assert.ok(candidates.every((candidate) => candidate.attachToId === "root" || candidate.depth >= 2));
});

test("inferBranchSemantics marks seed depth as current", () => {
  const profile = __private.classifyQuery("neural networks");
  const seed = { title: "Seed Paper", depth: 0, year: 2024, abstract: "" };
  const sem = __private.inferBranchSemantics(seed, profile, { depth: 0, rootYear: 2024 });
  assert.equal(sem.branchType, "current");
});

test("inferBranchSemantics classifies survey titles as overview", () => {
  const profile = __private.classifyQuery("machine learning");
  const paper = {
    title: "A Survey of Deep Representation Learning",
    abstract: "We review representation learning methods.",
    depth: 1,
    year: 2022,
    influenceScore: 40
  };
  const sem = __private.inferBranchSemantics(paper, profile, { depth: 1, rootYear: 2024 });
  assert.equal(sem.branchType, "overview");
});

test("inferBranchSemantics classifies methodology keywords", () => {
  const profile = __private.classifyQuery("vision transformers");
  const paper = {
    title: "Training Vision Transformers with improved optimization",
    abstract: "We study gradient-based training and ablation of transformer blocks.",
    depth: 1,
    year: 2023,
    influenceScore: 30
  };
  const sem = __private.inferBranchSemantics(paper, profile, { depth: 1, rootYear: 2024 });
  assert.equal(sem.branchType, "methodology");
});

test("attachBranchSemantics annotates every graph node", () => {
  const profile = __private.classifyQuery("topic models");
  const root = { id: "r", title: "Root", depth: 0, year: 2020, abstract: "" };
  const nodes = [
    root,
    { id: "a", title: "Older bounds on convergence", depth: 2, year: 1998, abstract: "We prove convergence bounds.", influenceScore: 10 }
  ];
  const out = __private.attachBranchSemantics(nodes, root, profile);
  assert.equal(out[0].branchType, "current");
  assert.equal(out[1].branchType, "foundational_theory");
});
