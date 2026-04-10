import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

const inputStyle = {
  width: "100%",
  padding: "14px 18px",
  borderRadius: 18,
  border: "1.5px solid #d4d4d8",
  background: "#ffffff",
  fontSize: 13,
  color: "#111318",
  fontWeight: 400,
  transition: "all 0.2s ease"
};

const errorStyle = {
  fontSize: 10,
  color: "#dc2626",
  marginTop: 5,
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  gap: 4
};

export default function RegisterPage() {
  const nav = useNavigate();
  const firstFieldRef = useRef(null);

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    username: "",
    password: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [showSuccess, setShowSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focused, setFocused] = useState(null);
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

  const errors = getFieldErrors();
  const showError = (field) => touched[field] && errors[field];

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const nextTouched = {
      fullName: true,
      phone: true,
      email: true,
      username: true,
      password: true
    };
    setTouched(nextTouched);
    setServerError("");
    setShowSuccess("");

    if (Object.values(errors).some(Boolean)) {
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
        return;
      }

      setShowSuccess("Account created successfully. Redirecting to sign in...");
      window.setTimeout(() => nav("/login", { replace: true }), 900);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="register-page"
      style={{
        minHeight: "100vh",
        fontFamily: "'Outfit', system-ui, sans-serif",
        background: "#f5f5f5",
        padding: "32px 20px"
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        *{box-sizing:border-box}
        input{font-family:inherit}
        input::placeholder{color:#71717a}
        input:focus{outline:none}
        button{font-family:inherit}
        button:active:not(:disabled){transform:scale(0.985)}
        @media (max-width: 1100px){
          .register-shell{grid-template-columns:1fr !important}
          .register-brand-panel{min-height:220px !important}
        }
        @media (max-width: 900px){
          .register-page{padding:24px 14px !important}
          .register-card{padding:28px 22px 24px !important}
          .register-form-shell{max-width:100% !important}
        }
        @media (max-width: 720px){
          .register-form-grid{grid-template-columns:1fr !important}
          .register-page-title{font-size:3rem !important}
          .register-card{padding:24px 18px 20px !important;border-radius:20px !important}
          .register-back-row{justify-content:flex-start !important;margin-bottom:14px !important}
        }
        @media (max-width: 480px){
          .register-page{padding:14px 10px !important}
          .register-card{padding:20px 14px 18px !important}
          .register-page-title{font-size:2.4rem !important}
          .register-page-copy{font-size:14px !important;margin-bottom:24px !important}
          .register-footer-note{margin-top:22px !important;font-size:11px !important}
        }
      `}</style>

      <div
        className="register-shell"
        style={{
          maxWidth: 860,
          margin: "0 auto",
          minHeight: "calc(100vh - 64px)",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 0,
          alignItems: "stretch"
        }}
      >
        <section
          className="register-card"
          style={{
            border: "1px solid #d4d4d8",
            borderRadius: 24,
            background: "#ffffff",
            boxShadow: "0 8px 26px rgba(17,19,24,0.06)",
            padding: "34px 30px 28px"
          }}
        >
          <div className="register-form-shell" style={{ maxWidth: 680, margin: "0 auto" }}>
            <div className="register-back-row" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <Link
                to="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#71717a",
                  textDecoration: "none"
                }}
              >
                <i className="bi bi-arrow-left" />
                Back to home
              </Link>
            </div>

            <h1 className="register-page-title" style={{ fontSize: 64, lineHeight: 0.96, fontWeight: 800, color: "#111318", letterSpacing: "-0.08em", marginBottom: 12 }}>
              Create account
            </h1>
            <p className="register-page-copy" style={{ fontSize: 16, lineHeight: 1.6, color: "#3f3f46", marginBottom: 34 }}>
              Set up your profile to start booking faster.
            </p>

            {serverError ? (
              <div
                style={{
                  marginBottom: 16,
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#991b1b",
                  padding: "12px 14px",
                  borderRadius: 14,
                  fontSize: 12,
                  fontWeight: 600
                }}
              >
                {serverError}
              </div>
            ) : null}

            {showSuccess ? (
              <div
                style={{
                  marginBottom: 16,
                  border: "1px solid #d4d4d8",
                  background: "#fafafa",
                  color: "#18181b",
                  padding: "12px 14px",
                  borderRadius: 14,
                  fontSize: 12,
                  fontWeight: 600
                }}
              >
                {showSuccess}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 22 }}>
              <div>
                <label htmlFor="register-fullName" style={{ display: "block", fontSize: 15, fontWeight: 700, color: "#111318", marginBottom: 10 }}>
                  Full Name
                </label>
                <input
                  id="register-fullName"
                  ref={firstFieldRef}
                  value={form.fullName}
                  onChange={(event) => setField("fullName", event.target.value)}
                  onBlur={() => touchField("fullName")}
                  onFocus={() => setFocused("fullName")}
                  placeholder="Juan Dela Cruz"
                  autoComplete="name"
                  style={{
                    ...inputStyle,
                    fontSize: 16,
                    padding: "16px 20px",
                    borderRadius: 18,
                    borderColor: showError("fullName") ? "#dc2626" : focused === "fullName" ? "#111318" : "#d4d4d8",
                    boxShadow: focused === "fullName" ? "0 0 0 3px rgba(17,19,24,0.06)" : "none"
                  }}
                />
                {showError("fullName") ? <div style={errorStyle}>{errors.fullName}</div> : null}
              </div>

              <div className="register-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <div>
                  <label htmlFor="register-phone" style={{ display: "block", fontSize: 15, fontWeight: 700, color: "#111318", marginBottom: 10 }}>
                    Phone
                  </label>
                  <input
                    id="register-phone"
                    value={form.phone}
                    onChange={(event) => setField("phone", event.target.value)}
                    onBlur={() => touchField("phone")}
                    onFocus={() => setFocused("phone")}
                    placeholder="09XXXXXXXXX"
                    autoComplete="tel"
                    style={{
                      ...inputStyle,
                      fontSize: 16,
                      padding: "16px 20px",
                      borderRadius: 18,
                      borderColor: showError("phone") ? "#dc2626" : focused === "phone" ? "#111318" : "#d4d4d8",
                      boxShadow: focused === "phone" ? "0 0 0 3px rgba(17,19,24,0.06)" : "none"
                    }}
                  />
                  {showError("phone") ? <div style={errorStyle}>{errors.phone}</div> : null}
                </div>

                <div>
                  <label htmlFor="register-email" style={{ display: "block", fontSize: 15, fontWeight: 700, color: "#111318", marginBottom: 10 }}>
                    Email
                  </label>
                  <input
                    id="register-email"
                    value={form.email}
                    onChange={(event) => setField("email", event.target.value)}
                    onBlur={() => touchField("email")}
                    onFocus={() => setFocused("email")}
                    placeholder="you@example.com"
                    autoComplete="email"
                    style={{
                      ...inputStyle,
                      fontSize: 16,
                      padding: "16px 20px",
                      borderRadius: 18,
                      borderColor: showError("email") ? "#dc2626" : focused === "email" ? "#111318" : "#d4d4d8",
                      boxShadow: focused === "email" ? "0 0 0 3px rgba(17,19,24,0.06)" : "none"
                    }}
                  />
                  {showError("email") ? <div style={errorStyle}>{errors.email}</div> : null}
                </div>

                <div>
                  <label htmlFor="register-username" style={{ display: "block", fontSize: 15, fontWeight: 700, color: "#111318", marginBottom: 10 }}>
                    Username
                  </label>
                  <input
                    id="register-username"
                    value={form.username}
                    onChange={(event) => setField("username", event.target.value)}
                    onBlur={() => touchField("username")}
                    onFocus={() => setFocused("username")}
                    placeholder="your_username"
                    autoComplete="username"
                    style={{
                      ...inputStyle,
                      fontSize: 16,
                      padding: "16px 20px",
                      borderRadius: 18,
                      borderColor: showError("username") ? "#dc2626" : focused === "username" ? "#111318" : "#d4d4d8",
                      boxShadow: focused === "username" ? "0 0 0 3px rgba(17,19,24,0.06)" : "none"
                    }}
                  />
                  {showError("username") ? <div style={errorStyle}>{errors.username}</div> : null}
                </div>

                <div>
                  <label htmlFor="register-password" style={{ display: "block", fontSize: 15, fontWeight: 700, color: "#111318", marginBottom: 10 }}>
                    Password
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="register-password"
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(event) => setField("password", event.target.value)}
                      onBlur={() => touchField("password")}
                      onFocus={() => setFocused("password")}
                      placeholder="Minimum 6 characters"
                      autoComplete="new-password"
                      style={{
                        ...inputStyle,
                        fontSize: 16,
                        padding: "16px 62px 16px 20px",
                        borderRadius: 18,
                        borderColor: showError("password") ? "#dc2626" : focused === "password" ? "#111318" : "#d4d4d8",
                        boxShadow: focused === "password" ? "0 0 0 3px rgba(17,19,24,0.06)" : "none"
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      style={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 42,
                        height: 42,
                        borderRadius: 14,
                        border: "1px solid #e4e4e7",
                        background: "#fafafa",
                        display: "grid",
                        placeItems: "center",
                        color: "#64748b",
                        cursor: "pointer"
                      }}
                    >
                      <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`} />
                    </button>
                  </div>
                  {showError("password") ? <div style={errorStyle}>{errors.password}</div> : null}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: "100%",
                  padding: "18px 20px",
                  borderRadius: 18,
                  border: "none",
                  background: "#000000",
                  color: "#ffffff",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  opacity: isSubmitting ? 0.72 : 1,
                  boxShadow: "0 10px 26px rgba(0,0,0,0.12)"
                }}
              >
                {isSubmitting ? "Creating account..." : "Create account"}
              </button>
            </form>

            <p style={{ marginTop: 28, fontSize: 15, color: "#52525b" }}>
              Already have an account?{" "}
              <Link to="/login" style={{ color: "#111318", fontWeight: 700, textDecoration: "none" }}>
                Sign in
              </Link>
            </p>

            <div className="register-footer-note" style={{ marginTop: 28, fontSize: 12, color: "#64748b" }}>
              (c) 2026 TES PROPERTY Real Estate.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
