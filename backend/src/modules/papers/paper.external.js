function normalizeSemanticScholarItem(item) {
  return {
    id: item.paperId || item.externalIds?.DOI || item.title,
    title: item.title || "Untitled paper",
    authors: Array.isArray(item.authors) ? item.authors.map((a) => a.name).filter(Boolean) : [],
    influenceScore:
      typeof item.citationCount === "number"
        ? Number((item.citationCount / 1000).toFixed(3))
        : 0,
    abstract: item.abstract || "",
    source: "semantic_scholar"
  };
}

function normalizeArxivItem(entry) {
  return {
    id: entry.id || entry.title,
    title: entry.title || "Untitled paper",
    authors: Array.isArray(entry.authors) ? entry.authors : [],
    influenceScore: 0,
    abstract: entry.summary || "",
    source: "arxiv"
  };
}

function xmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

function parseArxivXml(xml) {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  return entries.map((entry) => {
    const title = xmlValue(entry, "title");
    const id = xmlValue(entry, "id");
    const summary = xmlValue(entry, "summary");
    const authorMatches = entry.match(/<name>([\s\S]*?)<\/name>/g) || [];
    const authors = authorMatches
      .map((x) => x.replace(/<\/?name>/g, "").trim())
      .filter(Boolean);
    return { id, title, summary, authors };
  });
}

async function fetchSemanticScholar(topic, limit) {
  const url =
    "https://api.semanticscholar.org/graph/v1/paper/search?query=" +
    encodeURIComponent(topic) +
    `&limit=${limit}&fields=title,authors,abstract,citationCount,externalIds,paperId`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Semantic Scholar failed: ${response.status}`);
  }
  const payload = await response.json();
  const data = Array.isArray(payload.data) ? payload.data : [];
  return data.map(normalizeSemanticScholarItem);
}

async function fetchArxiv(topic, limit) {
  const url =
    "https://export.arxiv.org/api/query?search_query=all:" +
    encodeURIComponent(topic) +
    `&start=0&max_results=${limit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`arXiv failed: ${response.status}`);
  }
  const xml = await response.text();
  return parseArxivXml(xml).map(normalizeArxivItem);
}

async function fetchExternalPapers(topic, limit = 20) {
  const [semanticResult, arxivResult] = await Promise.allSettled([
    fetchSemanticScholar(topic, Math.min(limit, 20)),
    fetchArxiv(topic, Math.min(limit, 20))
  ]);

  const semanticItems = semanticResult.status === "fulfilled" ? semanticResult.value : [];
  const arxivItems = arxivResult.status === "fulfilled" ? arxivResult.value : [];

  const merged = [...semanticItems, ...arxivItems];
  const seen = new Set();
  const deduped = merged.filter((item) => {
    const key = `${item.title}`.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.slice(0, limit);
}

module.exports = { fetchExternalPapers };
