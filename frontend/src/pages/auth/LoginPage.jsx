import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "@/services/authService.js";
import { getCurrentUser } from "@/services/storageService.js";
import { cleanUsername, isStrongEnoughPassword, isValidUsername } from "@/utils/input.js";
import "./auth.css";

const inputStyle = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 9,
  border: "1.5px solid #e3e5ea",
  background: "#fff",
  fontSize: 12,
  color: "#111318",
  fontWeight: 400,
  transition: "all 0.2s ease"
};

const errorStyle = {
  fontSize: 10,
  color: "#e03131",
  marginTop: 4,
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  gap: 4,
  animation: "fadeIn 0.2s ease"
};

const socialButtonStyle = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  padding: "10px",
  borderRadius: 9,
  border: "1.5px solid #e3e5ea",
  background: "#fff",
  fontSize: 11,
  fontWeight: 500,
  color: "#3a3f4b",
  cursor: "not-allowed",
  transition: "all 0.15s",
  opacity: 0.72
};

const routeForRole = (role) => {
  if (role === "admin") return "/admin";
  if (role === "agent") return "/agent";
  return "/customer/dashboard";
};

export default function Login() {
  const nav = useNavigate();
  const currentUser = getCurrentUser();
  const [username, setUsername] = useState(currentUser?.username || "");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(null);
  const [shake, setShake] = useState(false);
  const userRef = useRef(null);

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  const triggerShake = () => {
    setShake(true);
    window.setTimeout(() => setShake(false), 500);
  };

  const validate = () => {
    const nextErrors = {};
    if (!username.trim()) nextErrors.username = "Username is required";
    else if (!isValidUsername(username)) nextErrors.username = "Use 3-32 letters, numbers, ., _, or -";
    if (!password) nextErrors.password = "Password is required";
    else if (!isStrongEnoughPassword(password, 6)) nextErrors.password = "Minimum 6 characters";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) triggerShake();
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    setServerError("");
    if (loading) return;
    if (!validate()) return;

    try {
      setLoading(true);
      const result = await login(cleanUsername(username), password);
      if (!result?.ok) {
        setServerError(result?.message || "Unable to sign in.");
        triggerShake();
        return;
      }

      const signedInUser = getCurrentUser();
      nav(routeForRole(signedInUser?.role), { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div
      className="login-redesign-shell"
      style={{
        minHeight: "100vh",
        display: "flex",
        fontFamily: "'Outfit',system-ui,sans-serif",
        background: "#f7f8fa"
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        *{box-sizing:border-box;margin:0;padding:0}
        input{font-family:inherit}
        input::placeholder{color:#a0a4b0;font-weight:400}
        input:focus{outline:none}
        button{font-family:inherit}
        button:active:not(:disabled){transform:scale(0.98)!important}
        ::selection{background:rgba(59,91,219,0.15)}
        @media (max-width: 960px){
          .login-redesign-shell{flex-direction:column}
          .login-redesign-brand-panel{display:none !important}
          .login-redesign-form-panel{padding:28px 18px !important}
          .login-redesign-form-card{max-width:420px !important}
          .login-redesign-top-links{position:static !important;margin-bottom:22px;justify-content:flex-end}
        }
        @media (max-width: 560px){
          .login-redesign-form-card{max-width:none !important}
          .login-redesign-socials{flex-direction:column}
        }
      `}</style>

      <div
        className="login-redesign-brand-panel"
        style={{
          flex: "0 0 44%",
          background: "linear-gradient(165deg,#111318 0%,#1a1e2a 40%,#232840 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "36px 40px",
          position: "relative",
          overflow: "hidden",
          minHeight: "100vh"
        }}
      >
        <div style={{ position: "absolute", top: -100, right: -80, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle,rgba(59,91,219,0.12),transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -60, left: -40, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle,rgba(43,138,62,0.08),transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, opacity: 0.03, backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.1) 1px,transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 2, animation: "fadeUp 0.5s ease both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3" /></svg>
            </div>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, lineHeight: 1 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: -0.3 }}>TES PROPERTY</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 1.7 }}>REAL ESTATE</span>
            </span>
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 2, animation: "fadeUp 0.6s 0.1s ease both" }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, color: "#fff", lineHeight: 1.12, letterSpacing: -1, marginBottom: 12 }}>
            Your next home
            <br />
            is one click away.
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.7, maxWidth: 320 }}>
            Access your dashboard to manage viewings, track listings, and connect with trusted agents.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28 }}>
            {[
              { icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", title: "End-to-end encrypted", desc: "Your data stays private and secure" },
              { icon: "M13 10V3L4 14h7v7l9-11h-7z", title: "Instant booking access", desc: "View and manage appointments in real-time" }
            ].map((item, index) => (
              <div
                key={item.title}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  animation: `slideIn 0.4s ${0.3 + (index * 0.1)}s ease both`
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(59,91,219,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#748ffc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{item.title}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 2, animation: "fadeIn 0.5s 0.4s ease both", display: "none" }} aria-hidden="true">
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>© 2026 RealEstate Pro. All rights reserved.</div>
        </div>
        <div style={{ position: "relative", zIndex: 2, animation: "fadeIn 0.5s 0.4s ease both", display: "none" }} aria-hidden="true">
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>© 2026 TES PROPERTY REAL ESTATE. All rights reserved.</div>
        </div>
        <div style={{ position: "relative", zIndex: 2, animation: "fadeIn 0.5s 0.4s ease both" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>{"\u00A9"} 2026 TES PROPERTY REAL ESTATE. All rights reserved.</div>
        </div>
      </div>

      <div
        className="login-redesign-form-panel"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
          position: "relative",
          background: "#f7f8fa"
        }}
      >
        <div
          className="login-redesign-top-links"
          style={{
            position: "absolute",
            top: 24,
            right: 24,
            display: "flex",
            alignItems: "center",
            gap: 6,
            animation: "fadeIn 0.5s 0.3s ease both"
          }}
        >
          <span style={{ fontSize: 10, color: "#a0a4b0", fontWeight: 500 }}>Don't have an account?</span>
          <button
            type="button"
            onClick={() => nav("/register")}
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#3b5bdb",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 2
            }}
          >
            Sign up
          </button>
        </div>

        <div
          className="login-redesign-form-card"
          style={{
            width: "100%",
            maxWidth: 380,
            animation: shake ? "shake 0.4s ease" : "fadeUp 0.5s 0.15s ease both"
          }}
        >
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#111318", letterSpacing: -0.8, marginBottom: 4 }}>Welcome back</h1>
            <p style={{ fontSize: 12, color: "#8b8f9e", fontWeight: 400, lineHeight: 1.5 }}>Enter your credentials to access your dashboard</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            {serverError ? (
              <div style={{ ...errorStyle, marginTop: -6, marginBottom: -6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                {serverError}
              </div>
            ) : null}

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#3a3f4b", display: "block", marginBottom: 5, letterSpacing: 0.1 }}>Username</label>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", transition: "color 0.2s", color: focused === "user" ? "#3b5bdb" : "#c4c7d0" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <input
                  ref={userRef}
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errors.username) setErrors((prev) => ({ ...prev, username: undefined }));
                    if (serverError) setServerError("");
                  }}
                  onFocus={() => setFocused("user")}
                  onBlur={() => setFocused(null)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter username"
                  autoComplete="username"
                  style={{
                    ...inputStyle,
                    paddingLeft: 38,
                    borderColor: errors.username ? "#e03131" : focused === "user" ? "#3b5bdb" : "#e3e5ea",
                    boxShadow: focused === "user" ? "0 0 0 3px rgba(59,91,219,0.08)" : errors.username ? "0 0 0 3px rgba(224,49,49,0.06)" : "none"
                  }}
                />
              </div>
              {errors.username ? <div style={errorStyle}>{errors.username}</div> : null}
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#3a3f4b", letterSpacing: 0.1 }}>Password</label>
                <button
                  type="button"
                  onClick={() => nav("/forgot-password")}
                  style={{ fontSize: 10, fontWeight: 500, color: "#3b5bdb", background: "none", border: "none", cursor: "pointer", opacity: 0.8 }}
                >
                  Forgot password?
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", transition: "color 0.2s", color: focused === "pass" ? "#3b5bdb" : "#c4c7d0" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                    if (serverError) setServerError("");
                  }}
                  onFocus={() => setFocused("pass")}
                  onBlur={() => setFocused(null)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  style={{
                    ...inputStyle,
                    paddingLeft: 38,
                    paddingRight: 40,
                    borderColor: errors.password ? "#e03131" : focused === "pass" ? "#3b5bdb" : "#e3e5ea",
                    boxShadow: focused === "pass" ? "0 0 0 3px rgba(59,91,219,0.08)" : errors.password ? "0 0 0 3px rgba(224,49,49,0.06)" : "none"
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((prev) => !prev)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", color: "#a0a4b0", transition: "color 0.15s" }}
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
              {errors.password ? <div style={errorStyle}>{errors.password}</div> : null}
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                border: "none",
                background: loading ? "#6b7084" : "#111318",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                marginTop: 4,
                boxShadow: "0 2px 8px rgba(17,19,24,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                letterSpacing: 0.2
              }}
            >
              {loading ? (
                <>
                  <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.25)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.6s linear infinite" }} />
                  Signing in...
                </>
              ) : (
                <>Sign in <span style={{ fontSize: 15, marginTop: -1 }}>→</span></>
              )}
            </button>
          </form>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#e3e5ea" }} />
            <span style={{ fontSize: 9, color: "#a0a4b0", fontWeight: 500, letterSpacing: 0.5, textTransform: "uppercase" }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: "#e3e5ea" }} />
          </div>

          <div className="login-redesign-socials" style={{ display: "flex", gap: 10 }}>
            <button type="button" disabled title="Google login is not available yet" style={socialButtonStyle}>
              <svg width="15" height="15" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
              Google
            </button>
            <button type="button" disabled title="Facebook login is not available yet" style={socialButtonStyle}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
              Facebook
            </button>
          </div>

          <div style={{ textAlign: "center", marginTop: 24 }}>
            <button
              type="button"
              onClick={() => nav("/")}
              style={{ fontSize: 10, fontWeight: 500, color: "#a0a4b0", background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, transition: "color 0.15s" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              Back to home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
