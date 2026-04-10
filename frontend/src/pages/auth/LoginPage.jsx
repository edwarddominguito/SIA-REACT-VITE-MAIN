import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { hasGoogleIdentityConfig, renderGoogleSignInButton, getGoogleIdentityConfigError } from "@/lib/googleIdentity.js";
import { login, loginWithGoogleCredential } from "@/services/authService.js";
import { getCurrentUser } from "@/services/storageService.js";
import { cleanUsername, isStrongEnoughPassword, isValidUsername } from "@/utils/input.js";

const routeForRole = (role) => {
  if (role === "admin") return "/admin";
  if (role === "agent") return "/agent";
  return "/customer/dashboard";
};

const inputStyle = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 9,
  border: "1.5px solid #e4e4e7",
  background: "#ffffff",
  fontSize: 12,
  color: "#111318",
  fontWeight: 400,
  transition: "all 0.2s ease"
};

const errorStyle = {
  fontSize: 10,
  color: "#dc2626",
  marginTop: 4,
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  gap: 4,
  animation: "fadeIn 0.2s ease"
};

export default function LoginPage() {
  const nav = useNavigate();
  const currentUser = getCurrentUser();
  const userRef = useRef(null);
  const googleButtonRef = useRef(null);

  const [username, setUsername] = useState(currentUser?.username || "");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [focused, setFocused] = useState(null);
  const [shake, setShake] = useState(false);
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  const triggerShake = () => {
    setShake(true);
    window.setTimeout(() => setShake(false), 500);
  };

  const completeGoogleSignIn = async (credential) => {
    if (loading || googleLoading) return;
    setServerError("");
    setGoogleError("");

    if (!credential) {
      setServerError("Google Sign-In did not return an ID token.");
      triggerShake();
      return;
    }

    try {
      setGoogleLoading(true);
      const result = await loginWithGoogleCredential(credential);
      if (!result?.ok) {
        setServerError(result?.message || "Unable to continue with Google.");
        triggerShake();
        return;
      }

      const signedInUser = getCurrentUser();
      nav(routeForRole(signedInUser?.role), { replace: true });
    } finally {
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const mountGoogleButton = async () => {
      if (!googleButtonRef.current) return;
      if (!hasGoogleIdentityConfig) {
        setGoogleReady(false);
        setGoogleError(getGoogleIdentityConfigError());
        return;
      }

      try {
        setGoogleError("");
        await renderGoogleSignInButton(googleButtonRef.current, {
          width: Math.max(240, googleButtonRef.current.clientWidth || 240),
          callback: (response) => {
            if (cancelled) return;
            void completeGoogleSignIn(response?.credential || "");
          }
        });
        if (!cancelled) {
          setGoogleReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          setGoogleReady(false);
          setGoogleError(error?.message || "Unable to load Google Sign-In.");
        }
      }
    };

    void mountGoogleButton();
    return () => {
      cancelled = true;
      googleButtonRef.current?.replaceChildren();
    };
  }, [nav]);

  const validate = () => {
    const nextErrors = {};
    const normalizedUsername = cleanUsername(username);

    if (!normalizedUsername) nextErrors.username = "Username is required";
    else if (!isValidUsername(normalizedUsername)) nextErrors.username = "Use 3-32 letters, numbers, ., _, or -.";

    if (!password) nextErrors.password = "Password is required";
    else if (!isStrongEnoughPassword(password, 6)) nextErrors.password = "Minimum 6 characters";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      triggerShake();
    }
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    if (event?.preventDefault) event.preventDefault();
    if (loading) return;
    setServerError("");
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

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      void handleSubmit(event);
    }
  };

  return (
    <div
      className="login-code-page"
      style={{
        minHeight: "100vh",
        display: "flex",
        fontFamily: "'Outfit', system-ui, sans-serif",
        background: "#f5f5f5"
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        *{box-sizing:border-box;margin:0;padding:0}
        input{font-family:inherit}
        input::placeholder{color:#a1a1aa;font-weight:400}
        input:focus{outline:none}
        button{font-family:inherit}
        button:active:not(:disabled){transform:scale(0.98)!important}
        ::selection{background:rgba(17,19,24,0.12)}
        .login-code-page .auth-shell{width:100%}
        @media (max-width: 768px){
          .login-code-page .form-panel{min-height:100vh;padding:88px 18px 28px !important;align-items:flex-start !important;justify-content:flex-start !important}
          .login-code-page .form-inner{max-width:460px !important}
          .login-code-page .login-page-title{font-size:2rem !important}
          .login-code-page .login-password-row{flex-wrap:wrap;gap:8px}
          .login-code-page .login-password-row a{margin-left:auto}
        }
        @media (max-width: 1024px){
          .login-code-page{display:block !important}
          .login-code-page .hero-panel{display:none !important}
          .login-code-page .form-panel{flex:1 1 auto !important}
          .login-code-page .floating-back{top:18px !important;left:18px !important}
          .login-code-page .floating-signup{top:18px !important;right:18px !important}
        }
        @media (max-width: 640px){
          .login-code-page .form-panel{padding:24px 16px 24px !important}
          .login-code-page .form-inner{max-width:100% !important}
          .login-code-page .floating-back,
          .login-code-page .floating-signup{position:static !important;margin-bottom:18px}
          .login-code-page .floating-auth-actions{display:flex !important;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
          .login-code-page .floating-back{padding:8px 12px !important;font-size:10px !important}
          .login-code-page .floating-signup{justify-content:flex-end}
          .login-code-page .login-secondary-actions{flex-direction:column}
          .login-code-page .login-secondary-actions > *{width:100%}
        }
        @media (max-width: 480px){
          .login-code-page .form-panel{padding:18px 12px 20px !important}
          .login-code-page .floating-auth-actions{margin-bottom:6px}
          .login-code-page .floating-signup{width:100%;justify-content:flex-start}
          .login-code-page .login-page-title{font-size:1.75rem !important}
        }
      `}</style>

      <div
        className="hero-panel"
        style={{
          flex: "0 0 44%",
          background: "linear-gradient(165deg,#08090d 0%,#111318 42%,#1a1c23 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "36px 40px",
          position: "relative",
          overflow: "hidden",
          minHeight: "100vh"
        }}
      >
        <div style={{ position: "absolute", top: -100, right: -80, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,255,255,0.08),transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -60, left: -40, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,255,255,0.05),transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, opacity: 0.04, backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.1) 1px,transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 2, animation: "fadeUp 0.5s ease both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.84)" strokeWidth="2" strokeLinecap="round">
                <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3" />
              </svg>
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: -0.3 }}>
              TES PROPERTY<span style={{ color: "rgba(255,255,255,0.35)" }}> Pro</span>
            </span>
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 2, animation: "fadeUp 0.6s 0.1s ease both" }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, color: "#fff", lineHeight: 1.12, letterSpacing: -1, marginBottom: 12 }}>
            Your next home
            <br />
            is one click away.
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.42)", lineHeight: 1.7, maxWidth: 320 }}>
            Access your dashboard to manage viewings, track listings, and connect with trusted agents.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28 }}>
            {[
              {
                icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
                title: "End-to-end protected",
                desc: "Your client and property data stays secure"
              },
              {
                icon: "M13 10V3L4 14h7v7l9-11h-7z",
                title: "Instant booking access",
                desc: "Manage appointments and viewing activity in real time"
              }
            ].map((feature, index) => (
              <div
                key={feature.title}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  animation: `slideIn 0.4s ${0.3 + index * 0.1}s ease both`
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4f4f5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={feature.icon} />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>{feature.title}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.34)", marginTop: 1 }}>{feature.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 2, animation: "fadeIn 0.5s 0.4s ease both" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>(c) 2026 TES PROPERTY. All rights reserved.</div>
        </div>
      </div>

      <div
        className="form-panel"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
          position: "relative",
          background: "#f5f5f5"
        }}
      >
        <div className="floating-auth-actions">
          <Link
            className="floating-back"
            to="/"
            style={{
              position: "absolute",
              top: 24,
              left: 24,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid #d4d4d8",
              background: "#ffffff",
              color: "#111318",
              fontSize: 11,
              fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 6px 18px rgba(17,19,24,0.06)",
              animation: "fadeIn 0.5s 0.25s ease both"
            }}
          >
            <i className="bi bi-arrow-left" />
            Back to Home
          </Link>

          <div
            className="floating-signup"
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
            <span style={{ fontSize: 10, color: "#a1a1aa", fontWeight: 500 }}>Don&apos;t have an account?</span>
            <Link
              to="/register"
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#111318",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 2
              }}
            >
              Sign up
            </Link>
          </div>
        </div>

        <div
          className="form-inner"
          style={{
            width: "100%",
            maxWidth: 380,
            animation: shake ? "shake 0.4s ease" : "fadeUp 0.5s 0.15s ease both"
          }}
        >
          <div style={{ marginBottom: 28 }}>
            <h1 className="login-page-title" style={{ fontSize: 26, fontWeight: 800, color: "#111318", letterSpacing: -0.8, marginBottom: 4 }}>Welcome back</h1>
            <p style={{ fontSize: 12, color: "#71717a", fontWeight: 400, lineHeight: 1.5 }}>
              Enter your credentials to access your dashboard
            </p>
          </div>

          {serverError ? (
            <div
              style={{
                marginBottom: 18,
                border: "1px solid #d4d4d8",
                background: "#fafafa",
                color: "#3f3f46",
                padding: "10px 12px",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 500
              }}
            >
              {serverError}
            </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#3f3f46", display: "block", marginBottom: 5, letterSpacing: 0.1 }}>Username</label>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", transition: "color 0.2s", color: focused === "user" ? "#111318" : "#a1a1aa" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  ref={userRef}
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    if (errors.username) setErrors((prev) => ({ ...prev, username: undefined }));
                  }}
                  onFocus={() => setFocused("user")}
                  onBlur={() => setFocused(null)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter username"
                  style={{
                    ...inputStyle,
                    paddingLeft: 38,
                    borderColor: errors.username ? "#dc2626" : focused === "user" ? "#111318" : "#e4e4e7",
                    boxShadow: focused === "user" ? "0 0 0 3px rgba(17,19,24,0.08)" : errors.username ? "0 0 0 3px rgba(220,38,38,0.06)" : "none"
                  }}
                />
              </div>
              {errors.username ? <div style={errorStyle}>{errors.username}</div> : null}
            </div>

            <div>
              <div className="login-password-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#3f3f46", letterSpacing: 0.1 }}>Password</label>
                <Link to="/forgot-password" style={{ fontSize: 10, fontWeight: 500, color: "#111318", background: "none", border: "none", cursor: "pointer", opacity: 0.8 }}>
                  Forgot password?
                </Link>
              </div>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", transition: "color 0.2s", color: focused === "pass" ? "#111318" : "#a1a1aa" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  onFocus={() => setFocused("pass")}
                  onBlur={() => setFocused(null)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter password"
                  style={{
                    ...inputStyle,
                    paddingLeft: 38,
                    paddingRight: 40,
                    borderColor: errors.password ? "#dc2626" : focused === "pass" ? "#111318" : "#e4e4e7",
                    boxShadow: focused === "pass" ? "0 0 0 3px rgba(17,19,24,0.08)" : errors.password ? "0 0 0 3px rgba(220,38,38,0.06)" : "none"
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((value) => !value)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", color: "#a1a1aa", transition: "color 0.15s" }}
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password ? <div style={errorStyle}>{errors.password}</div> : null}
            </div>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                border: "none",
                background: loading ? "#52525b" : "#111318",
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
                <>
                  Sign in <i className="bi bi-arrow-right"></i>
                </>
              )}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#e4e4e7" }} />
            <span style={{ fontSize: 9, color: "#a1a1aa", fontWeight: 500, letterSpacing: 0.5, textTransform: "uppercase" }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: "#e4e4e7" }} />
          </div>

          <div className="login-secondary-actions" style={{ display: "flex", gap: 10 }}>
            <div
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 44,
                position: "relative"
              }}
            >
              {!hasGoogleIdentityConfig ? (
                <div style={{ fontSize: 10, color: "#71717a", textAlign: "center", lineHeight: 1.5 }}>
                  {getGoogleIdentityConfigError()}
                </div>
              ) : (
                <>
                  <div
                    ref={googleButtonRef}
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "center",
                      visibility: googleReady ? "visible" : "hidden"
                    }}
                  />
                  {!googleReady ? (
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        border: "2px solid rgba(17,19,24,0.18)",
                        borderTopColor: "#111318",
                        borderRadius: "50%",
                        display: "inline-block",
                        animation: "spin 0.6s linear infinite",
                        position: "absolute"
                      }}
                    />
                  ) : null}
                  {googleError ? (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        padding: "0 10px",
                        fontSize: 10,
                        color: "#71717a",
                        textAlign: "center",
                        lineHeight: 1.5,
                        background: "#fff"
                      }}
                    >
                      {googleError}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
