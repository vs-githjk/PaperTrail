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

## Current State

What is working well now:
- The app has a coherent MVP
- The core topic-to-tree flow is real
- The repo docs match the product better
- The ranking layer is better than raw API output
- The backend has its first real test coverage

What still needs work:
- Better topic-intent reranking
- Better ancestor quality and reading-order explanations
- Local persistence of papers and trees
- Stronger graph modeling in Neo4j
- More test coverage across backend and frontend

## Next Best Step

The next pass should focus on ancestor-plan quality:
- extend the same precision and staging cleanup into ancestor-tree recommendations
- improve how ancestor nodes are assigned to `Foundational Background` vs `Broader Overview`
- reduce fallback dependence for guided ancestor plans
- keep narrowing the gap between search-plan quality and ancestor-plan quality

## Update Rule

After each meaningful development pass, update this file with:
- goal
- changes made
- files touched
- verification performed
- remaining weaknesses
- next best step
