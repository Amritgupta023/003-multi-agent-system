# Multi-Agent Research Assistant

Node.js API that will grow into a supervised research workflow powered by LangGraph, Gemini, Tavily, Redis, and Express.

## Level 3: Planner specialist

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

The local planner generates 3 questions for `quick`, 5 for `standard`, and 7 for `deep`. Repeating the request returns the stored plan instead of generating a different one.

### Test

```powershell
npm test
```
