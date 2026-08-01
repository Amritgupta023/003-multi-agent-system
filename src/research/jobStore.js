const { randomUUID } = require("node:crypto");
const { getJobRepository } = require("../storage");

async function createJob({ topic, depth, maxSources }) {
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

  await getJobRepository().save(job);
  return job;
}

async function getJob(id) {
  return getJobRepository().get(id);
}

async function updateJob(id, changes) {
  const existingJob = await getJob(id);
  if (!existingJob) return null;

  const updatedJob = {
    ...existingJob,
    ...changes,
    updatedAt: new Date().toISOString(),
  };
  await getJobRepository().save(updatedJob);
  return updatedJob;
}

async function clearJobs() {
  return getJobRepository().clear();
}

async function getStorageHealth() {
  return getJobRepository().health();
}

async function closeJobStore() {
  return getJobRepository().close();
}

module.exports = { clearJobs, closeJobStore, createJob, getJob, getStorageHealth, updateJob };
