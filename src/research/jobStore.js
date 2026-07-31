const { randomUUID } = require("node:crypto");

const jobs = new Map();

function createJob({ topic, depth, maxSources }) {
  const now = new Date().toISOString();
  const job = {
    id: randomUUID(),
    topic,
    options: { depth, maxSources },
    status: "queued",
    progress: 0,
    currentStep: "waiting_for_planner",
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(job.id, job);
  return job;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function clearJobs() {
  jobs.clear();
}

module.exports = { clearJobs, createJob, getJob };
