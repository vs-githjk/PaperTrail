const test = require("node:test");
const assert = require("node:assert/strict");

const repositoryPath = require.resolve("./paper.repository");
const externalPath = require.resolve("./paper.external");

function loadServiceWithMocks({ repositoryMock, externalMock }) {
  delete require.cache[require.resolve("./paper.service")];
  delete require.cache[repositoryPath];
  delete require.cache[externalPath];

  require.cache[repositoryPath] = {
    id: repositoryPath,
    filename: repositoryPath,
    loaded: true,
    exports: repositoryMock
  };

  require.cache[externalPath] = {
    id: externalPath,
    filename: externalPath,
    loaded: true,
    exports: externalMock
  };

  const service = require("./paper.service");

  delete require.cache[require.resolve("./paper.service")];
  delete require.cache[repositoryPath];
  delete require.cache[externalPath];

  return service;
}

test("searchPapers persists external results when local lookup misses", async () => {
  const saved = [];
  const service = loadServiceWithMocks({
    repositoryMock: {
      searchByText: async () => [],
      saveMany: async (papers) => {
        saved.push(...papers);
      }
    },
    externalMock: {
      fetchExternalPapers: async () => ({
        data: [{ title: "Attention Is All You Need", paperId: "paper-1", source: "semanticScholar" }]
      }),
      fetchAncestorTree: async () => ({})
    }
  });

  const result = await service.searchPapers("attention is all you need", 5);

  assert.equal(result.data.length, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].title, "Attention Is All You Need");
});

test("getAncestorTree persists the selected paper best-effort", async () => {
  const savedSelections = [];
  const service = loadServiceWithMocks({
    repositoryMock: {
      savePaper: async (paper) => {
        savedSelections.push(paper);
      },
      saveResearchSession: async () => {}
    },
    externalMock: {
      fetchExternalPapers: async () => ({ data: [] }),
      fetchAncestorTree: async () => ({
        data: {
          nodes: [{ id: "paper-1" }, { id: "paper-2" }],
          links: [{ source: "paper-1", target: "paper-2" }],
          meta: {
            guide: {
              title: "Research path",
              readingPlan: []
            }
          }
        }
      })
    }
  });

  await service.getAncestorTree({
    title: "Attention Is All You Need",
    paperId: "paper-1",
    query: "transformers"
  });

  assert.equal(savedSelections.length, 1);
  assert.equal(savedSelections[0].paperId, "paper-1");
});

test("getAncestorTree persists a research session with guide and graph stats", async () => {
  const sessions = [];
  const service = loadServiceWithMocks({
    repositoryMock: {
      savePaper: async () => {},
      saveResearchSession: async (session) => {
        sessions.push(session);
      }
    },
    externalMock: {
      fetchExternalPapers: async () => ({ data: [] }),
      fetchAncestorTree: async () => ({
        data: {
          nodes: [{ id: "paper-1" }, { id: "paper-2" }, { id: "paper-3" }],
          links: [{ source: "paper-1", target: "paper-2" }],
          meta: {
            guide: {
              title: "Research path",
              summary: "Start with the seed and then move outward."
            }
          }
        }
      })
    }
  });

  await service.getAncestorTree({
    title: "Attention Is All You Need",
    paperId: "paper-1",
    query: "transformers",
    role: "seed",
    roleLabel: "Seed Paper"
  });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].query, "transformers");
  assert.equal(sessions[0].selectedPaper.title, "Attention Is All You Need");
  assert.equal(sessions[0].guide.title, "Research path");
  assert.equal(sessions[0].graphStats.nodeCount, 3);
});

test("getWorkspaceSnapshot returns recent papers and recent research together", async () => {
  const service = loadServiceWithMocks({
    repositoryMock: {
      list: async () => [{ id: 1, title: "Recent Paper" }],
      listResearchSessions: async () => [{ id: 9, query: "transformers" }]
    },
    externalMock: {
      fetchExternalPapers: async () => ({ data: [] }),
      fetchAncestorTree: async () => ({})
    }
  });

  const result = await service.getWorkspaceSnapshot(4);

  assert.equal(result.data.recentPapers.length, 1);
  assert.equal(result.data.recentResearch.length, 1);
  assert.equal(result.data.recentResearch[0].query, "transformers");
});
