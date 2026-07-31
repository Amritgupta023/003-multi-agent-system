# Multi-Agent Research Assistant

Node.js API that will grow into a supervised research workflow powered by LangGraph, Gemini, Tavily, Redis, and Express.

## Level 2: Research job contract

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

### Test

```powershell
npm test
```
