const { pgPool } = require("../../db/postgres");

class PaperRepository {
  async list(limit = 20) {
    const query = `
      SELECT id, title, year, doi, created_at
      FROM papers
      ORDER BY created_at DESC
      LIMIT $1
    `;
    const { rows } = await pgPool.query(query, [limit]);
    return rows;
  }

  async searchByText(searchText, limit = 20) {
    const query = `
      SELECT
        id,
        title,
        COALESCE(authors, '[]'::jsonb) AS authors,
        COALESCE(influence_score, 0) AS "influenceScore",
        abstract
      FROM papers
      WHERE title ILIKE $1 OR COALESCE(abstract, '') ILIKE $1
      ORDER BY influence_score DESC NULLS LAST, created_at DESC
      LIMIT $2
    `;
    const { rows } = await pgPool.query(query, [`%${searchText}%`, limit]);
    return rows;
  }
}

module.exports = new PaperRepository();
