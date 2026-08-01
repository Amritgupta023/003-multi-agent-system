const assert = require("node:assert/strict");
const test = require("node:test");

process.env.REDIS_URL = "";

const { createJob, getJob } = require("../src/research/jobStore");
const { startBackgroundRun, waitForRun } = require("../src/workflow/backgroundRunner");

test("background runner persists progress and blocks concurrent runs", async () => {
  const job = await createJob({ topic: "Background execution test", depth: "quick", maxSources: 3 });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const runner = async (runningJob, onState) => {
    await onState({
      job: { ...runningJob, status: "planned", progress: 25, currentStep: "supervisor_reviewing_plan" },
      trace: [{ node: "planner", status: "completed" }],
      attempts: { planner: 1 },
      error: null,
    });
    await gate;
    return {
      job: { ...runningJob, status: "completed", progress: 100, currentStep: "completed", report: { markdown: "# Done" } },
      trace: [{ node: "planner" }, { node: "writer" }],
      attempts: { planner: 1, researcher: 1, writer: 1 },
      error: null,
    };
  };

  const first = await startBackgroundRun(job.id, { runner });
  const second = await startBackgroundRun(job.id, { runner });

  assert.equal(first.started, true);
  assert.equal(second.started, false);
  assert.equal(second.reason, "already_running");
  assert.equal(second.runId, first.runId);

  await new Promise((resolve) => setImmediate(resolve));
  const inProgress = await getJob(job.id);
  assert.equal(inProgress.progress, 25);
  assert.equal(inProgress.workflow.mode, "background");

  release();
  await waitForRun(job.id);
  const completed = await getJob(job.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.backgroundRun.status, "completed");
  assert.ok(completed.backgroundRun.finishedAt);
});

test("background runner stores safe failure details", async () => {
  const job = await createJob({ topic: "Failed background test", depth: "quick", maxSources: 3 });
  const run = await startBackgroundRun(job.id, {
    runner: async () => { throw new Error("secret provider failure"); },
  });
  await waitForRun(job.id);
  const failed = await getJob(job.id);

  assert.equal(run.started, true);
  assert.equal(failed.status, "failed");
  assert.equal(failed.failure.code, "BACKGROUND_EXECUTION_FAILED");
  assert.equal(failed.failure.retryable, true);
  assert.doesNotMatch(failed.failure.message, /secret provider failure/);
});
