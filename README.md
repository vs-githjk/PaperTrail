# PaperTrail

PaperTrail is a research-reading helper. A user enters a research topic, paper title, DOI, or paper link, and the app finds a likely seed paper plus a guided ancestor tree showing earlier material that led up to it.

This branch is the current MVP:
- Search by topic, paper title, DOI, arXiv link, or Semantic Scholar link
- Review likely starting points for the topic
- Generate a guided ancestor tree from the best seed paper
- Refine broad topics with a short clarification step before choosing a seed
- Render that tree as a layered guided ancestor map in the browser

## Current Stack

- Frontend: React + Vite + D3
- Backend: Node.js + Express
- Local infra: PostgreSQL, Redis, Neo4j via Docker Compose
- External data sources: Semantic Scholar and arXiv

## What Exists Today

- `client/` contains the MVP UI for searching papers and rendering the ancestor graph.
- `backend/` contains the API for search, health checks, and ancestor-tree generation.
- `docker-compose.yml` starts Postgres, Redis, and Neo4j for local development.
- Broad prompts such as `llms`, `rag`, or `iot` can trigger a clarification card so PaperTrail can pick a better seed.
- The tree now uses learning layers such as `Current paper`, `Direct foundations`, and `Earlier foundations` instead of a generic graph-only view.

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

## Latest Checkpoint

Current pushed checkpoint on `main`:
- branch: `main`
- commit: `a80a349`
- summary: `Improve PaperTrail broad-topic refinement and tree depth`

This checkpoint includes:
- clarification-aware broad-topic refinement
- smarter backend retrieval for refined searches
- adaptive tree depth for stronger seeds
- richer fallback learning trees when live citation ancestry is weak
- generation-band ancestor layout improvements
- the refined-tree crash fix

Progress across development passes is tracked in [PROJECT_PROGRESS.md](/Users/vidyutsriram/PaperTrail/PROJECT_PROGRESS.md:1).
Practical local startup steps are documented in [RUN_INSTRUCTIONS.md](/Users/vidyutsriram/PaperTrail/RUN_INSTRUCTIONS.md:1).
Deployment setup is documented in [DEPLOYMENT.md](/Users/vidyutsriram/PaperTrail/DEPLOYMENT.md:1).

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

## Deployment

The repo now includes first-pass deployment support for:
- Render backend + managed Postgres via [render.yaml](/Users/vidyutsriram/PaperTrail/render.yaml:1)
- Vercel frontend with SPA rewrites via [client/vercel.json](/Users/vidyutsriram/PaperTrail/client/vercel.json:1)
- environment setup and smoke-test steps in [DEPLOYMENT.md](/Users/vidyutsriram/PaperTrail/DEPLOYMENT.md:1)

The backend also supports managed-service env vars such as `DATABASE_URL`, `POSTGRES_SSL`, `REDIS_URL`, and `CORS_ORIGIN`.

## Near-Term Roadmap

- Add semantic branch types so the tree distinguishes:
  - overview branches
  - foundational theory branches
  - methodology branches
  - applied/supporting branches
- Improve broad-topic refinement further so prompts like `llms`, `agents`, and `rag` produce cleaner candidate pools
- Make adaptive depth more quality-aware so strong topics can open into deeper trees without clutter
- Persist reading plans and research trails more deeply instead of relying only on paper-level saves
- Use Neo4j for stored graph relationships instead of on-demand-only tree building
- Add caching for repeated searches and tree generation

## Teammate Next Passes

If someone is picking up from the latest pushed `main`, the best next work is:
1. `Branch semantics`
Make the ancestor tree teach what each branch means, not just that it exists.
2. `Broader-topic retrieval quality`
Keep improving clarification-aware search so vague prompts produce better seed pools.
3. `Adaptive depth tuning`
Let deeper trees open only when source quality supports it.
4. `Later`
Only after the deterministic product logic is stronger: add a focused in-app copilot over PaperTrail’s own context.

## Later Idea

A future direction is an in-app copilot that answers questions only about material inside PaperTrail. That can come later once the core ancestor-tree flow is stable, and it would likely use RAG plus memory scoped to the user’s activity inside the app.
