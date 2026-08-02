const QUESTION_TEMPLATES = [
  (topic) => `What is ${topic}, and what is its current context?`,
  (topic) => `What are the most important developments and trends related to ${topic}?`,
  (topic) => `What evidence, data, and expert perspectives are available about ${topic}?`,
  (topic) => `What are the main benefits and opportunities associated with ${topic}?`,
  (topic) => `What risks, limitations, and criticisms are associated with ${topic}?`,
  (topic) => `Which real-world examples or case studies best explain ${topic}?`,
  (topic) => `What future developments and open questions should be considered for ${topic}?`,
];

const QUESTION_COUNTS = {
  quick: 3,
  standard: 5,
  deep: 7,
};

function buildResearchPlan(job) {
  const { topic, options } = job;
  const questionCount = QUESTION_COUNTS[options.depth];
  const questions = QUESTION_TEMPLATES.slice(0, questionCount).map((createQuestion, index) => {
    const question = createQuestion(topic);
    return {
      id: `q${index + 1}`,
      question,
      searchQuery: `${topic} ${getSearchFocus(index)}`,
    };
  });

  return {
    objective: `Produce a ${options.depth} evidence-based report about ${topic}.`,
    depth: options.depth,
    sourceBudget: options.maxSources,
    questions,
    reportOutline: buildOutline(options.depth),
    generatedBy: "local-planner-v1",
    generatedAt: new Date().toISOString(),
  };
}

function getSearchFocus(index) {
  return [
    "overview current context",
    "latest developments trends",
    "research evidence statistics expert analysis",
    "benefits opportunities impact",
    "risks limitations criticism",
    "case studies real world examples",
    "future outlook open questions",
  ][index];
}

function buildOutline(depth) {
  const sections = ["Executive Summary", "Background and Current Context", "Key Findings"];

  if (depth !== "quick") {
    sections.push("Opportunities and Benefits", "Risks and Limitations");
  }

  if (depth === "deep") {
    sections.push("Case Studies", "Future Outlook");
  }

  sections.push("Conclusion", "Sources");
  return sections;
}

module.exports = { buildResearchPlan };
