const express = require("express");
const { buildResearchPlan } = require("../agents/planner");
const { createJob, getJob, updateJob } = require("./jobStore");
const { validateResearchRequest } = require("./validation");

const researchRouter = express.Router();

researchRouter.post("/", (request, response) => {
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

  const job = createJob(validation.value);
  return response.status(202).location(`/api/research/${job.id}`).json({
    success: true,
    message: "Research job accepted",
    data: job,
  });
});

researchRouter.post("/:jobId/plan", (request, response) => {
  const job = getJob(request.params.jobId);

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

  const plan = buildResearchPlan(job);
  const plannedJob = updateJob(job.id, {
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

researchRouter.get("/:jobId", (request, response) => {
  const job = getJob(request.params.jobId);

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
