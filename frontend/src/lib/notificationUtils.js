import { createEntityId } from "./inputUtils.js";
import { safeArray, saveArray } from "./storage.js";

export function pushNotification(payload) {
  const to = String(payload?.to || "").trim();
  if (!to) return null;

  const notification = {
    id: createEntityId("NTF"),
    to,
    type: String(payload?.type || "general"),
    title: String(payload?.title || "Notification"),
    message: String(payload?.message || "").trim(),
    appointmentId: payload?.appointmentId || "",
    meta: payload?.meta || {},
    createdAt: new Date().toISOString()
  };

  if (!notification.message) return null;

  const current = safeArray("allNotifications");
  saveArray("allNotifications", [notification, ...current]);
  return notification;
}
