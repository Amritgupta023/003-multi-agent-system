import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Select, Theme } from "@radix-ui/themes";
import {
  ArrowClockwise,
  ArrowSquareOut,
  Check,
  ClipboardText,
  DownloadSimple,
  FileText,
  Flask,
  MagnifyingGlass,
  Moon,
  Play,
  Sun,
  WarningCircle,
} from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import { api } from "./api";

const ACTIVE_STATUSES = new Set(["queued", "running", "planned", "researched", "written"]);
const PIPELINE = [
  { key: "planner", label: "Plan", threshold: 25 },
  { key: "researcher", label: "Research", threshold: 65 },
  { key: "writer", label: "Write", threshold: 90 },
  { key: "completed", label: "Review", threshold: 100 },
];

function App() {
  const [appearance, setAppearance] = useState(() => localStorage.getItem("research-theme") || "light");
  const [health, setHealth] = useState(null);
  const [topic, setTopic] = useState("");
  const [depth, setDepth] = useState("standard");
  const [maxSources, setMaxSources] = useState(6);
  const [job, setJob] = useState(null);
  const [status, setStatus] = useState(null);
  const [report, setReport] = useState(null);
  const [lookupId, setLookupId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingJob, setLoadingJob] = useState(false);
  const [error, setError] = useState(null);

  const jobId = job?.id || status?.id || null;
  const isActive = Boolean(status && ACTIVE_STATUSES.has(status.status) && status.status !== "failed");

  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
    localStorage.setItem("research-theme", appearance);
  }, [appearance]);

  useEffect(() => {
    api.health().then((response) => setHealth(response)).catch(() => setHealth(null));
  }, []);

  const loadReport = useCallback(async (id) => {
    try {
      const response = await api.getReport(id);
      setReport(response.data.report);
    } catch (requestError) {
      if (requestError.code !== "REPORT_NOT_READY") setError(requestError);
    }
  }, []);

  const refreshJob = useCallback(async (id, silent = false) => {
    if (!silent) setLoadingJob(true);
    try {
      const [statusResponse, jobResponse] = await Promise.all([api.getStatus(id), api.getJob(id)]);
      setStatus(statusResponse.data);
      setJob(jobResponse.data);
      setError(null);
      localStorage.setItem("last-research-job", id);
      if (statusResponse.data.status === "completed") await loadReport(id);
    } catch (requestError) {
      setError(requestError);
    } finally {
      if (!silent) setLoadingJob(false);
    }
  }, [loadReport]);

  useEffect(() => {
    if (!jobId || !isActive) return undefined;
    const timer = window.setInterval(() => refreshJob(jobId, true), 1400);
    return () => window.clearInterval(timer);
  }, [isActive, jobId, refreshJob]);

  async function submitResearch(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setReport(null);
    try {
      const response = await api.createResearch({
        topic: topic.trim(),
        depth,
        maxSources: Number(maxSources),
        runAsync: true,
      });
      setJob(response.data);
      setStatus({
        id: response.data.id,
        status: response.data.status,
        progress: response.data.progress,
        currentStep: response.data.currentStep,
        backgroundRun: response.data.backgroundRun,
      });
      localStorage.setItem("last-research-job", response.data.id);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setSubmitting(false);
    }
  }

  async function openJob(event) {
    event.preventDefault();
    if (!lookupId.trim()) return;
    setReport(null);
    await refreshJob(lookupId.trim());
  }

  async function retryJob() {
    if (!jobId) return;
    setSubmitting(true);
    try {
      await api.retry(jobId);
      await refreshJob(jobId);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setSubmitting(false);
    }
  }

  const trace = job?.executionTrace || [];
  const evidenceLabel = report?.evidenceStatus === "source_backed" ? "Source-backed" : "Unverified";
  const progress = status?.progress ?? job?.progress ?? 0;

  return (
    <Theme appearance={appearance} accentColor="tomato" grayColor="sand" radius="medium" scaling="100%">
      <div className="app-shell">
        <header className="topbar">
          <a className="brand" href="/" aria-label="Research Bureau home">
            <span className="brand-mark"><Flask size={18} weight="fill" /></span>
            <span>Research Bureau</span>
          </a>
          <div className="topbar-actions">
            <div className={`service-state ${health ? "is-online" : "is-offline"}`}>
              <span className="state-indicator" aria-hidden="true" />
              <span>{health ? `API ${health.level}` : "API offline"}</span>
              {health?.storage && <span className="storage-label">{health.storage.provider}</span>}
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={() => setAppearance((value) => value === "dark" ? "light" : "dark")}
              aria-label={`Switch to ${appearance === "dark" ? "light" : "dark"} mode`}
            >
              {appearance === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <main className="workspace">
          <section className="brief-panel" aria-labelledby="brief-heading">
            <div className="intro-copy">
              <p className="eyebrow">Multi-agent research</p>
              <h1 id="brief-heading">Ask a hard question.<br />Get a cited brief.</h1>
              <p>Planner, researcher, writer, and supervisor work through one inspectable run.</p>
            </div>

            <form className="research-form" onSubmit={submitResearch}>
              <label className="field-block" htmlFor="topic">
                <span>Research question</span>
                <textarea
                  id="topic"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="How will AI regulation reshape healthcare in India?"
                  minLength={3}
                  maxLength={500}
                  required
                />
                <small>Be specific. Add a market, timeframe, or decision context.</small>
              </label>

              <div className="form-row">
                <label className="field-block" htmlFor="depth-trigger">
                  <span>Research depth</span>
                  <Select.Root value={depth} onValueChange={setDepth}>
                    <Select.Trigger id="depth-trigger" className="select-trigger" />
                    <Select.Content>
                      <Select.Item value="quick">Quick</Select.Item>
                      <Select.Item value="standard">Standard</Select.Item>
                      <Select.Item value="deep">Deep</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </label>
                <label className="field-block" htmlFor="max-sources">
                  <span>Source budget</span>
                  <input
                    id="max-sources"
                    type="number"
                    min="1"
                    max="20"
                    value={maxSources}
                    onChange={(event) => setMaxSources(event.target.value)}
                  />
                </label>
              </div>

              {error && (
                <div className="inline-error" role="alert">
                  <WarningCircle size={19} weight="fill" />
                  <div><strong>{error.code || "Request failed"}</strong><span>{error.message}</span></div>
                </div>
              )}

              <Button className="primary-action" size="3" type="submit" disabled={submitting || topic.trim().length < 3}>
                {submitting ? <><span className="button-loader" /> Starting research</> : <><Play size={18} weight="fill" /> Run research</>}
              </Button>
            </form>

            <form className="lookup-form" onSubmit={openJob}>
              <label htmlFor="job-lookup">Open an existing job</label>
              <div>
                <input
                  id="job-lookup"
                  value={lookupId}
                  onChange={(event) => setLookupId(event.target.value)}
                  placeholder="Paste job ID"
                />
                <button type="submit" aria-label="Open job" disabled={loadingJob || !lookupId.trim()}>
                  <MagnifyingGlass size={19} />
                </button>
              </div>
            </form>
          </section>

          <section className="output-panel" aria-live="polite">
            {!job && !loadingJob ? (
              <EmptyOutput />
            ) : loadingJob ? (
              <LoadingOutput />
            ) : (
              <>
                <div className="run-header">
                  <div>
                    <p className="run-kicker">Current dossier</p>
                    <h2>{job?.topic}</h2>
                  </div>
                  <div className={`status-badge status-${status?.status || job?.status}`}>{formatStatus(status?.status || job?.status)}</div>
                </div>

                <div className="progress-block">
                  <div className="progress-summary">
                    <strong>{progress}%</strong>
                    <span>{humanizeStep(status?.currentStep || job?.currentStep)}</span>
                  </div>
                  <div className="progress-line" aria-label={`${progress}% complete`}>
                    <span style={{ transform: `scaleX(${progress / 100})` }} />
                  </div>
                  <div className="pipeline-grid">
                    {PIPELINE.map((stage) => (
                      <div className={progress >= stage.threshold ? "stage is-complete" : "stage"} key={stage.key}>
                        <span>{progress >= stage.threshold ? <Check size={14} weight="bold" /> : null}</span>
                        <p>{stage.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {status?.status === "failed" && (
                  <div className="failure-panel">
                    <WarningCircle size={24} weight="fill" />
                    <div><strong>Run stopped</strong><p>{status.failure?.message || "The supervisor could not complete this run."}</p></div>
                    <Button variant="soft" onClick={retryJob} disabled={submitting}><ArrowClockwise size={17} /> Retry</Button>
                  </div>
                )}

                <div className="output-tabs" aria-label="Research output sections">
                  <a href="#report">Report</a>
                  <a href="#trace">Agent trace</a>
                  <button type="button" onClick={() => navigator.clipboard?.writeText(jobId)}><ClipboardText size={16} /> Copy job ID</button>
                </div>

                <article className="report-view" id="report">
                  {report ? (
                    <>
                      <div className="report-toolbar">
                        <div>
                          <FileText size={20} />
                          <span>{report.wordCount} words</span>
                          <span>{report.citationCount} citations</span>
                          <span className={report.evidenceStatus === "source_backed" ? "evidence verified" : "evidence"}>{evidenceLabel}</span>
                        </div>
                        <a className="download-link" href={api.markdownUrl(jobId)} download>
                          <DownloadSimple size={17} /> Download
                        </a>
                      </div>
                      <div className="markdown-body">
                        <ReactMarkdown components={{
                          a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}<ArrowSquareOut size={13} /></a>,
                        }}>{report.markdown}</ReactMarkdown>
                      </div>
                    </>
                  ) : (
                    <div className="report-pending">
                      <FileText size={30} />
                      <h3>{isActive ? "The brief is being assembled" : "No report yet"}</h3>
                      <p>{isActive ? "This view updates as each specialist finishes." : "Run the workflow to generate a report."}</p>
                    </div>
                  )}
                </article>

                <section className="trace-view" id="trace">
                  <div className="section-heading"><h3>Agent trace</h3><span>{trace.length} events</span></div>
                  {trace.length ? (
                    <div className="trace-grid">
                      {trace.map((event, index) => (
                        <div className="trace-event" key={`${event.node}-${event.timestamp}-${index}`}>
                          <span className="trace-index">{String(index + 1).padStart(2, "0")}</span>
                          <div><strong>{formatStatus(event.node)}</strong><p>{formatStatus(event.status)}{event.artifact ? `: ${event.artifact}` : ""}</p></div>
                          <time>{event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</time>
                        </div>
                      ))}
                    </div>
                  ) : <p className="trace-empty">Agent events will appear after the first completed step.</p>}
                </section>
              </>
            )}
          </section>
        </main>
      </div>
    </Theme>
  );
}

function EmptyOutput() {
  return (
    <div className="empty-output">
      <div className="empty-symbol"><Flask size={36} weight="duotone" /></div>
      <p>Research workspace</p>
      <h2>Your next dossier starts on the left.</h2>
      <span>Submit a question to watch the agent team plan, search, review, and write.</span>
    </div>
  );
}

function LoadingOutput() {
  return (
    <div className="loading-output" aria-label="Loading job">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-block" />
      <div className="skeleton skeleton-block short" />
    </div>
  );
}

function formatStatus(value = "") {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeStep(value = "waiting_for_planner") {
  const labels = {
    workflow_starting: "Preparing the agent graph",
    supervisor_reviewing_plan: "Supervisor is reviewing the plan",
    supervisor_reviewing_research: "Supervisor is checking the evidence",
    supervisor_reviewing_report: "Supervisor is reviewing the report",
    waiting_for_planner: "Waiting for the planner",
    completed: "Dossier complete",
    background_execution_failed: "Background run failed",
  };
  return labels[value] || formatStatus(value);
}

export default App;
