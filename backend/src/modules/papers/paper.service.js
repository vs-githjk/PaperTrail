const paperRepository = require("./paper.repository");
const { fetchAncestorTree, fetchExternalPapers } = require("./paper.external");

class PaperService {
  async getRecentPapers(limit) {
    return paperRepository.list(limit);
  }

  async getWorkspaceSnapshot(limit, userId = null) {
    const normalizedLimit = Number(limit) > 0 ? Number(limit) : 6;

    const fallback = {
      data: {
        recentPapers: [],
        recentResearch: []
      }
    };

    try {
      const recentPapersPromise = paperRepository.list(normalizedLimit);
      const recentResearchPromise = userId
        ? paperRepository.listResearchSessionsByUser(userId, normalizedLimit)
        : paperRepository.listResearchSessions(normalizedLimit);

      const [recentPapers, recentResearch] = await Promise.all([
        recentPapersPromise,
        recentResearchPromise
      ]);

      return {
        data: {
          recentPapers,
          recentResearch
        }
      };
    } catch (error) {
      return fallback;
    }
  }

  async searchPapers(searchText, limit, userId = null, clarification = null) {
    if (!searchText || !searchText.trim()) return [];
    const normalizedLimit = Number(limit) > 0 ? Number(limit) : 20;
    const query = searchText.trim();

    if (userId) {
      try {
        await paperRepository.saveUserSearch(userId, query);
      } catch (error) {
        // Search history persistence is best-effort.
      }
    }

    try {
      const localMatches = await paperRepository.searchByText(query, normalizedLimit);
      if (localMatches.length > 0) return localMatches;
    } catch (error) {
      // Local DB may be unavailable during early local setup.
    }

    return fetchExternalPapers(query, normalizedLimit, clarification);
  }

  async getAncestorTree(selection) {
    if (!selection || typeof selection !== "object") {
      const error = new Error("A selected paper or query is required.");
      error.status = 400;
      throw error;
    }

    const graph = await fetchAncestorTree(selection, {
      depth: selection.depth,
      breadth: selection.breadth,
      maxNodes: selection.maxNodes
    });

    return graph;
  }

  async savePaperForWorkspace(paper) {
    if (!paper || typeof paper !== "object") {
      const error = new Error("A paper payload is required.");
      error.status = 400;
      throw error;
    }

    await paperRepository.savePaper(paper);
    return { data: { saved: true } };
  }

  async saveResearchTrailForWorkspace(payload, userId = null) {
    if (!payload || typeof payload !== "object") {
      const error = new Error("A research trail payload is required.");
      error.status = 400;
      throw error;
    }

    const selectedPaper = payload?.selectedPaper && typeof payload.selectedPaper === "object"
      ? payload.selectedPaper
      : payload?.paper && typeof payload.paper === "object"
        ? payload.paper
        : {};

    const graph = payload?.graph && typeof payload.graph === "object" ? payload.graph : {};

    await paperRepository.saveResearchSession({
      query: typeof payload?.query === "string" ? payload.query : "",
      selectedPaper: {
        paperId: selectedPaper.paperId || selectedPaper.externalId || selectedPaper.id || null,
        title: selectedPaper.title || "Untitled paper",
        year: Number.isFinite(Number(selectedPaper.year)) ? Number(selectedPaper.year) : null,
        doi: selectedPaper.doi || null,
        externalId: selectedPaper.externalId || selectedPaper.paperId || selectedPaper.id || null,
        source: selectedPaper.source || null,
        authors: Array.isArray(selectedPaper.authors) ? selectedPaper.authors : [],
        role: selectedPaper.role || null,
        roleLabel: selectedPaper.roleLabel || null
      },
      guide: payload?.guide && typeof payload.guide === "object"
        ? payload.guide
        : graph?.data?.meta?.guide || graph?.meta?.guide || {},
      graphStats: {
        nodeCount: Array.isArray(graph?.data?.nodes) ? graph.data.nodes.length : 0,
        linkCount: Array.isArray(graph?.data?.links) ? graph.data.links.length : 0
      }
    }, userId);

    return { data: { saved: true } };
  }

  async getHistory(limit, userId) {
    if (!userId) {
      const error = new Error("Unauthorized");
      error.status = 401;
      throw error;
    }

    const normalizedLimit = Number(limit) > 0 ? Number(limit) : 20;
    try {
      const searches = await paperRepository.listUserSearchesByUser(userId, normalizedLimit);
      return { data: searches };
    } catch (error) {
      return { data: [] };
    }
  }

  async deleteHistoryEntry(userId, searchId) {
    if (!userId) {
      const error = new Error("Unauthorized");
      error.status = 401;
      throw error;
    }

    const { deleted } = await paperRepository.deleteUserSearch(userId, searchId);
    if (!deleted) {
      const error = new Error("History entry not found.");
      error.status = 404;
      throw error;
    }
  }

  async clearHistory(userId) {
    if (!userId) {
      const error = new Error("Unauthorized");
      error.status = 401;
      throw error;
    }

    await paperRepository.clearUserSearches(userId);
    return { data: { cleared: true } };
  }
}

module.exports = new PaperService();
