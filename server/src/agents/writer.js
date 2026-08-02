function writeReport(job) {
  if (!job.research?.findings?.length) {
    throw new Error("Research findings are required before writing a report");
  }

  const citations = collectCitations(job.research);
  const citationNumbers = new Map(citations.flatMap((citation) => [
    [citation.sourceId, citation.number],
    [citation.url, citation.number],
  ]));
  const sections = [];

  sections.push(`# ${job.topic}`);
  sections.push("## Executive Summary");
  sections.push(buildExecutiveSummary(job, citationNumbers));
  sections.push("## Research Findings");

  for (const finding of job.research.findings) {
    const markers = citationMarkers(finding.sources, citationNumbers);
    sections.push(`### ${finding.question}`);
    sections.push(`${finding.summary}${markers ? ` ${markers}` : ""}`);

    if (finding.keyPoints?.length) {
      sections.push(finding.keyPoints.map((point) => `- ${point}`).join("\n"));
    }

    if (!markers) {
      sections.push("_Evidence status: source-backed evidence is not yet available for this finding._");
    }
  }

  sections.push("## Conclusion");
  sections.push(buildConclusion(job, citations.length));
  sections.push("## Sources");
  sections.push(
    citations.length
      ? citations.map((citation) => `${citation.number}. [${citation.title}](${citation.url})`).join("\n")
      : "No verified web sources were collected. Run the researcher with a valid Tavily API key before treating this report as evidence-backed.",
  );

  const markdown = sections.join("\n\n");
  return {
    title: job.topic,
    format: "markdown",
    markdown,
    citations,
    citationCount: citations.length,
    evidenceStatus: citations.length ? "source_backed" : "unverified",
    generatedBy: "local-writer-v1",
    wordCount: markdown.trim().split(/\s+/).length,
    generatedAt: new Date().toISOString(),
  };
}

function collectCitations(research) {
  const candidates = research.sources || research.findings.flatMap((finding) => finding.sources || []);
  const seen = new Set();
  const citations = [];

  for (const source of candidates) {
    if (!source?.url || seen.has(source.url)) continue;
    seen.add(source.url);
    citations.push({
      number: citations.length + 1,
      sourceId: source.id || null,
      title: source.title || source.domain || source.url,
      url: source.url,
      domain: source.domain || new URL(source.url).hostname,
      publishedDate: source.publishedDate || null,
    });
  }
  return citations;
}

function citationMarkers(sources = [], citationNumbers) {
  const numbers = sources
    .map((source) => citationNumbers.get(source.id) || citationNumbers.get(source.url))
    .filter(Boolean);
  return [...new Set(numbers)].sort((a, b) => a - b).map((number) => `[${number}]`).join("");
}

function buildExecutiveSummary(job, citationNumbers) {
  const supported = job.research.findings.filter((finding) => finding.sources?.length);
  const selected = (supported.length ? supported : job.research.findings).slice(0, 2);
  return selected.map((finding) => {
    const markers = citationMarkers(finding.sources, citationNumbers);
    return `${finding.summary}${markers ? ` ${markers}` : ""}`;
  }).join(" ");
}

function buildConclusion(job, citationCount) {
  const total = job.research.findings.length;
  const supported = job.research.findings.filter((finding) => finding.sources?.length).length;

  if (!citationCount) {
    return `The report covers ${total} planned research questions, but its conclusions remain provisional because no verified web sources were collected.`;
  }
  return `The report covers ${total} planned research questions; ${supported} have source-backed evidence. Areas marked as pending require additional research before firm conclusions are drawn.`;
}

module.exports = { writeReport };
