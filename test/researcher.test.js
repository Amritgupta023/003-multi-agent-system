const assert = require("node:assert/strict");
const test = require("node:test");
const { conductLocalResearch } = require("../src/agents/researcher");

test("local researcher creates one normalized finding per plan question", () => {
  const job = {
    options: { maxSources: 6 },
    plan: {
      questions: [
        { id: "q1", question: "What is the current context?", searchQuery: "topic current context" },
        { id: "q2", question: "What are the risks?", searchQuery: "topic risks" },
      ],
    },
  };

  const research = conductLocalResearch(job);

  assert.equal(research.findings.length, 2);
  assert.equal(research.findings[0].questionId, "q1");
  assert.equal(research.findings[0].evidenceStatus, "pending_live_search");
  assert.deepEqual(research.findings[0].sources, []);
  assert.equal(research.sourceSummary.requested, 6);
  assert.equal(research.sourceSummary.collected, 0);
});

test("local researcher refuses to run without a plan", () => {
  assert.throws(
    () => conductLocalResearch({ options: { maxSources: 5 } }),
    /research plan is required/i,
  );
});
