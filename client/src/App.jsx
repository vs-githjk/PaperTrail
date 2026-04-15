import { useEffect, useMemo, useState } from "react";
import ForceGraph from "./components/ForceGraph";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function getPaperId(paper) {
  return paper.id ?? paper.paperId ?? paper._id;
}

function getPaperTitle(paper) {
  return paper.title ?? "Untitled paper";
}

function getPaperAuthors(paper) {
  if (Array.isArray(paper.authors)) {
    return paper.authors
      .map((author) => (typeof author === "string" ? author : author?.name))
      .filter(Boolean)
      .join(", ");
  }
  return paper.authors ?? "Unknown authors";
}

function getInfluenceScore(paper) {
  const score = paper.influenceScore ?? paper.influence_score ?? paper.score;
  if (typeof score === "number") return score.toFixed(3);
  return "N/A";
}

function getRecommendationScore(paper) {
  const score = paper.recommendationScore;
  if (typeof score === "number") return score.toFixed(1);
  return null;
}

function getRoleLabel(paper) {
  return paper.roleLabel ?? null;
}

function formatSessionTime(value) {
  if (!value) return "Saved recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export default function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchPlan, setSearchPlan] = useState([]);
  const [workspace, setWorkspace] = useState({ recentPapers: [], recentResearch: [] });
  const [selectedPaperId, setSelectedPaperId] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [rawData, setRawData] = useState(null);
  const [showRawData, setShowRawData] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingTree, setLoadingTree] = useState(false);
  const [error, setError] = useState("");

  const selectedPaper = useMemo(
    () => results.find((paper) => getPaperId(paper) === selectedPaperId) || null,
    [results, selectedPaperId]
  );

  const guide = graphData?.data?.meta?.guide ?? graphData?.meta?.guide ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const response = await fetch(`${API_BASE}/api/workspace`);
        if (!response.ok) throw new Error(`Workspace failed: ${response.status}`);
        const payload = await response.json();
        if (!cancelled) {
          setWorkspace({
            recentPapers: payload?.data?.recentPapers || [],
            recentResearch: payload?.data?.recentResearch || []
          });
        }
      } catch (error) {
        if (!cancelled) {
          setWorkspace({ recentPapers: [], recentResearch: [] });
        }
      }
    }

    loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshWorkspace() {
    try {
      const response = await fetch(`${API_BASE}/api/workspace`);
      if (!response.ok) return;
      const payload = await response.json();
      setWorkspace({
        recentPapers: payload?.data?.recentPapers || [],
        recentResearch: payload?.data?.recentResearch || []
      });
    } catch (error) {
      // Leave the current workspace state alone if refresh fails.
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    if (!query.trim()) return;

    setError("");
    setLoadingSearch(true);
    setGraphData(null);
    setSelectedPaperId(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/search?q=${encodeURIComponent(query.trim())}`
      );
      if (!response.ok) throw new Error(`Search failed: ${response.status}`);
      const payload = await response.json();
      const papers = Array.isArray(payload) ? payload : payload.data || [];
      setResults(papers);
      setSearchPlan(payload?.meta?.readingPlan || []);
      setRawData(payload);
      await refreshWorkspace();
    } catch (err) {
      setError(err.message || "Search request failed.");
      setResults([]);
      setSearchPlan([]);
      setRawData(null);
    } finally {
      setLoadingSearch(false);
    }
  }

  async function handlePaperClick(paper) {
    const paperId = getPaperId(paper);
    if (!paperId) return;

    setError("");
    setLoadingTree(true);
    setSelectedPaperId(paperId);

    try {
      const response = await fetch(`${API_BASE}/api/papers/ancestor-tree`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...paper,
          query: query.trim()
        })
      });
      if (!response.ok) throw new Error(`Ancestor fetch failed: ${response.status}`);
      const payload = await response.json();
      setGraphData(payload);
      setRawData(payload);
      await refreshWorkspace();
    } catch (err) {
      setError(err.message || "Ancestor request failed.");
      setGraphData(null);
    } finally {
      setLoadingTree(false);
    }
  }

  async function handleTopMatchTree() {
    if (results.length === 0) return;
    await handlePaperClick(results[0]);
  }

  return (
    <main className="app">
      <h1>PaperTrail</h1>
      <p className="intro">
        Enter a research topic, paper title, DOI, or paper link. PaperTrail finds promising starting
        points and builds a guided ancestor tree of what to read first.
      </p>

      <form onSubmit={handleSearch} className="search-row">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try a research topic, paper title, DOI, or paper link"
          aria-label="Search papers"
        />
        <button type="submit" disabled={loadingSearch}>
          {loadingSearch ? "Searching..." : "Search"}
        </button>
        <button type="button" onClick={() => setShowRawData((prev) => !prev)}>
          {showRawData ? "Hide Raw Data" : "Show Raw Data"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      <section>
        <h2>Research Workspace</h2>
        <div className="workspace-grid">
          <div className="guide-card">
            <h3>Recent Research Trails</h3>
            {workspace.recentResearch.length === 0 ? (
              <p>Build an ancestor tree and PaperTrail will remember that trail here.</p>
            ) : (
              <ul className="workspace-list">
                {workspace.recentResearch.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      className="workspace-btn"
                      onClick={() => {
                        const selected = session.selectedPaper || {};
                        setQuery(session.query || selected.title || "");
                        handlePaperClick(selected);
                      }}
                    >
                      <strong>{session.selectedPaper?.title || "Untitled paper"}</strong>
                      <span>{session.query ? `Topic: ${session.query}` : "Saved research trail"}</span>
                      {session.guide?.summary ? <span>{session.guide.summary}</span> : null}
                      <span>
                        {session.graphStats?.nodeCount || 0} papers, {session.graphStats?.linkCount || 0} links
                      </span>
                      <span>{formatSessionTime(session.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="guide-card">
            <h3>Recently Saved Papers</h3>
            {workspace.recentPapers.length === 0 ? (
              <p>Searches and tree generations will start filling this list as you work.</p>
            ) : (
              <ul className="workspace-list">
                {workspace.recentPapers.map((paper) => (
                  <li key={paper.id || paper.externalId || paper.title}>
                    <div className="workspace-item">
                      <strong>{paper.title}</strong>
                      <span>{paper.year || "Year unknown"}</span>
                      {paper.source ? <span>Source: {paper.source}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2>Starting Points</h2>
        {results.length === 0 ? (
          <p>Search for a topic or paper to see likely starting points.</p>
        ) : (
          <>
            <div className="results-header">
              <p>
                Pick the best seed paper for your research direction, or let PaperTrail build a guided
                tree from the top match.
              </p>
              <button type="button" onClick={handleTopMatchTree} disabled={loadingTree}>
                {loadingTree ? "Building..." : "Build Tree From Top Match"}
              </button>
            </div>

            {Array.isArray(searchPlan) && searchPlan.length > 0 ? (
              <div className="guide-card">
                <h3>Suggested Reading Path</h3>
                {searchPlan.map((section) => (
                  <div key={section.stage} className="plan-section">
                    <strong>{section.label}</strong>
                    <p>{section.description}</p>
                    <ul className="plan-list">
                      {section.items.map((item) => (
                        <li key={item.id || item.title}>
                          <span>{item.title}</span>
                          {item.roleLabel ? <span>{item.roleLabel}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}

            <ul className="results">
              {results.map((paper, index) => {
                const id = getPaperId(paper);
                return (
                  <li key={id || getPaperTitle(paper)}>
                    <button type="button" className="paper-btn" onClick={() => handlePaperClick(paper)}>
                      <strong>
                        {index + 1}. {getPaperTitle(paper)}
                      </strong>
                      {getRoleLabel(paper) ? <span>Role: {getRoleLabel(paper)}</span> : null}
                      {paper.roleReason ? <span>{paper.roleReason}</span> : null}
                      {paper.matchReason ? <span>Why this is a good start: {paper.matchReason}</span> : null}
                      <span>Authors: {getPaperAuthors(paper)}</span>
                      <span>Influence Score: {getInfluenceScore(paper)}</span>
                      {getRecommendationScore(paper) ? (
                        <span>Recommendation Score: {getRecommendationScore(paper)}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section>
        <h2>Guided Reading Tree</h2>
        {selectedPaper ? <p>Seed paper: {getPaperTitle(selectedPaper)}</p> : null}
        {loadingTree ? <p>Loading ancestor tree...</p> : null}
        {guide ? (
          <div className="guide-card">
            <h3>{guide.title}</h3>
            <p>{guide.summary}</p>
            {Array.isArray(guide.recommendedOrder) && guide.recommendedOrder.length > 0 ? (
              <ol className="guide-list">
                {guide.recommendedOrder.map((item) => (
                  <li key={item.id || item.title}>
                    <strong>{item.title}</strong>
                    {item.roleLabel ? <span>Role: {item.roleLabel}</span> : null}
                    <span>{item.reason}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            {Array.isArray(guide.readingPlan) && guide.readingPlan.length > 0 ? (
              <div className="guide-plan">
                {guide.readingPlan.map((section) => (
                  <div key={section.stage} className="plan-section">
                    <strong>{section.label}</strong>
                    <p>{section.description}</p>
                    <ul className="plan-list">
                      {section.items.map((item) => (
                        <li key={item.id || item.title}>
                          <span>{item.title}</span>
                          {item.roleLabel ? <span>{item.roleLabel}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {graphData ? <ForceGraph data={graphData} /> : <p>Click a result to render its tree.</p>}
      </section>

      {showRawData ? (
        <section>
          <h2>Raw JSON</h2>
          <pre>{JSON.stringify(rawData, null, 2)}</pre>
        </section>
      ) : null}
    </main>
  );
}
