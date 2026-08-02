const ALLOWED_DEPTHS = new Set(["quick", "standard", "deep"]);

function validateResearchRequest(body) {
  const errors = [];

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      valid: false,
      errors: [{ field: "body", message: "Request body must be a JSON object" }],
    };
  }

  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const depth = body.depth === undefined ? "standard" : body.depth;
  const maxSources = body.maxSources === undefined ? 5 : body.maxSources;
  const runAsync = body.runAsync === undefined ? false : body.runAsync;

  if (!topic) {
    errors.push({ field: "topic", message: "Topic is required" });
  } else if (topic.length < 3 || topic.length > 500) {
    errors.push({ field: "topic", message: "Topic must contain between 3 and 500 characters" });
  }

  if (typeof depth !== "string" || !ALLOWED_DEPTHS.has(depth)) {
    errors.push({ field: "depth", message: "Depth must be quick, standard, or deep" });
  }

  if (!Number.isInteger(maxSources) || maxSources < 1 || maxSources > 20) {
    errors.push({ field: "maxSources", message: "maxSources must be an integer between 1 and 20" });
  }

  if (typeof runAsync !== "boolean") {
    errors.push({ field: "runAsync", message: "runAsync must be a boolean" });
  }

  return { valid: errors.length === 0, errors, value: { topic, depth, maxSources, runAsync } };
}

module.exports = { validateResearchRequest };
