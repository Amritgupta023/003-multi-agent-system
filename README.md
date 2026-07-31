# Multi-Agent Research Assistant

Node.js API that will grow into a supervised research workflow powered by LangGraph, Gemini, Tavily, Redis, and Express.

## Level 5: Researcher specialist

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

### Create a research job

```json
{
  "topic": "Impact of AI on software engineering",
  "depth": "deep",
  "maxSources": 10
}
```

`depth` can be `quick`, `standard`, or `deep`. When omitted, `depth` defaults to `standard` and `maxSources` defaults to `5`.

Jobs are stored in process memory at this level, so restarting the API clears them. Redis persistence is introduced at Level 9.

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

At Level 5 the researcher creates a normalized research framework for every planned question. Its empty `sources` arrays, `unverified` confidence, and `pending_live_search` status are intentional: real source-backed findings arrive with Tavily in Level 6.

### Test

```powershell
npm test
```
