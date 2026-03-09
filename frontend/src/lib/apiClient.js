const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const DEFAULT_TIMEOUT_MS = 12000;
const GET_INFLIGHT = new Map();
const MUTATION_INFLIGHT = new Map();

function buildRequestUrl(path) {
  return `${API_BASE}${path}`;
}

function toMethod(options = {}) {
  return String(options.method || "GET").toUpperCase();
}

function normalizeBody(body) {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return "";
  try {
    return JSON.stringify(body);
  } catch {
    return "";
  }
}

function buildMutationKey(path, options = {}) {
  const method = toMethod(options);
  const body = normalizeBody(options.body);
  return `${method}:${path}:${body}`;
}

function buildIdempotencyKey(path, options = {}) {
  const key = buildMutationKey(path, options);
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return `${Date.now().toString(36)}-${Math.abs(hash).toString(36)}`;
}

function withTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timeout")), timeoutMs);
  return { controller, timer };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function executeRequest(path, options = {}) {
  const method = toMethod(options);
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const { controller, timer } = withTimeoutController(timeoutMs);

  try {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (method !== "GET" && method !== "HEAD" && !headers["X-Idempotency-Key"]) {
      headers["X-Idempotency-Key"] = buildIdempotencyKey(path, options);
    }

    const response = await fetch(buildRequestUrl(path), {
      ...options,
      method,
      headers,
      signal: controller.signal
    });

    const payload = await parseResponse(response);
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.message || `Request failed (${response.status})`);
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiRequest(path, options = {}) {
  const method = toMethod(options);

  if (method === "GET") {
    const key = `${method}:${path}`;
    const current = GET_INFLIGHT.get(key);
    if (current) return current;
    const p = executeRequest(path, options).finally(() => {
      GET_INFLIGHT.delete(key);
    });
    GET_INFLIGHT.set(key, p);
    return p;
  }

  const mutationKey = buildMutationKey(path, options);
  const pending = MUTATION_INFLIGHT.get(mutationKey);
  if (pending) return pending;

  const p = executeRequest(path, options).finally(() => {
    MUTATION_INFLIGHT.delete(mutationKey);
  });
  MUTATION_INFLIGHT.set(mutationKey, p);
  return p;
}

