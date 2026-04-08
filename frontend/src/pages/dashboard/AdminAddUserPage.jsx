import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/layout/DashboardLayout.jsx";
import UIFeedback from "@/ui/UIFeedback.jsx";
import useUiFeedback from "@/hooks/useUiFeedback.js";
import { getCurrentUser, safeArray, saveArray, subscribeKeys } from "@/services/storageService.js";
import { apiRequest } from "@/api/client.js";
import { ADMIN_ADD_USER_NAV_ITEMS } from "@/data/constants.js";
import {
  cleanEmail,
  cleanPhone,
  cleanText,
  cleanUsername,
  isStrongEnoughPassword,
  isValidEmail,
  isValidPhone,
  isValidUsername
} from "@/utils/input.js";

export default function AdminAddUser() {
  const navigate = useNavigate();
  const feedback = useUiFeedback();
  const user = getCurrentUser();
  const [users, setUsers] = useState([]);
  const validTabSet = useMemo(() => new Set(ADMIN_ADD_USER_NAV_ITEMS.map((item) => item.id)), []);
  const [agentForm, setAgentForm] = useState({
    username: "",
    password: "",
    fullName: "",
    phone: "",
    email: ""
  });
  const [agentTouched, setAgentTouched] = useState({
    username: false, password: false, fullName: false, phone: false, email: false
  });
  const [agentSubmitted, setAgentSubmitted] = useState(false);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);

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

  function getAgentFieldErrors() {
    const uname = cleanUsername(agentForm.username);
    const pwd = String(agentForm.password || "").trim();
    const fullName = cleanText(agentForm.fullName, 80);
    const phone = cleanPhone(agentForm.phone);
    const email = cleanEmail(agentForm.email);
    return {
      username: !uname
        ? "Username is required."
        : !isValidUsername(uname)
        ? "3-32 chars, letters/numbers/._- only."
        : usernameExists(uname)
        ? "Username already exists."
        : "",
      password: !pwd
        ? "Password is required."
        : !isStrongEnoughPassword(pwd, 6)
        ? "Minimum 6 characters."
        : "",
      fullName: !fullName ? "Full name is required." : "",
      phone: !phone
        ? "Phone is required."
        : !isValidPhone(phone)
        ? "Invalid phone format."
        : "",
      email: !email
        ? "Email is required."
        : !isValidEmail(email)
        ? "Invalid email format."
        : ""
    };
  }

  const agentFieldErrors = getAgentFieldErrors();

  const showAgentError = (field) => (agentTouched[field] || agentSubmitted) && agentFieldErrors[field];
  const touchAgent = (field) => setAgentTouched((s) => ({ ...s, [field]: true }));

  const createAgentAccount = async () => {
    if (isCreatingAgent) return;
    setAgentSubmitted(true);
    const errs = getAgentFieldErrors();
    if (Object.values(errs).some(Boolean)) return;

    const uname = cleanUsername(agentForm.username);
    const pwd = String(agentForm.password || "").trim();
    const fullName = cleanText(agentForm.fullName, 80) || uname;
    const phone = cleanPhone(agentForm.phone);
    const email = cleanEmail(agentForm.email);

    try {
      setIsCreatingAgent(true);
      const res = await apiRequest("/api/users", {
        method: "POST",
        body: JSON.stringify({
          username: uname,
          password: pwd,
          fullName,
          phone,
          email,
          role: "agent",
          availabilityStatus: "available"
        })
      });
      const createdUser = res?.data;
      if (createdUser?.id) {
        saveArray("allUsers", [
          ...users.filter((entry) => String(entry?.id || "") !== String(createdUser.id)),
          {
            ...createdUser,
            availabilityStatus: "available",
            photoUrl: "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]);
      }
      setAgentForm({ username: "", password: "", fullName: "", phone: "", email: "" });
      setAgentTouched({ username: false, password: false, fullName: false, phone: false, email: false });
      setAgentSubmitted(false);
      feedback.notify("Agent account created successfully.", "success");
      navigate("/admin", { state: { tab: "users" } });
    } catch (error) {
      feedback.notify(error?.message || "Unable to create agent account.", "error");
    } finally {
      setIsCreatingAgent(false);
    }
  };

  return (
    <DashboardLayout
      suiteLabel="Admin Suite"
      profileName={user?.fullName || "Admin"}
      profileRole="Administrator"
      role="admin"
      navItems={ADMIN_ADD_USER_NAV_ITEMS}
      activeTab="users"
      onTabChange={handleTabChange}
    >
      <section className="agent-hero">
        <div>
          <h1>Add User</h1>
        </div>
      </section>

      <section className="agent-panel admin-create-user-page">
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
                <input
                  className={`form-control${showAgentError("username") ? " is-invalid" : ""}`}
                  placeholder="agent_username"
                  value={agentForm.username}
                  onChange={(e) => setAgentForm((s) => ({ ...s, username: e.target.value }))}
                  onBlur={() => touchAgent("username")}
                />
                {showAgentError("username") && (
                  <div className="field-error">
                    <i className="bi bi-exclamation-circle"></i>
                    {agentFieldErrors.username}
                  </div>
                )}
              </div>

              <div className="admin-field">
                <label>Password</label>
                <input
                  type="password"
                  className={`form-control${showAgentError("password") ? " is-invalid" : ""}`}
                  placeholder="Minimum 6 characters"
                  value={agentForm.password}
                  onChange={(e) => setAgentForm((s) => ({ ...s, password: e.target.value }))}
                  onBlur={() => touchAgent("password")}
                />
                {showAgentError("password") && (
                  <div className="field-error">
                    <i className="bi bi-exclamation-circle"></i>
                    {agentFieldErrors.password}
                  </div>
                )}
              </div>

              <div className="admin-field">
                <label>Full Name</label>
                <input
                  className={`form-control${showAgentError("fullName") ? " is-invalid" : ""}`}
                  placeholder="Juan Dela Cruz"
                  value={agentForm.fullName}
                  onChange={(e) => setAgentForm((s) => ({ ...s, fullName: e.target.value }))}
                  onBlur={() => touchAgent("fullName")}
                />
                {showAgentError("fullName") && (
                  <div className="field-error">
                    <i className="bi bi-exclamation-circle"></i>
                    {agentFieldErrors.fullName}
                  </div>
                )}
              </div>

              <div className="admin-field">
                <label>Phone</label>
                <input
                  className={`form-control${showAgentError("phone") ? " is-invalid" : ""}`}
                  placeholder="09XXXXXXXXX"
                  value={agentForm.phone}
                  onChange={(e) => setAgentForm((s) => ({ ...s, phone: e.target.value }))}
                  onBlur={() => touchAgent("phone")}
                />
                {showAgentError("phone") && (
                  <div className="field-error">
                    <i className="bi bi-exclamation-circle"></i>
                    {agentFieldErrors.phone}
                  </div>
                )}
              </div>

              <div className="admin-field">
                <label>Email</label>
                <input
                  className={`form-control${showAgentError("email") ? " is-invalid" : ""}`}
                  placeholder="agent@email.com"
                  value={agentForm.email}
                  onChange={(e) => setAgentForm((s) => ({ ...s, email: e.target.value }))}
                  onBlur={() => touchAgent("email")}
                />
                {showAgentError("email") && (
                  <div className="field-error">
                    <i className="bi bi-exclamation-circle"></i>
                    {agentFieldErrors.email}
                  </div>
                )}
              </div>
            </div>

            <div className="admin-create-user-actions">
              <button type="button" className="btn btn-outline-dark" onClick={() => navigate("/admin", { state: { tab: "users" } })}>
                Back to Users
              </button>
              <button type="submit" className="btn btn-dark" disabled={isCreatingAgent}>
                {isCreatingAgent ? "Creating Agent..." : "Create Agent"}
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
