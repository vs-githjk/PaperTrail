# PaperTrail

PaperTrail is a research-reading helper. A user enters a research topic, paper title, DOI, or paper link, and the app finds a likely seed paper plus a guided ancestor tree showing earlier material that led up to it.

This branch is the current MVP:
- Search by topic, paper title, DOI, arXiv link, or Semantic Scholar link
- Review likely starting points for the topic
- Generate a guided ancestor tree from the best seed paper
- Render that tree as an interactive force graph in the browser

## Current Stack

- Frontend: React + Vite + D3
- Backend: Node.js + Express
- Local infra: PostgreSQL, Redis, Neo4j via Docker Compose
- External data sources: Semantic Scholar and arXiv

## What Exists Today

- `client/` contains the MVP UI for searching papers and rendering the ancestor graph.
- `backend/` contains the API for search, health checks, and ancestor-tree generation.
- `docker-compose.yml` starts Postgres, Redis, and Neo4j for local development.

The backend can run even if those local services are unavailable. In that case it falls back to live external search where possible.

## API

- `GET /api/health`
- `GET /api/workspace`
- `GET /api/papers`
- `GET /api/search?q=<query>`
- `POST /api/papers/ancestor-tree`

Example ancestor-tree request body:

```json
{
  "title": "Attention Is All You Need",
  "paperId": "204e3073870fae3d05bcbc2f6a8e263d9b72e776",
  "depth": 2,
  "breadth": 3
}
```

The ancestor-tree response also includes lightweight guide metadata so the frontend can explain what to read first, not just draw the graph.
The workspace endpoint returns recent saved papers plus recent research trails so the UI can feel persistent across sessions.

Progress across development passes is tracked in [PROJECT_PROGRESS.md](/Users/vidyutsriram/PaperTrail/PROJECT_PROGRESS.md:1).
Practical local startup steps are documented in [RUN_INSTRUCTIONS.md](/Users/vidyutsriram/PaperTrail/RUN_INSTRUCTIONS.md:1).

## Local Setup

### 1. Install dependencies

```bash
cd backend && npm install
cd ../client && npm install
```

### 2. Create env files

```bash
cp backend/.env.example backend/.env
cp client/.env.example client/.env
```

### 3. Start local services

```bash
docker compose up -d
```

### 4. Run the app

In one terminal:

```bash
cd backend
npm run dev
```

In another terminal:

```bash
cd client
npm run dev
```

The frontend defaults to `http://localhost:5173` and the backend to `http://localhost:4000`.

## Near-Term Roadmap

- Improve ancestor quality by ranking sources around broad topic intent, not only direct paper matches
- Persist reading plans and research trails more deeply instead of relying only on paper-level saves
- Use Neo4j for stored graph relationships instead of on-demand-only tree building
- Add caching for repeated searches and tree generation
- Improve the guided reading experience beyond the current MVP heuristics

## Later Idea

A future direction is an in-app copilot that answers questions only about material inside PaperTrail. That can come later once the core ancestor-tree flow is stable, and it would likely use RAG plus memory scoped to the user’s activity inside the app.
