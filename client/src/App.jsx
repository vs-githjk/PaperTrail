import { useMemo, useState } from "react";
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

export default function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
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
      setRawData(payload);
    } catch (err) {
      setError(err.message || "Search request failed.");
      setResults([]);
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
      const response = await fetch(`${API_BASE}/api/papers/${paperId}/ancestors`);
      if (!response.ok) throw new Error(`Ancestor fetch failed: ${response.status}`);
      const payload = await response.json();
      setGraphData(payload);
      setRawData(payload);
    } catch (err) {
      setError(err.message || "Ancestor request failed.");
      setGraphData(null);
    } finally {
      setLoadingTree(false);
    }
  }

  return (
    <main className="app">
      <h1>Research Genealogy Backend Tester</h1>

      <form onSubmit={handleSearch} className="search-row">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by title or abstract"
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
        <h2>Results</h2>
        {results.length === 0 ? (
          <p>No results yet.</p>
        ) : (
          <ul className="results">
            {results.map((paper) => {
              const id = getPaperId(paper);
              return (
                <li key={id || getPaperTitle(paper)}>
                  <button type="button" className="paper-btn" onClick={() => handlePaperClick(paper)}>
                    <strong>{getPaperTitle(paper)}</strong>
                    <span>Authors: {getPaperAuthors(paper)}</span>
                    <span>Influence Score: {getInfluenceScore(paper)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2>Ancestor Tree</h2>
        {selectedPaper ? <p>Selected: {getPaperTitle(selectedPaper)}</p> : null}
        {loadingTree ? <p>Loading ancestor tree...</p> : null}
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
