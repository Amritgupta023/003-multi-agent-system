const assert = require("node:assert/strict");
const test = require("node:test");
const { createReportFilename, validateCitationIntegrity } = require("../src/reports/reportDelivery");

test("citation integrity accepts consecutive, referenced citations", () => {
  const result = validateCitationIntegrity({
    format: "markdown",
    markdown: "# Report\n\nA supported statement. [1]\n\n## Sources\n\n1. [Study](https://example.com/study)",
    evidenceStatus: "source_backed",
    citationCount: 1,
    citations: [{ number: 1, title: "Study", url: "https://example.com/study" }],
  });

  assert.deepEqual(result, { valid: true, errors: [] });
});

test("citation integrity rejects mismatches, duplicates, and missing markers", () => {
  const result = validateCitationIntegrity({
    format: "markdown",
    markdown: "# Broken report",
    evidenceStatus: "source_backed",
    citationCount: 2,
    citations: [
      { number: 2, url: "https://example.com/source" },
      { number: 2, url: "https://example.com/source" },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /invalid number/.test(error)));
  assert.ok(result.errors.some((error) => /duplicates/.test(error)));
  assert.ok(result.errors.some((error) => /inline marker/.test(error)));
});

test("report filenames are safe and deterministic", () => {
  assert.equal(
    createReportFilename("AI: Policy / India?", "12345678-abcd"),
    "ai-policy-india-12345678.md",
  );
  assert.equal(
    createReportFilename("भारत में ऊर्जा", "abcdef12-rest"),
    "research-report-abcdef12.md",
  );
});
