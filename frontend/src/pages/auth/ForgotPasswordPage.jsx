import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { resetPassword } from "@/services/authService.js";
import { cleanEmail, cleanUsername, isValidEmail, isStrongEnoughPassword } from "@/utils/input.js";
import "./auth.css";

export default function ForgotPassword() {
  const nav = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState("");
  const [touched, setTouched] = useState({
    username: false, email: false, password: false, confirmPassword: false
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (success) setSuccess("");
  };

  function getFieldErrors() {
    return {
      username: !form.username.trim() ? "Username is required." : "",
      email: !form.email.trim()
        ? "Email is required."
        : !isValidEmail(form.email)
        ? "Enter a valid email address."
        : "",
      password: !form.password.trim()
        ? "Password is required."
        : !isStrongEnoughPassword(form.password, 6)
        ? "Password must be at least 6 characters."
        : "",
      confirmPassword: !form.confirmPassword.trim()
        ? "Please confirm your password."
        : form.confirmPassword !== form.password
        ? "Passwords do not match."
        : ""
    };
  }

  const fieldErrors = getFieldErrors();
  const canSubmit = Object.values(fieldErrors).every((e) => !e);

  const showFieldError = (field) => (touched[field] || submitted) && fieldErrors[field];
  const touch = (field) => setTouched((s) => ({ ...s, [field]: true }));

  return (
    <div className="auth-shell">
      <div className="auth-page auth-page-reset wrap">
        <div className="auth-login-top">
          <div className="auth-login-brand">
            <span className="auth-logo-mark"><i className="bi bi-buildings"></i></span>
            <span className="auth-login-brand-copy">
              <strong>TES PROPERTY</strong>
              <span>REAL ESTATE</span>
            </span>
          </div>
          <p>Reset your account password</p>
          <div className="auth-top-microcopy">Verify your identity and set a new password</div>
        </div>

        <div className="card auth-login-card">
          <div className="header auth-login-header">
            <div className="title">Forgot Password</div>
            <div className="sub">Enter your username and email to reset your password.</div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (isSubmitting) return;
              setSubmitted(true);
              setServerError("");
              setSuccess("");
              const errs = getFieldErrors();
              if (Object.values(errs).some(Boolean)) return;

              try {
                setIsSubmitting(true);
                const res = await resetPassword({
                  username: cleanUsername(form.username),
                  email: cleanEmail(form.email),
                  newPassword: form.password
                });
                if (!res.ok) {
                  setServerError(res.message);
                  return;
                }

                setSuccess("Password updated successfully. Redirecting to login...");
                setTimeout(() => nav("/login"), 900);
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            {serverError && (
              <div className="auth-server-error">
                <i className="bi bi-exclamation-circle-fill"></i>
                {serverError}
              </div>
            )}
            {success && (
              <div className="auth-success-box">
                <i className="bi bi-check-circle-fill"></i>
                {success}
              </div>
            )}

            <label className="label">Username</label>
            <input
              className={`input${showFieldError("username") ? " input--invalid" : touched.username && !fieldErrors.username ? " input--valid" : ""}`}
              value={form.username}
              onChange={(e) => set("username", e.target.value)}
              onBlur={() => touch("username")}
              placeholder="Enter your username"
            />
            {showFieldError("username") && (
              <div className="field-error">
                <i className="bi bi-exclamation-circle"></i>
                {fieldErrors.username}
              </div>
            )}

            <label className="label">Email</label>
            <input
              className={`input${showFieldError("email") ? " input--invalid" : touched.email && !fieldErrors.email ? " input--valid" : ""}`}
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              onBlur={() => touch("email")}
              placeholder="you@example.com"
            />
            {showFieldError("email") && (
              <div className="field-error">
                <i className="bi bi-exclamation-circle"></i>
                {fieldErrors.email}
              </div>
            )}

            <label className="label">New Password</label>
            <div className="auth-input-row">
              <input
                className={`input${showFieldError("password") ? " input--invalid" : touched.password && !fieldErrors.password ? " input--valid" : ""}`}
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                onBlur={() => touch("password")}
                placeholder="Min. 6 characters"
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
            {showFieldError("password") && (
              <div className="field-error">
                <i className="bi bi-exclamation-circle"></i>
                {fieldErrors.password}
              </div>
            )}

            <label className="label">Confirm Password</label>
            <input
              className={`input${showFieldError("confirmPassword") ? " input--invalid" : touched.confirmPassword && !fieldErrors.confirmPassword && form.confirmPassword ? " input--valid" : ""}`}
              type={showPassword ? "text" : "password"}
              value={form.confirmPassword}
              onChange={(e) => set("confirmPassword", e.target.value)}
              onBlur={() => touch("confirmPassword")}
              placeholder="Re-enter new password"
            />
            {showFieldError("confirmPassword") && (
              <div className="field-error">
                <i className="bi bi-exclamation-circle"></i>
                {fieldErrors.confirmPassword}
              </div>
            )}

            <button className="btn-primary" type="submit" disabled={!canSubmit || isSubmitting}>
              <i className="bi bi-shield-check"></i>
              {isSubmitting ? "Resetting Password..." : "Reset Password"}
            </button>

            <div className="row-links auth-login-links">
              <Link to="/login" className="btn btn-outline-dark btn-sm">Back to login</Link>
              <Link to="/register" className="link">Create account</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
