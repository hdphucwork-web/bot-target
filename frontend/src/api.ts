const API_BASE = "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API Error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Settings ──
export const getSettings = () => request<Record<string, unknown>>("/api/settings");
export const updateSettings = (data: Record<string, unknown>) =>
  request("/api/settings", { method: "PUT", body: JSON.stringify(data) });

// ── Tasks ──
export const getTasks = () => request<Record<string, unknown>[]>("/api/tasks");
export const createTask = (data: Record<string, unknown>) =>
  request("/api/tasks", { method: "POST", body: JSON.stringify(data) });
export const updateTask = (id: string, data: Record<string, unknown>) =>
  request(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteTask = (id: string) =>
  request(`/api/tasks/${id}`, { method: "DELETE" });
export const startTask = (id: string) =>
  request(`/api/tasks/${id}/start`, { method: "POST" });
export const stopTask = (id: string) =>
  request(`/api/tasks/${id}/stop`, { method: "POST" });
export const pauseTask = (id: string) =>
  request(`/api/tasks/${id}/pause`, { method: "POST" });
export const resumeTask = (id: string) =>
  request(`/api/tasks/${id}/resume`, { method: "POST" });
export const startAllTasks = () =>
  request("/api/tasks/start-all", { method: "POST" });
export const stopAllTasks = () =>
  request("/api/tasks/stop-all", { method: "POST" });

// ── Proxies ──
export const getProxies = () => request<Record<string, unknown>[]>("/api/proxies");
export const addProxy = (raw: string) =>
  request("/api/proxies", { method: "POST", body: JSON.stringify({ raw }) });
export const addProxiesBulk = (proxies: string[]) =>
  request("/api/proxies/bulk", { method: "POST", body: JSON.stringify({ proxies }) });
export const deleteProxy = (id: string) =>
  request(`/api/proxies/${id}`, { method: "DELETE" });
export const testProxy = (id: string) =>
  request(`/api/proxies/${id}/test`, { method: "POST" });
export const testAllProxies = () =>
  request("/api/proxies/test-all", { method: "POST" });

export const WS_URL = "ws://localhost:8000/ws";
