import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout.jsx";
import UIFeedback from "../components/UIFeedback.jsx";
import useUiFeedback from "../lib/useUiFeedback.js";
import { getCurrentUser, safeArray, saveArray, subscribeKeys } from "../lib/storage.js";
import {
  cleanEmail,
  cleanPhone,
  cleanText,
  cleanUsername,
  createEntityId,
  isStrongEnoughPassword,
  isValidEmail,
  isValidPhone,
  isValidUsername
} from "../lib/inputUtils.js";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "bi-grid" },
  { id: "users", label: "Users", icon: "bi-people" },
  { id: "properties", label: "Properties", icon: "bi-buildings" },
  { id: "appointments", label: "Appointments", icon: "bi-calendar2-week" },
  { id: "office-meets", label: "Office Meets", icon: "bi-building" },
  { id: "trips", label: "Trips", icon: "bi-car-front" },
  { id: "calendar", label: "Calendar", icon: "bi-calendar3" },
  { id: "reviews", label: "Reviews", icon: "bi-star" },
  { id: "profile", label: "Profile", icon: "bi-person-circle" }
];

export default function AdminAddUser() {
  const navigate = useNavigate();
  const feedback = useUiFeedback();
  const user = getCurrentUser();
  const [users, setUsers] = useState([]);
  const validTabSet = useMemo(() => new Set(navItems.map((item) => item.id)), []);
  const [agentForm, setAgentForm] = useState({
    username: "",
    password: "",
    fullName: "",
    phone: "",
    email: ""
  });

  useEffect(() => {
    const refreshUsers = () => {
      setUsers(safeArray("allUsers"));
    };
    refreshUsers();
    return subscribeKeys(["allUsers"], refreshUsers);
  }, []);

  const handleTabChange = (nextTab) => {
    if (!validTabSet.has(nextTab)) {
      navigate("/admin");
      return;
    }
    if (nextTab === "dashboard") {
      navigate("/admin");
      return;
    }
    navigate("/admin", { state: { tab: nextTab } });
  };

  const usernameExists = (uname) => users.some((u) => cleanUsername(u.username) === cleanUsername(uname));

  const createAgentAccount = () => {
    const uname = cleanUsername(agentForm.username);
    const pwd = String(agentForm.password || "").trim();
    const fullName = cleanText(agentForm.fullName, 80) || uname;
    const phone = cleanPhone(agentForm.phone);
    const email = cleanEmail(agentForm.email);

    if (!uname || !pwd || !fullName || !phone || !email) {
      feedback.notify("All fields are required.", "error");
      return;
    }
    if (!isValidUsername(uname)) {
      feedback.notify("Invalid username. Use 3-32 letters, numbers, ., _, -.", "error");
      return;
    }
    if (!isStrongEnoughPassword(pwd, 6)) {
      feedback.notify("Password must be at least 6 characters.", "error");
      return;
    }
    if (!isValidPhone(phone)) {
      feedback.notify("Invalid phone format.", "error");
      return;
    }
    if (!isValidEmail(email)) {
      feedback.notify("Invalid email format.", "error");
      return;
    }
    if (usernameExists(uname)) {
      feedback.notify("Username already exists.", "error");
      return;
    }

    saveArray("allUsers", [
      ...users,
      {
        id: createEntityId("USR"),
        username: uname,
        password: pwd,
        role: "agent",
        availabilityStatus: "available",
        fullName,
        phone,
        email,
        photoUrl: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString()
      }
    ]);
    setAgentForm({ username: "", password: "", fullName: "", phone: "", email: "" });
    feedback.notify("Agent account created successfully.", "success");
    navigate("/admin", { state: { tab: "users" } });
  };

  return (
    <DashboardLayout
      suiteLabel="Admin Suite"
      profileName={user?.fullName || "Admin"}
      profileRole="Administrator"
      navItems={navItems}
      activeTab="users"
      onTabChange={handleTabChange}
    >
      <section className="agent-hero">
        <div>
          <h1>Add User</h1>
          <p>Admin Dashboard</p>
        </div>
      </section>

      <section className="agent-panel admin-create-user-page">
        <div className="admin-users-hero">
          <h2>Create Agent Account</h2>
          <p>Use this page to add a new agent account without cluttering the users table.</p>
        </div>

        <article className="admin-users-add-card">
          <div className="agent-panel-head admin-users-panel-head">
            <div>
              <h3>Agent Details</h3>
              <p>Only admin can create agent users from this page.</p>
            </div>
          </div>

          <form
            className="admin-agent-form"
            onSubmit={(e) => {
              e.preventDefault();
              createAgentAccount();
            }}
          >
            <div className="admin-agent-form-grid">
              <div className="admin-field">
                <label>Username</label>
                <input className="form-control" placeholder="agent_username" value={agentForm.username} onChange={(e) => setAgentForm((s) => ({ ...s, username: e.target.value }))} />
              </div>
              <div className="admin-field">
                <label>Password</label>
                <input type="password" className="form-control" placeholder="Minimum 6 characters" value={agentForm.password} onChange={(e) => setAgentForm((s) => ({ ...s, password: e.target.value }))} />
              </div>
              <div className="admin-field">
                <label>Full Name</label>
                <input className="form-control" placeholder="Juan Dela Cruz" value={agentForm.fullName} onChange={(e) => setAgentForm((s) => ({ ...s, fullName: e.target.value }))} />
              </div>
              <div className="admin-field">
                <label>Phone</label>
                <input className="form-control" placeholder="09XXXXXXXXX" value={agentForm.phone} onChange={(e) => setAgentForm((s) => ({ ...s, phone: e.target.value }))} />
              </div>
              <div className="admin-field">
                <label>Email</label>
                <input className="form-control" placeholder="agent@email.com" value={agentForm.email} onChange={(e) => setAgentForm((s) => ({ ...s, email: e.target.value }))} />
              </div>
            </div>

            <div className="admin-create-user-actions">
              <button type="button" className="btn btn-outline-dark" onClick={() => navigate("/admin", { state: { tab: "users" } })}>
                Back to Users
              </button>
              <button type="submit" className="btn btn-dark">
                Create Agent
              </button>
            </div>
          </form>
        </article>
      </section>

      <UIFeedback
        toasts={feedback.toasts}
        closeToast={feedback.closeToast}
        confirmState={feedback.confirmState}
        cancelConfirm={feedback.cancelConfirm}
        confirm={feedback.confirm}
      />
    </DashboardLayout>
  );
}
