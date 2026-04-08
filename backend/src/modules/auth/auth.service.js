export const registerAuthServiceRoutes = (api, model) => {
  const deps = model.getDeps();
  const {
    asyncHandler,
    clean,
    loadDb,
    updateDb,
    sanitizeUserRecord,
    normalizeAccountStatus,
    toRole,
    getRequestUserContext,
    isAdminContext,
    isValidUsername,
    isStrongPassword,
    isValidEmail,
    isValidPhone,
    makeId
  } = deps;

  const SUPABASE_URL = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, 500).replace(/\/+$/, "");
  const SUPABASE_ANON_KEY = clean(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY, 2500);
  const GOOGLE_AUTH_FALLBACK_PASSWORD = clean(process.env.GOOGLE_AUTH_FALLBACK_PASSWORD || "google_oauth_user", 120);

  const toSafeUser = (userLike) => ({
    id: userLike?.id,
    username: userLike?.username,
    fullName: userLike?.fullName || "",
    email: userLike?.email || "",
    phone: userLike?.phone || "",
    role: userLike?.role || "customer",
    photoUrl: userLike?.photoUrl || "",
    accountStatus: userLike?.accountStatus || "active",
    availabilityStatus: userLike?.availabilityStatus || "available",
    lastActiveAt: userLike?.lastActiveAt || ""
  });

  const baseUsernameFromEmail = (emailValue) => {
    const local = String(emailValue || "").split("@")[0] || "googleuser";
    const normalized = clean(local, 50).toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (normalized.length >= 3) return normalized.slice(0, 32);
    return "googleuser";
  };

  const makeUniqueUsername = (usersLike, seed) => {
    const taken = new Set(
      (Array.isArray(usersLike) ? usersLike : []).map((entry) => clean(entry?.username, 50).toLowerCase()).filter(Boolean)
    );
    const base = clean(seed, 32).toLowerCase().replace(/[^a-z0-9._-]/g, "") || "googleuser";
    if (!taken.has(base)) return base;

    let index = 1;
    while (index < 10000) {
      const suffix = `_${index}`;
      const candidate = `${base.slice(0, Math.max(3, 32 - suffix.length))}${suffix}`;
      if (!taken.has(candidate)) return candidate;
      index += 1;
    }
    return `google_${Date.now().toString(36).slice(-6)}`;
  };

  const parseJsonSafe = async (response) => {
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

  const fetchSupabaseUser = async (accessToken) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      const err = new Error("Google Sign-In backend is not configured. Missing SUPABASE_URL or SUPABASE_ANON_KEY.");
      err.statusCode = 500;
      throw err;
    }
    if (typeof fetch !== "function") {
      const err = new Error("This runtime does not support fetch, so Supabase token verification is unavailable.");
      err.statusCode = 500;
      throw err;
    }

    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`
      }
    });
    const payload = await parseJsonSafe(response);
    if (!response.ok) {
      const err = new Error(clean(payload?.msg || payload?.error_description || "Invalid Google session token.", 240));
      err.statusCode = response.status === 401 || response.status === 403 ? 401 : 400;
      throw err;
    }
    return payload || {};
  };

api.post("/auth/login", asyncHandler(async (req, res) => {
  const username = clean(req.body?.username, 50).replace(/\s+/g, "").toLowerCase();
  const password = clean(req.body?.password, 120);

  if (!username || !password) {
    return res.status(400).json({ ok: false, message: "Username and password are required." });
  }
  if (!isValidUsername(username)) {
    return res.status(400).json({ ok: false, message: "Invalid username format." });
  }

  const db = await loadDb();
  const user = db.users.find((u) => clean(u.username, 50).replace(/\s+/g, "").toLowerCase() === username && clean(u.password, 120) === password);
  if (!user) {
    return res.status(401).json({ ok: false, message: "Invalid credentials." });
  }
  if (normalizeAccountStatus(user.accountStatus) !== "active") {
    return res.status(403).json({ ok: false, message: "This account is inactive. Please contact support." });
  }

  const refreshedDb = await updateDb((currentDb) => {
    const idx = currentDb.users.findIndex((entry) => String(entry?.id || "") === String(user.id));
    if (idx < 0) return currentDb;
    const users = currentDb.users.slice();
    users[idx] = sanitizeUserRecord({
      ...users[idx],
      lastActiveAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return { ...currentDb, users };
  });
  const freshUser = refreshedDb.users.find((entry) => String(entry?.id || "") === String(user.id)) || user;

  return res.json({ ok: true, data: toSafeUser(freshUser) });
}));

api.post("/auth/google/session", asyncHandler(async (req, res) => {
  const authHeader = String(req.headers.authorization || "").trim();
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!accessToken) {
    return res.status(401).json({ ok: false, message: "Missing Google session token." });
  }

  const profile = await fetchSupabaseUser(accessToken);
  const providerUserId = clean(profile?.id, 120);
  const email = clean(profile?.email, 120).toLowerCase();
  const metadata = profile?.user_metadata && typeof profile.user_metadata === "object" ? profile.user_metadata : {};
  const fullName = clean(metadata?.full_name || metadata?.name, 90);
  const photoUrl = clean(metadata?.avatar_url || metadata?.picture, 1200);

  if (!providerUserId || !email) {
    return res.status(400).json({ ok: false, message: "Google account did not return a valid email profile." });
  }

  const nowIso = new Date().toISOString();
  const db = await loadDb();
  const existing = db.users.find((entry) => clean(entry?.email, 120).toLowerCase() === email) || null;
  if (existing && normalizeAccountStatus(existing.accountStatus) !== "active") {
    return res.status(403).json({ ok: false, message: "This account is inactive. Please contact support." });
  }

  const updatedDb = await updateDb((currentDb) => {
    const users = Array.isArray(currentDb?.users) ? currentDb.users.slice() : [];
    const existingIndex = users.findIndex((entry) => clean(entry?.email, 120).toLowerCase() === email);
    if (existingIndex >= 0) {
      users[existingIndex] = sanitizeUserRecord({
        ...users[existingIndex],
        fullName: fullName || users[existingIndex]?.fullName || baseUsernameFromEmail(email),
        photoUrl: photoUrl || users[existingIndex]?.photoUrl || "",
        lastActiveAt: nowIso,
        updatedAt: nowIso
      });
      return { ...currentDb, users };
    }

    const username = makeUniqueUsername(users, baseUsernameFromEmail(email));
    const created = sanitizeUserRecord({
      id: makeId("USR"),
      username,
      password: `${GOOGLE_AUTH_FALLBACK_PASSWORD}_${providerUserId}`.slice(0, 120),
      fullName: fullName || username,
      email,
      phone: "",
      photoUrl,
      role: "customer",
      accountStatus: "active",
      availabilityStatus: "offline",
      lastActiveAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso
    });
    return { ...currentDb, users: [created, ...users] };
  });

  const signedInUser = updatedDb.users.find((entry) => clean(entry?.email, 120).toLowerCase() === email);
  if (!signedInUser) {
    return res.status(500).json({ ok: false, message: "Unable to finalize Google sign-in." });
  }

  return res.json({ ok: true, data: toSafeUser(signedInUser) });
}));

api.post("/auth/register", asyncHandler(async (req, res) => {
  const username = clean(req.body?.username, 50).replace(/\s+/g, "").toLowerCase();
  const password = clean(req.body?.password, 120);
  const fullName = clean(req.body?.fullName, 90);
  const email = clean(req.body?.email, 120).toLowerCase();
  const phone = clean(req.body?.phone, 30);
  const requestedRole = toRole(req.body?.role) || "customer";
  const context = getRequestUserContext(req);
  const role = (requestedRole === "agent" || requestedRole === "admin")
    ? (isAdminContext(context) ? requestedRole : "customer")
    : "customer";

  if (!username || !password || !fullName) {
    return res.status(400).json({ ok: false, message: "username, password, and fullName are required." });
  }
  if (!isValidUsername(username)) {
    return res.status(400).json({ ok: false, message: "Invalid username format." });
  }
  if (!isStrongPassword(password, 6)) {
    return res.status(400).json({ ok: false, message: "Password must be at least 6 characters." });
  }
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ ok: false, message: "Invalid email format." });
  }
  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({ ok: false, message: "Invalid phone format." });
  }

  const nextDb = await updateDb((db) => {
    const exists = db.users.some((u) => clean(u.username, 50).replace(/\s+/g, "").toLowerCase() === username);
    if (exists) {
      const err = new Error("Username already exists.");
      err.statusCode = 409;
      throw err;
    }

    const user = {
      id: makeId("USR"),
      username,
      password,
      fullName,
      email,
      phone,
      role,
      accountStatus: "active",
      availabilityStatus: role === "agent" ? "available" : "offline",
      createdAt: new Date().toISOString()
    };
    return { ...db, users: [sanitizeUserRecord(user), ...db.users] };
  });

  const created = nextDb.users[0];
  return res.status(201).json({
    ok: true,
    data: {
      id: created.id,
      username: created.username,
      fullName: created.fullName,
      email: created.email,
      phone: created.phone,
      role: created.role,
      accountStatus: created.accountStatus,
      availabilityStatus: created.availabilityStatus
    }
  });
}));

api.post("/auth/reset-password", asyncHandler(async (req, res) => {
  const username = clean(req.body?.username, 50).replace(/\s+/g, "").toLowerCase();
  const email = clean(req.body?.email, 120).toLowerCase();
  const newPassword = clean(req.body?.newPassword, 120);

  if (!username || !email || !newPassword) {
    return res.status(400).json({ ok: false, message: "username, email, and newPassword are required." });
  }
  if (!isValidUsername(username)) {
    return res.status(400).json({ ok: false, message: "Invalid username format." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, message: "Invalid email format." });
  }
  if (!isStrongPassword(newPassword, 6)) {
    return res.status(400).json({ ok: false, message: "Password must be at least 6 characters." });
  }

  await updateDb((db) => {
    const idx = db.users.findIndex(
      (u) => clean(u.username, 50).replace(/\s+/g, "").toLowerCase() === username && clean(u.email, 120).toLowerCase() === email
    );
    if (idx < 0) {
      const err = new Error("No account matches that username and email.");
      err.statusCode = 404;
      throw err;
    }

    const users = db.users.slice();
    users[idx] = {
      ...users[idx],
      password: newPassword,
      updatedAt: new Date().toISOString()
    };
    return { ...db, users };
  });

  return res.json({ ok: true });
}));

};
