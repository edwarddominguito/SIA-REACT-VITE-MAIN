import { safeArray, saveArray, getCurrentUser, setCurrentUser, clearCurrentUser } from "./storage.js";
import { apiRequest } from "./apiClient.js";
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
} from "./inputUtils.js";

function loginLocal(username, password) {
  const users = safeArray("allUsers");
  const uname = cleanUsername(username);
  const pwd = String(password || "");
  const u = users.find((x) => cleanUsername(x.username) === uname && x.password === pwd);
  if (!u) return { ok: false, message: "Invalid username or password." };

  setCurrentUser({
    id: u.id,
    username: u.username,
    role: u.role,
    fullName: u.fullName,
    phone: u.phone,
    email: u.email,
    photoUrl: u.photoUrl
  });
  return { ok: true, user: u };
}

export async function login(username, password) {
  const uname = cleanUsername(username);
  const pwd = String(password || "");
  if (!uname || !pwd) {
    return { ok: false, message: "Username and password are required." };
  }

  try {
    const res = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: uname, password: pwd })
    });
    const u = res?.data;
    if (!u) return { ok: false, message: "Login failed." };

    setCurrentUser({
      id: u.id,
      username: u.username,
      role: u.role,
      fullName: u.fullName || "",
      phone: u.phone || "",
      email: u.email || "",
      photoUrl: u.photoUrl || ""
    });
    return { ok: true, user: u };
  } catch {
    return loginLocal(uname, pwd);
  }
}

export function logout() { clearCurrentUser(); }

export async function register(newUser) {
  const users = safeArray("allUsers");
  const username = cleanUsername(newUser.username);
  const fullName = cleanText(newUser.fullName, 80);
  const phone = cleanPhone(newUser.phone);
  const email = cleanEmail(newUser.email);
  const password = String(newUser.password || "");
  const photoUrl = cleanText(newUser.photoUrl, 400);

  if (!isValidUsername(username)) {
    return { ok: false, message: "Username must be 3-32 chars and only letters, numbers, ., _, -." };
  }
  if (!fullName) {
    return { ok: false, message: "Full name is required." };
  }
  if (!isStrongEnoughPassword(password, 6)) {
    return { ok: false, message: "Password must be at least 6 characters." };
  }
  if (!isValidEmail(email)) {
    return { ok: false, message: "Email format is invalid." };
  }
  if (!isValidPhone(phone)) {
    return { ok: false, message: "Phone format is invalid." };
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
      password,
      role: res?.data?.role || "customer",
      fullName,
      phone,
      email,
      photoUrl: photoUrl || ""
    };
    const next = users.slice();
    const hasSame = next.some((u) => cleanUsername(u.username) === username);
    if (!hasSame) next.push(created);
    saveArray("allUsers", next);
    return { ok: true, user: created };
  } catch (err) {
    const exists = users.some((u) => cleanUsername(u.username) === username);
    if (exists) return { ok: false, message: "Username already exists." };

    const created = {
      id: createEntityId("USR"),
      username,
      password,
      role: "customer",
      fullName,
      phone,
      email,
      photoUrl: photoUrl || ""
    };

    users.push(created);
    saveArray("allUsers", users);
    return { ok: true, user: created, note: err?.message || "" };
  }
}

export async function resetPassword({ username, email, newPassword }) {
  const users = safeArray("allUsers");
  const uname = cleanUsername(username);
  const mail = cleanEmail(email);
  const password = String(newPassword || "");

  if (!uname || !mail) {
    return { ok: false, message: "Username and email are required." };
  }
  if (!isStrongEnoughPassword(password, 6)) {
    return { ok: false, message: "Password must be at least 6 characters." };
  }

  try {
    await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ username: uname, email: mail, newPassword: password })
    });
  } catch {
    // keep local fallback below
  }

  const index = users.findIndex((u) => cleanUsername(u.username) === uname && cleanEmail(u.email) === mail);
  if (index < 0) {
    return { ok: false, message: "No account matches that username and email." };
  }

  const next = users.slice();
  next[index] = { ...next[index], password };
  saveArray("allUsers", next);
  return { ok: true };
}

export function requireRole(role) {
  const u = getCurrentUser();
  if (!u) return { ok: false };
  if (role && u.role !== role) return { ok: false };
  return { ok: true, user: u };
}
