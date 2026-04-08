export const registerCalendarServiceRoutes = (api, model) => {
  const deps = model.getDeps();
  const {
    asyncHandler,
    requireRole,
    loadDb,
    buildGoogleCalendarStatusSummary,
    GOOGLE_CALENDAR_SYNC_ENABLED,
    isGoogleCalendarConfigured,
    getMissingGoogleCalendarSettings,
    updateDb,
    syncGoogleCalendarBatch,
    scopeStateForContext,
    getRequestUserContext,
    normalizeTripStatusForClient,
    listOrPaginated
  } = deps;

api.get("/calendar/google/status", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const db = await loadDb({ forceReload: true });
  return res.json({ ok: true, data: buildGoogleCalendarStatusSummary(db) });
}));

api.post("/calendar/google/sync", requireRole(["admin"]), asyncHandler(async (req, res) => {
  if (!GOOGLE_CALENDAR_SYNC_ENABLED) {
    return res.status(400).json({
      ok: false,
      message: "Google Calendar sync is disabled. Set GOOGLE_CALENDAR_SYNC_ENABLED=true in backend .env."
    });
  }
  if (!isGoogleCalendarConfigured()) {
    return res.status(400).json({
      ok: false,
      message: "Google Calendar sync is missing one or more OAuth settings in backend .env.",
      missingFields: getMissingGoogleCalendarSettings()
    });
  }

  let syncResult = { processed: 0 };
  const syncedDb = await updateDb(async (currentDb) => {
    syncResult = await syncGoogleCalendarBatch(currentDb);
    return syncResult.nextDb;
  });

  return res.json({
    ok: true,
    data: {
      processed: syncResult.processed || 0,
      ...buildGoogleCalendarStatusSummary(syncedDb)
    }
  });
}));

api.get("/calendar/events", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const scopedState = scopeStateForContext(db, getRequestUserContext(req));
  const appointmentEvents = scopedState.allAppointments.map((a) => ({
    id: `app_${a.id}`,
    type: "appointment",
    title: a.propertyTitle || "Appointment",
    date: a.date || "",
    time: a.time || "",
    status: a.status || "pending",
    meta: {
      appointmentId: a.id,
      customer: a.customer || "",
      agent: a.agent || "",
      googleEventId: a.googleEventId || "",
      googleHtmlLink: a.googleHtmlLink || "",
      googleSyncStatus: a.googleSyncStatus || "pending"
    }
  }));
  const meetEvents = scopedState.officeMeets.map((m) => ({
    id: `meet_${m.id}`,
    type: "office-meet",
    title: m.mode === "virtual" ? "Virtual Office Meeting" : "Office Meeting",
    date: m.date || "",
    time: m.time || "",
    status: m.status || "pending",
    meta: {
      officeMeetId: m.id,
      customer: m.customer || "",
      googleEventId: m.googleEventId || "",
      googleHtmlLink: m.googleHtmlLink || "",
      googleSyncStatus: m.googleSyncStatus || "pending"
    }
  }));
  const tripEvents = scopedState.allTrips.map((t) => ({
    id: `trip_${t.id}`,
    type: "trip",
    title: t.title || "Property Tour",
    date: t.date || "",
    time: t.time || "",
    status: normalizeTripStatusForClient(t.status || "confirmed"),
    meta: {
      tripId: t.id,
      googleEventId: t.googleEventId || "",
      googleHtmlLink: t.googleHtmlLink || "",
      googleSyncStatus: t.googleSyncStatus || "pending"
    }
  }));

  const events = [...appointmentEvents, ...meetEvents, ...tripEvents];
  const result = listOrPaginated(events, req, { defaultLimit: 50, maxLimit: 200 });
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

};