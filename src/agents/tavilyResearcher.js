const { conductLocalResearch } = require("./researcher");

async function conductResearch(job, dependencies = {}) {
  const apiKey = dependencies.apiKey ?? process.env.TAVILY_API_KEY;
  const timeoutMs = dependencies.timeoutMs ?? Number(process.env.TAVILY_TIMEOUT_MS || 15000);
  const search = dependencies.search || tavilySearch;

  if (!apiKey) {
    return {
      ...conductLocalResearch(job),
      fallbackReason: "TAVILY_API_KEY is not configured",
    };
  }

  const findings = [];
  const uniqueSources = new Map();
  const warnings = [];
  const questionCount = job.plan.questions.length;
  const perQueryLimit = Math.max(1, Math.ceil(job.options.maxSources / questionCount));

  for (const item of job.plan.questions) {
    if (uniqueSources.size >= job.options.maxSources) {
      findings.push(createPendingFinding(item, "Source budget was exhausted before this question"));
      continue;
    }

    try {
      const response = await search(item.searchQuery, {
        apiKey,
        timeoutMs,
        maxResults: Math.min(perQueryLimit, job.options.maxSources - uniqueSources.size),
        searchDepth: job.options.depth === "deep" ? "advanced" : "basic",
        fetchImpl: dependencies.fetchImpl,
      });
      const findingSources = [];

      for (const result of response.results || []) {
        if (uniqueSources.size >= job.options.maxSources) break;
        const source = normalizeSource(result);
        if (!source) continue;

        const key = canonicalizeUrl(source.url);
        let storedSource = uniqueSources.get(key);
        if (!storedSource) {
          storedSource = { ...source, id: `s${uniqueSources.size + 1}` };
          uniqueSources.set(key, storedSource);
        }
        if (!findingSources.some((existing) => existing.id === storedSource.id)) {
          findingSources.push(storedSource);
        }
      }

      findings.push({
        questionId: item.id,
        question: item.question,
        query: item.searchQuery,
        summary: response.answer || buildSummary(findingSources),
        keyPoints: findingSources.map((source) => source.content).filter(Boolean).slice(0, 3),
        sources: findingSources,
        confidence: findingSources.length > 1 ? "medium" : findingSources.length === 1 ? "low" : "unverified",
        evidenceStatus: findingSources.length ? "source_backed" : "insufficient_sources",
      });
    } catch (_error) {
      warnings.push(`Search failed for question ${item.id}`);
      findings.push(createPendingFinding(item, "Tavily search failed for this question"));
    }
  }

  if (uniqueSources.size === 0) {
    return {
      ...conductLocalResearch(job),
      fallbackReason: "Tavily search failed or returned no usable sources",
    };
  }

  const sources = [...uniqueSources.values()];
  return {
    provider: "tavily",
    generatedBy: "tavily-search-v1",
    mode: "live_web_search",
    findings,
    sources,
    sourceSummary: {
      requested: job.options.maxSources,
      collected: sources.length,
      uniqueDomains: new Set(sources.map((source) => source.domain)).size,
    },
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

async function tavilySearch(query, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const fetchImpl = options.fetchImpl || fetch;

  try {
    const response = await fetchImpl("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        search_depth: options.searchDepth,
        max_results: options.maxResults,
        include_answer: "basic",
        include_raw_content: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Tavily request failed with status ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSource(result) {
  if (!result || typeof result.url !== "string" || !isHttpUrl(result.url)) return null;

  const url = new URL(result.url);
  return {
    title: typeof result.title === "string" && result.title.trim() ? result.title.trim() : url.hostname,
    url: result.url,
    domain: url.hostname.replace(/^www\./, ""),
    content: typeof result.content === "string" ? result.content.trim() : "",
    score: Number.isFinite(result.score) ? result.score : null,
    publishedDate: result.published_date || null,
  };
}

function canonicalizeUrl(value) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "").toLowerCase();
}

function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function buildSummary(sources) {
  if (!sources.length) return "No usable web sources were returned for this research question.";
  return sources.map((source) => source.content).filter(Boolean).join(" ").slice(0, 1200);
}

function createPendingFinding(item, reason) {
  return {
    questionId: item.id,
    question: item.question,
    query: item.searchQuery,
    summary: reason,
    keyPoints: [],
    sources: [],
    confidence: "unverified",
    evidenceStatus: "pending_live_search",
  };
}

module.exports = { conductResearch, tavilySearch };
