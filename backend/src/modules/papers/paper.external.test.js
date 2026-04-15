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

test("broad-topic queries expand into multiple candidate retrieval queries", () => {
  const profile = __private.classifyQuery("graph neural networks for drug discovery");
  const candidateQueries = __private.buildCandidateQueries(profile);

  assert.ok(candidateQueries.includes("graph neural networks for drug discovery"));
  assert.ok(candidateQueries.includes("graph neural networks for drug discovery survey"));
  assert.ok(candidateQueries.includes("graph neural networks for drug discovery review"));
  assert.ok(candidateQueries.length >= 4);
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
