const express = require("express");
const { generateResearchPlan } = require("../agents/geminiPlanner");
const { conductResearch } = require("../agents/tavilyResearcher");
const { writeReport } = require("../agents/writer");
const { runSupervisor } = require("../workflow/supervisorGraph");
const { createJob, getJob, updateJob } = require("./jobStore");
const { validateResearchRequest } = require("./validation");

const researchRouter = express.Router();

researchRouter.post("/", async (request, response) => {
  const validation = validateResearchRequest(request.body);

  if (!validation.valid) {
    return response.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Research request is invalid",
        details: validation.errors,
      },
    });
  }

  const job = await createJob(validation.value);
  return response.status(202).location(`/api/research/${job.id}`).json({
    success: true,
    message: "Research job accepted",
    data: job,
  });
});

researchRouter.post("/:jobId/plan", async (request, response) => {
  const job = await getJob(request.params.jobId);

  if (!job) {
    return response.status(404).json({
      success: false,
      error: {
        code: "JOB_NOT_FOUND",
        message: `Research job ${request.params.jobId} was not found`,
      },
    });
  }

  if (job.plan) {
    return response.status(200).json({
      success: true,
      message: "Existing research plan returned",
      data: job,
    });
  }

  const plan = await generateResearchPlan(job);
  const plannedJob = await updateJob(job.id, {
    status: "planned",
    progress: 25,
    currentStep: "waiting_for_researcher",
    plan,
  });

  return response.status(200).json({
    success: true,
    message: "Research plan generated",
    data: plannedJob,
  });
});

researchRouter.post("/:jobId/research", async (request, response) => {
  const job = await getJob(request.params.jobId);

  if (!job) {
    return response.status(404).json({
      success: false,
      error: {
        code: "JOB_NOT_FOUND",
        message: `Research job ${request.params.jobId} was not found`,
      },
    });
  }

  if (!job.plan) {
    return response.status(409).json({
      success: false,
      error: {
        code: "PLAN_REQUIRED",
        message: "Generate a research plan before running the researcher",
      },
    });
  }

  if (job.research) {
    return response.status(200).json({
      success: true,
      message: "Existing research results returned",
      data: job,
    });
  }

  const research = await conductResearch(job);
  const researchedJob = await updateJob(job.id, {
    status: "researched",
    progress: 65,
    currentStep: "waiting_for_writer",
    research,
  });

  return response.status(200).json({
    success: true,
    message: "Research step completed",
    data: researchedJob,
  });
});

researchRouter.post("/:jobId/write", async (request, response) => {
  const job = await getJob(request.params.jobId);

  if (!job) {
    return response.status(404).json({
      success: false,
      error: {
        code: "JOB_NOT_FOUND",
        message: `Research job ${request.params.jobId} was not found`,
      },
    });
  }

  if (!job.research) {
    return response.status(409).json({
      success: false,
      error: {
        code: "RESEARCH_REQUIRED",
        message: "Run the researcher before generating a report",
      },
    });
  }

  if (job.report) {
    return response.status(200).json({
      success: true,
      message: "Existing report returned",
      data: job,
    });
  }

  const report = writeReport(job);
  const completedJob = await updateJob(job.id, {
    status: "completed",
    progress: 100,
    currentStep: "completed",
    report,
  });

  return response.status(200).json({
    success: true,
    message: "Research report generated",
    data: completedJob,
  });
});

researchRouter.post("/:jobId/run", async (request, response) => {
  const job = await getJob(request.params.jobId);

  if (!job) {
    return response.status(404).json({
      success: false,
      error: { code: "JOB_NOT_FOUND", message: `Research job ${request.params.jobId} was not found` },
    });
  }

  if (job.status === "completed" && job.report) {
    return response.status(200).json({ success: true, message: "Existing completed workflow returned", data: job });
  }

  const result = await runSupervisor(job);
  const updatedJob = await updateJob(job.id, {
    ...result.job,
    executionTrace: result.trace,
    workflow: {
      engine: "langgraph",
      attempts: result.attempts,
      lastError: result.error,
    },
  });

  if (updatedJob.status === "failed") {
    return response.status(422).json({
      success: false,
      error: { code: "WORKFLOW_REVIEW_FAILED", message: "Supervisor rejected a workflow artifact" },
      data: updatedJob,
    });
  }

  return response.status(200).json({ success: true, message: "Supervised research workflow completed", data: updatedJob });
});

researchRouter.get("/:jobId", async (request, response) => {
  const job = await getJob(request.params.jobId);

  if (!job) {
    return response.status(404).json({
      success: false,
      error: {
        code: "JOB_NOT_FOUND",
        message: `Research job ${request.params.jobId} was not found`,
      },
    });
  }

  return response.status(200).json({ success: true, data: job });
});

module.exports = { researchRouter };
