import { createPublicKey, verify as verifySignature } from "crypto";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const DEFAULT_GOOGLE_JWK_CACHE_TTL_MS = 60 * 60 * 1000;

let googleJwkCache = {
  expiresAt: 0,
  keys: new Map()
};

const createStatusError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseCacheTtlMs = (cacheControlValue) => {
  const match = String(cacheControlValue || "").match(/max-age=(\d+)/i);
  const seconds = Number(match?.[1] || 0);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_GOOGLE_JWK_CACHE_TTL_MS;
};

const decodeBase64UrlToBuffer = (value) => {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
};

const parseJwtJsonPart = (segment, label) => {
  try {
    return JSON.parse(decodeBase64UrlToBuffer(segment).toString("utf8"));
  } catch {
    throw createStatusError(`Google ID token ${label} is invalid.`, 401);
  }
};

const parseGoogleIdToken = (token) => {
  const parts = String(token || "").trim().split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw createStatusError("Google ID token is malformed.", 401);
  }

  return {
    header: parseJwtJsonPart(parts[0], "header"),
    payload: parseJwtJsonPart(parts[1], "payload"),
    signature: decodeBase64UrlToBuffer(parts[2]),
    signingInput: `${parts[0]}.${parts[1]}`
  };
};

const toGoogleJwkMap = (keysLike) => {
  const entries = Array.isArray(keysLike)
    ? keysLike
        .filter((entry) => entry && typeof entry === "object" && entry.kid)
        .map((entry) => [String(entry.kid), entry])
    : [];
  return new Map(entries);
};

const fetchGoogleJwks = async (forceRefresh = false) => {
  if (!forceRefresh && googleJwkCache.expiresAt > Date.now() && googleJwkCache.keys.size > 0) {
    return googleJwkCache.keys;
  }

  if (typeof fetch !== "function") {
    throw createStatusError("This runtime does not support fetch, so Google ID token verification is unavailable.", 500);
  }

  let response;
  try {
    response = await fetch(GOOGLE_JWKS_URL, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
  } catch (error) {
    const wrapped = createStatusError("Unable to reach Google to verify the Google ID token.", 502);
    wrapped.cause = error;
    throw wrapped;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !Array.isArray(payload?.keys)) {
    throw createStatusError("Google ID token verification keys could not be loaded.", 502);
  }

  googleJwkCache = {
    expiresAt: Date.now() + parseCacheTtlMs(response.headers.get("cache-control")),
    keys: toGoogleJwkMap(payload.keys)
  };

  return googleJwkCache.keys;
};

const getGoogleJwkByKid = async (kid) => {
  const normalizedKid = String(kid || "").trim();
  if (!normalizedKid) return null;

  let keys = await fetchGoogleJwks(false);
  let jwk = keys.get(normalizedKid) || null;
  if (jwk) return jwk;

  keys = await fetchGoogleJwks(true);
  jwk = keys.get(normalizedKid) || null;
  return jwk;
};

const isVerifiedGoogleEmail = (payload) => {
  const emailVerified = payload?.email_verified;
  return emailVerified === true || String(emailVerified || "").toLowerCase() === "true";
};

const verifyGoogleTokenClaims = (payload, googleClientId, clean) => {
  const issuer = String(payload?.iss || "").trim();
  if (!GOOGLE_ISSUERS.has(issuer)) {
    throw createStatusError("Google ID token issuer is invalid.", 401);
  }

  const audiences = Array.isArray(payload?.aud)
    ? payload.aud.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [String(payload?.aud || "").trim()].filter(Boolean);
  if (!audiences.includes(googleClientId)) {
    throw createStatusError("Google ID token audience does not match this app.", 401);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = Number(payload?.exp || 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds) {
    throw createStatusError("Google ID token has expired.", 401);
  }

  const subject = clean(payload?.sub, 120);
  if (!subject) {
    throw createStatusError("Google ID token is missing the user subject.", 401);
  }

  const email = clean(payload?.email, 120).toLowerCase();
  if (!email) {
    throw createStatusError("Google account did not return a valid email profile.", 400);
  }

  if (!isVerifiedGoogleEmail(payload)) {
    throw createStatusError("Google account email is not verified.", 403);
  }
};

const verifyGoogleIdToken = async (idToken, googleClientId, clean) => {
  if (!googleClientId) {
    throw createStatusError("Google Sign-In backend is not configured. Missing GOOGLE_CLIENT_ID.", 500);
  }

  const parsed = parseGoogleIdToken(idToken);
  if (String(parsed.header?.alg || "").trim() !== "RS256") {
    throw createStatusError("Google ID token uses an unsupported signature algorithm.", 401);
  }

  const jwk = await getGoogleJwkByKid(parsed.header?.kid);
  if (!jwk) {
    throw createStatusError("Google ID token signing key could not be found.", 401);
  }

  let publicKey;
  try {
    publicKey = createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    throw createStatusError("Google ID token signing key is invalid.", 401);
  }

  const isValidSignature = verifySignature(
    "RSA-SHA256",
    Buffer.from(parsed.signingInput, "utf8"),
    publicKey,
    parsed.signature
  );
  if (!isValidSignature) {
    throw createStatusError("Google ID token signature is invalid.", 401);
  }

  verifyGoogleTokenClaims(parsed.payload, googleClientId, clean);

  return {
    id: clean(parsed.payload?.sub, 120),
    email: clean(parsed.payload?.email, 120).toLowerCase(),
    user_metadata: {
      full_name: clean(parsed.payload?.name, 90),
      name: clean(parsed.payload?.name, 90),
      avatar_url: clean(parsed.payload?.picture, 1200),
      picture: clean(parsed.payload?.picture, 1200),
      given_name: clean(parsed.payload?.given_name, 90),
      family_name: clean(parsed.payload?.family_name, 90)
    }
  };
};

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

  const GOOGLE_CLIENT_ID = clean(
    process.env.GOOGLE_CLIENT_ID
      || process.env.GOOGLE_OAUTH_CLIENT_ID
      || process.env.GOOGLE_CALENDAR_CLIENT_ID
      || process.env.VITE_GOOGLE_CLIENT_ID,
    500
  );
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
    const user = db.users.find(
      (entry) => clean(entry.username, 50).replace(/\s+/g, "").toLowerCase() === username && clean(entry.password, 120) === password
    );
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
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const idToken = String(req.body?.credential || req.body?.idToken || bearerToken).trim();
    if (!idToken) {
      return res.status(401).json({ ok: false, message: "Missing Google ID token." });
    }

    const profile = await verifyGoogleIdToken(idToken, GOOGLE_CLIENT_ID, clean);
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
      const exists = db.users.some((entry) => clean(entry.username, 50).replace(/\s+/g, "").toLowerCase() === username);
      if (exists) {
        const error = new Error("Username already exists.");
        error.statusCode = 409;
        throw error;
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
        (entry) =>
          clean(entry?.username, 50).replace(/\s+/g, "").toLowerCase() === username
          && clean(entry?.email, 120).toLowerCase() === email
      );
      if (idx < 0) {
        const error = new Error("No account matches that username and email.");
        error.statusCode = 404;
        throw error;
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
