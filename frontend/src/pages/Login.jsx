import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../lib/auth.js";
import { getCurrentUser } from "../lib/storage.js";
import { cleanUsername } from "../lib/inputUtils.js";
import "../styles/login.css";

export default function Login() {
  const nav = useNavigate();
  const existing = useMemo(() => getCurrentUser(), []);
  const [username, setUsername] = useState(existing?.username || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = username.trim() && password.trim();

  return (
    <div className="auth-shell">
      <div className="auth-page auth-page-login wrap">
        <div className="auth-login-top">
          <div className="auth-login-brand">
            <span className="auth-logo-mark"><i className="bi bi-buildings"></i></span>
            <strong>RealEstate Pro</strong>
          </div>
          <p>Sign in to your account</p>
          <div className="auth-top-microcopy">Secure access to your personalized real estate dashboard</div>
        </div>

        <div className="card auth-login-card">
          <div className="header auth-login-header">
            <div className="title">Welcome back</div>
            <div className="sub">Enter your credentials to access your dashboard</div>
          </div>
          <div className="auth-friendly-chips" aria-label="Login benefits">
            <span><i className="bi bi-shield-check"></i>Secure Sign In</span>
            <span><i className="bi bi-clock-history"></i>Fast Booking Access</span>
            <span><i className="bi bi-bell"></i>Live Notifications</span>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const res = await login(cleanUsername(username), password);
              if (!res.ok) {
                setError(res.message);
                return;
              }

              const u = getCurrentUser();
              if (u?.role === "admin") nav("/admin");
              else if (u?.role === "agent") nav("/agent");
              else nav("/customer");
            }}
          >
            {error && <div className="alert alert-danger py-2 mb-3">{error}</div>}
            <label className="label">Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) setError("");
              }}
              placeholder="Enter username"
              autoComplete="username"
              required
            />

            <label className="label">Password</label>
            <div className="auth-input-row">
              <input
                className="input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Enter password"
                autoComplete="current-password"
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

            <button className="btn-primary" type="submit" disabled={!canSubmit}>
              <span>Sign in</span>
              <i className="bi bi-arrow-right"></i>
            </button>

            <div className="signup-row">
              <span>Don't have an account? </span>
              <Link to="/register" className="link">Sign up</Link>
            </div>
            <div className="row-links auth-login-links">
              <Link to="/" className="btn btn-outline-dark btn-sm">Back to home</Link>
              <Link to="/forgot-password" className="link">Forgot password?</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
