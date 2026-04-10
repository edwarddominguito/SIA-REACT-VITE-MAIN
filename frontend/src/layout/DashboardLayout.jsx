import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { logout } from "@/services/authService.js";
import { getCurrentUser, safeArray, subscribeKeys } from "@/services/storageService.js";
import SidebarNav from "@/components/ui/SidebarNav.jsx";
import "@/pages/dashboard/dashboard.css";
import "@/pages/dashboard/dashboard-v2.css";
import {
  markNotificationAsRead,
  markNotificationsAsReadForUser,
  messageNavigationFromNotification,
  notificationsForUser,
  unreadNotificationCount
} from "@/utils/notifications.js";

const SIDEBAR_SECTION_PRESETS = {
  admin: [
    { id: "main", label: "Main Menu", itemIds: ["dashboard", "users", "properties"] },
    { id: "operations", label: "Operations", itemIds: ["appointments", "office-meets", "trips", "calendar", "messages"] },
    { id: "account", label: "Account", itemIds: ["reviews", "profile"] }
  ],
  agent: [
    { id: "main", label: "Main Menu", itemIds: ["dashboard", "properties"] },
    { id: "pipeline", label: "Client Pipeline", itemIds: ["appointments", "meets", "trips", "calendar", "messages"] },
    { id: "account", label: "Account", itemIds: ["reviews", "profile"] }
  ],
  customer: [
    { id: "main", label: "Main Menu", itemIds: ["dashboard", "browse", "appointments", "meets"] },
    { id: "planning", label: "Planning", itemIds: ["trips", "calendar", "messages"] },
    { id: "account", label: "Account", itemIds: ["reviews", "profile"] }
  ],
  default: [
    { id: "main", label: "Main Menu", itemIds: ["dashboard"] },
    { id: "account", label: "Account", itemIds: ["profile"] }
  ]
};

const buildSidebarSections = (role, navItems) => {
  const items = Array.isArray(navItems) ? navItems : [];
  if (!items.length) return [];

  const explicitSectioned = items.some((item) => String(item?.section || "").trim());
  if (explicitSectioned) {
    const grouped = [];
    items.forEach((item) => {
      const key = String(item?.section || "Menu").trim() || "Menu";
      let group = grouped.find((entry) => entry.id === key);
      if (!group) {
        group = { id: key, label: key, items: [] };
        grouped.push(group);
      }
      group.items.push(item);
    });
    return grouped.filter((group) => group.items.length);
  }

  const itemsById = new Map(items.map((item) => [item.id, item]));
  const preset = SIDEBAR_SECTION_PRESETS[role] || SIDEBAR_SECTION_PRESETS.default;
  const assigned = new Set();

  const sections = preset
    .map((section) => {
      const sectionItems = section.itemIds
        .map((id) => itemsById.get(id))
        .filter(Boolean);
      sectionItems.forEach((item) => assigned.add(item.id));
      return { id: section.id, label: section.label, items: sectionItems };
    })
    .filter((section) => section.items.length);

  const remaining = items.filter((item) => !assigned.has(item.id));
  if (remaining.length) {
    sections.push({ id: "more", label: "More", items: remaining });
  }

  return sections;
};

export default function DashboardLayout({
  suiteLabel,
  profileName,
  profileRole,
  role,
  navItems,
  activeTab,
  onTabChange,
  children
}) {
  const nav = useNavigate();
  const initial = (profileName || "U").charAt(0).toUpperCase();
  const sidebarStateKey = "dashboardSidebarCollapsed";
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(sidebarStateKey) === "1";
    } catch {
      return false;
    }
  });
  const [isSwitching, setIsSwitching] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [sidebarHint, setSidebarHint] = useState("");
  const [isDesktopViewport, setIsDesktopViewport] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 993
  );
  const switchTimerRef = useRef(null);
  const sidebarHintTimerRef = useRef(null);
  const user = getCurrentUser();

  useEffect(() => {
    return () => {
      if (switchTimerRef.current) {
        clearTimeout(switchTimerRef.current);
      }
      if (sidebarHintTimerRef.current) {
        clearTimeout(sidebarHintTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isNotifOpen && !isProfileOpen && !isLogoutConfirmOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsNotifOpen(false);
        setIsProfileOpen(false);
        setIsLogoutConfirmOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isNotifOpen, isProfileOpen, isLogoutConfirmOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncViewport = () => {
      setIsDesktopViewport(window.innerWidth >= 993);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.classList.add("dashboard-v2-portal-theme");

    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";

    return () => {
      document.body.classList.remove("dashboard-v2-portal-theme");
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(sidebarStateKey, isSidebarCollapsed ? "1" : "0");
    } catch {
      // ignore storage failures
    }
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const refreshNotifications = () => {
      const current = getCurrentUser();
      const username = String(current?.username || "").trim();
      const all = safeArray("allNotifications");
      setNotifications(notificationsForUser(username, all));
    };

    refreshNotifications();
    return subscribeKeys(["allNotifications", "currentUser"], refreshNotifications);
  }, []);

  const handleTabChange = (id) => {
    if (activeTab !== id) {
      setIsSwitching(true);
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
      switchTimerRef.current = setTimeout(() => {
        setIsSwitching(false);
      }, 170);
    }
    onTabChange(id);
    setIsNavOpen(false);
    setIsNotifOpen(false);
    setIsProfileOpen(false);
  };

  const unreadCount = unreadNotificationCount(notifications);
  const visibleNotifications = notifications.slice(0, 8);
  const profileInitials = String(profileName || user?.username || "U")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || initial;

  const markAllNotificationsRead = async () => {
    const username = String(getCurrentUser()?.username || "").trim();
    if (!username) return;
    await markNotificationsAsReadForUser(username);
  };

  const closeFloatingPanels = () => {
    setIsNotifOpen(false);
    setIsProfileOpen(false);
  };

  const handleNotificationClick = (notification) => {
    const target = messageNavigationFromNotification(role || user?.role, notification);
    if (!target) return;
    void markNotificationAsRead(notification?.id);
    closeFloatingPanels();
    nav(target.pathname, { state: target.state });
  };

  const handleNotificationKeyDown = (event, notification) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = messageNavigationFromNotification(role || user?.role, notification);
    if (!target) return;
    event.preventDefault();
    handleNotificationClick(notification);
  };

  const closeLogoutConfirm = () => {
    setIsLogoutConfirmOpen(false);
  };

  const handleSidebarToggle = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      setSidebarHint(next ? "Sidebar closed" : "Sidebar opened");
      if (sidebarHintTimerRef.current) clearTimeout(sidebarHintTimerRef.current);
      sidebarHintTimerRef.current = setTimeout(() => {
        setSidebarHint("");
      }, 700);
      return next;
    });
  };

  const handleNotificationsToggle = () => {
    setIsProfileOpen(false);
    setIsNotifOpen((prev) => !prev);
  };

  const handleProfileToggle = () => {
    setIsNotifOpen(false);
    setIsProfileOpen((prev) => !prev);
  };

  const requestLogout = () => {
    setIsNavOpen(false);
    closeFloatingPanels();
    setIsLogoutConfirmOpen(true);
  };

  const handleLogout = () => {
    setIsLogoutConfirmOpen(false);
    logout();
    nav("/login");
  };

  const desktopSidebarWidth = isSidebarCollapsed ? 92 : 270;
  const layoutInlineStyle = isDesktopViewport
    ? {
        "--sidebar-width": `${desktopSidebarWidth}px`,
        display: "block",
        minHeight: "100vh"
      }
    : undefined;
  const sidebarInlineStyle = undefined;
  const mainInlineStyle = isDesktopViewport
    ? {
        width: "auto",
        maxWidth: "none",
        minHeight: "100vh",
        margin: 0
      }
    : undefined;

  const shortcutPriority = ["dashboard", "browse", "properties", "appointments", "meets", "trips", "calendar", "reviews", "profile"];
  const shortcutItems = shortcutPriority
    .map((id) => navItems.find((item) => item.id === id))
    .filter((item, index, arr) => item && arr.findIndex((entry) => entry?.id === item.id) === index)
    .slice(0, 6);
  const sidebarSections = buildSidebarSections(role, navItems);
  const roleLabel = String(profileRole || role || "account")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
  const headerActions = (
    <>
      <button
        type="button"
        className={`dashboard-notif-backdrop ${isNotifOpen || isProfileOpen ? "show" : ""}`}
        aria-label="Close floating panels"
        onClick={closeFloatingPanels}
      />

      <div className="dashboard-page-heading-side">
        <div className="dashboard-top-actions">
          <div className="dashboard-action-group" role="toolbar" aria-label="Dashboard actions">
            <button
              type="button"
              className="dashboard-header-btn dashboard-notif-btn"
              aria-label="Open notifications"
              aria-expanded={isNotifOpen ? "true" : "false"}
              onClick={handleNotificationsToggle}
            >
              <i className="bi bi-bell"></i>
              {!!unreadCount && <span className="dashboard-notif-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </button>

            <button
              type="button"
              className={`dashboard-profile-trigger${isProfileOpen ? " open" : ""}`}
              aria-label="Open profile menu"
              aria-expanded={isProfileOpen ? "true" : "false"}
              onClick={handleProfileToggle}
            >
              <span className={`dashboard-profile-avatar${role ? ` role-${role}` : ""}`}>{profileInitials}</span>
              <i className={`bi ${isProfileOpen ? "bi-chevron-up" : "bi-chevron-down"}`}></i>
            </button>
          </div>
        </div>

        {sidebarHint ? <span className="dashboard-sidebar-hint dashboard-sidebar-hint-inline">{sidebarHint}</span> : null}

        <aside className={`dashboard-notif-panel ${isNotifOpen ? "open" : ""}`} aria-label="Notifications panel">
          <div className="dashboard-notif-head">
            <strong>Notifications</strong>
            <div className="dashboard-notif-actions">
              <button
                type="button"
                className="btn btn-outline-dark btn-sm"
                onClick={markAllNotificationsRead}
                disabled={!unreadCount}
              >
                Mark all
              </button>
              <button
                type="button"
                className="btn btn-outline-dark btn-sm"
                onClick={closeFloatingPanels}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
          <div className="dashboard-notif-body">
            {visibleNotifications.map((item) => {
              const messageTarget = messageNavigationFromNotification(role || user?.role, item);
              const isClickable = Boolean(messageTarget);
              return (
                <article
                  key={item.id}
                  className={`dashboard-notif-item${isClickable ? " is-clickable" : ""}`}
                  role={isClickable ? "button" : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  onClick={isClickable ? () => handleNotificationClick(item) : undefined}
                  onKeyDown={isClickable ? (event) => handleNotificationKeyDown(event, item) : undefined}
                >
                  <div className="dashboard-notif-icon"><i className="bi bi-bell"></i></div>
                  <div className="dashboard-notif-copy">
                    <div className="dashboard-notif-title">{item.title || "Notification"}</div>
                    <div className="dashboard-notif-message">{item.message || "-"}</div>
                    <div className="dashboard-notif-meta">
                      {item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}
                    </div>
                    {isClickable ? (
                      <div className="dashboard-notif-open-chat">Open conversation</div>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {!visibleNotifications.length && (
              <div className="dashboard-notif-empty">
                <i className="bi bi-bell-slash"></i>
                <p>No notifications yet.</p>
              </div>
            )}
          </div>
          <div className="dashboard-notif-foot">
            <button
              type="button"
              className="dashboard-notif-see-all"
              onClick={() => {
                closeFloatingPanels();
                nav("/notifications");
              }}
            >
              See all
              <i className="bi bi-arrow-right"></i>
            </button>
            <div className="small muted dashboard-notif-user">
              Signed in as @{user?.username || "-"}
            </div>
          </div>
        </aside>

        <aside className={`dashboard-profile-menu${isProfileOpen ? " open" : ""}`} aria-label="Profile menu">
          <div className="dashboard-profile-menu-head">
            <div className={`dashboard-profile-menu-avatar${role ? ` role-${role}` : ""}`}>{profileInitials}</div>
            <div className="dashboard-profile-menu-copy">
              <strong>{profileName || "User"}</strong>
              <span>{user?.email || "No email available"}</span>
              <span>@{user?.username || "-"}</span>
            </div>
          </div>

          <div className="dashboard-profile-menu-section">
            {shortcutItems.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`dashboard-profile-link${activeTab === item.id ? " active" : ""}`}
                onClick={() => handleTabChange(item.id)}
              >
                <i className={`bi ${item.icon}`}></i>
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="dashboard-profile-menu-section">
            <button
              type="button"
              className="dashboard-profile-link logout"
              onClick={requestLogout}
            >
              <i className="bi bi-box-arrow-right"></i>
              <span>Log out</span>
            </button>
          </div>
        </aside>

      </div>
    </>
  );
  const childItems = React.Children.toArray(children);
  const primaryHeroIndex = childItems.findIndex((child) => {
    if (!React.isValidElement(child) || typeof child.type !== "string" || child.type.toLowerCase() !== "section") {
      return false;
    }
    const className = typeof child.props?.className === "string" ? child.props.className : "";
    const classes = className.split(/\s+/).filter(Boolean);
    return classes.includes("agent-hero") && !classes.includes("rowed");
  });
  const primaryHeroChild = primaryHeroIndex >= 0 ? childItems[primaryHeroIndex] : null;
  const hasPrimaryPageHero = Boolean(primaryHeroChild);
  const useDesktopShellHeader = hasPrimaryPageHero && isDesktopViewport;
  const logoutConfirmModal =
    typeof document === "undefined"
      ? null
      : createPortal(
          <div className={`dashboard-confirm-backdrop${isLogoutConfirmOpen ? " show" : ""}`} onClick={closeLogoutConfirm}>
            <div
              className={`dashboard-confirm-dialog${isLogoutConfirmOpen ? " open" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="logout-confirm-title"
              aria-describedby="logout-confirm-copy"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="dashboard-confirm-icon" aria-hidden="true">
                <i className="bi bi-box-arrow-right"></i>
              </div>
              <div className="dashboard-confirm-copy">
                <span className="dashboard-confirm-kicker">Logout Confirmation</span>
                <h3 id="logout-confirm-title">Log out of your account?</h3>
                <p id="logout-confirm-copy">
                  You are currently signed in to the {roleLabel} dashboard as @{user?.username || "-"}. You can stay here or log out now.
                </p>
              </div>
              <div className="dashboard-confirm-actions">
                <button
                  type="button"
                  className="btn btn-outline-dark"
                  onClick={closeLogoutConfirm}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-dark"
                  onClick={handleLogout}
                >
                  Log out
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
  const headerMarkup = (
    <div className="dashboard-page-heading">
      <div className="dashboard-page-heading-main">
        <button
          type="button"
          className="dashboard-inline-sidebar-btn"
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={handleSidebarToggle}
        >
          <i className={`bi ${isSidebarCollapsed ? "bi-layout-sidebar-inset-reverse" : "bi-layout-sidebar-inset"}`}></i>
        </button>
        <div className="dashboard-page-heading-copy">{primaryHeroChild?.props?.children}</div>
      </div>
      {headerActions}
    </div>
  );
  const renderedChildren = hasPrimaryPageHero
    ? useDesktopShellHeader
      ? childItems.filter((_, index) => index !== primaryHeroIndex)
      : childItems.map((child, index) => (
          index === primaryHeroIndex && React.isValidElement(child)
            ? React.cloneElement(child, {
                children: headerMarkup
              })
            : child
        ))
    : childItems;

  return (
    <div className={`agent-layout dashboard-v2 ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`} style={layoutInlineStyle}>
      <aside className={`agent-sidebar ${isNavOpen ? "open" : ""}`} style={sidebarInlineStyle}>
        <div className="agent-sidebar-head">
          <div className="agent-sidebar-brand" aria-label="TES Property Real Estate">
            <span className={`agent-sidebar-brand-mark${role ? ` role-${role}` : ""}`} aria-hidden="true">
              <i className="bi bi-buildings"></i>
            </span>
            <div className="agent-sidebar-brand-copy">
              <strong>TES PROPERTY</strong>
              <span>REAL ESTATE</span>
            </div>
          </div>
        </div>
        <nav className="dashboard-tailwind-nav" aria-label={`${suiteLabel} navigation`}>
          <SidebarNav
            sections={sidebarSections}
            activeId={activeTab}
            onSelect={handleTabChange}
            collapsed={isSidebarCollapsed}
          />
        </nav>
        <div className="agent-sidebar-footer">
          <button
            type="button"
            className="agent-logout-btn"
            onClick={requestLogout}
            title="Log out"
          >
            <i className="bi bi-box-arrow-right"></i>
            <span>Log out</span>
          </button>
        </div>
      </aside>
      <button
        type="button"
        className={`agent-sidebar-backdrop ${isNavOpen ? "show" : ""}`}
        aria-label="Close navigation"
        onClick={() => setIsNavOpen(false)}
      />

      <main className="agent-main" style={mainInlineStyle}>
        {useDesktopShellHeader ? (
          <div className="dashboard-shell-header">
            <div className="dashboard-shell-header-inner">
              {headerMarkup}
            </div>
          </div>
        ) : null}
        <div className="dashboard-mobile-topbar">
          <button type="button" className="dashboard-menu-btn" onClick={() => setIsNavOpen(true)}>
            <i className="bi bi-list"></i>
            Menu
          </button>
          <div className="dashboard-mobile-title">
            <strong>TES PROPERTY</strong>
            <span>REAL ESTATE</span>
          </div>
          <span className={`dashboard-mobile-avatar${role ? ` role-${role}` : ""}`}>{initial}</span>
        </div>
        <div
          className={`dashboard-content ${isSwitching ? "is-loading" : ""}${useDesktopShellHeader ? " has-shell-header" : ""}`}
          aria-busy={isSwitching ? "true" : "false"}
          aria-live="polite"
        >
          <div className={`dashboard-page dashboard-page-${role || "default"} dashboard-tab-${activeTab || "default"}`}>
            {renderedChildren}
          </div>
        </div>
      </main>
      {logoutConfirmModal}
    </div>
  );
}
