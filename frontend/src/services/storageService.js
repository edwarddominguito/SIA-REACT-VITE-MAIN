import { apiRequest } from "../api/client.js";
import { dateOnlyValue, tripAttendees } from "../utils/domain.js";
import { cleanUsername } from "../utils/input.js";
import { CURRENT_USER_KEY, SESSION_SCOPED_DATA_KEYS, SYNC_KEYS, USER_ROLES } from "../data/constants.js";
import { DEMO_USERS } from "../data/mockData.js";

const USER_ROLE_SET = new Set(USER_ROLES);
const SESSION_SCOPED_KEY_SET = new Set(SESSION_SCOPED_DATA_KEYS);
let desiredSyncContextKey = "";
let completedSyncContextKey = "";
let bootstrapSyncPromise = null;

function hasWindow() {
  return typeof window !== "undefined";
}

function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeTimeValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return raw;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return raw;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeDateTimeRecord(key, item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  if (key !== "allAppointments" && key !== "officeMeets" && key !== "allTrips") return item;

  const normalizedDate = dateOnlyValue(item.date);
  const normalizedTime = normalizeTimeValue(item.time);
  const next = {
    ...item,
    date: normalizedDate,
    time: normalizedTime
  };

  if (key === "allTrips") {
    const attendees = Array.isArray(item.attendees)
      ? item.attendees
      : Array.isArray(item.members)
        ? item.members
        : item.customer
          ? [item.customer]
          : [];
    next.attendees = Array.from(new Set(attendees.map((entry) => String(entry || "").trim()).filter(Boolean)));
    if (!next.customer && next.attendees[0]) {
      next.customer = next.attendees[0];
    }
  }

  return next;
}

function normalizeSegmentData(key, list) {
  const items = Array.isArray(list) ? list : [];
  return items
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => normalizeDateTimeRecord(key, item));
}

function readStorageValue(key) {
  if (!hasWindow() || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key, value) {
  if (!hasWindow() || !window.localStorage) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorageValue(key) {
  if (!hasWindow() || !window.localStorage) return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function readSessionValue(key) {
  if (!hasWindow() || !window.sessionStorage) return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionValue(key, value) {
  if (!hasWindow() || !window.sessionStorage) return false;
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeSessionValue(key) {
  if (!hasWindow() || !window.sessionStorage) return false;
  try {
    window.sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function readScopedDataValue(key) {
  const normalizedKey = String(key || "").trim();
  if (!SESSION_SCOPED_KEY_SET.has(normalizedKey)) {
    return readStorageValue(normalizedKey);
  }

  const sessionValue = readSessionValue(normalizedKey);
  if (sessionValue !== null) return sessionValue;

  const legacyLocalValue = readStorageValue(normalizedKey);
  if (legacyLocalValue !== null) {
    writeSessionValue(normalizedKey, legacyLocalValue);
    removeStorageValue(normalizedKey);
  }
  return legacyLocalValue;
}

function writeScopedDataValue(key, value) {
  const normalizedKey = String(key || "").trim();
  if (!SESSION_SCOPED_KEY_SET.has(normalizedKey)) {
    return writeStorageValue(normalizedKey, value);
  }

  const written = writeSessionValue(normalizedKey, value);
  if (written) {
    removeStorageValue(normalizedKey);
  }
  return written;
}

function removeScopedDataValue(key) {
  const normalizedKey = String(key || "").trim();
  if (!SESSION_SCOPED_KEY_SET.has(normalizedKey)) {
    return removeStorageValue(normalizedKey);
  }
  const removedSession = removeSessionValue(normalizedKey);
  const removedLegacy = removeStorageValue(normalizedKey);
  return removedSession || removedLegacy;
}

function clearScopedDataCache() {
  SYNC_KEYS.forEach((key) => {
    removeScopedDataValue(key);
  });
}

function normalizeStoredUser(userLike) {
  if (!userLike || typeof userLike !== "object") return null;
  const username = String(userLike.username || "").trim();
  const role = String(userLike.role || "").trim().toLowerCase();
  if (!username || !USER_ROLE_SET.has(role)) return null;
  return {
    id: userLike.id ?? "",
    username,
    role,
    fullName: String(userLike.fullName || "").trim(),
    phone: String(userLike.phone || "").trim(),
    email: String(userLike.email || "").trim(),
    photoUrl: String(userLike.photoUrl || "").trim()
  };
}

function readCurrentUserFromStorage() {
  const sessionUser = normalizeStoredUser(safeJsonParse(readSessionValue(CURRENT_USER_KEY), null));
  if (sessionUser) return sessionUser;

  const legacyLocalUser = normalizeStoredUser(safeJsonParse(readStorageValue(CURRENT_USER_KEY), null));
  if (legacyLocalUser) {
    writeSessionValue(CURRENT_USER_KEY, JSON.stringify(legacyLocalUser));
    removeStorageValue(CURRENT_USER_KEY);
  }
  return legacyLocalUser;
}

function getSyncContextKey() {
  const currentUser = readCurrentUserFromStorage();
  return currentUser ? `${currentUser.role}:${currentUser.username}` : "guest";
}

function cleanRole(value) {
  return String(value || "").trim().toLowerCase();
}

function scopeUsers(list, currentUser) {
  const users = Array.isArray(list) ? list : [];
  if (!currentUser) return [];
  if (currentUser.role === "admin") return users;
  if (currentUser.role === "agent") {
    return users.filter((user) => {
      const role = cleanRole(user?.role);
      const username = cleanUsername(user?.username);
      return username === currentUser.username || role === "customer";
    });
  }
  return users.filter((user) => {
    const role = cleanRole(user?.role);
    const username = cleanUsername(user?.username);
    return username === currentUser.username || role === "admin" || role === "agent";
  });
}

function scopeProperties(list, currentUser) {
  const properties = Array.isArray(list) ? list : [];
  if (!currentUser) return properties;
  if (currentUser.role === "admin" || currentUser.role === "customer") return properties;
  return properties.filter((property) => cleanUsername(property?.agent) === currentUser.username);
}

function scopeAppointments(list, currentUser) {
  const appointments = Array.isArray(list) ? list : [];
  if (!currentUser) return [];
  if (currentUser.role === "admin") return appointments;
  if (currentUser.role === "agent") {
    return appointments.filter((appointment) => {
      const assignedAgent = cleanUsername(appointment?.assignedAgent || appointment?.agent);
      const propertyAgent = cleanUsername(appointment?.agent);
      return assignedAgent === currentUser.username || propertyAgent === currentUser.username;
    });
  }
  return appointments.filter((appointment) => cleanUsername(appointment?.customer) === currentUser.username);
}

function scopeOfficeMeets(list, currentUser) {
  const officeMeets = Array.isArray(list) ? list : [];
  if (!currentUser) return [];
  if (currentUser.role === "admin") return officeMeets;
  if (currentUser.role === "agent") {
    return officeMeets.filter((meet) => cleanUsername(meet?.assignedAgent || meet?.agent) === currentUser.username);
  }
  return officeMeets.filter((meet) => cleanUsername(meet?.customer || meet?.requestedBy) === currentUser.username);
}

function scopeTrips(list, currentUser) {
  const trips = Array.isArray(list) ? list : [];
  if (!currentUser) return [];
  if (currentUser.role === "admin") return trips;
  if (currentUser.role === "agent") {
    return trips.filter((trip) => cleanUsername(trip?.agent || trip?.createdBy) === currentUser.username);
  }
  return trips.filter((trip) => tripAttendees(trip).includes(currentUser.username));
}

function scopeReviews(list, currentUser) {
  const reviews = Array.isArray(list) ? list : [];
  if (!currentUser) return [];
  if (currentUser.role === "admin") return reviews;
  if (currentUser.role === "agent") {
    return reviews.filter((review) => cleanUsername(review?.agent) === currentUser.username);
  }
  return reviews.filter((review) => cleanUsername(review?.customer) === currentUser.username);
}

function scopeNotifications(list, currentUser) {
  const notifications = Array.isArray(list) ? list : [];
  if (!currentUser) return [];
  return notifications.filter((notification) => cleanUsername(notification?.to) === currentUser.username);
}

function scopeSegment(key, list, currentUser, options = {}) {
  const items = Array.isArray(list) ? list : [];
  if (key === "allUsers") return scopeUsers(items, currentUser);
  if (key === "allProperties") return scopeProperties(items, currentUser);
  if (key === "allAppointments") return scopeAppointments(items, currentUser);
  if (key === "officeMeets") return scopeOfficeMeets(items, currentUser);
  if (key === "allTrips") return scopeTrips(items, currentUser);
  if (key === "allReviews") return scopeReviews(items, currentUser);
  if (key === "allNotifications") {
    return options.keepOutgoingNotifications && currentUser ? items : scopeNotifications(items, currentUser);
  }
  return items;
}

function scopeStatePayload(payload = {}, currentUser, options = {}) {
  const next = {};
  SYNC_KEYS.forEach((key) => {
    next[key] = scopeSegment(key, payload[key], currentUser, options);
  });
  return next;
}

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
  const data = safeJsonParse(readScopedDataValue(key), []);
  return normalizeSegmentData(key, data);
}

export function emitStorageUpdate(key) {
  try {
    window.dispatchEvent(new CustomEvent("ls:update", { detail: { key } }));
  } catch {
    // ignore
  }
}

function setArraySilently(key, arr) {
  return writeScopedDataValue(key, JSON.stringify(normalizeSegmentData(key, arr)));
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

export function saveArray(key, arr) {
  const normalized = normalizeSegmentData(key, arr);
  const next = JSON.stringify(normalized);
  const previous = readScopedDataValue(key);
  if (previous === next) return;
  if (!writeScopedDataValue(key, next)) return;
  emitStorageUpdate(key);
}

function getLocalStatePayload() {
  const currentUser = readCurrentUserFromStorage();
  const rawPayload = {
    allUsers: safeArray("allUsers"),
    allProperties: safeArray("allProperties"),
    allAppointments: safeArray("allAppointments"),
    officeMeets: safeArray("officeMeets"),
    allReviews: safeArray("allReviews"),
    allNotifications: safeArray("allNotifications"),
    allTrips: safeArray("allTrips")
  };
  return scopeStatePayload(rawPayload, currentUser);
}

function hasAnyData(payload) {
  return SYNC_KEYS.some((k) => Array.isArray(payload[k]) && payload[k].length > 0);
}

function applyStateToLocal(payload = {}) {
  SYNC_KEYS.forEach((k) => {
    if (!Array.isArray(payload[k])) return;
    setArraySilently(k, payload[k]);
    emitStorageUpdate(k);
  });
}

export function seedDefaultData() {
  SYNC_KEYS.forEach((key) => {
    if (!readScopedDataValue(key)) {
      setArraySilently(key, []);
    }
  });
}

async function bootstrapStateForCurrentContext() {
  const currentUser = readCurrentUserFromStorage();
  const localPayload = getLocalStatePayload();
  applyStateToLocal(localPayload);

  const server = await apiRequest("/api/state", { method: "GET" });
  const serverData = scopeStatePayload(server?.data || {}, currentUser);
  if (hasAnyData(serverData)) applyStateToLocal(serverData);
}

export async function startApiSync(force = false) {
  const contextKey = getSyncContextKey();
  desiredSyncContextKey = contextKey;

  if (!force && !bootstrapSyncPromise && completedSyncContextKey === contextKey) {
    return;
  }
  if (bootstrapSyncPromise) {
    return bootstrapSyncPromise;
  }

  let currentPromise = null;
  currentPromise = bootstrapStateForCurrentContext()
    .catch(() => {
      // Keep current local cache if the server is unavailable.
    })
    .finally(() => {
      completedSyncContextKey = contextKey;
      if (bootstrapSyncPromise === currentPromise) {
        bootstrapSyncPromise = null;
      }
      if (desiredSyncContextKey !== completedSyncContextKey) {
        startApiSync(true).catch(() => {});
      }
    });

  bootstrapSyncPromise = currentPromise;
  return currentPromise;
}

export function getCurrentUser() {
  const normalized = readCurrentUserFromStorage();
  if (!normalized) {
    removeSessionValue(CURRENT_USER_KEY);
    removeStorageValue(CURRENT_USER_KEY);
  }
  return normalized;
}
export function setCurrentUser(user) {
  const normalized = normalizeStoredUser(user);
  if (!normalized) {
    clearCurrentUser();
    return;
  }
  const next = JSON.stringify(normalized);
  const previous = readSessionValue(CURRENT_USER_KEY);
  if (previous === next) return;
  const previousUser = normalizeStoredUser(safeJsonParse(previous, null));
  if (previousUser && `${previousUser.role}:${previousUser.username}` !== `${normalized.role}:${normalized.username}`) {
    clearScopedDataCache();
  }
  if (!writeSessionValue(CURRENT_USER_KEY, next)) return;
  removeStorageValue(CURRENT_USER_KEY);
  emitStorageUpdate(CURRENT_USER_KEY);
  startApiSync(true).catch(() => {});
}
export function clearCurrentUser() {
  const removedSession = removeSessionValue(CURRENT_USER_KEY);
  const removedLegacy = removeStorageValue(CURRENT_USER_KEY);
  clearScopedDataCache();
  if (!removedSession && !removedLegacy) return;
  emitStorageUpdate(CURRENT_USER_KEY);
  applyStateToLocal(getLocalStatePayload());
  startApiSync(true).catch(() => {});
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
  if (typeof window === "undefined") {
    return () => {};
  }
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
