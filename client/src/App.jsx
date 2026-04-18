import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AncestorTree from "./components/AncestorTree";
import Particles from "./components/Particles";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const WORKBENCH_SESSION_KEY = "papertrail_workbench_v1";

function readWorkbenchSession() {
  try {
    const raw = sessionStorage.getItem(WORKBENCH_SESSION_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap || typeof snap !== "object" || snap.version !== 1) return null;
    return snap;
  } catch {
    return null;
  }
}

function writeWorkbenchSession(payload) {
  try {
    let json = JSON.stringify(payload);
    if (json.length > 4_500_000) {
      json = JSON.stringify({ ...payload, graphData: null });
    }
    sessionStorage.setItem(WORKBENCH_SESSION_KEY, json);
  } catch {
    /* quota or stringify failure */
  }
}

function clearWorkbenchSession() {
  try {
    sessionStorage.removeItem(WORKBENCH_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

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

function getPaperHref(paper) {
  if (paper?.url) return paper.url;
  if (paper?.doi) return `https://doi.org/${paper.doi}`;
  if (paper?.source === "arxiv" && (paper?.paperId || paper?.externalId)) {
    return `https://arxiv.org/abs/${paper.paperId || paper.externalId}`;
  }
  if (paper?.paperId || paper?.externalId) {
    return `https://www.semanticscholar.org/paper/${paper.paperId || paper.externalId}`;
  }
  return null;
}

function getPaperSourceLabel(paper) {
  if (!paper?.source) return "External source";
  const source = String(paper.source).toLowerCase();
  if (source === "semantic_scholar" || source === "semanticscholar") return "Semantic Scholar";
  if (source === "arxiv") return "arXiv";
  return paper.source;
}

function getStageLabel(stage) {
  switch (stage) {
    case "start_here":
      return "Start Here";
    case "foundational_background":
      return "Foundational Background";
    case "broader_overview":
      return "Broader Overview";
    case "optional_supporting":
      return "Optional Supporting Reads";
    default:
      return "Reading Path";
  }
}

function getResourceGroupLabel(group) {
  switch (group) {
    case "watch":
      return "Watch";
    case "reference":
      return "Reference";
    case "read":
      return "Read";
    default:
      return "Explore";
  }
}

function getRouteStepLabel(node, totalSteps) {
  if (!node) return "No route selected";
  if (Number.isInteger(node.routeIndex) && node.routeIndex >= 0 && totalSteps > 0) {
    return `Step ${node.routeIndex + 1} of ${totalSteps}`;
  }
  if (node.kind === "seed") return "Current seed";
  return "Supporting context";
}

function getSeedGuideCopy(paper, isActive = false) {
  if (!paper) return "Use this to redraw the map from a different starting point.";
  if (isActive) return "This is the paper currently driving the route shown in the map.";
  if (paper.matchReason) return paper.matchReason;
  if (paper.role === "overview") return "Best if you want broad context before diving into specifics.";
  if (paper.role === "seminal") return "Best if you want the older foundational work first.";
  if (paper.role === "starting_point" || paper.role === "seed") {
    return "Best if you want a direct first paper to anchor the route.";
  }
  return "Use this to redraw the map from a different starting point.";
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
  const [historyBusy, setHistoryBusy] = useState(false);
  const [removingHistoryId, setRemovingHistoryId] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchPlan, setSearchPlan] = useState([]);
  const [workspace, setWorkspace] = useState({ recentPapers: [], recentResearch: [] });
  const [selectedPaperId, setSelectedPaperId] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [focusedNode, setFocusedNode] = useState(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingTree, setLoadingTree] = useState(false);
  const [savingPaperIds, setSavingPaperIds] = useState({});
  const [savingTrail, setSavingTrail] = useState(false);
  const [trailSaved, setTrailSaved] = useState(false);
  const [error, setError] = useState("");
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [routeTransitioning, setRouteTransitioning] = useState(false);
  const treeRestoreRef = useRef(null);
  const handlePaperClickRef = useRef(null);

  const selectedPaper = useMemo(
    () => results.find((paper) => getPaperId(paper) === selectedPaperId) || null,
    [results, selectedPaperId]
  );

  const guide = graphData?.data?.meta?.guide ?? graphData?.meta?.guide ?? null;
  const routeSteps = Array.isArray(guide?.recommendedOrder) ? guide.recommendedOrder : [];
  const companionResources = Array.isArray(guide?.companionResources) ? guide.companionResources : [];
  const companionResourceGroups = useMemo(
    () =>
      companionResources.reduce((groups, resource) => {
        const group = resource.group || "explore";
        if (!groups[group]) groups[group] = [];
        groups[group].push(resource);
        return groups;
      }, {}),
    [companionResources]
  );
  const isLoggedIn = Boolean(currentUser && authToken);
  const savedPaperKeys = new Set(
    workspace.recentPapers.map((paper) => String(paper.externalId || paper.paperId || paper.id || paper.title || ""))
  );

  useEffect(() => {
    if (!selectedPaperId || loadingTree) return undefined;
    setRouteTransitioning(true);
    const timer = setTimeout(() => setRouteTransitioning(false), 520);
    return () => clearTimeout(timer);
  }, [selectedPaperId, loadingTree, graphData]);

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

  async function removeHistoryEntry(entryId) {
    if (!authToken || entryId == null) return;
    setError("");
    setRemovingHistoryId(entryId);
    try {
      const response = await fetch(`${API_BASE}/api/history/${encodeURIComponent(entryId)}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      if (response.status === 404) {
        setError("That history entry was already removed.");
      } else if (!response.ok) {
        throw new Error(`Remove failed: ${response.status}`);
      }
      await fetchHistory();
    } catch (err) {
      setError(err.message || "Failed to remove search from history.");
    } finally {
      setRemovingHistoryId(null);
    }
  }

  async function clearAllHistory() {
    if (!authToken || history.length === 0) return;
    if (!window.confirm("Remove all searches from your history?")) return;
    setError("");
    setHistoryBusy(true);
    try {
      const response = await fetch(`${API_BASE}/api/history`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error(`Clear history failed: ${response.status}`);
      await fetchHistory();
    } catch (err) {
      setError(err.message || "Failed to clear history.");
    } finally {
      setHistoryBusy(false);
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

  useLayoutEffect(() => {
    const snap = readWorkbenchSession();
    if (snap) {
      setQuery(String(snap.query || ""));
      setHasSearched(Boolean(snap.hasSearched));
      setResults(Array.isArray(snap.results) ? snap.results : []);
      setSearchPlan(Array.isArray(snap.searchPlan) ? snap.searchPlan : []);
      setSelectedPaperId(snap.selectedPaperId ?? null);
      setGraphData(snap.graphData ?? null);
      setFocusedNode(null);
      setTrailSaved(false);
      if (snap.selectedPaperId && !snap.graphData) {
        treeRestoreRef.current = snap.selectedPaperId;
      } else {
        treeRestoreRef.current = null;
      }
    }
    setSessionHydrated(true);
  }, []);

  useEffect(() => {
    if (!sessionHydrated) return;
    const payload = {
      version: 1,
      query,
      hasSearched,
      results,
      searchPlan,
      selectedPaperId,
      graphData
    };
    writeWorkbenchSession(payload);
  }, [sessionHydrated, query, hasSearched, results, searchPlan, selectedPaperId, graphData]);

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
    setFocusedNode(null);
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
    const searchedResults = await runSearch(query);
    if (searchedResults[0]) {
      await handlePaperClick(searchedResults[0]);
    }
  }

  async function handlePaperClick(paper) {
    const paperId = getPaperId(paper);
    if (!paperId) return;

    setError("");
    setLoadingTree(true);
    setSelectedPaperId(paperId);
    setFocusedNode(null);

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

  handlePaperClickRef.current = handlePaperClick;

  useEffect(() => {
    if (!sessionHydrated) return;
    const pid = treeRestoreRef.current;
    if (!pid || graphData) return;
    const paper = results.find((p) => getPaperId(p) === pid);
    if (!paper) {
      treeRestoreRef.current = null;
      return;
    }
    treeRestoreRef.current = null;
    void handlePaperClickRef.current(paper);
  }, [sessionHydrated, results, graphData]);

  function handleGoHome() {
    clearWorkbenchSession();
    treeRestoreRef.current = null;
    setError("");
    setQuery("");
    setHasSearched(false);
    setResults([]);
    setSearchPlan([]);
    setSelectedPaperId(null);
    setGraphData(null);
    setFocusedNode(null);
    setTrailSaved(false);
    setLoadingSearch(false);
    setLoadingTree(false);
    setShowHistoryPanel(false);
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

  async function handleFocusedNodeAsSeed() {
    if (!focusedNode) return;
    await handlePaperClick(focusedNode);
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
    clearWorkbenchSession();
    setQuery("");
    setResults([]);
    setSearchPlan([]);
    setSelectedPaperId(null);
    setGraphData(null);
    setFocusedNode(null);
    setTrailSaved(false);
  }

  return (
    <main className="app workbench-shell">
      <div className="cosmos-backdrop" aria-hidden="true">
        <div className="cosmos-orb cosmos-orb-left" />
        <div className="cosmos-orb cosmos-orb-right" />
        <div className="cosmos-orb cosmos-orb-bottom" />
        <Particles
          className="cosmos-particles"
          particleColors={["#ffcf8b", "#f58b7c", "#8ca6ff", "#d7c2ff"]}
          particleCount={180}
          particleSpread={9}
          speed={0.06}
          particleBaseSize={82}
          sizeRandomness={0.8}
          moveParticlesOnHover
          particleHoverFactor={0.35}
          alphaParticles
          cameraDistance={18}
          pixelRatio={1}
        />
      </div>
      <header className="top-nav workbench-topbar">
        <button
          type="button"
          className="brand brand-home-btn"
          onClick={() => {
            handleGoHome();
          }}
          aria-label="Go to PaperTrail home"
          title="Clear search and graph and go back to the home screen"
        >
          <h1>PaperTrail</h1>
          <span className="brand-tag">Research constellation for guided reading</span>
        </button>
        <div className="top-search-cluster">
          <form onSubmit={handleSearch} className="top-search-form">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try a research topic, paper title, DOI, or paper link"
              aria-label="Search papers"
            />
          </form>
          <button
            type="button"
            className="workbench-refresh-btn"
            onClick={() => {
              handleGoHome();
            }}
            aria-label="Return to home"
            title="Clear search and graph and go back to the home screen"
          >
            +
          </button>
        </div>
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
          <section className="auth-modal history-modal" onClick={(event) => event.stopPropagation()}>
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
              <>
                <div className="history-modal-toolbar">
                  <button
                    type="button"
                    className="secondary-btn history-clear-all-btn"
                    onClick={() => {
                      void clearAllHistory();
                    }}
                    disabled={historyBusy || removingHistoryId != null}
                  >
                    {historyBusy ? "Clearing…" : "Clear all"}
                  </button>
                </div>
                <div className="history-list-scroll">
                  <ul className="workspace-list history-workspace-list">
                    {history.map((entry) => (
                      <li key={entry.id} className="history-row">
                        <button
                          type="button"
                          className="workspace-btn history-entry-btn"
                          disabled={removingHistoryId === entry.id || historyBusy}
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
                        <button
                          type="button"
                          className="history-remove-btn"
                          disabled={removingHistoryId != null || historyBusy}
                          aria-label={`Remove “${String(entry.query || "").trim() || "search"}” from history`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void removeHistoryEntry(entry.id);
                          }}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      <div className="workbench-grid">
        <aside className="workbench-sidebar">
          <div className="sidebar-scroll">
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
                        <span>{session.query || "Saved trail"}</span>
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
                        <span>{paper.year || "Year unknown"} · {getPaperSourceLabel(paper)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </aside>

        <section className="workbench-canvas">
          <div className="canvas-scroll">
            {!hasSearched ? (
              <div className="canvas-empty canvas-welcome">
                <span className="canvas-badge">Warm Knowledge Cosmos</span>
                <h2>Search a topic and let PaperTrail draw the intellectual sky around it.</h2>
                <p>
                  Start with a research question, paper title, DOI, or link. PaperTrail will surface the strongest
                  starting point, map the lineage behind it, and help you decide what to read next.
                </p>
              </div>
            ) : (
              <>
                <header className="canvas-header">
                  <span className="canvas-badge">AI Suggested Reading Path</span>
                  <h2>{selectedPaper ? `Tracing the lineage behind ${getPaperTitle(selectedPaper)}` : "Building your research map"}</h2>
                  <p className="canvas-subtitle">
                    {selectedPaper
                      ? "The tree is now the main workspace. Click a node to open the source paper in a new tab."
                      : "PaperTrail will map the top starting point first, then let you swap seeds from the right panel."}
                  </p>
                </header>

                <div className="guide-card agentic-card quickstart-card">
                  <h3>How To Use This Map</h3>
                  <div className="quickstart-grid">
                    <div className="quickstart-step">
                      <span className="quickstart-index">1</span>
                      <div>
                        <strong>Follow the numbered route first</strong>
                        <p>Those steps are the recommended reading path through the lineage.</p>
                      </div>
                    </div>
                    <div className="quickstart-step">
                      <span className="quickstart-index">2</span>
                      <div>
                        <strong>Use side branches as context</strong>
                        <p>They are useful supporting papers, but not the first things to read.</p>
                      </div>
                    </div>
                    <div className="quickstart-step">
                      <span className="quickstart-index">3</span>
                      <div>
                        <strong>Click any node to inspect it</strong>
                        <p>The inspector explains why it matters, where it fits, and lets you re-seed the map.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <section className={routeTransitioning ? "tree-hero agentic-card route-transitioning" : "tree-hero agentic-card"}>
                  <div className="tree-hero-toolbar">
                    <div>
                      <p className="meta-label">Current seed</p>
                      <h3>{selectedPaper ? getPaperTitle(selectedPaper) : "Top match will appear here"}</h3>
                    </div>
                    <div className="tree-hero-actions">
                      <button type="button" className="secondary-btn hero-inline-btn" onClick={handleTopMatchTree} disabled={loadingTree}>
                        {loadingTree ? "Building..." : "Rebuild From Top Match"}
                      </button>
                      {guide ? (
                        <button
                          type="button"
                          className="hero-inline-btn"
                          onClick={handleSaveTrail}
                          disabled={savingTrail || trailSaved || !selectedPaper}
                        >
                          {trailSaved ? "Trail Saved" : savingTrail ? "Saving..." : "Save Trail"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {Array.isArray(results) && results.length > 0 ? (
                    <div className="seed-switcher">
                      {results.slice(0, 6).map((paper, index) => {
                        const isActive = getPaperId(paper) === selectedPaperId;
                        return (
                          <button
                            key={getPaperId(paper) || getPaperTitle(paper)}
                            type="button"
                            className={isActive ? "seed-chip seed-chip-active" : "seed-chip"}
                            onClick={() => handlePaperClick(paper)}
                          >
                            <span>{index + 1}</span>
                            <span>{getPaperTitle(paper)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="tree-explorer-layout">
                    <div className={routeTransitioning ? "tree-stage route-transitioning" : "tree-stage"}>
                      <div className="tree-stage-legend">
                        <span className="legend-pill legend-pill-route">Main route</span>
                        <span className="legend-pill legend-pill-context">Supporting context</span>
                        <span className="legend-copy">Follow the bright numbered path first.</span>
                      </div>
                      {loadingTree ? <p className="tree-loading-copy">Building ancestor tree...</p> : null}
                      {!loadingTree ? (
                        <AncestorTree
                          data={graphData}
                          selectedNodeId={focusedNode?.id || null}
                          onNodeSelect={setFocusedNode}
                        />
                      ) : null}
                    </div>

                    <aside className={routeTransitioning ? "node-inspector agentic-card route-transitioning" : "node-inspector agentic-card"}>
                    <p className="meta-label">Node Inspector</p>
                    <h4>{focusedNode?.title || "Select a node in the map"}</h4>
                    <p className="node-inspector-copy">
                      {focusedNode
                        ? "Open the paper source, inspect its place in the lineage, or promote it into a fresh seed."
                        : "Click any node in the map to inspect it here. The graph is meant to be explored, not just viewed."}
                    </p>
                    <div className="inspector-hint">
                      <span className="meta-label">Reading tip</span>
                      <p>
                        {focusedNode && Number.isInteger(focusedNode.routeIndex) && focusedNode.routeIndex >= 0
                          ? "This node is part of the main suggested route, so it is worth reading in sequence."
                          : focusedNode?.kind === "seed"
                            ? "This is the current seed paper. Read around it, then return to it with more context."
                            : "This node is supporting context. Use it to clarify background, not necessarily as your first read."}
                      </p>
                    </div>
                    <div className="node-inspector-facts">
                      <div>
                        <span>Reading stage</span>
                        <strong>{focusedNode ? getStageLabel(focusedNode.stage) : "No stage selected"}</strong>
                      </div>
                      <div>
                        <span>Role</span>
                        <strong>{focusedNode?.kind === "seed" ? "Current seed" : "Ancestor node"}</strong>
                      </div>
                      <div>
                        <span>Route step</span>
                        <strong>{getRouteStepLabel(focusedNode, routeSteps.length)}</strong>
                      </div>
                      <div>
                        <span>Year</span>
                        <strong>{focusedNode?.year || "Unknown"}</strong>
                      </div>
                      <div>
                        <span>Source</span>
                        <strong>{focusedNode ? getPaperSourceLabel(focusedNode) : "No source selected"}</strong>
                      </div>
                      <div>
                        <span>Citations</span>
                        <strong>{focusedNode ? focusedNode.citationCount || 0 : 0}</strong>
                      </div>
                    </div>
                    {focusedNode?.storyReason ? (
                      <div className="story-reason-card">
                        <span className="meta-label">Why this matters</span>
                        <p>{focusedNode.storyReason}</p>
                      </div>
                    ) : null}
                    {focusedNode?.abstract ? (
                      <div className="story-abstract-card">
                        <span className="meta-label">Abstract Glimpse</span>
                        <div className="story-abstract-scroll">
                          <p>{focusedNode.abstract}</p>
                        </div>
                      </div>
                    ) : null}
                    {focusedNode?.doi ? (
                      <p className="node-identifier">DOI: {focusedNode.doi}</p>
                    ) : focusedNode?.paperId ? (
                      <p className="node-identifier">Paper ID: {focusedNode.paperId}</p>
                    ) : null}
                    <div className="node-inspector-actions">
                      <a
                        className={getPaperHref(focusedNode) ? "paper-link-btn inspector-link-btn" : "paper-link-btn inspector-link-btn disabled-link-btn"}
                        href={getPaperHref(focusedNode) || undefined}
                        target="_blank"
                        rel="noreferrer"
                        aria-disabled={!getPaperHref(focusedNode)}
                        onClick={(event) => {
                          if (!getPaperHref(focusedNode)) event.preventDefault();
                        }}
                      >
                        Open source
                      </a>
                      <button
                        type="button"
                        className="secondary-btn inspector-seed-btn"
                        disabled={!focusedNode || loadingTree}
                        onClick={handleFocusedNodeAsSeed}
                      >
                        Use as new seed
                      </button>
                    </div>
                    </aside>
                  </div>
                </section>

                {guide ? (
                  <div className="guide-card agentic-card">
                    <h3>{guide.title}</h3>
                    <p>{guide.summary}</p>
                  </div>
                ) : null}

                {routeSteps.length > 0 ? (
                  <div className={routeTransitioning ? "guide-card agentic-card route-transitioning" : "guide-card agentic-card"}>
                    <h3>Recommended Route</h3>
                    <p>Follow this numbered path first, then branch into the supporting context around it.</p>
                    <div className={routeTransitioning ? "route-step-list route-transitioning" : "route-step-list"}>
                      {routeSteps.map((step, index) => (
                        <div key={step.id || `${step.title}-${index}`} className="route-step-card">
                          <span className="route-step-index">{index + 1}</span>
                          <div className="route-step-copy">
                            <strong>{step.title}</strong>
                            <span>{step.reason || step.roleLabel || "Suggested next step in the lineage"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {companionResources.length > 0 ? (
                  <div className="guide-card agentic-card">
                    <h3>Companion Learning Resources</h3>
                    <p>
                      PaperTrail can also point you to videos, background references, and broader searches so you can
                      build intuition before or between papers.
                    </p>
                    <div className="resource-group-stack">
                      {Object.entries(companionResourceGroups).map(([group, items]) => (
                        <div key={group} className="resource-group-block">
                          <div className="resource-group-header">
                            <span className="canvas-badge resource-group-badge">{getResourceGroupLabel(group)}</span>
                          </div>
                          <div className="resource-grid">
                            {items.map((resource) => (
                              <a
                                key={resource.id}
                                className="resource-card"
                                href={resource.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <span className="mini-badge">
                                  {resource.type === "video"
                                    ? "Video"
                                    : resource.type === "reference"
                                      ? "Reference"
                                      : resource.type === "paper"
                                        ? "Paper"
                                        : "Search"}
                                </span>
                                <strong>{resource.label}</strong>
                                <span>{resource.description}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="copilot-teaser">
                      <div>
                        <span className="canvas-badge copilot-badge">Ask PaperTrail</span>
                        <strong>Coming soon: an in-app guide that explains this route in plain English.</strong>
                        <p>
                          We’ll add a focused copilot later for questions about the current map, the papers in it, and
                          what to read next.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

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
              </>
            )}
          </div>
        </section>

        <aside className="workbench-right-panel">
          <div className="right-panel-sticky">
            <button type="button" className="tree-cta" onClick={handleTopMatchTree} disabled={loadingTree}>
              {loadingTree ? "Building..." : "Build Tree From Top Match"}
            </button>
            <h2>Starting Points</h2>
            <p className="panel-intro">Pick a seed to redraw the lineage. Use open to jump to the paper source.</p>
            <p className="panel-microcopy">
              The active card is the seed currently shaping the route. Switching cards redraws the map around a new
              starting point.
            </p>
          </div>
          <div className="starting-points-scroll">
            <ul className="results compact-results">
              {results.map((paper, index) => {
                const id = getPaperId(paper);
                const paperKey = String(id || paper.externalId || getPaperTitle(paper));
                const isSaved = savedPaperKeys.has(paperKey);
                const isSaving = Boolean(savingPaperIds[paperKey]);
                const href = getPaperHref(paper);
                const isActive = id === selectedPaperId;

                return (
                  <li key={id || getPaperTitle(paper)} className="starting-point-slide">
                    <div className={isActive ? "paper-card compact-paper-card paper-card-active" : "paper-card compact-paper-card"}>
                      <button type="button" className="paper-btn compact-paper-btn" onClick={() => handlePaperClick(paper)}>
                        <span className="mini-badge">
                          {getRoleLabel(paper) || "Best Starting Paper"}
                        </span>
                        {isActive ? <span className="seed-status-badge">Current route seed</span> : null}
                        <strong>
                          {index + 1}. {getPaperTitle(paper)}
                        </strong>
                        <span className="seed-guide-copy">{getSeedGuideCopy(paper, isActive)}</span>
                      </button>
                      <div className="paper-card-actions">
                        <button
                          type="button"
                          className="save-paper-btn compact-action-btn"
                          onClick={() => handleSavePaper(paper)}
                          disabled={isSaved || isSaving}
                        >
                          {isSaved ? "Saved" : isSaving ? "Saving..." : "Save"}
                        </button>
                        {href ? (
                          <a className="paper-link-btn compact-action-btn" href={href} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
