# Implementation roadmap

Each level ends in a runnable API that can be tested independently.

1. **API foundation** — Express app, health endpoint, error contract, configuration, tests.
2. **Research job contract** — accept a research topic, validate input, create and inspect in-memory jobs.
3. **Planner specialist** — turn a topic into a structured research plan using a deterministic local implementation.
4. **Gemini integration** — connect the planner to Gemini while retaining a test-friendly fallback.
5. **Researcher specialist** — execute plan items and normalize findings and sources.
6. **Tavily live search** — perform real web searches with source URLs and attribution metadata.
7. **Writer specialist** — synthesize findings into a cited Markdown report.
8. **Supervisor and LangGraph** — route, review, retry, and control all specialist steps as a graph.
9. **Redis persistence** — persist jobs/checkpoints so runs survive process restarts.
10. **Asynchronous execution** — background runs, progress states, retries, and status polling.
11. **Report delivery** — final report endpoint with citations and export-ready response.
12. **Production hardening** — request IDs, logging, rate limits, security, Docker, and full integration tests.
