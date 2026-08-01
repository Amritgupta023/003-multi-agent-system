const { randomUUID } = require("node:crypto");
const { getJob, updateJob } = require("../research/jobStore");
const { runSupervisorStream } = require("./supervisorGraph");

const activeRuns = new Map();

async function startBackgroundRun(jobId, options = {}) {
  const active = activeRuns.get(jobId);
  if (active) return { started: false, reason: "already_running", runId: active.runId };

  const existingJob = await getJob(jobId);
  if (!existingJob) return { started: false, reason: "not_found" };

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const baseJob = options.retry ? resetForRetry(existingJob) : existingJob;
  const runningJob = await updateJob(jobId, {
    ...baseJob,
    status: "running",
    progress: Math.max(baseJob.progress || 0, 1),
    currentStep: "workflow_starting",
    backgroundRun: { id: runId, status: "running", startedAt, finishedAt: null },
    failure: null,
  });

  const promise = executeRun(runningJob, runId, startedAt, options)
    .finally(() => activeRuns.delete(jobId));
  activeRuns.set(jobId, { runId, promise });

  return { started: true, runId, job: runningJob };
}

async function executeRun(job, runId, startedAt, options) {
  const runner = options.runner || runSupervisorStream;

  try {
    const result = await runner(job, async (state) => {
      if (!state?.job) return;
      await updateJob(job.id, {
        ...state.job,
        executionTrace: state.trace || [],
        workflow: {
          engine: "langgraph",
          mode: "background",
          attempts: state.attempts || {},
          lastError: state.error || null,
        },
        backgroundRun: { id: runId, status: "running", startedAt, finishedAt: null },
      });
    }, options.dependencies);

    const finishedAt = new Date().toISOString();
    await updateJob(job.id, {
      ...result.job,
      executionTrace: result.trace || [],
      workflow: {
        engine: "langgraph",
        mode: "background",
        attempts: result.attempts || {},
        lastError: result.error || null,
      },
      backgroundRun: {
        id: runId,
        status: result.job.status === "failed" ? "failed" : "completed",
        startedAt,
        finishedAt,
      },
    });
  } catch (_error) {
    await updateJob(job.id, {
      status: "failed",
      currentStep: "background_execution_failed",
      backgroundRun: { id: runId, status: "failed", startedAt, finishedAt: new Date().toISOString() },
      failure: {
        code: "BACKGROUND_EXECUTION_FAILED",
        message: "The background workflow failed unexpectedly",
        retryable: true,
      },
    });
  }
}

function resetForRetry(job) {
  const {
    plan: _plan,
    research: _research,
    report: _report,
    executionTrace: _trace,
    workflow: _workflow,
    failure: _failure,
    ...base
  } = job;
  return { ...base, status: "queued", progress: 0, currentStep: "waiting_for_planner" };
}

function getActiveRun(jobId) {
  return activeRuns.get(jobId) || null;
}

async function waitForRun(jobId) {
  const active = activeRuns.get(jobId);
  if (active) await active.promise;
}

module.exports = { getActiveRun, startBackgroundRun, waitForRun };
