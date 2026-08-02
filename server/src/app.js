const express = require("express");
const { researchRouter } = require("./research/router");
const { getStorageHealth } = require("./research/jobStore");

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/", (_request, response) => {
  response.status(200).json({
    success: true,
    message: "Multi-Agent Research Assistant API",
    level: 11,
  });
});

app.get("/api/health", async (_request, response) => {
  const storage = await getStorageHealth();
  response.status(200).json({
    success: true,
    status: "ok",
    service: "multi-agent-research-assistant",
    level: 11,
    storage,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/research", researchRouter);

app.use((request, response) => {
  response.status(404).json({
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Route ${request.method} ${request.originalUrl} was not found`,
    },
  });
});

app.use((error, _request, response, _next) => {
  const isInvalidJson = error instanceof SyntaxError && error.status === 400;

  response.status(isInvalidJson ? 400 : 500).json({
    success: false,
    error: {
      code: isInvalidJson ? "INVALID_JSON" : "INTERNAL_SERVER_ERROR",
      message: isInvalidJson ? "Request body contains invalid JSON" : "An unexpected error occurred",
    },
  });
});

module.exports = { app };
