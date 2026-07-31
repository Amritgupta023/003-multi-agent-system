const assert = require("node:assert/strict");
const test = require("node:test");
const { conductResearch, tavilySearch } = require("../src/agents/tavilyResearcher");

function createJob() {
  return {
    topic: "Grid scale energy storage",
    options: { depth: "deep", maxSources: 3 },
    plan: {
      questions: [
        { id: "q1", question: "What is the current context?", searchQuery: "energy storage context" },
        { id: "q2", question: "What are the trends?", searchQuery: "energy storage trends" },
      ],
    },
  };
}

test("Tavily researcher normalizes, deduplicates, and budgets sources", async () => {
  const searchCalls = [];
  const search = async (query, options) => {
    searchCalls.push({ query, options });
    return {
      answer: `Answer for ${query}`,
      results: [
        { title: "Shared source", url: "https://example.com/report?ref=search", content: "Evidence A", score: 0.9 },
        { title: `Source for ${query}`, url: `https://${query.includes("context") ? "one.org" : "two.org"}/page`, content: "Evidence B", score: 0.8 },
      ],
    };
  };

  const research = await conductResearch(createJob(), { apiKey: "test-key", search });

  assert.equal(research.provider, "tavily");
  assert.equal(research.mode, "live_web_search");
  assert.equal(research.sources.length, 3);
  assert.equal(research.sourceSummary.collected, 3);
  assert.ok(research.sources.length <= createJob().options.maxSources);
  assert.equal(research.findings[0].evidenceStatus, "source_backed");
  assert.equal(searchCalls[0].options.searchDepth, "advanced");
  assert.ok(research.sources.every((source) => source.id && source.url && source.domain));
});

test("Tavily researcher uses local fallback when every search fails", async () => {
  const research = await conductResearch(createJob(), {
    apiKey: "test-key",
    search: async () => {
      throw new Error("network unavailable");
    },
  });

  assert.equal(research.provider, "local");
  assert.match(research.fallbackReason, /no usable sources/i);
  assert.equal(research.sourceSummary.collected, 0);
});

test("Tavily REST client sends official search request fields", async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      json: async () => ({ answer: "Result", results: [] }),
    };
  };

  await tavilySearch("test query", {
    apiKey: "tvly-test",
    timeoutMs: 100,
    maxResults: 4,
    searchDepth: "basic",
    fetchImpl,
  });

  const body = JSON.parse(captured.options.body);
  assert.equal(captured.url, "https://api.tavily.com/search");
  assert.equal(captured.options.headers.Authorization, "Bearer tvly-test");
  assert.deepEqual(body, {
    query: "test query",
    search_depth: "basic",
    max_results: 4,
    include_answer: "basic",
    include_raw_content: false,
  });
});
