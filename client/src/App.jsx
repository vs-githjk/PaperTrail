import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AncestorTree from "./components/AncestorTree";
import Particles from "./components/Particles";
import { FloatingField } from "./ux/FloatingField";
import { mountLiveChrome } from "./ux/liveChrome";

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

function tokenizePrompt(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function isBroadTopicPrompt(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (/10\.\d{4,9}\//i.test(raw) || /arxiv\.org|semanticscholar\.org|doi\.org/i.test(raw)) return false;

  const tokens = tokenizePrompt(raw);
  const broadSingles = new Set(["llm", "llms", "ai", "iot", "nlp", "rag"]);
  if (tokens.length === 1 && broadSingles.has(tokens[0])) return true;
  if (tokens.length <= 3 && !/["“”]/.test(raw)) return true;
  if (/\b(basics|overview|introduction|fundamentals|applications|systems)\b/i.test(raw)) return true;
  return false;
}

const CLARIFICATION_GROUPS = {
  focus: {
    label: "What part matters most?",
    options: [
      { id: "foundations", label: "Foundations", hint: "theory, origins, seminal work" },
      { id: "reasoning", label: "Reasoning", hint: "chain-of-thought, problem solving" },
      { id: "agents", label: "Agents", hint: "tool use, planning, autonomy" },
      { id: "rag", label: "RAG", hint: "retrieval, memory, grounded answers" },
      { id: "applications", label: "Applications", hint: "real-world systems and uses" }
    ]
  },
  material: {
    label: "What kind of papers do you want?",
    options: [
      { id: "survey", label: "Intro & Surveys", hint: "high-level orientation first" },
      { id: "seminal", label: "Seminal Papers", hint: "older foundational work" },
      { id: "practical", label: "Practical Papers", hint: "methods, systems, implementation" },
      { id: "recent", label: "Recent Work", hint: "more current papers" }
    ]
  },
  goal: {
    label: "What is your goal?",
    options: [
      { id: "understand", label: "Understand from scratch", hint: "build intuition gradually" },
      { id: "build", label: "Build something", hint: "favor actionable methods" },
      { id: "research", label: "Research deeply", hint: "broader and more foundational" }
    ]
  }
};

function clarificationBoost(paper, clarification) {
  if (!paper || !clarification) return 0;
  const haystack = `${paper.title || ""} ${paper.abstract || ""} ${paper.matchReason || ""} ${paper.role || ""} ${paper.roleReason || ""}`.toLowerCase();
  let boost = 0;

  const focusTokens = {
    foundations: ["foundation", "fundamental", "survey", "overview", "introduction", "theory", "vision"],
    reasoning: ["reasoning", "planning", "inference", "decision", "problem solving"],
    agents: ["agent", "tool", "autonomous", "planner", "workflow"],
    rag: ["retrieval", "rag", "memory", "knowledge", "grounded"],
    applications: ["application", "system", "deployment", "case study", "practical"]
  };

  const materialRules = {
    survey: () => (paper.role === "overview" ? 70 : haystack.includes("survey") || haystack.includes("overview") ? 45 : -10),
    seminal: () => (paper.role === "seminal" ? 70 : paper.year && Number(paper.year) < 2018 ? 28 : -8),
    practical: () => (haystack.includes("system") || haystack.includes("application") || haystack.includes("framework") ? 45 : 0),
    recent: () => (paper.year && Number(paper.year) >= 2023 ? 36 : 0)
  };

  const goalRules = {
    understand: () => (paper.role === "overview" ? 55 : paper.role === "starting_point" ? 24 : 0),
    build: () => (haystack.includes("framework") || haystack.includes("system") || haystack.includes("application") ? 40 : 0),
    research: () => (paper.role === "seminal" ? 38 : paper.role === "overview" ? 24 : 10)
  };

  if (clarification.focus && focusTokens[clarification.focus]) {
    for (const token of focusTokens[clarification.focus]) {
      if (haystack.includes(token)) boost += 16;
    }
  }

  if (clarification.material && materialRules[clarification.material]) {
    boost += materialRules[clarification.material]();
  }

  if (clarification.goal && goalRules[clarification.goal]) {
    boost += goalRules[clarification.goal]();
  }

  return boost;
}

function updateClarificationValue(prev, key, value) {
  return {
    ...prev,
    [key]: prev[key] === value ? "" : value
  };
}

class WorkbenchErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("PaperTrail runtime error", error);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app workbench-shell">
          <div className="cosmos-backdrop" aria-hidden="true" />
          <section className="runtime-error-panel">
            <span className="canvas-badge">PaperTrail hit a runtime error</span>
            <h2>The refined tree flow crashed in the browser.</h2>
            <p>
              The page didn’t lose your work, but this code path needs to be fixed. Refresh once, and if it happens
              again, the error below tells us exactly what broke.
            </p>
            <pre>{String(this.state.error?.message || this.state.error)}</pre>
            <button
              type="button"
              className="pt-btn-primary"
              data-cta-long="true"
              onClick={() => window.location.reload()}
            >
              reload local preview
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
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
  const [authShake, setAuthShake] = useState(false);
  const [authTabIndicator, setAuthTabIndicator] = useState({ tx: 0, sx: 0 });
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
  const [clarification, setClarification] = useState({ focus: "", material: "", goal: "" });
  const treeRestoreRef = useRef(null);
  const handlePaperClickRef = useRef(null);
  const shellRef = useRef(null);
  const navActionsRef = useRef(null);
  const authTabRowRef = useRef(null);
  const authLoginTabRef = useRef(null);
  const authRegisterTabRef = useRef(null);

  const broadQueryMode = useMemo(() => isBroadTopicPrompt(query), [query]);
  const hasClarificationAnswers = Boolean(clarification.focus || clarification.material || clarification.goal);
  const rankedResults = useMemo(() => {
    if (!results.length || !hasClarificationAnswers) return results;

    return [...results].sort((left, right) => {
      const rightScore = Number(right.recommendationScore || 0) + clarificationBoost(right, clarification);
      const leftScore = Number(left.recommendationScore || 0) + clarificationBoost(left, clarification);
      const scoreGap = rightScore - leftScore;
      if (scoreGap !== 0) return scoreGap;
      return String(left.title || "").localeCompare(String(right.title || ""));
    });
  }, [results, clarification, hasClarificationAnswers]);

  const selectedPaper = useMemo(
    () => rankedResults.find((paper) => getPaperId(paper) === selectedPaperId)
      || results.find((paper) => getPaperId(paper) === selectedPaperId)
      || null,
    [rankedResults, results, selectedPaperId]
  );

  const guide = graphData?.data?.meta?.guide ?? graphData?.meta?.guide ?? null;
  const graphMeta = graphData?.data?.meta ?? graphData?.meta ?? null;
  const isFallbackTree = graphMeta?.source === "fallback";
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

  useLayoutEffect(() => {
    if (!showAuthPanel) return;
    const row = authTabRowRef.current;
    const tab = authMode === "login" ? authLoginTabRef.current : authRegisterTabRef.current;
    if (!row || !tab) return;
    const rr = row.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    setAuthTabIndicator({ tx: tr.left - rr.left, sx: Math.max(1, tr.width) });
  }, [showAuthPanel, authMode]);

  useEffect(() => {
    const root = shellRef.current;
    if (!root) return undefined;
    return mountLiveChrome(root);
  }, []);

  useEffect(() => {
    const nav = navActionsRef.current;
    if (!nav) return undefined;
    let ghostRaf = 0;
    let pendingEnter = null;
    const flushGhost = () => {
      ghostRaf = 0;
      const btn = pendingEnter;
      pendingEnter = null;
      if (!btn) return;
      nav.style.willChange = "transform";
      const nr = nav.getBoundingClientRect();
      const br = btn.getBoundingClientRect();
      nav.style.setProperty("--nav-ghost-tx", `${br.left - nr.left}px`);
      nav.style.setProperty("--nav-ghost-sx", `${br.width}`);
      nav.style.setProperty("--nav-ghost-o", "1");
    };
    const onEnter = (event) => {
      pendingEnter = event.currentTarget;
      cancelAnimationFrame(ghostRaf);
      ghostRaf = requestAnimationFrame(flushGhost);
    };
    const onLeave = () => {
      pendingEnter = null;
      cancelAnimationFrame(ghostRaf);
      ghostRaf = 0;
      nav.style.setProperty("--nav-ghost-o", "0");
      nav.style.willChange = "auto";
    };
    const sel = "button.nav-link-btn, button.pt-btn-primary";
    const buttons = [...nav.querySelectorAll(sel)];
    buttons.forEach((btn) => btn.addEventListener("pointerenter", onEnter));
    nav.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(ghostRaf);
      buttons.forEach((btn) => btn.removeEventListener("pointerenter", onEnter));
      nav.removeEventListener("pointerleave", onLeave);
    };
  }, [isLoggedIn]);

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
      setClarification(
        snap.clarification && typeof snap.clarification === "object"
          ? { focus: snap.clarification.focus || "", material: snap.clarification.material || "", goal: snap.clarification.goal || "" }
          : { focus: "", material: "", goal: "" }
      );
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
      graphData,
      clarification
    };
    writeWorkbenchSession(payload);
  }, [sessionHydrated, query, hasSearched, results, searchPlan, selectedPaperId, graphData, clarification]);

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

  async function runSearch(searchText, options = {}) {
    const normalized = String(searchText || "").trim();
    if (!normalized) return [];
    const normalizedClarification = options?.clarification && typeof options.clarification === "object"
      ? {
          focus: options.clarification.focus || "",
          material: options.clarification.material || "",
          goal: options.clarification.goal || ""
        }
      : { focus: "", material: "", goal: "" };
    const preserveClarification = Boolean(options?.preserveClarification);

    setError("");
    setHasSearched(true);
    setTrailSaved(false);
    setLoadingSearch(true);
    setGraphData(null);
    setFocusedNode(null);
    setSelectedPaperId(null);
    if (preserveClarification) {
      setClarification(normalizedClarification);
    } else {
      setClarification({ focus: "", material: "", goal: "" });
    }

    try {
      const params = new URLSearchParams({ q: normalized });
      if (normalizedClarification.focus) params.set("focus", normalizedClarification.focus);
      if (normalizedClarification.material) params.set("material", normalizedClarification.material);
      if (normalizedClarification.goal) params.set("goal", normalizedClarification.goal);
      const response = await fetch(
        `${API_BASE}/api/search?${params.toString()}`,
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
      if (authToken) await fetchHistory();
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
    if (searchedResults[0] && !isBroadTopicPrompt(query)) {
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
          query: query.trim(),
          clarification: hasClarificationAnswers ? clarification : undefined
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
    setClarification({ focus: "", material: "", goal: "" });
    setTrailSaved(false);
    setLoadingSearch(false);
    setLoadingTree(false);
    setShowHistoryPanel(false);
  }

  async function handleTopMatchTree() {
    let topMatch = rankedResults[0] || results[0] || null;

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

  async function handleClarifiedBuild() {
    const refinedResults = await runSearch(query, {
      clarification,
      preserveClarification: true
    });
    const topMatch = refinedResults[0] || null;
    if (!topMatch) {
      setError("PaperTrail couldn’t find a refined starting paper for this topic yet. Try a slightly more specific prompt or use broad match.");
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
    const email = String(authForm.email || "").trim();
    const password = String(authForm.password || "").trim();
    const name = String(authForm.name || "").trim();
    if (!email || !password) {
      setAuthShake(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAuthShake(true));
      });
      return;
    }
    if (authMode === "register" && !name) {
      setAuthShake(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAuthShake(true));
      });
      return;
    }

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
    setClarification({ focus: "", material: "", goal: "" });
    setTrailSaved(false);
  }

  return (
    <WorkbenchErrorBoundary>
    <main ref={shellRef} className="app workbench-shell">
      <div className="cosmos-backdrop" aria-hidden="true">
        <div className="cosmos-orb cosmos-orb-left" />
        <div className="cosmos-orb cosmos-orb-right" />
        <div className="cosmos-orb cosmos-orb-bottom" />
        <Particles
          className="cosmos-particles"
          particleColors={["#ede9fe", "#c4b5fd", "#8b5cf6", "#fafaf9"]}
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
            <FloatingField
              id="top-search-query"
              label="Search papers"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              ariaLabel="Try a research topic, paper title, DOI, or paper link"
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
        <div className="nav-actions" ref={navActionsRef}>
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
              <button type="button" className="pt-btn-destructive" onClick={handleLogout} aria-label="Log out">
                log out
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="pt-btn-primary"
              data-cta-long="true"
              onClick={() => {
                setAuthError("");
                setAuthMode("login");
                setShowAuthPanel(true);
              }}
            >
              login / register
            </button>
          )}
        </div>
      </header>

      {!isLoggedIn && showAuthPanel ? (
        <div className="auth-modal-backdrop" onClick={() => setShowAuthPanel(false)}>
          <section className="auth-modal" onClick={(event) => event.stopPropagation()}>
            <div className="auth-modal-header">
              <h3>join PaperTrail</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowAuthPanel(false)}
                aria-label="Close login modal"
              >
                x
              </button>
            </div>

            <div className="auth-tab-shell">
              <div className="auth-tab-row" ref={authTabRowRef}>
                <button
                  type="button"
                  ref={authLoginTabRef}
                  onClick={() => setAuthMode("login")}
                  className={authMode === "login" ? "secondary-btn active-auth-btn" : "secondary-btn"}
                >
                  login
                </button>
                <button
                  type="button"
                  ref={authRegisterTabRef}
                  onClick={() => setAuthMode("register")}
                  className={authMode === "register" ? "secondary-btn active-auth-btn" : "secondary-btn"}
                >
                  register
                </button>
                <div
                  className="auth-tab-indicator"
                  aria-hidden="true"
                  style={{
                    transform: `translate3d(${authTabIndicator.tx}px, 0, 0) scaleX(${authTabIndicator.sx})`
                  }}
                />
              </div>
            </div>

            <form
              onSubmit={handleAuthSubmit}
              className={`auth-form${authShake ? " ux-shake-once" : ""}`}
              onAnimationEnd={(event) => {
                if (event.animationName === "uxShake") setAuthShake(false);
              }}
            >
              {authMode === "register" ? (
                <FloatingField
                  id="auth-name"
                  name="name"
                  label="Name"
                  value={authForm.name}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, name: event.target.value }))}
                  autoComplete="name"
                />
              ) : null}
              <FloatingField
                id="auth-email"
                name="email"
                label="Email"
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                autoComplete="email"
              />
              <FloatingField
                id="auth-password"
                name="password"
                label="Password"
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
                autoComplete={authMode === "register" ? "new-password" : "current-password"}
              />
              <button type="submit" className="pt-btn-primary" data-cta-long="true" disabled={loadingAuth}>
                {loadingAuth
                  ? "please wait…"
                  : authMode === "register"
                    ? "register"
                    : "sign in"}
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
                          className="history-remove-btn pt-btn-destructive"
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
          <section className="sidebar-block sidebar-block-scroll">
            <div className="sidebar-heading-row">
              <h2>Recent Research Trails</h2>
            </div>
            <div className="sidebar-list-scroll">
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
            </div>
          </section>

          <section className="sidebar-block sidebar-block-scroll">
            <div className="sidebar-heading-row">
              <h2>Recently Saved Papers</h2>
            </div>
            <div className="sidebar-list-scroll">
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
            </div>
          </section>
        </aside>

        <section className="workbench-canvas">
          <div className="canvas-scroll">
            {!hasSearched ? (
              <div className="canvas-empty canvas-welcome ux-card-tilt">
                <div className="ux-card-grid" aria-hidden="true" />
                <span className="canvas-badge" data-depth="0.3">
                  Warm Knowledge Cosmos
                </span>
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

                {broadQueryMode && results.length > 0 && !graphData ? (
                  <div className="guide-card clarification-card agentic-card ux-card-tilt ux-card-tilt--glow-only">
                    <div className="ux-card-grid" aria-hidden="true" />
                    <h3>Narrow This Topic First</h3>
                    <p>
                      This topic is broad, so answer a few quick questions and PaperTrail will choose a much better seed
                      before drawing the tree.
                    </p>
                    <div className="clarification-summary" aria-live="polite">
                      {Object.entries(CLARIFICATION_GROUPS).map(([groupKey, group]) => {
                        const selected = group.options.find((option) => option.id === clarification[groupKey]);
                        return (
                          <span key={groupKey} className={selected ? "clarification-summary-chip is-selected" : "clarification-summary-chip"}>
                            <strong>{group.label}</strong>
                            <em>{selected ? selected.label : "Not chosen yet"}</em>
                          </span>
                        );
                      })}
                    </div>
                    <div className="clarification-grid">
                      {Object.entries(CLARIFICATION_GROUPS).map(([groupKey, group]) => (
                        <div key={groupKey} className="clarification-group">
                          <span className="meta-label">{group.label}</span>
                          <div className="clarification-chip-row">
                            {group.options.map((option) => {
                              const isActive = clarification[groupKey] === option.id;
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  className={isActive ? "clarification-chip clarification-chip-active" : "clarification-chip"}
                                  aria-pressed={isActive}
                                  onClick={() =>
                                    setClarification((prev) => updateClarificationValue(prev, groupKey, option.id))
                                  }
                                >
                                  <strong>{option.label}</strong>
                                  <span>{option.hint}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="clarification-actions">
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={handleTopMatchTree}
                      >
                        use broad match
                      </button>
                      <button
                        type="button"
                        className="pt-btn-primary"
                        data-cta-long="true"
                        onClick={handleClarifiedBuild}
                        disabled={!hasClarificationAnswers || rankedResults.length === 0 || loadingTree}
                      >
                        {loadingTree ? "building…" : "build refined tree"}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="guide-card agentic-card quickstart-card ux-card-tilt ux-card-tilt--glow-only">
                  <div className="ux-card-grid" aria-hidden="true" />
                  <h3>How To Use This Map</h3>
                  <div className="quickstart-grid">
                    <div className="quickstart-step">
                      <span className="quickstart-index" data-depth="0.3">
                        1
                      </span>
                      <div>
                        <strong>Follow the numbered route first</strong>
                        <p>Those steps are the recommended reading path through the lineage.</p>
                      </div>
                    </div>
                    <div className="quickstart-step">
                      <span className="quickstart-index" data-depth="0.3">
                        2
                      </span>
                      <div>
                        <strong>Use side branches as context</strong>
                        <p>They are useful supporting papers, but not the first things to read.</p>
                      </div>
                    </div>
                    <div className="quickstart-step">
                      <span className="quickstart-index" data-depth="0.3">
                        3
                      </span>
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
                        {loadingTree ? "building…" : "rebuild from top match"}
                      </button>
                      {guide ? (
                        <button
                          type="button"
                          className="hero-inline-btn pt-btn-primary"
                          data-cta-long="true"
                          onClick={handleSaveTrail}
                          disabled={savingTrail || trailSaved || !selectedPaper}
                        >
                          {trailSaved ? "trail saved" : savingTrail ? "saving…" : "save trail"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {Array.isArray(results) && results.length > 0 ? (
                    <div className="seed-switcher-hint">
                      <span className="canvas-badge seed-switcher-badge">Starting points live on the right</span>
                      <p>
                        Keep the map focused here, then use the right rail to swap to another strong seed if you want
                        to redraw the lineage.
                      </p>
                    </div>
                  ) : null}
                  <div className="tree-explorer-layout">
                    <div className={routeTransitioning ? "tree-stage route-transitioning" : "tree-stage"}>
                      <div className="tree-stage-legend">
                        <span className="legend-pill legend-pill-route">Core ancestry</span>
                        <span className="legend-pill legend-pill-context">Supporting branches</span>
                        <span className="legend-copy">Hover a marker to inspect how each paper connects into the lineage.</span>
                      </div>
                      {loadingTree ? (
                        <div className="tree-loading-ux" aria-busy="true">
                          <p className="tree-loading-copy">Building ancestor tree...</p>
                          <div className="ux-skeleton-stack tree-skel" aria-hidden="true">
                            <div className="ux-skel-line" />
                            <div className="ux-skel-line" />
                            <div className="ux-skel-line" />
                          </div>
                        </div>
                      ) : null}
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
                        className={
                          getPaperHref(focusedNode)
                            ? "paper-link-btn inspector-link-btn"
                            : "paper-link-btn inspector-link-btn disabled-link-btn"
                        }
                        href={getPaperHref(focusedNode) || undefined}
                        target="_blank"
                        rel="noreferrer"
                        aria-disabled={!getPaperHref(focusedNode)}
                        onClick={(event) => {
                          if (!getPaperHref(focusedNode)) event.preventDefault();
                        }}
                      >
                        open source
                      </a>
                      <button
                        type="button"
                        className="inspector-seed-btn pt-btn-primary"
                        data-cta-long="true"
                        disabled={!focusedNode || loadingTree}
                        onClick={handleFocusedNodeAsSeed}
                      >
                        use as new seed
                      </button>
                    </div>
                    </aside>
                  </div>
                </section>

                {guide ? (
                  <div className="guide-card agentic-card ux-card-tilt ux-card-tilt--glow-only">
                    <div className="ux-card-grid" aria-hidden="true" />
                    <h3>{guide.title}</h3>
                    <p>{guide.summary}</p>
                  </div>
                ) : null}

                {isFallbackTree ? (
                  <div className="guide-card fallback-note-card agentic-card ux-card-tilt ux-card-tilt--glow-only">
                    <div className="ux-card-grid" aria-hidden="true" />
                    <h3>Guided Fallback Tree</h3>
                    <p>
                      Live citation ancestry was unavailable for this seed, so PaperTrail built a broader learning tree
                      from related papers, surveys, and foundational context instead.
                    </p>
                  </div>
                ) : null}

                {routeSteps.length > 0 ? (
                  <div
                    className={
                      routeTransitioning
                        ? "guide-card agentic-card ux-card-tilt ux-card-tilt--glow-only route-transitioning"
                        : "guide-card agentic-card ux-card-tilt ux-card-tilt--glow-only"
                    }
                  >
                    <div className="ux-card-grid" aria-hidden="true" />
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
                  <div className="guide-card agentic-card ux-card-tilt ux-card-tilt--glow-only">
                    <div className="ux-card-grid" aria-hidden="true" />
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
                  <div className="guide-card agentic-card ux-card-tilt ux-card-tilt--glow-only">
                    <div className="ux-card-grid" aria-hidden="true" />
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
            <button
              type="button"
              className="tree-cta pt-btn-primary"
              data-cta-long="true"
              onClick={handleTopMatchTree}
              disabled={loadingTree}
            >
              {loadingTree ? "building…" : "build tree from top match"}
            </button>
            <h2>Starting Points</h2>
            <p className="panel-intro">Pick a seed to redraw the lineage. Use open to jump to the paper source.</p>
            <p className="panel-microcopy">
              The active card is the seed currently shaping the route. Switching cards redraws the map around a new
              starting point.
            </p>
          </div>
          <div className="starting-points-scroll">
            {loadingSearch ? (
              <div className="ux-skeleton-stack panel-search-skel" aria-busy="true">
                <div className="ux-skel-line" />
                <div className="ux-skel-line" />
                <div className="ux-skel-line" />
              </div>
            ) : null}
            <ul className={`results compact-results${loadingSearch ? " is-hidden-while-loading" : ""}`}>
              {rankedResults.map((paper, index) => {
                const id = getPaperId(paper);
                const paperKey = String(id || paper.externalId || getPaperTitle(paper));
                const isSaved = savedPaperKeys.has(paperKey);
                const isSaving = Boolean(savingPaperIds[paperKey]);
                const href = getPaperHref(paper);
                const isActive = id === selectedPaperId;

                return (
                  <li key={id || getPaperTitle(paper)} className="starting-point-slide">
                    <div
                      className={
                        isActive
                          ? "paper-card compact-paper-card paper-card-active ux-card-tilt"
                          : "paper-card compact-paper-card ux-card-tilt"
                      }
                    >
                      <div className="ux-card-grid" aria-hidden="true" />
                      <button type="button" className="paper-btn compact-paper-btn" onClick={() => handlePaperClick(paper)}>
                        <span className="mini-badge" data-depth="0.3">
                          {getRoleLabel(paper) || "Best Starting Paper"}
                        </span>
                        {isActive ? <span className="seed-status-badge">Current route seed</span> : null}
                        <strong data-depth="0.25">
                          {index + 1}. {getPaperTitle(paper)}
                        </strong>
                        <span className="seed-guide-copy">{getSeedGuideCopy(paper, isActive)}</span>
                      </button>
                      <div className="paper-card-actions">
                        <button
                          type="button"
                          className="save-paper-btn compact-action-btn secondary-btn"
                          onClick={() => handleSavePaper(paper)}
                          disabled={isSaved || isSaving}
                        >
                          {isSaved ? "saved" : isSaving ? "saving…" : "save"}
                        </button>
                        {href ? (
                          <a className="paper-link-btn compact-action-btn" href={href} target="_blank" rel="noreferrer">
                            open
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
    </WorkbenchErrorBoundary>
  );
}
