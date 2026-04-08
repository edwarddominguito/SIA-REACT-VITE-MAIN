import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, safeArray, subscribeKeys } from "@/services/storageService.js";
import {
  markNotificationAsRead,
  markNotificationsAsReadForUser,
  messageNavigationFromNotification,
  notificationsForUser,
  unreadNotificationCount
} from "@/utils/notifications.js";

function dashboardPathForRole(role) {
  if (role === "admin") return "/admin";
  if (role === "agent") return "/agent";
  return "/customer/dashboard";
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
      setNotifications(notificationsForUser(username, all));
    };

    refresh();
    return subscribeKeys(["allNotifications", "currentUser"], refresh);
  }, []);

  const unreadCount = useMemo(() => unreadNotificationCount(notifications), [notifications]);
  const backPath = dashboardPathForRole(user?.role);
  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(backPath || "/dashboard");
  };

  const markAllRead = async () => {
    const username = String(getCurrentUser()?.username || "").trim();
    if (!username) return;
    await markNotificationsAsReadForUser(username);
  };

  const handleNotificationClick = (notification) => {
    const target = messageNavigationFromNotification(user?.role, notification);
    if (!target) return;
    void markNotificationAsRead(notification?.id);
    navigate(target.pathname, { state: target.state });
  };

  const handleNotificationKeyDown = (event, notification) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = messageNavigationFromNotification(user?.role, notification);
    if (!target) return;
    event.preventDefault();
    handleNotificationClick(notification);
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
          {notifications.map((item) => {
            const messageTarget = messageNavigationFromNotification(user?.role, item);
            const isClickable = Boolean(messageTarget);
            return (
              <article
                key={item.id}
                className={`notifications-item ${item.readAt ? "" : "unread"}${isClickable ? " is-clickable" : ""}`}
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={isClickable ? () => handleNotificationClick(item) : undefined}
                onKeyDown={isClickable ? (event) => handleNotificationKeyDown(event, item) : undefined}
              >
                <div className="notifications-item-icon">
                  <i className={`bi ${item.readAt ? "bi-bell" : "bi-bell-fill"}`}></i>
                </div>
                <div>
                  <div className="notifications-item-title">{item.title || "Notification"}</div>
                  <div className="notifications-item-message">{item.message || "-"}</div>
                  <div className="notifications-item-meta">
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}
                  </div>
                  {isClickable ? <div className="notifications-item-action">Open conversation</div> : null}
                </div>
              </article>
            );
          })}
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
