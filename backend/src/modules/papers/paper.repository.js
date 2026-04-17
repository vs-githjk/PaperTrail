const { pgPool } = require("../../db/postgres");

let memoryResearchSessionId = 1;
const memoryResearchSessions = [];
let memoryPaperId = 1;
const memorySavedPapers = [];
let memorySearchId = 1;
const memorySearchHistory = [];

function normalizePaperRecord(paper) {
  return {
    id: memoryPaperId++,
    title: paper?.title || "Untitled paper",
    year: Number.isFinite(Number(paper?.year)) ? Number(paper.year) : null,
    doi: paper?.doi || null,
    externalId: paper?.paperId || paper?.externalId || paper?.id || null,
    source: paper?.source || null,
    abstract: paper?.abstract || "",
    authors: Array.isArray(paper?.authors) ? paper.authors : [],
    influenceScore: Number.isFinite(Number(paper?.influenceScore)) ? Number(paper.influenceScore) : 0,
    created_at: new Date().toISOString()
  };
}

function upsertMemoryPaper(paper) {
  const record = normalizePaperRecord(paper);
  const matchIndex = memorySavedPapers.findIndex((item) => (
    (record.doi && item.doi === record.doi)
    || (record.externalId && item.externalId === record.externalId)
  ));

  if (matchIndex >= 0) {
    const existing = memorySavedPapers[matchIndex];
    memorySavedPapers[matchIndex] = {
      ...existing,
      ...record,
      id: existing.id,
      created_at: existing.created_at
    };
    return;
  }

  memorySavedPapers.unshift(record);
}

class PaperRepository {
  async list(limit = 20) {
    try {
      const query = `
        SELECT id, title, year, doi, external_id AS "externalId", source, created_at
        FROM papers
        ORDER BY created_at DESC
        LIMIT $1
      `;
      const { rows } = await pgPool.query(query, [limit]);
      return rows;
    } catch (error) {
      return memorySavedPapers.slice(0, limit);
    }
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

    try {
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
    } catch (error) {
      upsertMemoryPaper(paper);
    }
  }

  async saveMany(papers) {
    for (const paper of papers) {
      await this.savePaper(paper);
    }
  }

  async saveUserSearch(userId, queryText) {
    const normalizedQuery = String(queryText || "").trim();
    if (!normalizedQuery) return;

    try {
      const query = `
        INSERT INTO user_searches (user_id, query)
        VALUES ($1, $2)
        RETURNING id
      `;
      await pgPool.query(query, [userId, normalizedQuery]);
    } catch (error) {
      memorySearchHistory.unshift({
        id: memorySearchId++,
        userId,
        query: normalizedQuery,
        createdAt: new Date().toISOString()
      });
    }
  }

  async listUserSearchesByUser(userId, limit = 50) {
    try {
      const query = `
        SELECT id, query, created_at AS "createdAt"
        FROM user_searches
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;
      const { rows } = await pgPool.query(query, [userId, limit]);
      return rows;
    } catch (error) {
      return memorySearchHistory
        .filter((entry) => Number(entry.userId) === Number(userId))
        .slice(0, limit);
    }
  }

  async deleteUserSearch(userId, searchId) {
    const sid = Number(searchId);
    if (!Number.isFinite(sid) || sid <= 0) {
      return { deleted: 0 };
    }

    try {
      const result = await pgPool.query(
        "DELETE FROM user_searches WHERE id = $1 AND user_id = $2",
        [sid, userId]
      );
      return { deleted: result.rowCount || 0 };
    } catch (error) {
      const idx = memorySearchHistory.findIndex(
        (entry) => Number(entry.userId) === Number(userId) && Number(entry.id) === sid
      );
      if (idx >= 0) {
        memorySearchHistory.splice(idx, 1);
        return { deleted: 1 };
      }
      return { deleted: 0 };
    }
  }

  async clearUserSearches(userId) {
    try {
      const result = await pgPool.query(
        "DELETE FROM user_searches WHERE user_id = $1",
        [userId]
      );
      return { deleted: result.rowCount || 0 };
    } catch (error) {
      const before = memorySearchHistory.length;
      for (let i = memorySearchHistory.length - 1; i >= 0; i -= 1) {
        if (Number(memorySearchHistory[i].userId) === Number(userId)) {
          memorySearchHistory.splice(i, 1);
        }
      }
      return { deleted: before - memorySearchHistory.length };
    }
  }

  async listResearchSessions(limit = 10) {
    try {
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
    } catch (error) {
      return memoryResearchSessions.slice(0, limit);
    }
  }

  async listResearchSessionsByUser(userId, limit = 10) {
    try {
      const query = `
        SELECT
          id,
          query,
          COALESCE(selected_paper, '{}'::jsonb) AS "selectedPaper",
          COALESCE(guide, '{}'::jsonb) AS guide,
          COALESCE(graph_stats, '{}'::jsonb) AS "graphStats",
          created_at AS "createdAt"
        FROM research_sessions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;
      const { rows } = await pgPool.query(query, [userId, limit]);
      return rows;
    } catch (error) {
      return memoryResearchSessions
        .filter((session) => session.userId === userId)
        .slice(0, limit);
    }
  }

  async saveResearchSession(session, userId = null) {
    const normalized = {
      query: typeof session?.query === "string" ? session.query.trim() : "",
      selectedPaper: session?.selectedPaper && typeof session.selectedPaper === "object"
        ? session.selectedPaper
        : {},
      guide: session?.guide && typeof session.guide === "object" ? session.guide : {},
      graphStats: session?.graphStats && typeof session.graphStats === "object" ? session.graphStats : {}
    };

    const query = `
      INSERT INTO research_sessions (query, selected_paper, guide, graph_stats, user_id)
      VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5)
      RETURNING id
    `;

    try {
      await pgPool.query(query, [
        normalized.query || null,
        JSON.stringify(normalized.selectedPaper),
        JSON.stringify(normalized.guide),
        JSON.stringify(normalized.graphStats),
        userId
      ]);
    } catch (error) {
      memoryResearchSessions.unshift({
        id: memoryResearchSessionId++,
        userId,
        query: normalized.query || null,
        selectedPaper: normalized.selectedPaper,
        guide: normalized.guide,
        graphStats: normalized.graphStats,
        createdAt: new Date().toISOString()
      });
    }
  }
}

module.exports = new PaperRepository();
