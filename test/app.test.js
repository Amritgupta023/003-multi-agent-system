const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

process.env.GEMINI_API_KEY = "";
process.env.TAVILY_API_KEY = "";
process.env.REDIS_URL = "";

const { app } = require("../src/app");
const { clearJobs } = require("../src/research/jobStore");

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("GET /api/health reports a healthy service", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.status, "ok");
  assert.equal(body.level, 10);
  assert.deepEqual(body.storage, { provider: "memory", status: "ready", persistent: false });
});

test("POST /api/research creates a queued research job", async () => {
  clearJobs();
  const response = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "Impact of AI on software engineering", depth: "deep", maxSources: 10 }),
  });
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.equal(body.success, true);
  assert.match(body.data.id, /^[0-9a-f-]{36}$/i);
  assert.equal(body.data.status, "queued");
  assert.equal(body.data.options.depth, "deep");
  assert.equal(response.headers.get("location"), `/api/research/${body.data.id}`);

  const statusResponse = await fetch(`${baseUrl}/api/research/${body.data.id}`);
  const statusBody = await statusResponse.json();
  assert.equal(statusResponse.status, 200);
  assert.deepEqual(statusBody.data, body.data);
});

test("POST /api/research applies default options", async () => {
  const response = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "Quantum computing trends" }),
  });
  const body = await response.json();

  assert.equal(response.status, 202);
  assert.deepEqual(body.data.options, { depth: "standard", maxSources: 5 });
});

test("POST /api/research rejects invalid fields", async () => {
  const response = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: " ", depth: "extreme", maxSources: 50 }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.deepEqual(body.error.details.map((detail) => detail.field), ["topic", "depth", "maxSources"]);
});

test("GET /api/research/:jobId returns JOB_NOT_FOUND", async () => {
  const response = await fetch(`${baseUrl}/api/research/missing-job`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, "JOB_NOT_FOUND");
});

test("POST /api/research/:jobId/plan creates and stores a depth-aware plan", async () => {
  const createResponse = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "Renewable energy in India", depth: "deep", maxSources: 12 }),
  });
  const createdJob = (await createResponse.json()).data;

  const planResponse = await fetch(`${baseUrl}/api/research/${createdJob.id}/plan`, { method: "POST" });
  const body = await planResponse.json();

  assert.equal(planResponse.status, 200);
  assert.equal(body.data.status, "planned");
  assert.equal(body.data.progress, 25);
  assert.equal(body.data.currentStep, "waiting_for_researcher");
  assert.equal(body.data.plan.questions.length, 7);
  assert.equal(body.data.plan.sourceBudget, 12);
  assert.equal(body.data.plan.generatedBy, "local-planner-v1");
  assert.equal(body.data.plan.provider, "local");

  const statusResponse = await fetch(`${baseUrl}/api/research/${createdJob.id}`);
  const storedJob = (await statusResponse.json()).data;
  assert.deepEqual(storedJob.plan, body.data.plan);
});

test("planner changes question count based on research depth", async () => {
  const expectedCounts = { quick: 3, standard: 5, deep: 7 };

  for (const [depth, expectedCount] of Object.entries(expectedCounts)) {
    const createResponse = await fetch(`${baseUrl}/api/research`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "Electric vehicle adoption", depth }),
    });
    const job = (await createResponse.json()).data;
    const planResponse = await fetch(`${baseUrl}/api/research/${job.id}/plan`, { method: "POST" });
    const plannedJob = (await planResponse.json()).data;

    assert.equal(plannedJob.plan.questions.length, expectedCount);
  }
});

test("planning is idempotent and returns the existing plan", async () => {
  const createResponse = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "Space tourism economics" }),
  });
  const job = (await createResponse.json()).data;
  const firstResponse = await fetch(`${baseUrl}/api/research/${job.id}/plan`, { method: "POST" });
  const firstBody = await firstResponse.json();
  const secondResponse = await fetch(`${baseUrl}/api/research/${job.id}/plan`, { method: "POST" });
  const secondBody = await secondResponse.json();

  assert.equal(secondResponse.status, 200);
  assert.equal(secondBody.message, "Existing research plan returned");
  assert.deepEqual(secondBody.data.plan, firstBody.data.plan);
});

test("planning a missing job returns JOB_NOT_FOUND", async () => {
  const response = await fetch(`${baseUrl}/api/research/missing-job/plan`, { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, "JOB_NOT_FOUND");
});

test("POST /api/research/:jobId/research requires a plan", async () => {
  const createResponse = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "Green hydrogen market" }),
  });
  const job = (await createResponse.json()).data;
  const response = await fetch(`${baseUrl}/api/research/${job.id}/research`, { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error.code, "PLAN_REQUIRED");
});

test("POST /api/research/:jobId/research stores normalized findings", async () => {
  const createResponse = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "Green hydrogen market", depth: "quick", maxSources: 4 }),
  });
  const job = (await createResponse.json()).data;
  await fetch(`${baseUrl}/api/research/${job.id}/plan`, { method: "POST" });

  const response = await fetch(`${baseUrl}/api/research/${job.id}/research`, { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.status, "researched");
  assert.equal(body.data.progress, 65);
  assert.equal(body.data.currentStep, "waiting_for_writer");
  assert.equal(body.data.research.findings.length, 3);
  assert.equal(body.data.research.provider, "local");
  assert.equal(body.data.research.sourceSummary.collected, 0);
  assert.ok(body.data.research.findings.every((finding) => finding.evidenceStatus === "pending_live_search"));
});

test("researching is idempotent and missing jobs return JOB_NOT_FOUND", async () => {
  const createResponse = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "Battery recycling systems", depth: "quick" }),
  });
  const job = (await createResponse.json()).data;
  await fetch(`${baseUrl}/api/research/${job.id}/plan`, { method: "POST" });
  const firstResponse = await fetch(`${baseUrl}/api/research/${job.id}/research`, { method: "POST" });
  const firstBody = await firstResponse.json();
  const secondResponse = await fetch(`${baseUrl}/api/research/${job.id}/research`, { method: "POST" });
  const secondBody = await secondResponse.json();

  assert.equal(secondBody.message, "Existing research results returned");
  assert.deepEqual(secondBody.data.research, firstBody.data.research);

  const missingResponse = await fetch(`${baseUrl}/api/research/missing-job/research`, { method: "POST" });
  const missingBody = await missingResponse.json();
  assert.equal(missingResponse.status, 404);
  assert.equal(missingBody.error.code, "JOB_NOT_FOUND");
});

test("POST /api/research/:jobId/write requires research", async () => {
  const createResponse = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "Circular economy policy" }),
  });
  const job = (await createResponse.json()).data;
  const response = await fetch(`${baseUrl}/api/research/${job.id}/write`, { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error.code, "RESEARCH_REQUIRED");
});

test("POST /api/research/:jobId/write completes a job with a report", async () => {
  const createResponse = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "Circular economy policy", depth: "quick" }),
  });
  const job = (await createResponse.json()).data;
  await fetch(`${baseUrl}/api/research/${job.id}/plan`, { method: "POST" });
  await fetch(`${baseUrl}/api/research/${job.id}/research`, { method: "POST" });

  const response = await fetch(`${baseUrl}/api/research/${job.id}/write`, { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.status, "completed");
  assert.equal(body.data.progress, 100);
  assert.equal(body.data.currentStep, "completed");
  assert.equal(body.data.report.format, "markdown");
  assert.equal(body.data.report.evidenceStatus, "unverified");
  assert.match(body.data.report.markdown, /^# Circular economy policy/);

  const secondResponse = await fetch(`${baseUrl}/api/research/${job.id}/write`, { method: "POST" });
  const secondBody = await secondResponse.json();
  assert.equal(secondBody.message, "Existing report returned");
  assert.deepEqual(secondBody.data.report, body.data.report);
});

test("writing a missing job returns JOB_NOT_FOUND", async () => {
  const response = await fetch(`${baseUrl}/api/research/missing-job/write`, { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, "JOB_NOT_FOUND");
});

test("POST /api/research/:jobId/run completes the supervised workflow", async () => {
  const createResponse = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "AI governance in healthcare", depth: "quick", maxSources: 3 }),
  });
  const job = (await createResponse.json()).data;
  const response = await fetch(`${baseUrl}/api/research/${job.id}/run`, { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.status, "completed");
  assert.equal(body.data.progress, 100);
  assert.equal(body.data.workflow.engine, "langgraph");
  assert.deepEqual(body.data.workflow.attempts, { planner: 1, researcher: 1, writer: 1 });
  assert.equal(body.data.executionTrace.length, 6);
  assert.deepEqual(body.data.executionTrace.map((event) => event.node), [
    "planner", "supervisor", "researcher", "supervisor", "writer", "supervisor",
  ]);
  assert.ok(body.data.report.markdown.startsWith("# AI governance in healthcare"));

  const secondResponse = await fetch(`${baseUrl}/api/research/${job.id}/run`, { method: "POST" });
  const secondBody = await secondResponse.json();
  assert.equal(secondBody.message, "Existing completed workflow returned");
});

test("running a missing workflow job returns JOB_NOT_FOUND", async () => {
  const response = await fetch(`${baseUrl}/api/research/missing-job/run`, { method: "POST" });
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, "JOB_NOT_FOUND");
});

test("runAsync creation starts a pollable background workflow", async () => {
  const createResponse = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      topic: "Autonomous vehicle regulation",
      depth: "quick",
      maxSources: 3,
      runAsync: true,
    }),
  });
  const created = await createResponse.json();

  assert.equal(createResponse.status, 202);
  assert.equal(created.message, "Research job accepted and background workflow started");
  assert.ok(created.runId);
  assert.equal(created.data.backgroundRun.status, "running");

  let statusBody;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const statusResponse = await fetch(`${baseUrl}/api/research/${created.data.id}/status`);
    statusBody = await statusResponse.json();
    if (["completed", "failed"].includes(statusBody.data.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  assert.equal(statusBody.data.status, "completed");
  assert.equal(statusBody.data.progress, 100);
  assert.equal(statusBody.data.backgroundRun.status, "completed");
  assert.equal(statusBody.data.failure, null);
});

test("async endpoints validate missing and completed jobs", async () => {
  const missingResponse = await fetch(`${baseUrl}/api/research/missing-job/run-async`, { method: "POST" });
  const missingBody = await missingResponse.json();
  assert.equal(missingResponse.status, 404);
  assert.equal(missingBody.error.code, "JOB_NOT_FOUND");

  const createResponse = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "Completed async guard", depth: "quick" }),
  });
  const job = (await createResponse.json()).data;
  await fetch(`${baseUrl}/api/research/${job.id}/run`, { method: "POST" });
  const rerunResponse = await fetch(`${baseUrl}/api/research/${job.id}/run-async`, { method: "POST" });
  const rerunBody = await rerunResponse.json();

  assert.equal(rerunResponse.status, 409);
  assert.equal(rerunBody.error.code, "JOB_ALREADY_COMPLETED");
});

test("unknown routes return the standard 404 response", async () => {
  const response = await fetch(`${baseUrl}/does-not-exist`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "ROUTE_NOT_FOUND");
});

test("malformed JSON returns a useful 400 response", async () => {
  const response = await fetch(`${baseUrl}/unknown`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not-valid-json",
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_JSON");
});
