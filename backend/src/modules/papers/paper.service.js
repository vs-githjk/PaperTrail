const paperRepository = require("./paper.repository");
const { fetchAncestorTree, fetchExternalPapers } = require("./paper.external");

class PaperService {
  async getRecentPapers(limit) {
    return paperRepository.list(limit);
  }

  async getWorkspaceSnapshot(limit) {
    const normalizedLimit = Number(limit) > 0 ? Number(limit) : 6;

    const fallback = {
      data: {
        recentPapers: [],
        recentResearch: []
      }
    };

    try {
      const [recentPapers, recentResearch] = await Promise.all([
        paperRepository.list(normalizedLimit),
        paperRepository.listResearchSessions(normalizedLimit)
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

  async searchPapers(searchText, limit) {
    if (!searchText || !searchText.trim()) return [];
    const normalizedLimit = Number(limit) > 0 ? Number(limit) : 20;
    const query = searchText.trim();
    try {
      const localMatches = await paperRepository.searchByText(query, normalizedLimit);
      if (localMatches.length > 0) return localMatches;
    } catch (error) {
      // Local DB may be unavailable during early local setup.
    }

    const externalResults = await fetchExternalPapers(query, normalizedLimit);
    try {
      await paperRepository.saveMany(externalResults.data || []);
    } catch (error) {
      // Persistence is best-effort during local setup.
    }

    return externalResults;
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

    try {
      await paperRepository.savePaper(selection);
    } catch (error) {
      // Persistence is best-effort during local setup.
    }

    try {
      await paperRepository.saveResearchSession({
        query: selection.query,
        selectedPaper: {
          paperId: selection.paperId || selection.externalId || selection.id || null,
          title: selection.title || "Untitled paper",
          year: Number.isFinite(Number(selection.year)) ? Number(selection.year) : null,
          doi: selection.doi || null,
          externalId: selection.externalId || selection.paperId || selection.id || null,
          source: selection.source || null,
          authors: Array.isArray(selection.authors) ? selection.authors : [],
          role: selection.role || null,
          roleLabel: selection.roleLabel || null
        },
        guide: graph?.data?.meta?.guide || graph?.meta?.guide || {},
        graphStats: {
          nodeCount: Array.isArray(graph?.data?.nodes) ? graph.data.nodes.length : 0,
          linkCount: Array.isArray(graph?.data?.links) ? graph.data.links.length : 0
        }
      });
    } catch (error) {
      // Persistence is best-effort during local setup.
    }

    return graph;
  }
}

module.exports = new PaperService();
