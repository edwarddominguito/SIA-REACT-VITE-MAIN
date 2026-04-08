export const registerNotificationsServiceRoutes = (api, model) => {
  const deps = model.getDeps();
  const {
    asyncHandler,
    loadDb,
    getRequestUserContext,
    clean,
    isAdminContext,
    normalizeRecordCollection,
    canAccessNotification,
    listOrPaginated,
    updateDb,
    makeId,
    sanitizeStateMeta
  } = deps;

api.get("/notifications", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const context = getRequestUserContext(req);
  const to = clean(req.query?.to, 60);
  const requestedTo = isAdminContext(context) ? to : context.username || "";
  const notifications = requestedTo
    ? db.notifications.filter((n) => String(n.to) === requestedTo)
    : normalizeRecordCollection(db.notifications).filter((notification) => canAccessNotification(notification, context));
  const result = listOrPaginated(notifications, req, { defaultLimit: 30, maxLimit: 100 });
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

api.post("/notifications", asyncHandler(async (req, res) => {
  const to = clean(req.body?.to, 60);
  const title = clean(req.body?.title, 120) || "Notification";
  const message = clean(req.body?.message, 500);
  const type = clean(req.body?.type, 60) || "general";
  const appointmentId = clean(req.body?.appointmentId, 80);
  const officeMeetId = clean(req.body?.officeMeetId || req.body?.meetId, 80);

  if (!to || !message) {
    return res.status(400).json({ ok: false, message: "to and message are required." });
  }

  const nextDb = await updateDb((db) => {
    const recipientRecord = db.users.find((u) => String(u?.username) === to || String(u?.id) === to);
    if (!recipientRecord) {
      const err = new Error("Recipient user not found.");
      err.statusCode = 404;
      throw err;
    }
    const recipientUsername = String(recipientRecord.username || "").trim();
    if (!recipientUsername) {
      const err = new Error("Invalid recipient user.");
      err.statusCode = 400;
      throw err;
    }
    const notif = {
      id: makeId("NOTIF"),
      to: recipientUsername,
      appointmentId,
      officeMeetId,
      title,
      message,
      type,
      meta: sanitizeStateMeta(req.body?.meta),
      readAt: null,
      createdAt: new Date().toISOString()
    };
    return { ...db, notifications: [notif, ...db.notifications] };
  });

  const created = nextDb.notifications[0];
  return res.status(201).json({ ok: true, data: created });
}));

api.patch("/notifications/:id/read", asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 80);
  const context = getRequestUserContext(req);
  const nextDb = await updateDb((db) => {
    const idx = db.notifications.findIndex((n) => String(n.id) === id);
    if (idx < 0) {
      const err = new Error("Notification not found.");
      err.statusCode = 404;
      throw err;
    }
    if (!isAdminContext(context) && !canAccessNotification(db.notifications[idx], context)) {
      const err = new Error("You do not have access to update this notification.");
      err.statusCode = 403;
      throw err;
    }
    const notifications = db.notifications.slice();
    notifications[idx] = { ...notifications[idx], readAt: new Date().toISOString() };
    return { ...db, notifications };
  });

  const updated = nextDb.notifications.find((n) => String(n.id) === id);
  return res.json({ ok: true, data: updated });
}));

};