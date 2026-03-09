import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, safeArray, saveArray, subscribeKeys } from "../lib/storage.js";

function dashboardPathForRole(role) {
  if (role === "admin") return "/admin";
  if (role === "agent") return "/agent";
  return "/customer";
}

export default function Notifications() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const refresh = () => {
      const current = getCurrentUser();
      const username = String(current?.username || "").trim();
      const all = safeArray("allNotifications");
      const mine = all.filter((n) => String(n?.to || "").trim() === username);
      setNotifications(mine);
    };

    refresh();
    return subscribeKeys(["allNotifications", "currentUser"], refresh);
  }, []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n?.readAt).length, [notifications]);
  const backPath = dashboardPathForRole(user?.role);
  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(backPath || "/dashboard");
  };

  const markAllRead = () => {
    const username = String(getCurrentUser()?.username || "").trim();
    if (!username) return;
    const all = safeArray("allNotifications");
    const now = new Date().toISOString();
    const next = all.map((n) => {
      const to = String(n?.to || "").trim();
      if (to !== username) return n;
      return n?.readAt ? n : { ...n, readAt: now };
    });
    saveArray("allNotifications", next);
  };

  return (
    <div className="notifications-page">
      <div className="notifications-wrap">
        <div className="notifications-head">
          <div>
            <h1>All Notifications</h1>
            <p>Signed in as @{user?.username || "-"}</p>
          </div>
          <div className="notifications-actions">
            <span className="badge badge-soft">{unreadCount} unread</span>
            <button type="button" className="btn btn-outline-dark btn-sm" onClick={markAllRead} disabled={!unreadCount}>
              Mark all read
            </button>
            <button type="button" className="btn btn-dark btn-sm" onClick={goBack}>Back</button>
          </div>
        </div>

        <section className="notifications-list">
          {notifications.map((item) => (
            <article key={item.id} className={`notifications-item ${item.readAt ? "" : "unread"}`}>
              <div className="notifications-item-icon">
                <i className={`bi ${item.readAt ? "bi-bell" : "bi-bell-fill"}`}></i>
              </div>
              <div>
                <div className="notifications-item-title">{item.title || "Notification"}</div>
                <div className="notifications-item-message">{item.message || "-"}</div>
                <div className="notifications-item-meta">
                  {item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}
                </div>
              </div>
            </article>
          ))}
          {!notifications.length && (
            <div className="dashboard-notif-empty">
              <i className="bi bi-bell-slash"></i>
              <p>No notifications yet.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
