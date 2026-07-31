const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
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
  assert.equal(body.level, 4);
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
