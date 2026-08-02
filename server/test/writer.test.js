const assert = require("node:assert/strict");
const test = require("node:test");
const { writeReport } = require("../src/agents/writer");

test("writer creates matching inline citations and source list", () => {
  const source1 = { id: "s1", title: "First Report", url: "https://one.example/report", domain: "one.example" };
  const source2 = { id: "s2", title: "Second Study", url: "https://two.example/study", domain: "two.example" };
  const job = {
    topic: "Energy storage outlook",
    research: {
      sources: [source1, source2],
      findings: [
        {
          question: "What is changing?",
          summary: "Storage deployment is changing.",
          keyPoints: ["Deployment is increasing."],
          sources: [source1, source2],
        },
      ],
    },
  };

  const report = writeReport(job);

  assert.equal(report.evidenceStatus, "source_backed");
  assert.equal(report.citationCount, 2);
  assert.match(report.markdown, /Storage deployment is changing\. \[1\]\[2\]/);
  assert.match(report.markdown, /1\. \[First Report\]\(https:\/\/one\.example\/report\)/);
  assert.match(report.markdown, /2\. \[Second Study\]\(https:\/\/two\.example\/study\)/);
});

test("writer labels reports without sources as unverified", () => {
  const report = writeReport({
    topic: "Unverified topic",
    research: {
      findings: [{ question: "What is known?", summary: "Evidence is pending.", keyPoints: [], sources: [] }],
    },
  });

  assert.equal(report.citationCount, 0);
  assert.equal(report.evidenceStatus, "unverified");
  assert.match(report.markdown, /No verified web sources were collected/);
  assert.doesNotMatch(report.markdown, /\[1\]/);
});

test("writer requires research findings", () => {
  assert.throws(() => writeReport({ research: {} }), /Research findings are required/);
});
