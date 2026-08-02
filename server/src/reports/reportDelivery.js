function validateCitationIntegrity(report) {
  const errors = [];
  const citations = report?.citations;

  if (!report || report.format !== "markdown" || typeof report.markdown !== "string") {
    return { valid: false, errors: ["Report must contain Markdown content"] };
  }
  if (!Array.isArray(citations) || report.citationCount !== citations.length) {
    return { valid: false, errors: ["citationCount does not match the citations array"] };
  }

  const urls = new Set();
  citations.forEach((citation, index) => {
    const expectedNumber = index + 1;
    if (citation.number !== expectedNumber) errors.push(`Citation ${expectedNumber} has an invalid number`);
    if (!isHttpUrl(citation.url)) errors.push(`Citation ${expectedNumber} has an invalid URL`);
    if (urls.has(citation.url)) errors.push(`Citation ${expectedNumber} duplicates an earlier URL`);
    if (!report.markdown.includes(`[${expectedNumber}]`)) {
      errors.push(`Citation ${expectedNumber} has no inline marker`);
    }
    urls.add(citation.url);
  });

  if (report.evidenceStatus === "source_backed" && citations.length === 0) {
    errors.push("A source-backed report must contain citations");
  }
  return { valid: errors.length === 0, errors };
}

function createReportFilename(topic, jobId) {
  const slug = String(topic || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return `${slug || "research-report"}-${jobId.slice(0, 8)}.md`;
}

function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

module.exports = { createReportFilename, validateCitationIntegrity };
