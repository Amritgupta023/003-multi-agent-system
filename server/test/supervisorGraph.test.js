const assert = require("node:assert/strict");
const test = require("node:test");
const { runSupervisor } = require("../src/workflow/supervisorGraph");

function createJob() {
  return {
    id: "job-1",
    topic: "AI safety standards",
    options: { depth: "quick", maxSources: 3 },
    status: "queued",
    progress: 0,
  };
}

function validDependencies() {
  return {
    planner: async () => ({
      objective: "Research AI safety standards",
      questions: Array.from({ length: 3 }, (_, index) => ({
        id: `q${index + 1}`,
        question: `Question ${index + 1}`,
        searchQuery: `Query ${index + 1}`,
      })),
      provider: "test-planner",
    }),
    researcher: async (job) => ({
      provider: "test-researcher",
      findings: job.plan.questions.map((item) => ({
        questionId: item.id,
        summary: `Finding for ${item.id}`,
        sources: [],
      })),
    }),
    writer: async (job) => ({
      format: "markdown",
      markdown: `# ${job.topic}\n\nReport`,
      citations: [],
      citationCount: 0,
      generatedBy: "test-writer",
    }),
  };
}

test("LangGraph supervisor routes and approves all specialists", async () => {
  const result = await runSupervisor(createJob(), validDependencies());

  assert.equal(result.job.status, "completed");
  assert.equal(result.job.progress, 100);
  assert.deepEqual(result.attempts, { planner: 1, researcher: 1, writer: 1 });
  assert.deepEqual(result.trace.map((event) => event.node), [
    "planner",
    "supervisor",
    "researcher",
    "supervisor",
    "writer",
    "supervisor",
  ]);
  assert.ok(result.trace.filter((event) => event.node === "supervisor").every((event) => event.decision === "approved"));
});

test("supervisor retries an invalid artifact and then fails safely", async () => {
  let calls = 0;
  const dependencies = validDependencies();
  dependencies.planner = async () => {
    calls += 1;
    return { objective: "Invalid", questions: [], provider: "broken-planner" };
  };

  const result = await runSupervisor(createJob(), dependencies);

  assert.equal(calls, 2);
  assert.equal(result.attempts.planner, 2);
  assert.equal(result.job.status, "failed");
  assert.equal(result.job.currentStep, "supervisor_review_failed");
  assert.equal(result.error, "PLAN_REVIEW_FAILED");
  assert.ok(result.trace.some((event) => event.decision === "retry"));
  assert.ok(result.trace.some((event) => event.decision === "fail"));
});
