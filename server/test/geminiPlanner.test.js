const assert = require("node:assert/strict");
const test = require("node:test");
const { generateResearchPlan } = require("../src/agents/geminiPlanner");

function createJob(depth = "standard") {
  return {
    topic: "Responsible artificial intelligence",
    options: { depth, maxSources: 8 },
  };
}

test("Gemini planner normalizes valid structured output", async () => {
  const client = {
    models: {
      generateContent: async (request) => {
        assert.equal(request.model, "test-model");
        assert.equal(request.config.responseMimeType, "application/json");
        return {
          text: JSON.stringify({
            objective: "Assess responsible AI practices.",
            questions: Array.from({ length: 5 }, (_, index) => ({
              question: `Research question ${index + 1}?`,
              searchQuery: `responsible AI query ${index + 1}`,
            })),
            reportOutline: ["Summary", "Findings", "Conclusion"],
          }),
        };
      },
    },
  };

  const plan = await generateResearchPlan(createJob(), {
    apiKey: "test-key",
    model: "test-model",
    timeoutMs: 100,
    client,
  });

  assert.equal(plan.provider, "gemini");
  assert.equal(plan.generatedBy, "gemini:test-model");
  assert.equal(plan.questions[0].id, "q1");
  assert.equal(plan.sourceBudget, 8);
  assert.equal(plan.fallbackReason, undefined);
});

test("Gemini planner falls back when output is invalid", async () => {
  const client = {
    models: { generateContent: async () => ({ text: "not-json" }) },
  };

  const plan = await generateResearchPlan(createJob("quick"), {
    apiKey: "test-key",
    client,
  });

  assert.equal(plan.provider, "local");
  assert.equal(plan.generatedBy, "local-planner-v1");
  assert.equal(plan.fallbackReason, "Gemini returned invalid JSON");
  assert.equal(plan.questions.length, 3);
});

test("Gemini planner falls back after a timeout", async () => {
  const client = {
    models: { generateContent: () => new Promise(() => {}) },
  };

  const plan = await generateResearchPlan(createJob(), {
    apiKey: "test-key",
    timeoutMs: 5,
    client,
  });

  assert.equal(plan.provider, "local");
  assert.match(plan.fallbackReason, /timed out after 5ms/);
});
