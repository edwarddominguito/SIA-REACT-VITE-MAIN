import { createEntityId } from "./input.js";
import { safeArray, saveArray } from "../services/storageService.js";
import { apiRequest } from "../api/client.js";

const normalizeNotificationUsername = (value) => String(value || "").trim();
const normalizeNotificationType = (value) => String(value || "").trim().toLowerCase();
const normalizeNotificationMeta = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

export function notificationsForUser(username, notifications = safeArray("allNotifications")) {
  const normalizedUsername = normalizeNotificationUsername(username);
  if (!normalizedUsername) return [];
  const list = Array.isArray(notifications) ? notifications : [];
  return list.filter((notification) => normalizeNotificationUsername(notification?.to) === normalizedUsername);
}

export function unreadNotificationCount(notifications = []) {
  const list = Array.isArray(notifications) ? notifications : [];
  return list.filter((notification) => !notification?.readAt).length;
}

export function markNotificationsRead(notifications, username, readAt = new Date().toISOString()) {
  const normalizedUsername = normalizeNotificationUsername(username);
  const list = Array.isArray(notifications) ? notifications : [];
  if (!normalizedUsername) return list;

  return list.map((notification) => {
    if (normalizeNotificationUsername(notification?.to) !== normalizedUsername) return notification;
    return notification?.readAt ? notification : { ...notification, readAt };
  });
}

export function markNotificationReadById(notifications, notificationId, readAt = new Date().toISOString()) {
  const normalizedId = String(notificationId || "").trim();
  const list = Array.isArray(notifications) ? notifications : [];
  if (!normalizedId) return list;

  return list.map((notification) => {
    if (String(notification?.id || "").trim() !== normalizedId) return notification;
    return notification?.readAt ? notification : { ...notification, readAt };
  });
}

export async function markNotificationsAsReadForUser(username) {
  const normalizedUsername = normalizeNotificationUsername(username);
  if (!normalizedUsername) return [];
  const current = safeArray("allNotifications");
  const unreadIds = current
    .filter((notification) => normalizeNotificationUsername(notification?.to) === normalizedUsername && !notification?.readAt)
    .map((notification) => String(notification.id || "").trim())
    .filter(Boolean);

  if (!unreadIds.length) return [];
  const next = markNotificationsRead(current, normalizedUsername);
  saveArray("allNotifications", next);
  await Promise.all(
    unreadIds.map((id) =>
      apiRequest(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => null)
    )
  );
  return unreadIds;
}

export async function markNotificationAsRead(notificationId) {
  const normalizedId = String(notificationId || "").trim();
  if (!normalizedId) return false;

  const current = safeArray("allNotifications");
  const target = current.find((notification) => String(notification?.id || "").trim() === normalizedId);
  if (!target) return false;
  if (!target?.readAt) {
    const next = markNotificationReadById(current, normalizedId);
    saveArray("allNotifications", next);
  }
  await apiRequest(`/api/notifications/${normalizedId}/read`, { method: "PATCH" }).catch(() => null);
  return true;
}

export function messageContactFromNotification(notification) {
  const type = normalizeNotificationType(notification?.type);
  const meta = normalizeNotificationMeta(notification?.meta);
  const source = normalizeNotificationType(meta?.source);
  if (type !== "message" && source !== "message") return "";
  return normalizeNotificationUsername(meta?.contactUsername || meta?.contact || meta?.username);
}

export function messageNavigationFromNotification(role, notification) {
  const contact = messageContactFromNotification(notification);
  if (!contact) return null;

  const normalizedRole = normalizeNotificationType(role);
  if (normalizedRole === "admin") {
    return { pathname: "/admin", state: { tab: "messages", messageContact: contact } };
  }
  if (normalizedRole === "agent") {
    return { pathname: "/agent", state: { section: "messages", messageContact: contact } };
  }
  return { pathname: "/customer/messages", state: { messageContact: contact } };
}

export function pushNotification(payload) {
  const to = normalizeNotificationUsername(payload?.to);
  if (!to) return null;

  const notification = {
    id: createEntityId("NTF"),
    to,
    type: String(payload?.type || "general"),
    title: String(payload?.title || "Notification"),
    message: String(payload?.message || "").trim(),
    appointmentId: payload?.appointmentId || "",
    officeMeetId: payload?.officeMeetId || payload?.meetId || "",
    meta: payload?.meta || {},
    createdAt: new Date().toISOString()
  };

  if (!notification.message) return null;

  const current = safeArray("allNotifications");
  const duplicate = current.find((item) => {
    if (!item || typeof item !== "object") return false;
    if (normalizeNotificationUsername(item.to) !== notification.to) return false;
    if (String(item.type || "") !== notification.type) return false;
    if (String(item.title || "") !== notification.title) return false;
    if (String(item.message || "").trim() !== notification.message) return false;
    if (String(item.appointmentId || "") !== String(notification.appointmentId || "")) return false;
    const previousTime = new Date(item.createdAt || 0).getTime();
    if (!Number.isFinite(previousTime) || previousTime <= 0) return false;
    return (Date.now() - previousTime) < 3000;
  });
  if (duplicate) {
    return duplicate;
  }
  saveArray("allNotifications", [notification, ...current]);
  apiRequest("/api/notifications", {
    method: "POST",
    body: JSON.stringify(notification)
  }).catch(() => {
    // Keep the local notification so the UI remains usable if the server is temporarily unavailable.
  });
  return notification;
}
