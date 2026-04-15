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

test("searchPapers returns external results when local lookup misses", async () => {
  const service = loadServiceWithMocks({
    repositoryMock: {
      searchByText: async () => []
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
  assert.equal(result.data[0].title, "Attention Is All You Need");
});

test("savePaperForWorkspace persists a selected paper", async () => {
  const saved = [];
  const service = loadServiceWithMocks({
    repositoryMock: {
      savePaper: async (paper) => {
        saved.push(paper);
      }
    },
    externalMock: {
      fetchExternalPapers: async () => ({ data: [] }),
      fetchAncestorTree: async () => ({})
    }
  });

  const result = await service.savePaperForWorkspace({
    title: "Attention Is All You Need",
    paperId: "paper-1",
    query: "transformers"
  });

  assert.equal(result.data.saved, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].paperId, "paper-1");
});

test("getAncestorTree returns graph without auto-saving session", async () => {
  const service = loadServiceWithMocks({
    repositoryMock: {
      saveResearchSession: async () => {}
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

  const graph = await service.getAncestorTree({
    title: "Attention Is All You Need",
    paperId: "paper-1",
    query: "transformers",
    role: "seed",
    roleLabel: "Seed Paper"
  });

  assert.equal(Array.isArray(graph.data.nodes), true);
  assert.equal(graph.data.nodes.length, 3);
});

test("saveResearchTrailForWorkspace persists session when requested", async () => {
  const sessions = [];
  const service = loadServiceWithMocks({
    repositoryMock: {
      saveResearchSession: async (session, userId) => {
        sessions.push({ session, userId });
      }
    },
    externalMock: {
      fetchExternalPapers: async () => ({ data: [] }),
      fetchAncestorTree: async () => ({})
    }
  });

  const result = await service.saveResearchTrailForWorkspace({
    query: "transformers",
    selectedPaper: {
      paperId: "paper-1",
      title: "Attention Is All You Need",
      roleLabel: "Seed Paper"
    },
    guide: {
      title: "Research path"
    },
    graph: {
      data: {
        nodes: [{ id: "paper-1" }, { id: "paper-2" }],
        links: [{ source: "paper-1", target: "paper-2" }]
      }
    }
  }, 12);

  assert.equal(result.data.saved, true);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].userId, 12);
  assert.equal(sessions[0].session.query, "transformers");
  assert.equal(sessions[0].session.selectedPaper.title, "Attention Is All You Need");
  assert.equal(sessions[0].session.guide.title, "Research path");
  assert.equal(sessions[0].session.graphStats.nodeCount, 2);
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
