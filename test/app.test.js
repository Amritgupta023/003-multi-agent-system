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
  assert.equal(body.level, 2);
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
