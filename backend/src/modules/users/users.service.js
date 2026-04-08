export const registerUsersServiceRoutes = (api, model) => {
  const deps = model.getDeps();
  const {
    asyncHandler,
    requireRole,
    clean,
    loadDb,
    updateDb,
    listOrPaginated,
    normalizeAccountStatus,
    normalizeAvailabilityStatus,
    toRole,
    isValidUsername,
    isStrongPassword,
    isValidEmail,
    isValidPhone,
    makeId,
    sanitizeUserRecord,
    serializeUserForClient
  } = deps;

api.get("/users", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const db = await loadDb();
  const users = db.users.map((u) => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName || "",
    email: u.email || "",
    phone: u.phone || "",
    role: u.role || "customer",
    photoUrl: u.photoUrl || "",
    accountStatus: normalizeAccountStatus(u.accountStatus),
    availabilityStatus: normalizeAvailabilityStatus(u.availabilityStatus),
    lastActiveAt: u.lastActiveAt || "",
    deactivatedAt: u.deactivatedAt || "",
    createdAt: u.createdAt || "",
    updatedAt: u.updatedAt || ""
  }));
  const result = listOrPaginated(users, req);
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

api.post("/users", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const username = clean(req.body?.username, 50).replace(/\s+/g, "").toLowerCase();
  const password = clean(req.body?.password, 120);
  const fullName = clean(req.body?.fullName, 90);
  const email = clean(req.body?.email, 120).toLowerCase();
  const phone = clean(req.body?.phone, 30);
  const role = toRole(req.body?.role) === "admin" || toRole(req.body?.role) === "agent" ? toRole(req.body?.role) : "customer";

  if (!username || !password || !fullName) {
    return res.status(400).json({ ok: false, message: "username, password, and fullName are required." });
  }
  if (!isValidUsername(username)) {
    return res.status(400).json({ ok: false, message: "Invalid username format." });
  }
  if (!isStrongPassword(password, 6)) {
    return res.status(400).json({ ok: false, message: "Password must be at least 6 characters." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, message: "Invalid email format." });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ ok: false, message: "Invalid phone format." });
  }

  const nextDb = await updateDb((db) => {
    const exists = db.users.some((u) => clean(u.username, 50).replace(/\s+/g, "").toLowerCase() === username);
    if (exists) {
      const err = new Error("Username already exists.");
      err.statusCode = 409;
      throw err;
    }
    const createdUser = sanitizeUserRecord({
      id: makeId("USR"),
      username,
      password,
      fullName,
      email,
      phone,
      role,
      accountStatus: "active",
      availabilityStatus: role === "agent" ? "available" : "offline",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return { ...db, users: [createdUser, ...db.users] };
  });

  return res.status(201).json({ ok: true, data: serializeUserForClient(nextDb.users[0]) });
}));

api.patch("/users/:id", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 60);
  const fullName = clean(req.body?.fullName, 90);
  const email = clean(req.body?.email, 120).toLowerCase();
  const phone = clean(req.body?.phone, 30);
  const role = toRole(req.body?.role);
  const accountStatus = req.body?.accountStatus === undefined ? "" : normalizeAccountStatus(req.body?.accountStatus);
  const availabilityStatus = req.body?.availabilityStatus === undefined ? "" : normalizeAvailabilityStatus(req.body?.availabilityStatus);
  const photoUrl = req.body?.photoUrl === undefined ? "" : clean(req.body?.photoUrl, 1000);
  if (!fullName) {
    return res.status(400).json({ ok: false, message: "Full name is required." });
  }
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ ok: false, message: "Invalid email format." });
  }
  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({ ok: false, message: "Invalid phone format." });
  }
  if (role && !["admin", "agent", "customer"].includes(role)) {
    return res.status(400).json({ ok: false, message: "Invalid role." });
  }
  const nextDb = await updateDb((db) => {
    const idx = db.users.findIndex((u) => String(u.id) === id);
    if (idx < 0) {
      const err = new Error("User not found.");
      err.statusCode = 404;
      throw err;
    }
    const current = db.users[idx];
    const isPrimaryAdmin = String(current?.username || "") === "admin" && String(current?.role || "").toLowerCase() === "admin";
    if (isPrimaryAdmin && accountStatus === "inactive") {
      const err = new Error("The primary admin account cannot be deactivated.");
      err.statusCode = 400;
      throw err;
    }
    const nextUser = {
      ...current,
      fullName: fullName || current.fullName,
      email: email || current.email,
      phone: phone || current.phone,
      role: role || toRole(current.role) || "customer",
      photoUrl: photoUrl || current.photoUrl || "",
      accountStatus: accountStatus || normalizeAccountStatus(current.accountStatus),
      availabilityStatus: availabilityStatus || normalizeAvailabilityStatus(current.availabilityStatus),
      deactivatedAt: (accountStatus || normalizeAccountStatus(current.accountStatus)) === "inactive"
        ? current.deactivatedAt || new Date().toISOString()
        : "",
      updatedAt: new Date().toISOString()
    };
    const users = db.users.slice();
    users[idx] = sanitizeUserRecord(nextUser);
    return { ...db, users };
  });

  const updated = nextDb.users.find((u) => String(u.id) === id);
  return res.json({ ok: true, data: serializeUserForClient(updated) });
}));

api.delete("/users/:id", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 60);
  const nextDb = await updateDb((db) => {
    const idx = db.users.findIndex((u) => String(u.id) === id);
    if (idx < 0) {
      const err = new Error("User not found.");
      err.statusCode = 404;
      throw err;
    }
    const current = db.users[idx];
    if (String(current?.username || "") === "admin" && String(current?.role || "").toLowerCase() === "admin") {
      const err = new Error("The primary admin account cannot be deleted.");
      err.statusCode = 400;
      throw err;
    }
    const users = db.users.slice();
    users[idx] = sanitizeUserRecord({
      ...current,
      accountStatus: "inactive",
      availabilityStatus: "offline",
      deactivatedAt: current.deactivatedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return { ...db, users };
  });
  const updated = nextDb.users.find((u) => String(u.id) === id);
  return res.json({ ok: true, data: serializeUserForClient(updated) });
}));

};