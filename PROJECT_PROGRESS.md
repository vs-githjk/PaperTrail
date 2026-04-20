# Project Progress

This file is the running log for PaperTrail development passes. Each pass should record what changed, what was verified, what remains weak, and the next best step.

## Product Direction

PaperTrail is a research-reading helper:
- A user enters a research topic, paper title, DOI, or paper link
- The app finds likely starting papers
- The app generates a guided ancestor tree
- The app helps the user understand what to read first and why

The long-term goal is not just graph visualization. The real product is guided research discovery.

## Pass 1: MVP Alignment

### Goal

Make the repo internally consistent around the real MVP instead of a broad architecture wish list.

### Changes Made

- Reworked the backend so the ancestor-tree flow is real instead of partially stubbed
- Added `POST /api/papers/ancestor-tree`
- Allowed search input to work with topic text, paper titles, DOIs, arXiv links, and Semantic Scholar links
- Added fallback tree generation when live citation data is unavailable
- Updated the frontend so it talks to the real ancestor-tree endpoint
- Improved the frontend presentation from a backend tester into a first-pass PaperTrail UI
- Rewrote `README.md` to reflect the actual MVP
- Added safer Redis error handling so local development degrades more cleanly

### Key Files

- [README.md](/Users/vidyutsriram/PaperTrail/README.md:1)
- [backend/src/routes/index.js](/Users/vidyutsriram/PaperTrail/backend/src/routes/index.js:1)
- [backend/src/modules/papers/paper.controller.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.controller.js:1)
- [backend/src/modules/papers/paper.service.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.service.js:1)
- [backend/src/modules/papers/paper.external.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.js:1)
- [backend/src/db/redis.js](/Users/vidyutsriram/PaperTrail/backend/src/db/redis.js:1)
- [client/src/App.jsx](/Users/vidyutsriram/PaperTrail/client/src/App.jsx:1)
- [client/src/components/ForceGraph.jsx](/Users/vidyutsriram/PaperTrail/client/src/components/ForceGraph.jsx:1)
- [client/src/styles.css](/Users/vidyutsriram/PaperTrail/client/src/styles.css:1)

### Verification

- Backend syntax checks passed with `node --check`
- Frontend production build passed with `npm run build`
- Live backend smoke test passed for:
  - `GET /api/health`
  - `GET /api/search`
  - `POST /api/papers/ancestor-tree`

### Remaining Weaknesses

- Topic search quality was still heuristic-heavy
- Guided reading order was shallow and not very intentional
- The live path still depended mostly on external APIs rather than strong local persistence

## Pass 2: Topic Ranking And Guided Reading Heuristics

### Goal

Move PaperTrail closer to a real product by making broad research-topic queries behave more intelligently.

### Changes Made

- Added query classification for:
  - broad topic
  - exact-ish title
  - direct identifier
- Added stronger seed-paper scoring heuristics
- Added survey/review preference for broad-topic searches
- Added `recommendationScore` and `matchReason` to search results
- Improved guide ranking so ancestor recommendations are chosen more intentionally
- Surfaced recommendation reasoning in the frontend UI
- Added backend tests with Node's built-in test runner

### Key Files

- [backend/src/modules/papers/paper.external.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.js:1)
- [backend/src/modules/papers/paper.external.test.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.test.js:1)
- [backend/package.json](/Users/vidyutsriram/PaperTrail/backend/package.json:1)
- [client/src/App.jsx](/Users/vidyutsriram/PaperTrail/client/src/App.jsx:1)

### Verification

- Backend syntax checks passed
- Backend tests passed with `npm test`
- Frontend production build passed
- Live backend check confirmed search responses now include:
  - `recommendationScore`
  - `matchReason`

### Remaining Weaknesses

- Broad-topic retrieval is still limited by external source quality
- Some lower-ranked results can still be noisy
- We still need stronger topic-intent reranking beyond token overlap heuristics

## Pass 3: Topic Coverage Reranking

### Goal

Reduce false positives for broad-topic research queries by rewarding fuller topic coverage and making recommendation messaging more trustworthy.

### Changes Made

- Added explicit topic-coverage scoring on top of token overlap
- Increased rewards for stronger title coverage on broad-topic queries
- Added stronger penalties for partial-topic matches that only cover a small slice of the user intent
- Tightened `matchReason` so weak matches are no longer described as strong topical matches
- Added a regression test for noisy broad-topic ranking behavior

### Key Files

- [backend/src/modules/papers/paper.external.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.js:1)
- [backend/src/modules/papers/paper.external.test.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.test.js:1)

### Verification

- Backend syntax checks passed
- Backend tests passed with `npm test`
- Live backend search verified the updated response messaging for a broad topic query

### Remaining Weaknesses

- External retrieval still surfaces noisy candidates before reranking
- Broad-topic top results are better, but not yet consistently “best paper for this topic”
- We still need a stronger retrieval strategy than single-pass external search plus heuristics

## Pass 4: Two-Stage Retrieval Foundation

### Goal

Separate candidate gathering from ranking so PaperTrail can retrieve better starting points for both broad-topic searches and exact paper-title lookups.

### Changes Made

- Introduced a first version of two-stage retrieval:
  - candidate query generation
  - reranking over merged candidates
- Added broad-topic query expansion with overview-style variants such as `survey`, `review`, and `overview`
- Added exact-title query expansion with tightly scoped variants instead of broad topic-style expansion
- Improved exact-title scoring so canonical paper-title matches are favored more strongly
- Added tests covering:
  - broad-topic query expansion
  - exact-title query expansion behavior
  - exact-title classification boundaries

### Key Files

- [backend/src/modules/papers/paper.external.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.js:1)
- [backend/src/modules/papers/paper.external.test.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.test.js:1)

### Verification

- Backend syntax checks passed
- Backend tests passed with `npm test`
- Live exact-title retrieval now returns the 2017 Transformer paper first for `Attention Is All You Need`
- Live broad-topic retrieval now surfaces stronger domain-relevant review and mapping papers for `graph neural networks for drug discovery`

### Remaining Weaknesses

- Candidate retrieval still depends on external API behavior
- Some broad-topic results remain relevant-but-not-ideal
- We still need a clearer distinction between:
  - overview papers
  - seminal papers
  - practical starting papers

## Pass 5: Recommendation Roles

### Goal

Make PaperTrail explain what kind of paper each recommendation is, not just how highly it ranked.

### Changes Made

- Added backend paper-role classification for:
  - overview
  - seminal
  - seed
  - starting point
  - supporting
- Included role metadata in search results:
  - `role`
  - `roleLabel`
  - `roleReason`
- Included role metadata in guided reading recommendations
- Updated the frontend to display recommendation roles in both:
  - starting-point search results
  - guided reading list
- Added tests for role classification behavior

### Key Files

- [backend/src/modules/papers/paper.external.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.js:1)
- [backend/src/modules/papers/paper.external.test.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.test.js:1)
- [client/src/App.jsx](/Users/vidyutsriram/PaperTrail/client/src/App.jsx:1)

### Verification

- Backend tests passed with `npm test`
- Backend syntax checks passed
- Frontend production build passed
- Live search API responses now include recommendation role metadata

### Remaining Weaknesses

- Fallback ancestor trees still use placeholder guide items without richer role semantics
- The distinction between `seminal` and `starting point` is still heuristic
- The UI shows roles, but it does not yet restructure the reading plan around them

## Pass 6: Guided Reading Structure

### Goal

Turn recommendation roles into a staged reading plan so PaperTrail feels like guided research help instead of annotated search results.

### Changes Made

- Added backend reading-plan grouping with stages:
  - `start_here`
  - `foundational_background`
  - `broader_overview`
  - `optional_supporting`
- Added reading-plan metadata to search responses under `meta.readingPlan`
- Added reading-plan metadata to guided ancestor recommendations
- Updated the frontend to render staged reading sections for:
  - search results
  - guided reading recommendations
- Fixed a search response-shape bug so the API now returns the expected top-level `data` and `meta`
- Added backend tests for reading-plan grouping

### Key Files

- [backend/src/modules/papers/paper.external.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.js:1)
- [backend/src/modules/papers/paper.external.test.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.test.js:1)
- [backend/src/modules/papers/paper.controller.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.controller.js:1)
- [client/src/App.jsx](/Users/vidyutsriram/PaperTrail/client/src/App.jsx:1)
- [client/src/styles.css](/Users/vidyutsriram/PaperTrail/client/src/styles.css:1)

### Verification

- Backend tests passed with `npm test`
- Backend syntax checks passed
- Frontend production build passed
- Live search API verification confirmed:
  - top-level `data`
  - top-level `meta.readingPlan`
  - staged reading sections in the response

### Remaining Weaknesses

- Guided reading stages still depend on heuristic role assignment
- Exact-title plans can still include near-title variants as additional `start_here` items
- Fallback ancestor-tree plans still need richer staged semantics

## Pass 7: Stage Quality Refinement

### Goal

Reduce noisy items inside reading stages, especially for exact-title searches where near-title variants were crowding `Start Here`.

### Changes Made

- Tightened `buildReadingPlan` so exact-title searches keep only one paper in `Start Here`
- Reclassified lower-ranked exact-title variants from `seed` to `supporting`
- Preserved those related papers in the reading plan, but moved them into `Optional Supporting Reads`
- Added a regression test for exact-title reading-plan cleanup

### Key Files

- [backend/src/modules/papers/paper.external.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.js:1)
- [backend/src/modules/papers/paper.external.test.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.test.js:1)

### Verification

- Backend tests passed with `npm test`
- Backend syntax checks passed
- Live exact-title search verification confirmed:
  - one paper in `Start Here`
  - related variants moved to `Optional Supporting Reads`

### Remaining Weaknesses

- Broad-topic `Start Here` can still contain papers that are relevant but not ideal first reads
- Stage assignment is still driven by heuristics rather than stronger intent-aware modeling
- Fallback ancestor guidance still needs richer staged semantics

## Pass 8: Broad-Topic Stage Cleanup

### Goal

Make broad-topic reading plans feel more deliberate by limiting `Start Here` to one true first read and pushing other strong-but-secondary papers into later stages.

### Changes Made

- Tightened broad-topic stage assignment so only one top paper occupies `Start Here`
- Kept overview-style papers in `Broader Overview` unless they are chosen as the single first read
- Demoted additional strong broad-topic papers into `Optional Supporting Reads` instead of crowding the first stage
- Added a regression test for broad-topic single-item `Start Here` behavior

### Key Files

- [backend/src/modules/papers/paper.external.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.js:1)
- [backend/src/modules/papers/paper.external.test.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.test.js:1)

### Verification

- Backend tests passed with `npm test`
- Backend syntax checks passed
- Live broad-topic search verification confirmed:
  - a single item in `Start Here`
  - overview material separated into `Broader Overview`
  - lower-priority strong matches moved to `Optional Supporting Reads`

### Remaining Weaknesses

- The single chosen broad-topic first read is still only as good as the ranking heuristic
- Some live overview matches can still be topically noisy if external retrieval brings in odd survey papers
- We still need stronger domain-intent filtering before reranking

## Pass 9: Retrieval Precision And Run Guide

### Goal

Reduce obviously off-domain overview papers in broad-topic searches and add a practical run guide for the project.

### Changes Made

- Added domain-intent filtering for overview-style broad-topic candidates
- Prevented obviously off-domain survey/review papers from being treated as true overview recommendations
- Added a regression test for noisy overview filtering
- Added [RUN_INSTRUCTIONS.md](/Users/vidyutsriram/PaperTrail/RUN_INSTRUCTIONS.md:1) with practical setup and local run steps
- Linked the run guide from [README.md](/Users/vidyutsriram/PaperTrail/README.md:1)

### Key Files

- [backend/src/modules/papers/paper.external.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.js:1)
- [backend/src/modules/papers/paper.external.test.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.test.js:1)
- [RUN_INSTRUCTIONS.md](/Users/vidyutsriram/PaperTrail/RUN_INSTRUCTIONS.md:1)
- [README.md](/Users/vidyutsriram/PaperTrail/README.md:1)

### Verification

- Backend tests passed with `npm test`
- Frontend production build passed
- Live broad-topic verification from the previous pass still matched the intended staged behavior

### Remaining Weaknesses

- Domain filtering is still heuristic and not yet field-aware in a deeper semantic sense
- Ancestor-tree staged plans still need the same precision improvements as search plans
- Broader-topic retrieval still depends on external result quality

## Pass 10: Ancestor Plan Fallback Quality

### Goal

Bring fallback ancestor guidance closer to the staged search experience so ancestor plans degrade more gracefully when live citation expansion is unavailable.

### Changes Made

- Upgraded fallback ancestor recommendations to include:
  - explicit roles
  - role labels
  - staged reading-plan metadata
- Replaced plain fallback guide text items with richer structured recommendation objects
- Added a regression test confirming fallback ancestor guides now include staged reading-plan sections

### Key Files

- [backend/src/modules/papers/paper.external.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.js:1)
- [backend/src/modules/papers/paper.external.test.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.test.js:1)

### Verification

- Backend tests passed with `npm test`

### Remaining Weaknesses

- Live ancestor expansion still needs stronger stage-aware precision, not just fallback improvements
- Ancestor plans still rely on shallow graph heuristics when citation data is available
- Search-plan quality is still ahead of ancestor-plan quality

## Pass 11: Live Ancestor Stage Precision

### Goal

Improve how real citation-derived ancestor nodes are staged so live ancestor plans feel closer to the search-plan quality.

### Changes Made

- Added stage-aware scoring for live ancestor recommendations
- Introduced a dedicated ancestor reading-plan builder that separates:
  - first read
  - foundational background
  - broader overview
  - optional supporting reads
- Improved live ancestor stage assignment so overview and foundational items are chosen more intentionally instead of relying on a single generic sort
- Added a regression test for live ancestor stage separation

### Key Files

- [backend/src/modules/papers/paper.external.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.js:1)
- [backend/src/modules/papers/paper.external.test.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.test.js:1)

### Verification

- Backend tests passed with `npm test`

### Remaining Weaknesses

- Live ancestor quality still depends on the citation data returned by external sources
- Some ancestor-stage decisions are still heuristic rather than citation-network-aware
- We have not yet added equivalent live-response verification for ancestor staging

## Pass 12: First Persistence Layer

### Goal

Begin storing useful paper state locally so PaperTrail can evolve from a stateless research helper into a reusable research workspace.

### Changes Made

- Added first persistence hooks for searched and selected papers
- Search now best-effort saves externally fetched papers into Postgres
- Ancestor-tree generation now best-effort saves the selected seed paper
- Extended the paper schema to include:
  - `external_id`
  - `source`
- Added service-level tests covering persistence behavior

### Key Files

- [backend/src/modules/papers/paper.repository.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.repository.js:1)
- [backend/src/modules/papers/paper.service.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.service.js:1)
- [backend/src/modules/papers/paper.service.test.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.service.test.js:1)
- [backend/src/server.js](/Users/vidyutsriram/PaperTrail/backend/src/server.js:1)
- [backend/db/postgres/init/001_create_papers.sql](/Users/vidyutsriram/PaperTrail/backend/db/postgres/init/001_create_papers.sql:1)

### Verification

- Backend tests passed with `npm test`
- Backend syntax checks passed for repository, service, and server files

### Remaining Weaknesses

- Persistence is still best-effort and only stores papers, not full reading plans
- We are not yet surfacing saved papers back into the frontend experience in a dedicated way
- Local persistence still depends on Postgres being available

## Pass 13: Saved Research Workspace

### Goal

Turn the first persistence layer into an actual reusable workspace by storing research sessions and surfacing them in the app.

### Changes Made

- Added a `research_sessions` table for saved research trails
- Ancestor-tree generation now best-effort saves:
  - the original query
  - the selected paper
  - the guide metadata
  - basic graph stats
- Added a workspace snapshot service and API route:
  - `GET /api/workspace`
- Updated the frontend to show:
  - recent research trails
  - recently saved papers
  - one-click restart from a prior research trail
- Added service tests for:
  - research-session persistence
  - workspace snapshot responses

### Key Files

- [backend/src/modules/papers/paper.repository.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.repository.js:1)
- [backend/src/modules/papers/paper.service.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.service.js:1)
- [backend/src/modules/papers/paper.service.test.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.service.test.js:1)
- [backend/src/modules/papers/paper.controller.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.controller.js:1)
- [backend/src/routes/index.js](/Users/vidyutsriram/PaperTrail/backend/src/routes/index.js:1)
- [backend/src/server.js](/Users/vidyutsriram/PaperTrail/backend/src/server.js:1)
- [backend/db/postgres/init/001_create_papers.sql](/Users/vidyutsriram/PaperTrail/backend/db/postgres/init/001_create_papers.sql:1)
- [client/src/App.jsx](/Users/vidyutsriram/PaperTrail/client/src/App.jsx:1)
- [client/src/styles.css](/Users/vidyutsriram/PaperTrail/client/src/styles.css:1)

### Verification

- Backend tests passed with `npm test`
- Frontend production build passed with `npm run build`
- Workspace flow was validated at the API-contract level through service tests

### Remaining Weaknesses

- Research sessions currently store summaries and restart context, not the full graph payload
- The workspace UI is useful, but still basic compared with the guided-reading experience
- Saved state is still local-only and best-effort when Postgres is unavailable

## Pass 14: Merge And Deployment Prep

### Goal

Bring your friend’s ahead-of-branch product work into `vids-branch`, verify the merged app, and prepare the repo for a first real deployment.

### Changes Made

- Fast-forward merged `origin/adi's-branch()` into `vids-branch`
- Brought in:
  - auth flows
  - saved history
  - workbench UI improvements
  - ancestor tree empty-state and interaction changes
- Installed and verified the new frontend dependency set needed by the merged branch
- Added deployment-oriented backend config support for:
  - `DATABASE_URL`
  - `POSTGRES_SSL`
  - `REDIS_URL`
  - `CORS_ORIGIN`
- Added a Render blueprint in [render.yaml](/Users/vidyutsriram/PaperTrail/render.yaml:1)
- Refined deployment support around the intended hosting split:
  - Render for the backend and Postgres
  - Vercel for the frontend
- Added a Vercel SPA config in [client/vercel.json](/Users/vidyutsriram/PaperTrail/client/vercel.json:1)
- Added a deployment guide in [DEPLOYMENT.md](/Users/vidyutsriram/PaperTrail/DEPLOYMENT.md:1)
- Added a repo-level Node version pin with [.node-version](/Users/vidyutsriram/PaperTrail/.node-version:1)

### Key Files

- [backend/src/config/index.js](/Users/vidyutsriram/PaperTrail/backend/src/config/index.js:1)
- [backend/src/app.js](/Users/vidyutsriram/PaperTrail/backend/src/app.js:1)
- [backend/src/db/redis.js](/Users/vidyutsriram/PaperTrail/backend/src/db/redis.js:1)
- [backend/.env.example](/Users/vidyutsriram/PaperTrail/backend/.env.example:1)
- [render.yaml](/Users/vidyutsriram/PaperTrail/render.yaml:1)
- [client/vercel.json](/Users/vidyutsriram/PaperTrail/client/vercel.json:1)
- [DEPLOYMENT.md](/Users/vidyutsriram/PaperTrail/DEPLOYMENT.md:1)
- [README.md](/Users/vidyutsriram/PaperTrail/README.md:1)

### Verification

- `git merge --ff-only "origin/adi's-branch()"` completed cleanly
- Backend tests passed with `npm test`
- Frontend production build passed with `npm run build`
- Confirmed the merged frontend dependency issue was resolved by installing the new package set

### Remaining Weaknesses

- The app is deployment-ready, but not yet actually deployed
- Redis and Neo4j are still optional and not yet represented as first-class managed production services
- CORS still needs to be set to the final frontend URL during deployment
- We still need one full live-production smoke test after deployment

## Pass 14: Workbench UX — Empty Tree, Auth-Gated Workspace, Sidebar Polish

### Goal

Align the workbench with clearer expectations: the ancestor graph should not show placeholder data until the user has chosen a paper, saved trails and papers should only appear in context of a logged-in account, and the sidebar should stay visually clean.

### Changes Made

- **Ancestor tree empty until selection:** Removed the mock seed/ancestor nodes used when the API returned no graph. On first load (or before a tree exists), the right panel shows an empty state with guidance to click a result paper or use **Build Tree From Top Match**; the force graph mounts only when normalized graph data has at least one node. Focal and insight copy match empty vs. loaded states.
- **Workspace lists tied to login:** **Recent Research Trails** and **Recently Saved Papers** no longer render trail or paper cards for logged-out users. Sidebar shows short login prompts instead. Workspace fetching (`loadWorkspace`, `refreshWorkspace`) runs only when an auth token is present; logout clears workspace state immediately so nothing leaks across sessions.
- **Sidebar heading cleanup:** Removed the decorative **+** next to the **Recent Research Trails** heading.

### Key Files

- [client/src/components/AncestorTree.tsx](client/src/components/AncestorTree.tsx)
- [client/src/styles.css](client/src/styles.css)
- [client/src/App.jsx](client/src/App.jsx)

### Verification

- Manual UX check: logged-out visit shows empty ancestor guidance and no saved cards; after login, workspace lists populate from `GET /api/workspace` when data exists; paper click or top-match build shows the real graph.
- Frontend production build: `npm run build` (client).

### Remaining Weaknesses

- Deployment hardening (CORS, authenticated writes, disabling risky in-memory fallbacks in production) is still recommended before a public launch; see separate deployment review.

## Current State

What is working well now:
- The app has a coherent MVP
- The core topic-to-tree flow is real
- The repo docs match the product better
- The ranking layer is better than raw API output
- The backend has its first real test coverage
- The app now has the beginnings of a reusable research workspace
- The merged branch now includes auth and a fuller workbench experience
- The repo has a first-pass deployment path
- The workbench ancestor panel and sidebar behavior respect empty-state and login boundaries

What still needs work:
- Better semantic meaning inside the tree branches
- Better broad-topic refinement for vague prompts like `llms`, `rag`, and `agents`
- Better ancestor quality and reading-order explanations
- Deeper persistence of papers, trails, and graph state
- Stronger graph modeling in Neo4j
- More test coverage across backend and frontend
- A full live deployment and production smoke test

## Pass 15: Broad-Topic Refinement And Adaptive Tree Depth

### Goal

Make PaperTrail materially better on broad prompts by:
- asking a few narrowing questions before committing to a seed
- using those answers to improve retrieval instead of only frontend ranking
- letting stronger seeds open into deeper trees

### Changes Made

- Added a broad-topic clarification flow in the frontend for prompts such as `llms`
- Added clarification-aware ranking and refined-tree actions in the workbench
- Added clarification-aware backend search parameters:
  - `focus`
  - `material`
  - `goal`
- Taught backend query classification that one-word prompts like `llms`, `rag`, and `iot` can still be broad topics
- Expanded broad-topic candidate query generation using clarification-aware query phrases and aliases
- Added clarification-fit scoring to seed ranking
- Added adaptive tree budgets so stronger seeds can expand more deeply
- Improved tree generation bands and layout so learning layers read more clearly
- Fixed the refined-tree runtime crash caused by the tree label gutter reference

### Key Files

- [backend/src/modules/papers/paper.controller.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.controller.js:1)
- [backend/src/modules/papers/paper.service.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.service.js:1)
- [backend/src/modules/papers/paper.external.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.js:1)
- [backend/src/modules/papers/paper.external.test.js](/Users/vidyutsriram/PaperTrail/backend/src/modules/papers/paper.external.test.js:1)
- [client/src/App.jsx](/Users/vidyutsriram/PaperTrail/client/src/App.jsx:1)
- [client/src/components/AncestorTree.tsx](/Users/vidyutsriram/PaperTrail/client/src/components/AncestorTree.tsx:1)
- [client/src/styles.css](/Users/vidyutsriram/PaperTrail/client/src/styles.css:1)
- [README.md](/Users/vidyutsriram/PaperTrail/README.md:1)
- [RUN_INSTRUCTIONS.md](/Users/vidyutsriram/PaperTrail/RUN_INSTRUCTIONS.md:1)

### Verification

- Backend tests passed with `npm test`: `29/29`
- Frontend production build passed with `npm run build`
- Local broad-topic checks improved for prompts such as:
  - `llms`
  - `iot`
- Refined-tree crash reproduced and fixed via local runtime error boundary and follow-up patch

### Remaining Weaknesses

- Branches are still visually generic; they do not yet teach branch meaning
- Clarification-aware retrieval is much better, but broad-topic candidate pools can still be noisy
- Adaptive depth is now smarter, but still conservative and should be made more quality-aware
- Live citation ancestry still depends on external source coverage when Neo4j is unavailable

## Next Best Step

The next passes for a teammate picking up from `main` at `a80a349` should be:
1. `Branch semantics`
Make the tree explain what kind of understanding each branch gives the user.
2. `Broader-topic retrieval quality`
Keep tightening clarification-aware retrieval so vague prompts produce better candidate pools.
3. `Adaptive depth tuning`
Allow stronger topics to open into deeper trees without making weak topics noisy.

## Update Rule

After each meaningful development pass, update this file with:
- goal
- changes made
- files touched
- verification performed
- remaining weaknesses
- next best step
