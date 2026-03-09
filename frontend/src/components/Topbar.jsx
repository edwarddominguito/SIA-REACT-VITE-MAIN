import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { logout } from "../lib/auth.js";
import { getCurrentUser } from "../lib/storage.js";

export default function Topbar({
  title,
  badgeIcon,
  badgeText,
  badgeClass,
  links = [],
  showSearch = false,
  searchValue = "",
  onSearchChange
}) {
  const nav = useNavigate();
  const user = getCurrentUser();

  return (
    <div className="app-topbar">
      <div className="container page-wrap py-3 d-flex align-items-center justify-content-between gap-3">
        <div className="d-flex align-items-center gap-3 flex-grow-1">
          <div className="brand">
            <div className={"brand-badge " + (badgeClass || "")}>real.</div>
            <div>
              <div className="fw-bold">{title}</div>
              <div className="small muted">
                {user ? `${user.fullName} (@${user.username})` : ""}
              </div>
            </div>
          </div>

          {links.length > 0 && (
            <div className="topbar-links d-none d-md-flex ms-2">
              {links.map((l) => (
                <Link key={l.to} to={l.to} className={l.active ? "text-dark" : ""}>
                  {l.label}
                </Link>
              ))}
            </div>
          )}

          {showSearch && (
            <div className="topbar-search ms-auto">
              <i className="bi bi-search text-secondary"></i>
              <input
                value={searchValue}
                onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
                placeholder="Search listings, locations..."
              />
            </div>
          )}
        </div>

        <div className="d-flex align-items-center gap-2">
          <span className="badge badge-soft d-none d-lg-inline">
            <i className={"bi " + badgeIcon + " me-1"}></i>
            {badgeText}
          </span>
          <button
            className="btn btn-outline-dark btn-sm"
            onClick={() => {
              logout();
              nav("/login");
            }}
          >
            <i className="bi bi-box-arrow-right me-1"></i>Logout
          </button>
        </div>
      </div>
    </div>
  );
}
