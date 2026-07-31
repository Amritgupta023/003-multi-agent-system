const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { app } = require("../src/app");

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
  assert.equal(body.level, 1);
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
