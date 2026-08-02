const { buildResearchPlan } = require("./planner");

const QUESTION_COUNTS = { quick: 3, standard: 5, deep: 7 };

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    objective: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          searchQuery: { type: "string" },
        },
        required: ["question", "searchQuery"],
      },
    },
    reportOutline: { type: "array", items: { type: "string" } },
  },
  required: ["objective", "questions", "reportOutline"],
};

async function generateResearchPlan(job, dependencies = {}) {
  const apiKey = dependencies.apiKey ?? process.env.GEMINI_API_KEY;
  const model = dependencies.model ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const timeoutMs = dependencies.timeoutMs ?? Number(process.env.GEMINI_TIMEOUT_MS || 15000);

  if (!apiKey) {
    return createFallbackPlan(job, "GEMINI_API_KEY is not configured");
  }

  try {
    const client = dependencies.client || (await createGeminiClient(apiKey));
    const response = await withTimeout(
      client.models.generateContent({
        model,
        contents: buildPrompt(job),
        config: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: PLAN_SCHEMA,
        },
      }),
      timeoutMs,
    );
    const parsed = JSON.parse(response.text);
    validateGeminiPlan(parsed, job.options.depth);

    return {
      ...parsed,
      depth: job.options.depth,
      sourceBudget: job.options.maxSources,
      questions: parsed.questions.map((question, index) => ({ id: `q${index + 1}`, ...question })),
      generatedBy: `gemini:${model}`,
      provider: "gemini",
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return createFallbackPlan(job, sanitizeReason(error));
  }
}

async function createGeminiClient(apiKey) {
  const { GoogleGenAI } = await import("@google/genai");
  return new GoogleGenAI({ apiKey });
}

function buildPrompt(job) {
  const count = QUESTION_COUNTS[job.options.depth];
  return [
    "You are the planner specialist in a multi-agent research system.",
    `Create a ${job.options.depth} research plan for: ${job.topic}`,
    `Return exactly ${count} distinct research questions with focused web search queries.`,
    `The total source budget is ${job.options.maxSources}.`,
    "Create a logical report outline. Do not answer the research questions.",
  ].join("\n");
}

function validateGeminiPlan(plan, depth) {
  const expectedCount = QUESTION_COUNTS[depth];
  const validQuestion = (item) =>
    item && typeof item.question === "string" && item.question.trim() &&
    typeof item.searchQuery === "string" && item.searchQuery.trim();

  if (
    !plan ||
    typeof plan.objective !== "string" ||
    !Array.isArray(plan.questions) ||
    plan.questions.length !== expectedCount ||
    !plan.questions.every(validQuestion) ||
    !Array.isArray(plan.reportOutline) ||
    plan.reportOutline.length < 3 ||
    !plan.reportOutline.every((section) => typeof section === "string" && section.trim())
  ) {
    throw new Error("Gemini returned an invalid research plan");
  }
}

function createFallbackPlan(job, reason) {
  return {
    ...buildResearchPlan(job),
    provider: "local",
    fallbackReason: reason,
  };
}

function sanitizeReason(error) {
  if (error?.name === "TimeoutError") return error.message;
  if (error instanceof SyntaxError) return "Gemini returned invalid JSON";
  return "Gemini planning failed; local planner used";
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Gemini request timed out after ${timeoutMs}ms`);
      error.name = "TimeoutError";
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = { generateResearchPlan };
