import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../lib/auth.js";
import { cleanEmail, cleanPhone, cleanText, cleanUsername } from "../lib/inputUtils.js";
import "../styles/login.css";

export default function Register() {
  const nav = useNavigate();
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const canSubmit = ["fullName", "phone", "email", "username", "password"].every((k) => String(form[k] || "").trim());

  return (
    <div className="auth-shell">
      <div className="auth-page wrap single auth-page-register">
        <div className="auth-login-top">
          <div className="auth-login-brand">
            <span className="auth-logo-mark"><i className="bi bi-buildings"></i></span>
            <strong>RealEstate Pro</strong>
          </div>
          <p>Create your customer account</p>
          <div className="auth-top-microcopy">Join in minutes and start booking property appointments</div>
        </div>

        <div className="card narrow">
          <div className="header">
            <div>
              <div className="title">Create Customer Account</div>
              <div className="sub">Set up your profile to access listings, appointments, and trip updates</div>
            </div>
          </div>
          <div className="auth-friendly-chips" aria-label="Signup benefits">
            <span><i className="bi bi-house-check"></i>Verified Listings</span>
            <span><i className="bi bi-calendar2-check"></i>Easy Appointments</span>
            <span><i className="bi bi-people"></i>Trusted Agents</span>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const required = ["fullName", "phone", "email", "username", "password"];
              for (const r of required) {
                if (!String(form[r] || "").trim()) {
                  setError("All required fields must be filled.");
                  return;
                }
              }

              const payload = {
                ...form,
                fullName: cleanText(form.fullName, 80),
                phone: cleanPhone(form.phone),
                email: cleanEmail(form.email),
                username: cleanUsername(form.username)
              };
              const res = await register(payload);
              if (!res.ok) {
                setError(res.message);
                return;
              }

              nav("/login");
            }}
          >
            {error && <div className="alert alert-danger py-2 mb-3">{error}</div>}
            <div className="auth-grid">
              <div>
                <label className="label">Full Name *</label>
                <input className="input" value={form.fullName} onChange={(e) => { set("fullName", e.target.value); if (error) setError(""); }} />
              </div>
              <div>
                <label className="label">Phone *</label>
                <input className="input" value={form.phone} onChange={(e) => { set("phone", e.target.value); if (error) setError(""); }} />
              </div>
              <div>
                <label className="label">Email *</label>
                <input className="input" value={form.email} onChange={(e) => { set("email", e.target.value); if (error) setError(""); }} />
              </div>
              <div>
                <label className="label">Username *</label>
                <input className="input" value={form.username} onChange={(e) => { set("username", e.target.value); if (error) setError(""); }} />
              </div>
              <div>
                <label className="label">Password *</label>
                <div className="auth-input-row">
                  <input
                    className="input"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => { set("password", e.target.value); if (error) setError(""); }}
                    autoComplete="new-password"
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
              </div>
            </div>

            <button className="btn-primary" type="submit" disabled={!canSubmit}>Register</button>
            <div className="row-links">
              <Link to="/" className="btn btn-outline-dark btn-sm">Back to home</Link>
              <Link to="/login" className="link">Already have an account? Sign in</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
