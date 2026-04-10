const paperRepository = require("./paper.repository");
const { fetchExternalPapers } = require("./paper.external");

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
}

module.exports = new PaperService();
