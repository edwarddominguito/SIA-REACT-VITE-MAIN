import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { resetPassword } from "../lib/auth.js";
import { cleanEmail, cleanUsername } from "../lib/inputUtils.js";
import "../styles/login.css";

export default function ForgotPassword() {
  const nav = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const set = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (error) setError("");
    if (success) setSuccess("");
  };

  const canSubmit = form.username.trim() && form.email.trim() && form.password.trim() && form.confirmPassword.trim();

  return (
    <div className="auth-shell">
      <div className="auth-page wrap">
        <div className="card auth-login-card">
          <div className="header">
            <div className="title">Forgot Password</div>
            <div className="sub">Reset your account password using username and email.</div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setSuccess("");

              if (form.password !== form.confirmPassword) {
                setError("Password confirmation does not match.");
                return;
              }

              const res = await resetPassword({
                username: cleanUsername(form.username),
                email: cleanEmail(form.email),
                newPassword: form.password
              });
              if (!res.ok) {
                setError(res.message);
                return;
              }

              setSuccess("Password updated successfully. Redirecting to login...");
              setTimeout(() => nav("/login"), 900);
            }}
          >
            {error && <div className="alert alert-danger py-2 mb-3">{error}</div>}
            {success && <div className="alert alert-success py-2 mb-3">{success}</div>}

            <label className="label">Username</label>
            <input className="input" value={form.username} onChange={(e) => set("username", e.target.value)} required />

            <label className="label">Email</label>
            <input className="input" value={form.email} onChange={(e) => set("email", e.target.value)} required />

            <label className="label">New Password</label>
            <div className="auth-input-row">
              <input
                className="input"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                required
              />
              <button
                type="button"
                className="auth-input-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`}></i>
              </button>
            </div>

            <label className="label">Confirm Password</label>
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              value={form.confirmPassword}
              onChange={(e) => set("confirmPassword", e.target.value)}
              required
            />

            <button className="btn-primary" type="submit" disabled={!canSubmit}>Reset Password</button>

            <div className="row-links">
              <Link to="/login" className="link">Back to login</Link>
              <Link to="/register" className="link">Create account</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
