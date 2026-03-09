import { apiRequest } from "./apiClient.js";

const SYNC_KEYS = ["allUsers", "allProperties", "allAppointments", "officeMeets", "allTrips", "allReviews", "allNotifications"];
const DEMO_USERS = [
  { id: 1, username: "admin", password: "admin123", role: "admin", fullName: "System Admin", phone: "09123456789", email: "admin@email.com", photoUrl: "" },
  { id: 2, username: "agent", password: "agent123", role: "agent", fullName: "Demo Agent", phone: "09999999999", email: "agent@email.com", photoUrl: "" },
  { id: 3, username: "customer", password: "customer123", role: "customer", fullName: "Demo Customer", phone: "09888888888", email: "customer@email.com", photoUrl: "" }
];
const keySet = new Set(SYNC_KEYS);
const pendingSyncKeys = new Set();
let syncTimer = null;
let syncInFlight = false;
let syncRetryNeeded = false;
let syncStarted = false;

function idKey(item) {
  const id = String(item?.id ?? "").trim();
  if (id) return `id:${id}`;
  return "";
}

function signatureKey(item, key) {
  if (key === "users") {
    return `u:${String(item?.username || "").trim().toLowerCase()}`;
  }
  if (key === "tripProperties") {
    return `${String(item?.tripId || "")}:${String(item?.propertyId || "")}:${String(item?.stopOrder || "")}`;
  }
  if (key === "appointments") {
    return `${String(item?.propertyId || "")}:${String(item?.customer || "")}:${String(item?.date || "")}:${String(item?.time || "")}`;
  }
  if (key === "notifications") {
    return `${String(item?.to || "")}:${String(item?.type || "")}:${String(item?.title || "")}:${String(item?.message || "")}:${String(item?.createdAt || "")}`;
  }
  return "";
}

function mergeUnique(localList, serverList, keyHint = "") {
  const out = [];
  const seen = new Set();
  const put = (item) => {
    if (!item || typeof item !== "object") return;
    const k = idKey(item) || signatureKey(item, keyHint) || JSON.stringify(item);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(item);
  };
  (Array.isArray(serverList) ? serverList : []).forEach(put);
  (Array.isArray(localList) ? localList : []).forEach(put);
  return out;
}

export function safeArray(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function emitStorageUpdate(key) {
  try {
    window.dispatchEvent(new CustomEvent("ls:update", { detail: { key } }));
  } catch {
    // ignore
  }
}

function setArraySilently(key, arr) {
  localStorage.setItem(key, JSON.stringify(Array.isArray(arr) ? arr : []));
}

function withDemoUsers(users) {
  const list = Array.isArray(users) ? users : [];
  const map = new Map();
  list.forEach((u) => {
    const username = String(u?.username || "").trim().toLowerCase();
    if (!username) return;
    const existing = map.get(username);
    if (!existing) {
      map.set(username, u);
      return;
    }
    const existingIsDemo = /^demo_/i.test(String(existing?.id || ""));
    const incomingIsDemo = /^demo_/i.test(String(u?.id || ""));
    if (existingIsDemo && !incomingIsDemo) {
      map.set(username, u);
    }
  });
  const deduped = Array.from(map.values());
  const existing = new Set(deduped.map((u) => String(u?.username || "").trim().toLowerCase()));
  const missing = DEMO_USERS.filter((u) => !existing.has(u.username.toLowerCase()));
  return missing.length ? [...deduped, ...missing] : deduped;
}

function buildPartialPayload(keys) {
  const expanded = new Set(keys);
  if (expanded.has("allReviews")) {
    expanded.add("allAppointments");
    expanded.add("allProperties");
    expanded.add("allUsers");
  }
  if (expanded.has("allAppointments")) {
    expanded.add("allProperties");
    expanded.add("allUsers");
  }
  if (expanded.has("officeMeets")) {
    expanded.add("allUsers");
  }
  if (expanded.has("allTrips")) {
    expanded.add("allProperties");
    expanded.add("allUsers");
  }
  if (expanded.has("allNotifications")) {
    expanded.add("allAppointments");
    expanded.add("officeMeets");
    expanded.add("allUsers");
  }

  const payload = {};
  expanded.forEach((key) => {
    if (!keySet.has(key)) return;
    payload[key] = safeArray(key);
  });
  return payload;
}

async function syncPayloadToApi(payload) {
  try {
    await apiRequest("/api/state", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    return true;
  } catch {
    return false;
  }
}

async function flushSyncQueue() {
  if (!syncStarted) return;
  if (syncInFlight) {
    syncRetryNeeded = true;
    return;
  }

  if (!pendingSyncKeys.size) return;

  syncInFlight = true;
  const keys = Array.from(pendingSyncKeys);
  pendingSyncKeys.clear();

  const success = await syncPayloadToApi(buildPartialPayload(keys));
  syncInFlight = false;

  if (!success) {
    keys.forEach((key) => pendingSyncKeys.add(key));
    scheduleSync(2500);
    return;
  }

  if (syncRetryNeeded || pendingSyncKeys.size) {
    syncRetryNeeded = false;
    scheduleSync(450);
  }
}

function scheduleSync(delayMs = 900) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    flushSyncQueue();
  }, delayMs);
}

function queueSync(key) {
  if (!keySet.has(key)) return;
  pendingSyncKeys.add(key);
  if (syncStarted) scheduleSync(900);
}

export function saveArray(key, arr) {
  setArraySilently(key, arr);
  emitStorageUpdate(key);
  queueSync(key);
}

function getLocalStatePayload() {
  return {
    allUsers: withDemoUsers(safeArray("allUsers")),
    allProperties: safeArray("allProperties"),
    allAppointments: safeArray("allAppointments"),
    officeMeets: safeArray("officeMeets"),
    allReviews: safeArray("allReviews"),
    allNotifications: safeArray("allNotifications"),
    allTrips: safeArray("allTrips")
  };
}

function hasAnyData(payload) {
  return SYNC_KEYS.some((k) => Array.isArray(payload[k]) && payload[k].length > 0);
}

function applyStateToLocal(payload = {}) {
  SYNC_KEYS.forEach((k) => {
    if (!Array.isArray(payload[k])) return;
    const value = k === "allUsers" ? withDemoUsers(payload[k]) : payload[k];
    setArraySilently(k, value);
    emitStorageUpdate(k);
  });
}

export function seedDefaultData() {
  let users = safeArray("allUsers");
  const nextUsers = withDemoUsers(users);
  if (users.length === 0 || nextUsers.length !== users.length) {
    users = nextUsers;
    saveArray("allUsers", users);
  }

  let props = safeArray("allProperties");
  if (props.length === 0) {
    props = [
      { id: 101, title: "2BR Condo - Downtown", description: "Near mall, clean and modern condo.", price: 25000, location: "Davao City", agent: "agent", imageUrl: "" }
    ];
    saveArray("allProperties", props);
  }

  if (!localStorage.getItem("allAppointments")) saveArray("allAppointments", []);
  if (!localStorage.getItem("officeMeets")) saveArray("officeMeets", []);
  if (!localStorage.getItem("allTrips")) saveArray("allTrips", []);
  if (!localStorage.getItem("allReviews")) saveArray("allReviews", []);
  if (!localStorage.getItem("allNotifications")) saveArray("allNotifications", []);
}

export async function startApiSync() {
  if (syncStarted) return;
  syncStarted = true;

  try {
    const localPayload = getLocalStatePayload();
    const server = await apiRequest("/api/state", { method: "GET" });
    const serverData = server?.data || {};
    if (hasAnyData(serverData)) {
      const merged = {
        allUsers: withDemoUsers(mergeUnique(localPayload.allUsers, serverData.allUsers, "users")),
        allProperties: mergeUnique(localPayload.allProperties, serverData.allProperties, "properties"),
        allAppointments: mergeUnique(localPayload.allAppointments, serverData.allAppointments, "appointments"),
        officeMeets: mergeUnique(localPayload.officeMeets, serverData.officeMeets, "officeMeets"),
        allReviews: mergeUnique(localPayload.allReviews, serverData.allReviews, "reviews"),
        allNotifications: mergeUnique(localPayload.allNotifications, serverData.allNotifications, "notifications"),
        allTrips: mergeUnique(localPayload.allTrips, serverData.allTrips, "trips")
      };
      applyStateToLocal(merged);
      await apiRequest("/api/state", {
        method: "PUT",
        body: JSON.stringify(merged)
      });
      return;
    }

    if (hasAnyData(localPayload)) {
      await apiRequest("/api/state", {
        method: "PUT",
        body: JSON.stringify(localPayload)
      });
    }
  } catch {
    // local-only mode fallback
  }

  if (pendingSyncKeys.size) {
    scheduleSync(100);
  }
}

export function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem("currentUser")); } catch { return null; }
}
export function setCurrentUser(user) {
  localStorage.setItem("currentUser", JSON.stringify(user));
  emitStorageUpdate("currentUser");
}
export function clearCurrentUser() {
  localStorage.removeItem("currentUser");
  emitStorageUpdate("currentUser");
}

/**
 * Subscribe to updates for one or more keys.
 * Triggers for:
 * - Same-tab writes via saveArray/setCurrentUser (CustomEvent)
 * - Other-tab writes via native "storage" event
 * - Tab focus (useful after refresh/returning to tab)
 */
export function subscribeKeys(keys, onUpdate) {
  const set = new Set([].concat(keys || []));
  const handleCustom = (e) => {
    const k = e?.detail?.key;
    if (!k || set.has(k)) onUpdate(k);
  };
  const handleStorage = (e) => {
    const k = e?.key;
    if (!k || set.has(k)) onUpdate(k);
  };
  const handleFocus = () => onUpdate(null);

  window.addEventListener("ls:update", handleCustom);
  window.addEventListener("storage", handleStorage);
  window.addEventListener("focus", handleFocus);

  return () => {
    window.removeEventListener("ls:update", handleCustom);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("focus", handleFocus);
  };
}
