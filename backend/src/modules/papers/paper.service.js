const paperRepository = require("./paper.repository");
const { fetchAncestorTree, fetchExternalPapers } = require("./paper.external");

class PaperService {
  async getRecentPapers(limit) {
    return paperRepository.list(limit);
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

    return fetchExternalPapers(query, normalizedLimit);
  }

  async getAncestorTree(selection) {
    if (!selection || typeof selection !== "object") {
      const error = new Error("A selected paper or query is required.");
      error.status = 400;
      throw error;
    }

    return fetchAncestorTree(selection, {
      depth: selection.depth,
      breadth: selection.breadth,
      maxNodes: selection.maxNodes
    });
  }
}

module.exports = new PaperService();
