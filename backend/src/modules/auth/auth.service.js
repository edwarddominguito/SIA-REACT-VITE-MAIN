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

  const safeUser = {
    id: freshUser.id,
    username: freshUser.username,
    fullName: freshUser.fullName || "",
    email: freshUser.email || "",
    phone: freshUser.phone || "",
    role: freshUser.role || "customer",
    photoUrl: freshUser.photoUrl || "",
    accountStatus: freshUser.accountStatus || "active",
    availabilityStatus: freshUser.availabilityStatus || "available",
    lastActiveAt: freshUser.lastActiveAt || ""
  };

  return res.json({ ok: true, data: safeUser });
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