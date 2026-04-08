import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { completeGoogleSignInFromUrl } from "@/services/authService.js";
import { getCurrentUser } from "@/services/storageService.js";

const routeForRole = (role) => {
  if (role === "admin") return "/admin";
  if (role === "agent") return "/agent";
  return "/customer/dashboard";
};

export default function OAuthCallbackPage() {
  const nav = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const result = await completeGoogleSignInFromUrl();
      if (cancelled) return;
      if (!result?.ok) {
        setError(result?.message || "Google sign-in failed.");
        return;
      }
      const currentUser = getCurrentUser();
      nav(routeForRole(currentUser?.role), { replace: true });
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [nav]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f7f8fa",
        fontFamily: "'Outfit', system-ui, sans-serif",
        padding: 20
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          border: "1px solid #e8ebf0",
          borderRadius: 14,
          padding: "26px 22px",
          boxShadow: "0 6px 24px rgba(17, 19, 24, 0.06)"
        }}
      >
        <h1 style={{ fontSize: 22, margin: 0, marginBottom: 8, color: "#111318" }}>Signing you in...</h1>
        {!error ? (
          <p style={{ margin: 0, color: "#5f6778", fontSize: 13 }}>
            Completing Google sign-in. You will be redirected automatically.
          </p>
        ) : (
          <>
            <p style={{ margin: 0, color: "#b42318", fontSize: 13, marginBottom: 14 }}>{error}</p>
            <button
              type="button"
              onClick={() => nav("/login", { replace: true })}
              style={{
                border: "none",
                borderRadius: 10,
                padding: "10px 14px",
                background: "#111318",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}

