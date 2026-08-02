function conductLocalResearch(job) {
  if (!job.plan?.questions?.length) {
    throw new Error("A research plan is required before research can begin");
  }

  const findings = job.plan.questions.map((item) => ({
    questionId: item.id,
    question: item.question,
    query: item.searchQuery,
    summary: `A source-backed answer for this question will be collected using the search query: ${item.searchQuery}`,
    keyPoints: [
      `Define the evidence needed to answer: ${item.question}`,
      "Compare multiple reliable sources before drawing a conclusion.",
      "Record publication details and URLs for every factual claim.",
    ],
    sources: [],
    confidence: "unverified",
    evidenceStatus: "pending_live_search",
  }));

  return {
    provider: "local",
    generatedBy: "local-researcher-v1",
    mode: "research_framework",
    findings,
    sourceSummary: {
      requested: job.options.maxSources,
      collected: 0,
      uniqueDomains: 0,
    },
    limitations: [
      "Live web search is not enabled at this level.",
      "Findings are research frameworks and must not be treated as verified factual conclusions.",
    ],
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { conductLocalResearch };
