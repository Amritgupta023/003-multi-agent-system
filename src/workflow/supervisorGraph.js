const { generateResearchPlan } = require("../agents/geminiPlanner");
const { conductResearch } = require("../agents/tavilyResearcher");
const { writeReport } = require("../agents/writer");

const MAX_ATTEMPTS = 2;

async function runSupervisor(job, dependencies = {}) {
  const graph = await createSupervisorGraph(dependencies);
  return graph.invoke({ job, trace: [], attempts: {}, error: null });
}

async function createSupervisorGraph(dependencies = {}) {
  const { Annotation, END, START, StateGraph } = await import("@langchain/langgraph");
  const State = Annotation.Root({
    job: Annotation(),
    trace: Annotation({ reducer: (left, right) => left.concat(right), default: () => [] }),
    attempts: Annotation({ default: () => ({}) }),
    error: Annotation(),
  });

  const planner = dependencies.planner || generateResearchPlan;
  const researcher = dependencies.researcher || conductResearch;
  const writer = dependencies.writer || writeReport;

  const graph = new StateGraph(State)
    .addNode("planner", async (state) => runPlannerNode(state, planner))
    .addNode("review_plan", reviewPlanNode)
    .addNode("researcher", async (state) => runResearcherNode(state, researcher))
    .addNode("review_research", reviewResearchNode)
    .addNode("writer", async (state) => runWriterNode(state, writer))
    .addNode("review_report", reviewReportNode)
    .addNode("failed", failureNode)
    .addEdge(START, "planner")
    .addEdge("planner", "review_plan")
    .addConditionalEdges("review_plan", (state) => routeReview(state, "planner", "researcher"), ["planner", "researcher", "failed"])
    .addEdge("researcher", "review_research")
    .addConditionalEdges("review_research", (state) => routeReview(state, "researcher", "writer"), ["researcher", "writer", "failed"])
    .addEdge("writer", "review_report")
    .addConditionalEdges("review_report", (state) => routeReview(state, "writer", END), ["writer", END, "failed"])
    .addEdge("failed", END)
    .compile();

  return graph;
}

async function runPlannerNode(state, planner) {
  const attempt = (state.attempts.planner || 0) + 1;
  try {
    const plan = await planner(state.job);
    return {
      job: { ...state.job, plan, status: "planned", progress: 25, currentStep: "supervisor_reviewing_plan" },
      attempts: { ...state.attempts, planner: attempt },
      error: null,
      trace: [traceEvent("planner", "completed", attempt, plan.provider || plan.generatedBy)],
    };
  } catch (_error) {
    return specialistFailure(state, "planner", attempt);
  }
}

async function runResearcherNode(state, researcher) {
  const attempt = (state.attempts.researcher || 0) + 1;
  try {
    const research = await researcher(state.job);
    return {
      job: { ...state.job, research, status: "researched", progress: 65, currentStep: "supervisor_reviewing_research" },
      attempts: { ...state.attempts, researcher: attempt },
      error: null,
      trace: [traceEvent("researcher", "completed", attempt, research.provider || research.generatedBy)],
    };
  } catch (_error) {
    return specialistFailure(state, "researcher", attempt);
  }
}

async function runWriterNode(state, writer) {
  const attempt = (state.attempts.writer || 0) + 1;
  try {
    const report = await writer(state.job);
    return {
      job: { ...state.job, report, status: "written", progress: 90, currentStep: "supervisor_reviewing_report" },
      attempts: { ...state.attempts, writer: attempt },
      error: null,
      trace: [traceEvent("writer", "completed", attempt, report.generatedBy)],
    };
  } catch (_error) {
    return specialistFailure(state, "writer", attempt);
  }
}

function reviewPlanNode(state) {
  const expected = { quick: 3, standard: 5, deep: 7 }[state.job.options.depth];
  const approved = Boolean(
    state.job.plan?.objective &&
    state.job.plan?.questions?.length === expected &&
    state.job.plan.questions.every((item) => item.question && item.searchQuery),
  );
  return reviewResult(state, "plan", "planner", approved);
}

function reviewResearchNode(state) {
  const findings = state.job.research?.findings;
  const approved = Boolean(
    Array.isArray(findings) &&
    findings.length === state.job.plan.questions.length &&
    findings.every((item) => item.questionId && item.summary && Array.isArray(item.sources)),
  );
  return reviewResult(state, "research", "researcher", approved);
}

function reviewReportNode(state) {
  const report = state.job.report;
  const approved = Boolean(
    report?.format === "markdown" &&
    report.markdown?.startsWith(`# ${state.job.topic}`) &&
    Array.isArray(report.citations) &&
    report.citationCount === report.citations.length,
  );
  const result = reviewResult(state, "report", "writer", approved);

  if (approved) {
    result.job = { ...state.job, status: "completed", progress: 100, currentStep: "completed" };
  }
  return result;
}

function reviewResult(state, artifact, specialist, approved) {
  const attempt = state.attempts[specialist] || 1;
  return {
    error: approved ? null : `${artifact.toUpperCase()}_REVIEW_FAILED`,
    trace: [{
      ...traceEvent("supervisor", approved ? "approved" : "retry_requested", attempt),
      artifact,
      specialist,
      decision: approved ? "approved" : attempt < MAX_ATTEMPTS ? "retry" : "fail",
    }],
  };
}

function routeReview(state, specialist, nextNode) {
  if (!state.error) return nextNode;
  return (state.attempts[specialist] || 0) < MAX_ATTEMPTS ? specialist : "failed";
}

function failureNode(state) {
  return {
    job: { ...state.job, status: "failed", currentStep: "supervisor_review_failed" },
    trace: [traceEvent("supervisor", "failed", 0)],
  };
}

function specialistFailure(state, specialist, attempt) {
  return {
    attempts: { ...state.attempts, [specialist]: attempt },
    error: `${specialist.toUpperCase()}_EXECUTION_FAILED`,
    trace: [traceEvent(specialist, "failed", attempt)],
  };
}

function traceEvent(node, status, attempt, provider = null) {
  return { node, status, attempt, provider, timestamp: new Date().toISOString() };
}

module.exports = { createSupervisorGraph, runSupervisor };
