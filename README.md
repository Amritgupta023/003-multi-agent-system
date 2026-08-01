# Multi-Agent Research Assistant

Node.js API that will grow into a supervised research workflow powered by LangGraph, Gemini, Tavily, Redis, and Express.

## Level 11: Report delivery

### Run locally

```powershell
npm install
npm start
```

The API runs at `http://localhost:3000` by default.

### Available endpoints

- `GET /` — API identity and current implementation level
- `GET /api/health` — service health check
- `POST /api/research` — validate a topic and create an in-memory research job
- `GET /api/research/:jobId` — inspect a research job and its current status
- `POST /api/research/:jobId/plan` — generate a deterministic, depth-aware research plan
- `POST /api/research/:jobId/research` — process planned questions into normalized research findings
- `POST /api/research/:jobId/write` — generate a Markdown report with inline citations
- `POST /api/research/:jobId/run` — run planner, researcher, writer, and supervisor reviews as one LangGraph workflow
- `POST /api/research/:jobId/run-async` — start the supervised workflow in the background
- `GET /api/research/:jobId/status` — poll compact progress and failure details
- `POST /api/research/:jobId/retry` — restart a failed workflow from a clean state
- `GET /api/research/:jobId/report` — retrieve the complete report as JSON
- `GET /api/research/:jobId/report/markdown` — download the raw Markdown report
- `GET /api/research/:jobId/report/citations` — retrieve citation metadata only

### Create a research job

```json
{
  "topic": "Impact of AI on software engineering",
  "depth": "deep",
  "maxSources": 10
}
```

`depth` can be `quick`, `standard`, or `deep`. When omitted, `depth` defaults to `standard` and `maxSources` defaults to `5`.

Jobs use Redis persistence when `REDIS_URL` is configured; otherwise development falls back to process memory.

### Generate a plan

Create a job first, then call:

```http
POST /api/research/{jobId}/plan
```

The Gemini planner generates 3 questions for `quick`, 5 for `standard`, and 7 for `deep`. Repeating the request returns the stored plan instead of generating a different one.

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` to use Gemini. `GEMINI_MODEL` defaults to `gemini-2.5-flash`, and `GEMINI_TIMEOUT_MS` defaults to 15000. If the key is absent, Gemini times out, or its response is invalid, the request still succeeds with the local deterministic planner. Inspect `plan.provider` and `plan.fallbackReason` to see which path ran.

### Run the researcher

Generate a plan first, then call:

```http
POST /api/research/{jobId}/research
```

Set `TAVILY_API_KEY` in `.env` to run live web searches. The researcher normalizes Tavily results, removes duplicate URLs, enforces the job's total source budget, and records titles, URLs, domains, snippets, relevance scores, and publication dates. `deep` jobs use advanced search; other depths use basic search.

When the key is missing or all searches fail, the endpoint still returns the Level 5 local research framework with `provider: "local"` and a `fallbackReason`.

### Generate the report

Run the researcher first, then call:

```http
POST /api/research/{jobId}/write
```

The writer only creates citation markers for collected source URLs. Reports produced from local fallback research are marked `unverified` and explicitly state that source-backed evidence is unavailable.

### Run the supervised workflow

Create a job and call:

```http
POST /api/research/{jobId}/run
```

LangGraph routes through planner, plan review, researcher, research review, writer, and report review. The supervisor retries a rejected artifact once, then safely fails the workflow rather than looping forever. `executionTrace` records every node, decision, attempt, provider, and timestamp.

### Redis persistence

Set `REDIS_URL` in `.env` to persist complete jobs across API restarts:

```env
REDIS_URL=redis://localhost:6379
REDIS_JOB_TTL_SECONDS=86400
REDIS_KEY_PREFIX=research:job:
REDIS_CONNECT_TIMEOUT_MS=2000
REDIS_REQUIRED=false
```

Jobs are stored as JSON with a configurable TTL. When Redis is not configured, development uses memory storage. When Redis is configured but unavailable and `REDIS_REQUIRED=false`, the API keeps working with a mirrored memory fallback and health reports `degraded`. Set `REDIS_REQUIRED=true` when persistence must be mandatory.

### Background execution

Set `"runAsync": true` while creating a job, or call `POST /api/research/{jobId}/run-async`. Both return `202 Accepted` immediately with a run ID and status URL. Poll `GET /api/research/{jobId}/status` until the status becomes `completed` or `failed`.

Every LangGraph state update is persisted, so Redis-backed jobs expose stage-by-stage progress. In-process locks reject concurrent runs for the same job. Failed jobs include safe retry metadata and can be restarted with `POST /api/research/{jobId}/retry`.

### Report delivery

After a job completes, retrieve JSON from `GET /api/research/{jobId}/report`, download Markdown from `/report/markdown`, or fetch only source metadata from `/report/citations`. Delivery validates citation numbering, URLs, duplicates, inline markers, and evidence status before returning a report. Incomplete jobs return `409 REPORT_NOT_READY`.

### Test

```powershell
npm test
```
