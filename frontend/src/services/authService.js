import { apiRequest } from "../api/client.js";
import { clearGoogleAutoSelect, getGoogleIdentityConfigError, hasGoogleIdentityConfig } from "../lib/googleIdentity.js";
import { getCurrentUser, setCurrentUser, clearCurrentUser } from "./storageService.js";
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
    const user = res?.data;
    if (!user) return { ok: false, message: "Login failed.", data: null };

    setCurrentUser({
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName || "",
      phone: user.phone || "",
      email: user.email || "",
      photoUrl: user.photoUrl || ""
    });
    return { ok: true, user, data: user };
  } catch (error) {
    return { ok: false, message: error?.message || "Login failed.", data: null };
  }
}

export function logout() {
  clearCurrentUser();
  clearGoogleAutoSelect();
}

export async function loginWithGoogleCredential(credential) {
  if (!hasGoogleIdentityConfig) {
    return { ok: false, message: getGoogleIdentityConfigError(), data: null };
  }

  const idToken = String(credential || "").trim();
  if (!idToken) {
    return { ok: false, message: "Google Sign-In did not return an ID token.", data: null };
  }

  try {
    const res = await apiRequest("/api/auth/google/session", {
      method: "POST",
      body: JSON.stringify({ credential: idToken }),
      skipAuthHeaders: true
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
  } catch (error) {
    return { ok: false, message: error?.message || "Unable to register account.", data: null };
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
  const user = getCurrentUser();
  if (!user) return { ok: false, reason: "missing" };
  if (!user.username || !user.role) return { ok: false, reason: "invalid" };
  if (role && user.role !== role) return { ok: false, reason: "forbidden", user };
  return { ok: true, user };
}
