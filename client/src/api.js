const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const error = new Error(body?.error?.message || `Request failed with status ${response.status}`);
    error.code = body?.error?.code || "REQUEST_FAILED";
    error.details = body?.error?.details;
    throw error;
  }
  return body;
}

export const api = {
  health: () => request("/api/health"),
  createResearch: (payload) => request("/api/research", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  getJob: (jobId) => request(`/api/research/${jobId}`),
  getStatus: (jobId) => request(`/api/research/${jobId}/status`),
  getReport: (jobId) => request(`/api/research/${jobId}/report`),
  retry: (jobId) => request(`/api/research/${jobId}/retry`, { method: "POST" }),
  markdownUrl: (jobId) => `${API_BASE}/api/research/${jobId}/report/markdown`,
};
