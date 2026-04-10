import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { resetPassword } from "@/services/authService.js";
import { cleanEmail, cleanUsername, isStrongEnoughPassword, isValidEmail } from "@/utils/input.js";
import { Button, Card, Input } from "@/components/ui/index.js";

export default function ForgotPasswordPage() {
  const nav = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState("");
  const [touched, setTouched] = useState({
    username: false,
    email: false,
    password: false,
    confirmPassword: false
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (success) setSuccess("");
  };

  const getFieldErrors = () => ({
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
  });

  const fieldErrors = getFieldErrors();
  const canSubmit = Object.values(fieldErrors).every((value) => !value);
  const showFieldError = (field) => (touched[field] || submitted) && fieldErrors[field];
  const touch = (field) => setTouched((state) => ({ ...state, [field]: true }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setSubmitted(true);
    setServerError("");
    setSuccess("");

    if (Object.values(getFieldErrors()).some(Boolean)) return;

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
  };

  return (
    <div className="min-h-screen bg-zinc-100/70">
      <div className="container grid min-h-screen place-items-center py-10">
        <Card className="w-full max-w-xl space-y-6 p-6 md:p-8">
          <div className="space-y-2">
            <h1 className="typo-page-title text-zinc-950">Reset password</h1>
            <p className="typo-body">Verify your account identity and set a new password.</p>
          </div>

          {serverError ? (
            <div className="rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700">
              {serverError}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700">
              {success}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="forgot-username" className="text-sm font-semibold text-zinc-800">Username</label>
              <Input
                id="forgot-username"
                value={form.username}
                onChange={(event) => setField("username", event.target.value)}
                onBlur={() => touch("username")}
                placeholder="your_username"
                error={Boolean(showFieldError("username"))}
              />
              {showFieldError("username") ? <p className="text-xs font-medium text-zinc-600">{fieldErrors.username}</p> : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="forgot-email" className="text-sm font-semibold text-zinc-800">Email</label>
              <Input
                id="forgot-email"
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                onBlur={() => touch("email")}
                placeholder="you@example.com"
                error={Boolean(showFieldError("email"))}
              />
              {showFieldError("email") ? <p className="text-xs font-medium text-zinc-600">{fieldErrors.email}</p> : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="forgot-password" className="text-sm font-semibold text-zinc-800">New Password</label>
              <div className="relative">
                <Input
                  id="forgot-password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) => setField("password", event.target.value)}
                  onBlur={() => touch("password")}
                  placeholder="Minimum 6 characters"
                  className="pr-12"
                  error={Boolean(showFieldError("password"))}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-2 my-auto grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`}></i>
                </button>
              </div>
              {showFieldError("password") ? <p className="text-xs font-medium text-zinc-600">{fieldErrors.password}</p> : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="forgot-confirmPassword" className="text-sm font-semibold text-zinc-800">Confirm Password</label>
              <Input
                id="forgot-confirmPassword"
                type={showPassword ? "text" : "password"}
                value={form.confirmPassword}
                onChange={(event) => setField("confirmPassword", event.target.value)}
                onBlur={() => touch("confirmPassword")}
                placeholder="Re-enter new password"
                error={Boolean(showFieldError("confirmPassword"))}
              />
              {showFieldError("confirmPassword") ? <p className="text-xs font-medium text-zinc-600">{fieldErrors.confirmPassword}</p> : null}
            </div>

            <Button type="submit" size="cta" className="w-full" loading={isSubmitting} disabled={!canSubmit}>
              {isSubmitting ? "Resetting password..." : "Reset password"}
            </Button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link to="/login" className="font-medium text-zinc-600 no-underline hover:text-zinc-900">
              Back to login
            </Link>
            <Link to="/register" className="font-semibold text-zinc-900 no-underline hover:text-black">
              Create account
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
