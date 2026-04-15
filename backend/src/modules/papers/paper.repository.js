const { pgPool } = require("../../db/postgres");

class PaperRepository {
  async list(limit = 20) {
    const query = `
      SELECT id, title, year, doi, external_id AS "externalId", source, created_at
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
        abstract,
        doi,
        external_id AS "externalId",
        source
      FROM papers
      WHERE title ILIKE $1 OR COALESCE(abstract, '') ILIKE $1
      ORDER BY influence_score DESC NULLS LAST, created_at DESC
      LIMIT $2
    `;
    const { rows } = await pgPool.query(query, [`%${searchText}%`, limit]);
    return rows;
  }

  async savePaper(paper) {
    const normalized = {
      title: paper?.title || "Untitled paper",
      year: Number.isFinite(Number(paper?.year)) ? Number(paper.year) : null,
      doi: paper?.doi || null,
      abstract: paper?.abstract || "",
      authors: Array.isArray(paper?.authors) ? paper.authors : [],
      influenceScore: Number.isFinite(Number(paper?.influenceScore)) ? Number(paper.influenceScore) : 0,
      externalId: paper?.paperId || paper?.externalId || paper?.id || null,
      source: paper?.source || null
    };

    if (normalized.doi) {
      const query = `
        INSERT INTO papers (title, year, doi, abstract, authors, influence_score, external_id, source)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
        ON CONFLICT (doi)
        DO UPDATE SET
          title = EXCLUDED.title,
          year = COALESCE(EXCLUDED.year, papers.year),
          abstract = COALESCE(NULLIF(EXCLUDED.abstract, ''), papers.abstract),
          authors = CASE
            WHEN jsonb_array_length(EXCLUDED.authors) > 0 THEN EXCLUDED.authors
            ELSE papers.authors
          END,
          influence_score = GREATEST(EXCLUDED.influence_score, papers.influence_score),
          external_id = COALESCE(EXCLUDED.external_id, papers.external_id),
          source = COALESCE(EXCLUDED.source, papers.source)
        RETURNING id
      `;
      await pgPool.query(query, [
        normalized.title,
        normalized.year,
        normalized.doi,
        normalized.abstract,
        JSON.stringify(normalized.authors),
        normalized.influenceScore,
        normalized.externalId,
        normalized.source
      ]);
      return;
    }

    if (normalized.externalId) {
      const query = `
        INSERT INTO papers (title, year, doi, abstract, authors, influence_score, external_id, source)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
        ON CONFLICT (external_id)
        DO UPDATE SET
          title = EXCLUDED.title,
          year = COALESCE(EXCLUDED.year, papers.year),
          abstract = COALESCE(NULLIF(EXCLUDED.abstract, ''), papers.abstract),
          authors = CASE
            WHEN jsonb_array_length(EXCLUDED.authors) > 0 THEN EXCLUDED.authors
            ELSE papers.authors
          END,
          influence_score = GREATEST(EXCLUDED.influence_score, papers.influence_score),
          source = COALESCE(EXCLUDED.source, papers.source)
        RETURNING id
      `;
      await pgPool.query(query, [
        normalized.title,
        normalized.year,
        normalized.doi,
        normalized.abstract,
        JSON.stringify(normalized.authors),
        normalized.influenceScore,
        normalized.externalId,
        normalized.source
      ]);
      return;
    }

    const query = `
      INSERT INTO papers (title, year, doi, abstract, authors, influence_score, external_id, source)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
      RETURNING id
    `;
    await pgPool.query(query, [
      normalized.title,
      normalized.year,
      normalized.doi,
      normalized.abstract,
      JSON.stringify(normalized.authors),
      normalized.influenceScore,
      normalized.externalId,
      normalized.source
    ]);
  }

  async saveMany(papers) {
    for (const paper of papers) {
      await this.savePaper(paper);
    }
  }

  async listResearchSessions(limit = 10) {
    const query = `
      SELECT
        id,
        query,
        COALESCE(selected_paper, '{}'::jsonb) AS "selectedPaper",
        COALESCE(guide, '{}'::jsonb) AS guide,
        COALESCE(graph_stats, '{}'::jsonb) AS "graphStats",
        created_at AS "createdAt"
      FROM research_sessions
      ORDER BY created_at DESC
      LIMIT $1
    `;
    const { rows } = await pgPool.query(query, [limit]);
    return rows;
  }

  async saveResearchSession(session) {
    const normalized = {
      query: typeof session?.query === "string" ? session.query.trim() : "",
      selectedPaper: session?.selectedPaper && typeof session.selectedPaper === "object"
        ? session.selectedPaper
        : {},
      guide: session?.guide && typeof session.guide === "object" ? session.guide : {},
      graphStats: session?.graphStats && typeof session.graphStats === "object" ? session.graphStats : {}
    };

    const query = `
      INSERT INTO research_sessions (query, selected_paper, guide, graph_stats)
      VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb)
      RETURNING id
    `;

    await pgPool.query(query, [
      normalized.query || null,
      JSON.stringify(normalized.selectedPaper),
      JSON.stringify(normalized.guide),
      JSON.stringify(normalized.graphStats)
    ]);
  }
}

module.exports = new PaperRepository();
