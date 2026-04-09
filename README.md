📚 Research Genealogy App – Technical Architecture
🧾 Executive Summary

A research paper genealogy mapper that helps students discover the complete ancestral tree of papers behind a research topic. It transforms scattered academic references into an interactive, navigable knowledge graph.

🧰 1. Tech Stack
🎨 Frontend
Framework: React 18+ (Next.js for SSR & SEO)
State Management: Redux Toolkit / Zustand
Visualization:
D3.js (force-directed graphs)
Cytoscape.js (alternative)
Plotly.js (analytics & timelines)
Styling: Tailwind CSS + CSS Modules
Forms: React Hook Form + Zod
Search UI: Algolia
Package Manager: pnpm
⚙️ Backend
Runtime: Node.js 20+ / Python (FastAPI)
Framework: Express.js / FastAPI
Database:
PostgreSQL (primary data)
Redis (cache)
Neo4j (graph DB)
Search Engine: Elasticsearch
Queue: Bull / Celery
Auth: JWT + OAuth2
API: REST + GraphQL
📥 Data Sources & Processing
APIs: ArXiv, Semantic Scholar, CrossRef, PubMed, OpenAlex
Citation Parsing: Grobid, Semantic Scholar API
NLP: spaCy / BERT
Scraping: Puppeteer / Playwright
🚀 DevOps & Deployment
Docker + Docker Compose
Kubernetes (production)
CI/CD: GitHub Actions / GitLab CI
Cloud: AWS / GCP
Monitoring: Prometheus, Grafana
Logging: ELK Stack
🛠 Development Tools
Git (GitHub/GitLab)
Testing: Jest, Playwright
API Testing: Postman / Insomnia
Code Quality: ESLint, Prettier
Docs: Swagger / OpenAPI
🏗 2. System Architecture
High-Level Layers
Client Layer (React SPA)
Search UI (Algolia)
Graph Visualization (D3/Cytoscape)
Analytics (Plotly)
API Gateway
Rate limiting
Authentication (JWT)
Validation & CORS
Backend Services
Auth Service
Search Service
Graph Service
Paper Service
Scraper Service
Data Layer
PostgreSQL (papers)
Neo4j (graph relationships)
Redis (cache)
Elasticsearch (search)
S3 (PDF storage)
🔄 3. Workflow & Data Flow
User Journey
User logs in (OAuth/JWT)
Searches for a research topic
Selects a paper
Backend builds citation graph
Frontend visualizes graph
User explores, filters, and saves results
Data Pipeline
Fetch papers from APIs (ArXiv, Semantic Scholar)
Extract citations
Match & deduplicate
Store in DB
Update graph & influence scores
🔌 4. API Endpoints
Auth
POST /api/auth/login
POST /api/auth/signup
POST /api/auth/oauth/callback
Papers
GET /api/papers/search?q=
GET /api/papers/:id
GET /api/papers/:id/ancestor-tree
GET /api/papers/:id/descendants
GET /api/papers/:id/influence
User Features
GET /api/topics
GET /api/recommendations
POST /api/searches
GET /api/searches
DELETE /api/searches/:id
🧠 5. Key Algorithms
🔗 Ancestor Tree Algorithm
BFS/DFS traversal of citations
Depth-limited (default: 5)
Filters low-quality citations
Returns nodes + links graph structure
⭐ Influence Scoring

Factors:

Citation count (normalized)
Author h-index
Venue prestige
PageRank (network centrality)

Weighted formula:

0.4 Citation Score
0.2 Author Score
0.2 Venue Score
0.2 PageRank
🧹 Deduplication
Fuzzy string matching
Semantic similarity (BERT)
Merge duplicate papers intelligently
⚡ 6. Performance & Scalability
Caching
Redis (24h TTL)
Pre-built graphs
Cached search queries
Optimization
Indexed DB queries
Materialized views
Lazy loading graphs
Sampling large citation sets
Graph Limits
Max depth: 5–7
Max nodes: ~500
🔐 7. Security
JWT Authentication (1-hour expiry)
OAuth2 login
Password hashing (bcrypt)
HTTPS/TLS
Rate limiting
SQL injection protection
🚢 8. Deployment
Local (Docker Compose)
Frontend
Backend
PostgreSQL
Redis
Neo4j
Elasticsearch
Production (Kubernetes)
Auto-scaling pods
Health checks
Resource limits
💰 9. Estimated Costs (AWS)
Component	Cost
EC2	$75
RDS	$40
Redis	$20
S3	$12
Transfer	$30
Total	~$177/month
🗺 10. Implementation Roadmap
Phase 1 (Weeks 1–4)
Basic search
Simple graph (depth 3)
Local setup
Phase 2 (Weeks 5–8)
Graph algorithms
Elasticsearch
Auth system
Phase 3 (Weeks 9–12)
Optimization
Analytics dashboard
Production deployment
Phase 4 (Month 4+)
AI recommendations
Collaboration features
Mobile app
🔮 11. Future Enhancements
🤖 AI Features
Auto summaries (LLMs)
Research gap detection
Impact prediction
🤝 Collaboration
Shared libraries
Annotations
Team workspaces
📊 Advanced Visualization
3D graphs
Timeline animations
Topic maps
🔗 Integrations
Zotero / Mendeley
Overleaf
Google Scholar
📌 Conclusion

This system provides a scalable, intelligent, and visual way to explore research papers and their relationships, enabling deeper academic discovery and insight.