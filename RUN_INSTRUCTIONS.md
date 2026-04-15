# Run Instructions

This file explains how to run PaperTrail locally in its current MVP state.

## What You Need

- Node.js 20+ recommended
- npm
- Docker Desktop or a compatible Docker runtime if you want the local databases

PaperTrail can still run without the local databases. In that case it will rely on external paper search and degrade gracefully.

## Project Structure

- `client/`: React + Vite frontend
- `backend/`: Express backend
- `docker-compose.yml`: local PostgreSQL, Redis, and Neo4j services

## First-Time Setup

### 1. Install dependencies

```bash
cd backend
npm install

cd ../client
npm install
```

### 2. Create env files

```bash
cp backend/.env.example backend/.env
cp client/.env.example client/.env
```

The defaults are already set for local development.

## Optional Local Services

If you want PostgreSQL, Redis, and Neo4j running locally:

```bash
docker compose up -d
```

This starts:
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- Neo4j on `localhost:7474` and `localhost:7687`

If you do not start these services, the backend will still run, but it will rely on external search and fallback behavior.

## Run The App

### Terminal 1: backend

```bash
cd backend
npm run dev
```

Backend default:
- `http://localhost:4000`

### Terminal 2: frontend

```bash
cd client
npm run dev
```

Frontend default:
- `http://localhost:5173`

## How To Use The App

In the frontend, enter one of:
- a research topic
- a paper title
- a DOI
- an arXiv link
- a Semantic Scholar link

PaperTrail will:
1. find candidate starting papers
2. organize them into a staged reading plan
3. let you choose a seed paper
4. build a guided ancestor tree when available
5. save recent trails and papers into the workspace when Postgres is available

## Useful Commands

### Backend tests

```bash
cd backend
npm test
```

### Frontend production build

```bash
cd client
npm run build
```

## Current Notes

- Search is working and includes reading-plan metadata
- Exact-title lookups are cleaner now and keep one main seed in `Start Here`
- Broad-topic plans are staged, but retrieval quality is still being improved
- Ancestor trees may fall back to placeholder guidance when live citation expansion is unavailable
- Recent research trails appear in the workspace view when local persistence is available

## Main Docs

- Product overview: [README.md](/Users/vidyutsriram/PaperTrail/README.md:1)
- Development progress log: [PROJECT_PROGRESS.md](/Users/vidyutsriram/PaperTrail/PROJECT_PROGRESS.md:1)
