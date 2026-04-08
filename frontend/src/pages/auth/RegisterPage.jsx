import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { register } from "@/services/authService.js";
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

const fieldMeta = [
  { key: "fullName", label: "Full Name", placeholder: "Juan Dela Cruz", autoComplete: "name", icon: "user" },
  { key: "phone", label: "Phone", placeholder: "09XXXXXXXXX", autoComplete: "tel", icon: "phone" },
  { key: "email", label: "Email", placeholder: "you@example.com", autoComplete: "email", icon: "mail" },
  { key: "username", label: "Username", placeholder: "your_username", autoComplete: "username", icon: "id" }
];

function FieldIcon({ type }) {
  if (type === "phone") {
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.63 2.62a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.46-1.29a2 2 0 0 1 2.11-.45c.84.3 1.72.51 2.62.63A2 2 0 0 1 22 16.92z" /></svg>;
  }
  if (type === "mail") {
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 4h16v16H4z" opacity=".001" /><path d="M4 6l8 6 8-6" /><rect x="3" y="5" width="18" height="14" rx="2" /></svg>;
  }
  if (type === "id") {
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 10h8M8 14h5" /></svg>;
  }
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
}

export default function Register() {
  const nav = useNavigate();
  const firstFieldRef = useRef(null);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [showSuccess, setShowSuccess] = useState("");
  const [focused, setFocused] = useState(null);
  const [shake, setShake] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState({
    fullName: false,
    phone: false,
    email: false,
    username: false,
    password: false
  });

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (serverError) setServerError("");
    if (showSuccess) setShowSuccess("");
  };

  const touchField = (key) => setTouched((prev) => ({ ...prev, [key]: true }));

  const triggerShake = () => {
    setShake(true);
    window.setTimeout(() => setShake(false), 500);
  };

  const getFieldErrors = () => ({
    fullName: !form.fullName.trim() ? "Full name is required." : "",
    phone: !form.phone.trim()
      ? "Phone is required."
      : !isValidPhone(form.phone)
      ? "Use format: 09XX, +63XX (7-20 digits)."
      : "",
    email: !form.email.trim()
      ? "Email is required."
      : !isValidEmail(form.email)
      ? "Enter a valid email address."
      : "",
    username: !form.username.trim()
      ? "Username is required."
      : !isValidUsername(form.username)
      ? "3-32 chars, letters/numbers/._- only."
      : "",
    password: !form.password.trim()
      ? "Password is required."
      : !isStrongEnoughPassword(form.password, 6)
      ? "Password must be at least 6 characters."
      : ""
  });

  const [errors, setErrors] = useState(getFieldErrors());

  useEffect(() => {
    setErrors(getFieldErrors());
  }, [form]);

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const nextErrors = getFieldErrors();
    setErrors(nextErrors);
    setTouched({
      fullName: true,
      phone: true,
      email: true,
      username: true,
      password: true
    });
    setServerError("");
    setShowSuccess("");

    if (Object.values(nextErrors).some(Boolean)) {
      triggerShake();
      return;
    }

    const payload = {
      ...form,
      fullName: cleanText(form.fullName, 80),
      phone: cleanPhone(form.phone),
      email: cleanEmail(form.email),
      username: cleanUsername(form.username)
    };

    try {
      setIsSubmitting(true);
      const result = await register(payload);
      if (!result?.ok) {
        setServerError(result?.message || "Unable to create account.");
        triggerShake();
        return;
      }

      setShowSuccess("Account created successfully. Redirecting to sign in...");
      window.setTimeout(() => {
        nav("/login", { replace: true });
      }, 900);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="register-redesign-shell"
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
          .register-redesign-shell{flex-direction:column}
          .register-redesign-brand-panel{display:none !important}
          .register-redesign-form-panel{padding:28px 18px !important}
          .register-redesign-form-card{max-width:520px !important}
          .register-redesign-top-links{position:static !important;margin-bottom:22px;justify-content:flex-end}
          .register-redesign-grid{grid-template-columns:1fr !important}
        }
        @media (max-width: 560px){
          .register-redesign-form-card{max-width:none !important}
        }
      `}</style>

      <div
        className="register-redesign-brand-panel"
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
            Create your profile
            <br />
            and start booking faster.
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.7, maxWidth: 320 }}>
            Join in minutes and unlock property appointments, saved listings, notifications, and trip updates.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28 }}>
            {[
              { icon: "M3 10l9-7 9 7v11a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1V10z", title: "Verified Listings", desc: "Browse trusted properties with up-to-date details" },
              { icon: "M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z", title: "Easy Appointments", desc: "Book and track property viewings from one place" }
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
        className="register-redesign-form-panel"
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
          className="register-redesign-top-links"
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
          <span style={{ fontSize: 10, color: "#a0a4b0", fontWeight: 500 }}>Already have an account?</span>
          <button
            type="button"
            onClick={() => nav("/login")}
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
            Sign in
          </button>
        </div>

        <div
          className="register-redesign-form-card"
          style={{
            width: "100%",
            maxWidth: 540,
            animation: shake ? "shake 0.4s ease" : "fadeUp 0.5s 0.15s ease both"
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#111318", letterSpacing: -0.8, marginBottom: 4 }}>Create customer account</h1>
            <p style={{ fontSize: 12, color: "#8b8f9e", fontWeight: 400, lineHeight: 1.5 }}>Set up your profile to access listings, appointments, and trip updates</p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {["Verified Listings", "Easy Appointments", "Trusted Agents"].map((label) => (
              <span
                key={label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  border: "1px solid #d8e2f0",
                  background: "#f6faff",
                  color: "#2f4562",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: ".8rem",
                  fontWeight: 800
                }}
              >
                <i className="bi bi-check2-circle" style={{ color: "#1e3a5f" }}></i>
                {label}
              </span>
            ))}
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
            {showSuccess ? (
              <div style={{ ...errorStyle, color: "#2b8a3e", marginTop: -6, marginBottom: -6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                {showSuccess}
              </div>
            ) : null}

            <div className="register-redesign-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 16 }}>
              {fieldMeta.map((field, index) => (
                <div key={field.key}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#3a3f4b", display: "block", marginBottom: 5, letterSpacing: 0.1 }}>{field.label}</label>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", transition: "color 0.2s", color: focused === field.key ? "#3b5bdb" : "#c4c7d0" }}>
                      <FieldIcon type={field.icon} />
                    </div>
                    <input
                      ref={index === 0 ? firstFieldRef : undefined}
                      value={form[field.key]}
                      onChange={(e) => {
                        setField(field.key, e.target.value);
                        if (errors[field.key]) setErrors((prev) => ({ ...prev, [field.key]: "" }));
                      }}
                      onFocus={() => setFocused(field.key)}
                      onBlur={() => {
                        setFocused(null);
                        touchField(field.key);
                      }}
                      placeholder={field.placeholder}
                      autoComplete={field.autoComplete}
                      style={{
                        ...inputStyle,
                        paddingLeft: 38,
                        borderColor: errors[field.key] && touched[field.key] ? "#e03131" : focused === field.key ? "#3b5bdb" : "#e3e5ea",
                        boxShadow: focused === field.key ? "0 0 0 3px rgba(59,91,219,0.08)" : errors[field.key] && touched[field.key] ? "0 0 0 3px rgba(224,49,49,0.06)" : "none"
                      }}
                    />
                  </div>
                  {errors[field.key] && touched[field.key] ? <div style={errorStyle}>{errors[field.key]}</div> : null}
                </div>
              ))}

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#3a3f4b", display: "block", marginBottom: 5, letterSpacing: 0.1 }}>Password</label>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", transition: "color 0.2s", color: focused === "password" ? "#3b5bdb" : "#c4c7d0" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => {
                      setField("password", e.target.value);
                      if (errors.password) setErrors((prev) => ({ ...prev, password: "" }));
                    }}
                    onFocus={() => setFocused("password")}
                    onBlur={() => {
                      setFocused(null);
                      touchField("password");
                    }}
                    autoComplete="new-password"
                    placeholder="Min. 6 characters"
                    style={{
                      ...inputStyle,
                      paddingLeft: 38,
                      paddingRight: 40,
                      borderColor: errors.password && touched.password ? "#e03131" : focused === "password" ? "#3b5bdb" : "#e3e5ea",
                      boxShadow: focused === "password" ? "0 0 0 3px rgba(59,91,219,0.08)" : errors.password && touched.password ? "0 0 0 3px rgba(224,49,49,0.06)" : "none"
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", color: "#a0a4b0", transition: "color 0.15s" }}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
                {errors.password && touched.password ? <div style={errorStyle}>{errors.password}</div> : null}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                border: "none",
                background: isSubmitting ? "#6b7084" : "#111318",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: isSubmitting ? "not-allowed" : "pointer",
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
              {isSubmitting ? (
                <>
                  <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.25)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.6s linear infinite" }} />
                  Creating account...
                </>
              ) : (
                <>
                  <i className="bi bi-person-plus"></i>
                  Create Account
                </>
              )}
            </button>
          </form>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
            <button
              type="button"
              onClick={() => nav("/")}
              style={{ fontSize: 10, fontWeight: 500, color: "#a0a4b0", background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, transition: "color 0.15s" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              Back to home
            </button>
            <button
              type="button"
              onClick={() => nav("/login")}
              style={{ fontSize: 12, fontWeight: 700, color: "#2756e1", background: "none", border: "none", cursor: "pointer" }}
            >
              Already have an account? Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
