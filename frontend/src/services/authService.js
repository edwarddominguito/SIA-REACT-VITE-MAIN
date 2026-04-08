import { getCurrentUser, setCurrentUser, clearCurrentUser } from "./storageService.js";
import { apiRequest } from "../api/client.js";
import { hasSupabaseAuthConfig, supabase } from "../lib/supabaseClient.js";
import {
  cleanEmail,
  cleanPhone,
  cleanText,
  cleanUsername,
  createEntityId,
  isStrongEnoughPassword,
  isValidEmail,
  isValidPhone,
  isValidUsername
} from "../utils/input.js";

const GOOGLE_REDIRECT_PATH = "/auth/callback";

const formatGoogleConfigError = () =>
  "Google Sign-In is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.";

const getOAuthErrorFromSearch = () => {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search || "");
  const code = String(params.get("error") || "").trim();
  const description = String(params.get("error_description") || "").trim();
  if (!code && !description) return "";
  return description || code || "";
};

const buildGoogleRedirectUrl = () => {
  if (typeof window === "undefined") return GOOGLE_REDIRECT_PATH;
  return `${window.location.origin}${GOOGLE_REDIRECT_PATH}`;
};

const persistUserSession = (userLike) => {
  if (!userLike) return null;
  const next = {
    id: userLike.id,
    username: userLike.username,
    role: userLike.role,
    fullName: userLike.fullName || "",
    phone: userLike.phone || "",
    email: userLike.email || "",
    photoUrl: userLike.photoUrl || ""
  };
  setCurrentUser(next);
  return next;
};

const getSessionFromCallbackUrlIfPresent = async () => {
  if (!supabase) return null;
  const hash = typeof window === "undefined" ? "" : String(window.location.hash || "").replace(/^#/, "");
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const accessToken = String(params.get("access_token") || "").trim();
  const refreshToken = String(params.get("refresh_token") || "").trim();
  if (!accessToken || !refreshToken) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });
  if (error) {
    throw error;
  }

  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }
  return data?.session || null;
};

export async function login(username, password) {
  const uname = cleanUsername(username);
  const pwd = String(password || "");
  if (!uname || !pwd) {
    return { ok: false, message: "Username and password are required.", data: null };
  }

  try {
    const res = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: uname, password: pwd })
    });
    const u = res?.data;
    if (!u) return { ok: false, message: "Login failed.", data: null };

    setCurrentUser({
      id: u.id,
      username: u.username,
      role: u.role,
      fullName: u.fullName || "",
      phone: u.phone || "",
      email: u.email || "",
      photoUrl: u.photoUrl || ""
    });
    return { ok: true, user: u, data: u };
  } catch (error) {
    return { ok: false, message: error?.message || "Login failed.", data: null };
  }
}

export function logout() {
  clearCurrentUser();
  if (supabase) {
    void supabase.auth.signOut();
  }
}

export async function loginWithGoogle() {
  if (!hasSupabaseAuthConfig || !supabase) {
    return { ok: false, message: formatGoogleConfigError(), data: null };
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: buildGoogleRedirectUrl()
    }
  });
  if (error) {
    return { ok: false, message: error.message || "Unable to start Google Sign-In.", data: null };
  }
  return { ok: true, data: { redirecting: true } };
}

export async function completeGoogleSignInFromUrl() {
  if (!hasSupabaseAuthConfig || !supabase) {
    return { ok: false, message: formatGoogleConfigError(), data: null };
  }

  try {
    const oauthError = getOAuthErrorFromSearch();
    if (oauthError) {
      return { ok: false, message: oauthError, data: null };
    }

    const hashSession = await getSessionFromCallbackUrlIfPresent();
    const session = hashSession || (await supabase.auth.getSession()).data?.session || null;
    if (!session?.access_token) {
      return { ok: false, message: "Google session was not found after redirect.", data: null };
    }

    const res = await apiRequest("/api/auth/google/session", {
      method: "POST",
      body: JSON.stringify({}),
      skipAuthHeaders: true,
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });
    const user = persistUserSession(res?.data);
    if (!user) {
      return { ok: false, message: "Google login succeeded but user session could not be created.", data: null };
    }
    return { ok: true, data: user, user };
  } catch (error) {
    return { ok: false, message: error?.message || "Google Sign-In failed.", data: null };
  }
}

export async function register(newUser) {
  const username = cleanUsername(newUser.username);
  const fullName = cleanText(newUser.fullName, 80);
  const phone = cleanPhone(newUser.phone);
  const email = cleanEmail(newUser.email);
  const password = String(newUser.password || "");
  const photoUrl = cleanText(newUser.photoUrl, 400);

  if (!isValidUsername(username)) {
    return { ok: false, message: "Username must be 3-32 chars and only letters, numbers, ., _, -.", data: null };
  }
  if (!fullName) {
    return { ok: false, message: "Full name is required.", data: null };
  }
  if (!isStrongEnoughPassword(password, 6)) {
    return { ok: false, message: "Password must be at least 6 characters.", data: null };
  }
  if (!isValidEmail(email)) {
    return { ok: false, message: "Email format is invalid.", data: null };
  }
  if (!isValidPhone(phone)) {
    return { ok: false, message: "Phone format is invalid.", data: null };
  }

  try {
    const res = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        fullName,
        phone,
        email,
        role: "customer"
      })
    });
    const created = {
      id: res?.data?.id || createEntityId("USR"),
      username,
      role: res?.data?.role || "customer",
      fullName,
      phone,
      email,
      photoUrl: photoUrl || ""
    };
    return { ok: true, user: created, data: created };
  } catch (err) {
    return { ok: false, message: err?.message || "Unable to register account.", data: null };
  }
}

export async function resetPassword({ username, email, newPassword }) {
  const uname = cleanUsername(username);
  const mail = cleanEmail(email);
  const password = String(newPassword || "");

  if (!uname || !mail) {
    return { ok: false, message: "Username and email are required.", data: null };
  }
  if (!isStrongEnoughPassword(password, 6)) {
    return { ok: false, message: "Password must be at least 6 characters.", data: null };
  }

  try {
    await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ username: uname, email: mail, newPassword: password })
    });
  } catch (error) {
    return { ok: false, message: error?.message || "Unable to reset password.", data: null };
  }
  return { ok: true, data: { username: uname } };
}

export function requireRole(role) {
  const u = getCurrentUser();
  if (!u) return { ok: false, reason: "missing" };
  if (!u.username || !u.role) return { ok: false, reason: "invalid" };
  if (role && u.role !== role) return { ok: false, reason: "forbidden", user: u };
  return { ok: true, user: u };
}
