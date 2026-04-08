import { getCurrentUser, setCurrentUser, clearCurrentUser } from "./storageService.js";
import { apiRequest } from "../api/client.js";
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

export function logout() { clearCurrentUser(); }

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
