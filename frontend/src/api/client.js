import appConfig from "../config/appConfig.js";

const API_BASE = appConfig.apiBaseUrl;
const DEFAULT_TIMEOUT_MS = 12000;
const GET_INFLIGHT = new Map();
const MUTATION_INFLIGHT = new Map();

class ApiError extends Error {
  constructor(message, { status = 0, code = "request_failed", requestId = "", cause = null, data = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.cause = cause;
    this.data = data;
  }
}

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

function getStoredCurrentUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem("currentUser") || window.localStorage?.getItem("currentUser");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const role = String(parsed?.role || "").trim().toLowerCase();
    const username = String(parsed?.username || "").trim();
    if (!username || !["admin", "agent", "customer"].includes(role)) return null;
    return { username, role };
  } catch {
    return null;
  }
}

function createRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildGetKey(path, options = {}) {
  const user = getStoredCurrentUser();
  const userKey = user ? `${user.role}:${user.username}` : "guest";
  return `${toMethod(options)}:${path}:${userKey}`;
}

function buildMutationKey(path, options = {}) {
  const method = toMethod(options);
  const body = normalizeBody(options.body);
  const user = getStoredCurrentUser();
  const userKey = user ? `${user.role}:${user.username}` : "guest";
  return `${method}:${path}:${userKey}:${body}`;
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
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timer };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function executeRequest(path, options = {}) {
  const method = toMethod(options);
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const { controller, timer } = withTimeoutController(timeoutMs);

  try {
    const currentUser = getStoredCurrentUser();
    const requestId = createRequestId();
    const headers = {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    };

    if (currentUser && !options.skipAuthHeaders) {
      headers["X-User-Role"] = headers["X-User-Role"] || currentUser.role;
      headers["X-User-Username"] = headers["X-User-Username"] || currentUser.username;
    }
    headers["X-Request-Id"] = headers["X-Request-Id"] || requestId;

    if (method !== "GET" && method !== "HEAD" && !headers["X-Idempotency-Key"]) {
      headers["X-Idempotency-Key"] = buildIdempotencyKey(path, options);
    }

    let response;
    try {
      response = await fetch(buildRequestUrl(path), {
        ...options,
        method,
        headers,
        signal: controller.signal
      });
    } catch (error) {
      const message = controller.signal.aborted
        ? "Request timed out. Please try again."
        : "Unable to reach the server right now.";
      throw new ApiError(message, {
        status: 0,
        code: controller.signal.aborted ? "timeout" : "network_error",
        requestId,
        cause: error,
        data: null
      });
    }

    const payload = await parseResponse(response);
    if (!response.ok || payload?.ok === false) {
      throw new ApiError(payload?.message || `Request failed (${response.status})`, {
        status: response.status,
        code: payload?.code || "http_error",
        requestId: payload?.requestId || requestId,
        data: payload?.data ?? null
      });
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function createStreamResponse(path, options = {}) {
  const currentUser = getStoredCurrentUser();
  const requestId = createRequestId();
  const headers = {
    Accept: "text/event-stream",
    ...(options.headers || {})
  };

  if (currentUser && !options.skipAuthHeaders) {
    headers["X-User-Role"] = headers["X-User-Role"] || currentUser.role;
    headers["X-User-Username"] = headers["X-User-Username"] || currentUser.username;
  }
  headers["X-Request-Id"] = headers["X-Request-Id"] || requestId;

  let response;
  try {
    response = await fetch(buildRequestUrl(path), {
      ...options,
      method: "GET",
      headers,
      cache: "no-store",
      signal: options.signal
    });
  } catch (error) {
    throw new ApiError("Unable to reach the server right now.", {
      status: 0,
      code: "network_error",
      requestId,
      cause: error,
      data: null
    });
  }

  if (!response.ok) {
    const payload = await parseResponse(response);
    throw new ApiError(payload?.message || `Request failed (${response.status})`, {
      status: response.status,
      code: payload?.code || "http_error",
      requestId: payload?.requestId || requestId,
      data: payload?.data ?? null
    });
  }

  if (!response.body) {
    throw new ApiError("Streaming is not supported by this browser.", {
      status: response.status,
      code: "stream_unsupported",
      requestId,
      data: null
    });
  }

  return response;
}

function parseSseBlock(block) {
  const normalized = String(block || "");
  if (!normalized.trim()) return null;
  let event = "message";
  const dataLines = [];

  normalized.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith(":")) return;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || "message";
      return;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  });

  if (!dataLines.length) return { event, data: null };
  const rawData = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(rawData) };
  } catch {
    return { event, data: rawData };
  }
}

export async function streamRequest(path, { signal, headers, onEvent } = {}) {
  const response = await createStreamResponse(path, { signal, headers });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";
      for (const block of blocks) {
        const parsed = parseSseBlock(block);
        if (parsed && typeof onEvent === "function") {
          await onEvent(parsed);
        }
      }
    }

    buffer += decoder.decode();
    const trailing = parseSseBlock(buffer);
    if (trailing && typeof onEvent === "function") {
      await onEvent(trailing);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function apiRequest(path, options = {}) {
  const method = toMethod(options);

  if (method === "GET") {
    const key = buildGetKey(path, options);
    const current = GET_INFLIGHT.get(key);
    if (current) return current;

    const pending = executeRequest(path, options).finally(() => {
      GET_INFLIGHT.delete(key);
    });
    GET_INFLIGHT.set(key, pending);
    return pending;
  }

  const mutationKey = buildMutationKey(path, options);
  const pending = MUTATION_INFLIGHT.get(mutationKey);
  if (pending) return pending;

  const request = executeRequest(path, options).finally(() => {
    MUTATION_INFLIGHT.delete(mutationKey);
  });
  MUTATION_INFLIGHT.set(mutationKey, request);
  return request;
}
