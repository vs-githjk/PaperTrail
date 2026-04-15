import { useEffect, useMemo, useState } from "react";
import AncestorTree from "./components/AncestorTree";

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
  const [authMode, setAuthMode] = useState("login");
  const [showAuthPanel, setShowAuthPanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("papertrail_token") || "");
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [authError, setAuthError] = useState("");
  const [history, setHistory] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchPlan, setSearchPlan] = useState([]);
  const [workspace, setWorkspace] = useState({ recentPapers: [], recentResearch: [] });
  const [selectedPaperId, setSelectedPaperId] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingTree, setLoadingTree] = useState(false);
  const [savingPaperIds, setSavingPaperIds] = useState({});
  const [savingTrail, setSavingTrail] = useState(false);
  const [trailSaved, setTrailSaved] = useState(false);
  const [error, setError] = useState("");

  const selectedPaper = useMemo(
    () => results.find((paper) => getPaperId(paper) === selectedPaperId) || null,
    [results, selectedPaperId]
  );

  const guide = graphData?.data?.meta?.guide ?? graphData?.meta?.guide ?? null;
  const isLoggedIn = Boolean(currentUser && authToken);
  const savedPaperKeys = new Set(
    workspace.recentPapers.map((paper) => String(paper.externalId || paper.paperId || paper.id || paper.title || ""))
  );

  function getAuthHeaders(extra = {}) {
    if (!authToken) return extra;
    return {
      ...extra,
      Authorization: `Bearer ${authToken}`
    };
  }

  async function fetchHistory() {
    if (!authToken) {
      setHistory([]);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/history?limit=1000`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error(`History failed: ${response.status}`);
      const payload = await response.json();
      setHistory(payload?.data || []);
    } catch (error) {
      setHistory([]);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      if (!authToken) {
        if (!cancelled) {
          setWorkspace({ recentPapers: [], recentResearch: [] });
        }
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/workspace`, {
          headers: getAuthHeaders()
        });
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
  }, [authToken]);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      if (!authToken) {
        if (!cancelled) {
          setCurrentUser(null);
          setHistory([]);
        }
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error(`Auth failed: ${response.status}`);
        const payload = await response.json();
        if (!cancelled) {
          setCurrentUser(payload?.data?.user || null);
        }
      } catch (error) {
        if (!cancelled) {
          setCurrentUser(null);
          setAuthToken("");
          localStorage.removeItem("papertrail_token");
        }
      }
    }

    loadUser();

    return () => {
      cancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    fetchHistory();
  }, [authToken, currentUser?.id]);

  async function refreshWorkspace() {
    if (!authToken) {
      setWorkspace({ recentPapers: [], recentResearch: [] });
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/workspace`, {
        headers: getAuthHeaders()
      });
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

  async function runSearch(searchText) {
    const normalized = String(searchText || "").trim();
    if (!normalized) return [];

    setError("");
    setHasSearched(true);
    setTrailSaved(false);
    setLoadingSearch(true);
    setGraphData(null);
    setSelectedPaperId(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/search?q=${encodeURIComponent(normalized)}`,
        {
          headers: getAuthHeaders()
        }
      );
      if (!response.ok) throw new Error(`Search failed: ${response.status}`);
      const payload = await response.json();
      const papers = Array.isArray(payload) ? payload : payload.data || [];
      setResults(papers);
      setSearchPlan(payload?.meta?.readingPlan || []);
      await refreshWorkspace();
      return papers;
    } catch (err) {
      setError(err.message || "Search request failed.");
      setResults([]);
      setSearchPlan([]);
      return [];
    } finally {
      setLoadingSearch(false);
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    await runSearch(query);
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
        headers: getAuthHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({
          ...paper,
          query: query.trim()
        })
      });
      if (!response.ok) throw new Error(`Ancestor fetch failed: ${response.status}`);
      const payload = await response.json();
      setGraphData(payload);
      setTrailSaved(false);
      await refreshWorkspace();
    } catch (err) {
      setError(err.message || "Ancestor request failed.");
      setGraphData(null);
    } finally {
      setLoadingTree(false);
    }
  }

  async function handleTopMatchTree() {
    let topMatch = results[0] || null;

    if (!topMatch) {
      const searchedResults = await runSearch(query);
      topMatch = searchedResults[0] || null;
    }

    if (!topMatch) {
      setError("Search first to load starting points before building the ancestor tree.");
      return;
    }

    await handlePaperClick(topMatch);
  }

  async function handleSaveTrail() {
    if (!graphData || !selectedPaper) return;

    setSavingTrail(true);
    try {
      const response = await fetch(`${API_BASE}/api/research-trails/save`, {
        method: "POST",
        headers: getAuthHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({
          query: query.trim(),
          selectedPaper,
          guide,
          graph: graphData
        })
      });
      if (!response.ok) throw new Error(`Trail save failed: ${response.status}`);
      setTrailSaved(true);
      await refreshWorkspace();
    } catch (saveError) {
      setError(saveError.message || "Failed to save research trail.");
    } finally {
      setSavingTrail(false);
    }
  }

  async function handleSavePaper(paper) {
    const paperKey = String(getPaperId(paper) || paper.externalId || getPaperTitle(paper));
    if (!paperKey) return;

    setSavingPaperIds((prev) => ({ ...prev, [paperKey]: true }));
    try {
      const response = await fetch(`${API_BASE}/api/papers/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(paper)
      });
      if (!response.ok) throw new Error(`Save failed: ${response.status}`);
      await refreshWorkspace();
    } catch (saveError) {
      setError(saveError.message || "Failed to save paper.");
    } finally {
      setSavingPaperIds((prev) => ({ ...prev, [paperKey]: false }));
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");
    setLoadingAuth(true);

    try {
      const endpoint = authMode === "register" ? "signup" : "login";
      const response = await fetch(`${API_BASE}/api/auth/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          authMode === "register"
            ? authForm
            : { email: authForm.email, password: authForm.password }
        )
      });
      const contentType = response.headers.get("content-type") || "";
      const rawBody = await response.text();
      const payload = contentType.includes("application/json")
        ? JSON.parse(rawBody || "{}")
        : null;
      if (!response.ok) {
        throw new Error(
          payload?.error
            || payload?.message
            || (rawBody ? rawBody.slice(0, 180) : "")
            || "Authentication failed."
        );
      }

      if (!payload || typeof payload !== "object") {
        throw new Error("Authentication endpoint returned an unexpected response.");
      }

      const token = payload?.data?.token || "";
      const user = payload?.data?.user || null;
      setAuthToken(token);
      setCurrentUser(user);
      setHasSearched(false);
      localStorage.setItem("papertrail_token", token);
      setAuthForm((prev) => ({ ...prev, password: "" }));
      setShowAuthPanel(false);
      await Promise.all([refreshWorkspace(), fetchHistory()]);
    } catch (error) {
      setAuthError(error.message || "Authentication failed.");
    } finally {
      setLoadingAuth(false);
    }
  }

  function handleLogout() {
    setAuthToken("");
    setCurrentUser(null);
    setHasSearched(false);
    setHistory([]);
    setWorkspace({ recentPapers: [], recentResearch: [] });
    setAuthError("");
    setShowHistoryPanel(false);
    localStorage.removeItem("papertrail_token");
  }

  return (
    <main className="app workbench-shell">
      <header className="top-nav workbench-topbar">
        <div className="brand">
          <h1>PaperTrail</h1>
        </div>
        <form onSubmit={handleSearch} className="top-search-form">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try a research topic, paper title, DOI, or paper link"
            aria-label="Search papers"
          />
        </form>
        <div className="nav-actions">
          <button
            type="button"
            className="nav-link-btn"
            onClick={() => {
              setShowHistoryPanel(true);
            }}
          >
            History
          </button>
          {isLoggedIn ? (
            <div className="auth-status">
              <p>
                Logged in as <strong>{currentUser.name || currentUser.email}</strong>
              </p>
              <button type="button" onClick={handleLogout} aria-label="Log out">
                Log out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAuthError("");
                setAuthMode("login");
                setShowAuthPanel(true);
              }}
            >
              Login/Register
            </button>
          )}
        </div>
      </header>

      {!isLoggedIn && showAuthPanel ? (
        <div className="auth-modal-backdrop" onClick={() => setShowAuthPanel(false)}>
          <section className="auth-modal" onClick={(event) => event.stopPropagation()}>
            <div className="auth-modal-header">
              <h3>Join PaperTrail</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowAuthPanel(false)}
                aria-label="Close login modal"
              >
                x
              </button>
            </div>

            <div className="auth-mode-row">
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className={authMode === "login" ? "secondary-btn active-auth-btn" : "secondary-btn"}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("register")}
                className={authMode === "register" ? "secondary-btn active-auth-btn" : "secondary-btn"}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="auth-form">
              {authMode === "register" ? (
                <input
                  type="text"
                  value={authForm.name}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Enter your name"
                  aria-label="Name"
                />
              ) : null}
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Enter your email"
                aria-label="Email"
              />
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Enter your password"
                aria-label="Password"
              />
              <button type="submit" disabled={loadingAuth}>
                {loadingAuth
                  ? "Please wait..."
                  : authMode === "register"
                    ? "Register"
                    : "Login"}
              </button>
            </form>
            {authError ? <p className="error">{authError}</p> : null}
          </section>
        </div>
      ) : null}

      {showHistoryPanel ? (
        <div className="auth-modal-backdrop" onClick={() => setShowHistoryPanel(false)}>
          <section className="auth-modal" onClick={(event) => event.stopPropagation()}>
            <div className="auth-modal-header">
              <h3>Your History</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowHistoryPanel(false)}
                aria-label="Close history modal"
              >
                x
              </button>
            </div>
            {!isLoggedIn ? (
              <p>
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={() => {
                    setShowHistoryPanel(false);
                    setAuthError("");
                    setAuthMode("login");
                    setShowAuthPanel(true);
                  }}
                >
                  Login
                </button>{" "}
                to view the history
              </p>
            ) : history.length === 0 ? (
              <p>No history yet. Start searching and your searches will appear here.</p>
            ) : (
              <ul className="workspace-list">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="workspace-btn"
                      onClick={async () => {
                        const q = String(entry.query || "").trim();
                        if (!q) return;
                        setQuery(q);
                        setShowHistoryPanel(false);
                        await runSearch(q);
                      }}
                    >
                      <strong>{entry.query}</strong>
                      <span>{formatSessionTime(entry.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      <div className="workbench-grid">
        <aside className="workbench-sidebar">
          <section className="sidebar-block">
            <div className="sidebar-heading-row">
              <h2>Recent Research Trails</h2>
            </div>
            {!isLoggedIn ? (
              <p className="sidebar-empty">Login to view saved trails.</p>
            ) : workspace.recentResearch.length === 0 ? (
              <p className="sidebar-empty">Saved trails appear here.</p>
            ) : (
              <ul className="workspace-list compact-list">
                {workspace.recentResearch.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      className="workspace-btn sidebar-item-btn"
                      onClick={() => {
                        const selected = session.selectedPaper || {};
                        setQuery(session.query || selected.title || "");
                        handlePaperClick(selected);
                      }}
                    >
                      <strong>{session.selectedPaper?.title || "Untitled paper"}</strong>
                      <span>{formatSessionTime(session.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sidebar-block">
            <div className="sidebar-heading-row">
              <h2>Recently Saved Papers</h2>
            </div>
            {!isLoggedIn ? (
              <p className="sidebar-empty">Login to view saved papers.</p>
            ) : workspace.recentPapers.length === 0 ? (
              <p className="sidebar-empty">Saved papers appear here.</p>
            ) : (
              <ul className="workspace-list compact-list">
                {workspace.recentPapers.map((paper) => (
                  <li key={paper.id || paper.externalId || paper.title}>
                    <div className="workspace-item sidebar-item-btn">
                      <strong>{paper.title}</strong>
                      <span>{paper.year || "Year unknown"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className="workbench-canvas">
          {!hasSearched ? (
            <div className="canvas-empty">
              <p>Search for a topic or paper to begin your workbench session.</p>
            </div>
          ) : (
            <>
              <header className="canvas-header">
                <span className="canvas-badge">AI Suggested Reading Path</span>
                <h2>Read these first to get oriented quickly</h2>
              </header>

              {Array.isArray(searchPlan) && searchPlan.length > 0 ? (
                <div className="guide-card agentic-card">
                  <h3>Suggested Reading Path</h3>
                  {searchPlan.map((section) => (
                    <div key={section.stage} className="plan-section">
                      <strong>{section.label}</strong>
                      <p>{section.description}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <ul className="results">
                {results.map((paper, index) => {
                  const id = getPaperId(paper);
                  const paperKey = String(id || paper.externalId || getPaperTitle(paper));
                  const isSaved = savedPaperKeys.has(paperKey);
                  const isSaving = Boolean(savingPaperIds[paperKey]);
                  return (
                    <li key={id || getPaperTitle(paper)}>
                      <div className="paper-card agentic-card">
                        <button type="button" className="paper-btn" onClick={() => handlePaperClick(paper)}>
                          <span className="mini-badge">
                            {getRoleLabel(paper) || "Best Starting Paper"}
                          </span>
                          <strong>
                            {index + 1}. {getPaperTitle(paper)}
                          </strong>
                          {paper.matchReason ? <span>Why this is a good start: {paper.matchReason}</span> : null}
                          <span>Authors: {getPaperAuthors(paper)}</span>
                          <span>Influence Score: {getInfluenceScore(paper)}</span>
                          {getRecommendationScore(paper) ? (
                            <span>Recommendation Score: {getRecommendationScore(paper)}</span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="save-paper-btn"
                          onClick={() => handleSavePaper(paper)}
                          disabled={isSaved || isSaving}
                        >
                          {isSaved ? "Saved" : isSaving ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {guide ? (
                <div className="guide-card agentic-card">
                  <button
                    type="button"
                    className="save-guide-btn"
                    onClick={handleSaveTrail}
                    disabled={savingTrail || trailSaved || !selectedPaper}
                  >
                    {trailSaved ? "Saved" : savingTrail ? "Saving..." : "Save"}
                  </button>
                  <h3>{guide.title}</h3>
                  <p>{guide.summary}</p>
                </div>
              ) : null}
            </>
          )}
        </section>

        <aside className="workbench-right-panel">
          <button type="button" className="tree-cta" onClick={handleTopMatchTree} disabled={loadingTree}>
            {loadingTree ? "Building..." : "Build Tree From Top Match"}
          </button>
          <h2>Ancestor Tree</h2>
          <div className="tree-placeholder">
            {loadingTree ? <p>Loading ancestor tree...</p> : null}
            {!loadingTree ? <AncestorTree data={graphData} /> : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
