# Deployment Guide

This repo is now prepared for a first deployment on Render.

The simplest production shape for PaperTrail right now is:
- a Render static site for the React frontend
- a Render web service for the Express backend
- a Render Postgres database for auth, saved papers, and saved research trails

Redis and Neo4j are still optional. The app can start without them, and the backend already degrades gracefully when they are unavailable.

## Recommended First Deploy

Use the included [render.yaml](/Users/vidyutsriram/PaperTrail/render.yaml:1) blueprint.

It provisions:
- `papertrail-api`
- `papertrail-web`
- `papertrail-db`

## Before You Create The Blueprint

Make sure the branch you want to deploy is pushed to GitHub.

You will need to provide a few values during setup:
- `CORS_ORIGIN`
  Set this to your frontend URL, such as `https://papertrail-web.onrender.com`
- `VITE_API_BASE`
  Set this to your backend URL, such as `https://papertrail-api.onrender.com`
- `REDIS_URL`
  Optional
- `NEO4J_URI`
  Optional
- `NEO4J_USER`
  Optional
- `NEO4J_PASSWORD`
  Optional

For a first deployment, it is fine to leave Redis and Neo4j unset.

## Render Setup Steps

1. In Render, choose `New +` and create a Blueprint from this repository.
2. Let Render read [render.yaml](/Users/vidyutsriram/PaperTrail/render.yaml:1).
3. When prompted, fill in:
   - `CORS_ORIGIN`
   - `VITE_API_BASE`
   - any optional Redis or Neo4j values you want to use
4. Deploy the stack.
5. Once the static site and API URLs exist, double-check:
   - the frontend points to the backend URL
   - the backend allows the frontend origin in `CORS_ORIGIN`

## Environment Notes

The backend now supports:
- `DATABASE_URL`
- `POSTGRES_SSL`
- `CORS_ORIGIN`
- `REDIS_URL`

That means you can deploy against managed services without translating everything into localhost-style fields.

## Health Check

After deployment, verify:

```bash
curl https://YOUR-BACKEND-URL/api/health
```

You should get:

```json
{"status":"ok"}
```

## First Production Smoke Test

After both services are live:

1. Load the frontend.
2. Sign up for an account.
3. Search for a topic like `transformers in NLP`.
4. Build an ancestor tree from a starting paper.
5. Save a paper or research trail.
6. Refresh and confirm workspace/history state still appears.

## What Is Still Optional

- Redis caching
- Neo4j-backed graph persistence
- custom domains
- production hardening like tighter auth/session controls and stricter observability

## Good Next Deployment Pass

After the first live deployment succeeds, the next infrastructure pass should be:
- add a custom domain
- tighten CORS to only the real frontend origin
- add managed Redis if caching becomes important
- decide whether Neo4j belongs in the first public deployment or a later upgrade
