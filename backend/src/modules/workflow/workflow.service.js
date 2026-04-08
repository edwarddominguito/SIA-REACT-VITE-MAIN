export const registerWorkflowServiceRoutes = (api, model) => {
  const deps = model.getDeps();
  const {
    asyncHandler,
    requireRole,
    clean,
    loadDb,
    getRequestUserContext,
    normalizeRecordCollection,
    sanitizeAppointmentRecord,
    canAccessAppointment,
    listOrPaginated,
    updateDb,
    isIsoDate,
    isHHMM,
    isWithinOfficeHours,
    isFutureOrNowSchedule,
    matchesUsername,
    ensureAccessibleProperty,
    findPropertyRecord,
    assertRoleUser,
    isTerminalWorkflowStatus,
    makeId,
    syncWorkflowRecordAndPersist,
    normalizeAppointmentStatus,
    isAdminContext,
    isValidTransition,
    buildLifecyclePatch,
    sanitizeTripRecord,
    canAccessTrip,
    normalizeCollection,
    normalizePropertyStatus,
    normalizeLocation,
    normalizeTripStatusForStorage,
    sanitizeTripAttendees,
    sanitizeOfficeMeetRecord,
    canAccessOfficeMeet,
    isValidEmail,
    isValidPhone,
    sanitizeUserRecord,
    toRole,
    normalizeAccountStatus,
    normalizeOfficeMeetingStatus,
    canAccessReview,
    parseNumber
  } = deps;

api.get("/appointments", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const context = getRequestUserContext(req);
  const appointments = normalizeRecordCollection(db.appointments)
    .map((appointment) => sanitizeAppointmentRecord(appointment))
    .filter((appointment) => canAccessAppointment(appointment, context));
  const result = listOrPaginated(appointments, req, { defaultLimit: 20, maxLimit: 100 });
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

api.post("/appointments", requireRole(["customer", "admin"]), asyncHandler(async (req, res) => {
  const propertyId = clean(req.body?.propertyId, 80);
  const customer = clean(req.body?.customer || req.headers["x-user-username"], 60);
  const date = clean(req.body?.date, 20);
  const time = clean(req.body?.time, 10);
  if (!propertyId || !customer || !isIsoDate(date) || !isHHMM(time)) {
    return res.status(400).json({ ok: false, message: "propertyId, customer, valid date (YYYY-MM-DD), and time (HH:MM) are required." });
  }
  if (!isWithinOfficeHours(date, time)) {
    return res.status(400).json({ ok: false, message: "Appointment must be within office operating hours." });
  }
  if (!isFutureOrNowSchedule(date, time)) {
    return res.status(400).json({ ok: false, message: "Appointment schedule must be now or in the future." });
  }

  const nextDb = await updateDb((db) => {
    const context = getRequestUserContext(req);
    if (context.role === "customer" && !matchesUsername(customer, context.username)) {
      const err = new Error("Customers can only create their own appointments.");
      err.statusCode = 403;
      throw err;
    }
    const property = ensureAccessibleProperty(findPropertyRecord(db, propertyId));
    const customerRecord = assertRoleUser(db, customer, "customer", "Customer not found.");
    const customerUsername = String(customerRecord.username || "").trim();
    const duplicatePending = db.appointments.some((a) => {
      const appointment = sanitizeAppointmentRecord(a);
      return (
      String(a.propertyId) === propertyId &&
      String(appointment.customer) === customerUsername &&
      String(appointment.date) === date &&
      String(appointment.time) === time &&
      !isTerminalWorkflowStatus(appointment.status)
      );
    });
    if (duplicatePending) {
      const err = new Error("You already have an active appointment for this schedule.");
      err.statusCode = 409;
      throw err;
    }

    const appointment = sanitizeAppointmentRecord({
      id: makeId("APP"),
      propertyId,
      propertyTitle: clean(req.body?.propertyTitle, 120) || clean(property.title, 120),
      location: clean(req.body?.location, 140) || clean(property.location, 140),
      propertyImage: clean(req.body?.propertyImage, 1000) || clean(property.imageUrl, 1000),
      customer: customerUsername,
      agent: clean(req.body?.agent || property.agent, 60),
      date,
      time,
      status: "pending",
      notes: clean(req.body?.notes, 500),
      createdAt: new Date().toISOString()
    });
    return { ...db, appointments: [appointment, ...db.appointments] };
  });

  const created = nextDb.appointments[0];
  const synced = await syncWorkflowRecordAndPersist("appointment", created);
  return res.status(201).json({ ok: true, data: synced || created });
}));

api.patch("/appointments/:id", requireRole(["admin", "agent", "customer"]), asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 80);
  const context = getRequestUserContext(req);
  const requestedStatus = req.body?.status === undefined ? "" : normalizeAppointmentStatus(req.body?.status);
  const requestedDate = req.body?.date === undefined ? "" : clean(req.body?.date, 20);
  const requestedTime = req.body?.time === undefined ? "" : clean(req.body?.time, 10);
  const requestedAssignedAgent = req.body?.assignedAgent === undefined ? "" : clean(req.body?.assignedAgent, 60);
  const notes = req.body?.notes === undefined ? "" : clean(req.body?.notes, 1500);
  const outcomeNotes = req.body?.outcomeNotes === undefined ? "" : clean(req.body?.outcomeNotes, 1500);
  const cancelReason = req.body?.cancelReason === undefined ? "" : clean(req.body?.cancelReason, 500);

  const nextDb = await updateDb((db) => {
    const idx = db.appointments.findIndex((appointment) => String(appointment?.id) === id);
    if (idx < 0) {
      const err = new Error("Appointment not found.");
      err.statusCode = 404;
      throw err;
    }
    const current = sanitizeAppointmentRecord(db.appointments[idx]);
    if (!isAdminContext(context) && !canAccessAppointment(current, context)) {
      const err = new Error("You do not have access to update this appointment.");
      err.statusCode = 403;
      throw err;
    }
    const currentStatus = normalizeAppointmentStatus(current.status);
    let nextStatus = requestedStatus || currentStatus;

    if (context.role === "customer") {
      const customerAllowed = nextStatus === "cancelled" && (currentStatus === "pending" || currentStatus === "confirmed" || currentStatus === "rescheduled");
      if (!customerAllowed || requestedAssignedAgent || requestedDate || requestedTime || outcomeNotes) {
        const err = new Error("Customers can only cancel their own active appointments.");
        err.statusCode = 403;
        throw err;
      }
    }

    let nextDate = current.date;
    let nextTime = current.time;
    if (requestedDate || requestedTime) {
      nextDate = requestedDate || current.date;
      nextTime = requestedTime || current.time;
      if (!isIsoDate(nextDate) || !isHHMM(nextTime)) {
        const err = new Error("A valid date and time are required when rescheduling.");
        err.statusCode = 400;
        throw err;
      }
      if (!isWithinOfficeHours(nextDate, nextTime)) {
        const err = new Error("Appointment must stay within office operating hours.");
        err.statusCode = 400;
        throw err;
      }
      if (!isFutureOrNowSchedule(nextDate, nextTime)) {
        const err = new Error("Rescheduled appointment must be in the future.");
        err.statusCode = 400;
        throw err;
      }
      if (!requestedStatus) nextStatus = "rescheduled";
    }

    if (!isValidTransition("appointment", currentStatus, nextStatus)) {
      const err = new Error(`Invalid appointment status transition from ${currentStatus} to ${nextStatus}.`);
      err.statusCode = 400;
      throw err;
    }

    let assignedAgent = current.assignedAgent || current.agent || "";
    if (requestedAssignedAgent) {
      if (context.role !== "admin") {
        const err = new Error("Only admin can assign or reassign agents.");
        err.statusCode = 403;
        throw err;
      }
      const agentRecord = assertRoleUser(db, requestedAssignedAgent, "agent", "Agent not found.");
      assignedAgent = agentRecord.username;
    }

    const appointments = db.appointments.slice();
    appointments[idx] = sanitizeAppointmentRecord({
      ...current,
      assignedAgent,
      agent: assignedAgent || current.agent || "",
      date: nextDate,
      time: nextTime,
      status: nextStatus,
      notes: notes || current.notes || "",
      outcomeNotes: outcomeNotes || current.outcomeNotes || "",
      cancelReason: cancelReason || current.cancelReason || "",
      ...buildLifecyclePatch(current, "appointment", nextStatus)
    });
    return { ...db, appointments };
  });

  const updated = nextDb.appointments.find((appointment) => String(appointment?.id) === id);
  const synced = updated ? await syncWorkflowRecordAndPersist("appointment", updated) : updated;
  return res.json({ ok: true, data: synced || updated });
}));

api.patch("/appointments/:id/status", requireRole(["admin", "agent", "customer"]), asyncHandler(async (req, res) => {
  return res.redirect(307, `${req.baseUrl}/appointments/${clean(req.params.id, 80)}`);
}));

api.get("/trips", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const context = getRequestUserContext(req);
  const trips = normalizeRecordCollection(db.trips)
    .map((trip) => sanitizeTripRecord(trip))
    .filter((trip) => canAccessTrip(trip, context))
    .map((trip) => sanitizeTripRecord(trip));
  const result = listOrPaginated(trips, req, { defaultLimit: 20, maxLimit: 100 });
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

api.post("/trips", requireRole(["admin", "agent"]), asyncHandler(async (req, res) => {
  const context = getRequestUserContext(req);
  const date = clean(req.body?.date, 20);
  const time = clean(req.body?.time, 10);
  const customer = clean(req.body?.customer, 60);
  const title = clean(req.body?.title, 120);
  const location = clean(req.body?.location, 140);
  const notes = clean(req.body?.notes, 1200);
  const propertyIds = Array.from(new Set(normalizeCollection(req.body?.propertyIds).map((propertyId) => clean(propertyId, 64)).filter(Boolean)));

  if (!customer || !title || !location || !isIsoDate(date) || !isHHMM(time) || !propertyIds.length) {
    return res.status(400).json({ ok: false, message: "customer, title, location, propertyIds, valid date (YYYY-MM-DD), and time (HH:MM) are required." });
  }
  if (!isWithinOfficeHours(date, time) || !isFutureOrNowSchedule(date, time)) {
    return res.status(400).json({ ok: false, message: "Tours must be scheduled within office hours and in the future." });
  }

  const nextDb = await updateDb((db) => {
    const customerRecord = assertRoleUser(db, customer, "customer", "Customer not found.");
    const creatorUsername = context.username;
    const invalidProperty = propertyIds.find((propertyId) => {
      const property = findPropertyRecord(db, propertyId);
      if (!property) return true;
      const propertyStatus = normalizePropertyStatus(property?.propertyStatus || property?.status);
      if (["archived", "inactive", "sold", "rented"].includes(propertyStatus)) return true;
      if (context.role === "admin") return false;
      return !matchesUsername(property?.agent, creatorUsername);
    });
    if (invalidProperty) {
      const err = new Error("One or more properties are invalid for this trip.");
      err.statusCode = 400;
      throw err;
    }

    const trip = sanitizeTripRecord({
      id: makeId("TRIP"),
      createdBy: creatorUsername,
      agent: creatorUsername,
      customer,
      title,
      location: normalizeLocation(location),
      date,
      time,
      status: "confirmed",
      notes,
      attendees: [customer],
      propertyIds,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return { ...db, trips: [trip, ...db.trips] };
  });

  const created = nextDb.trips[0];
  const synced = await syncWorkflowRecordAndPersist("trip", created);
  return res.status(201).json({ ok: true, data: synced || created });
}));

api.patch("/trips/:id", requireRole(["admin", "agent", "customer"]), asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 80);
  const context = getRequestUserContext(req);
  const status = req.body?.status === undefined ? "" : normalizeTripStatusForStorage(req.body?.status);
  const date = req.body?.date === undefined ? "" : clean(req.body?.date, 20);
  const time = req.body?.time === undefined ? "" : clean(req.body?.time, 10);
  const notes = req.body?.notes === undefined ? "" : clean(req.body?.notes, 1200);
  const outcomeNotes = req.body?.outcomeNotes === undefined ? "" : clean(req.body?.outcomeNotes, 1500);
  const attendeesPayload = req.body?.attendees === undefined ? null : sanitizeTripAttendees(req.body?.attendees);

  const nextDb = await updateDb((db) => {
    const idx = db.trips.findIndex((trip) => String(trip?.id) === id);
    if (idx < 0) {
      const err = new Error("Trip not found.");
      err.statusCode = 404;
      throw err;
    }
    if (!canAccessTrip(db.trips[idx], context)) {
      const err = new Error("You do not have access to update this trip.");
      err.statusCode = 403;
      throw err;
    }

    const currentTrip = sanitizeTripRecord(db.trips[idx]);
    let nextTrip = { ...currentTrip };

    if (context.role === "customer") {
      if (status || date || time || notes || outcomeNotes) {
        const err = new Error("Customers can only manage their attendance on tours.");
        err.statusCode = 403;
        throw err;
      }
      const nextAttendees = attendeesPayload || sanitizeTripAttendees(currentTrip.attendees);
      if (!nextAttendees.includes(context.username)) {
        nextTrip.customer = nextTrip.customer === context.username ? (nextAttendees[0] || "") : nextTrip.customer;
      }
      nextTrip = sanitizeTripRecord({
        ...nextTrip,
        attendees: nextAttendees,
        updatedAt: new Date().toISOString()
      });
      const trips = db.trips.slice();
      trips[idx] = nextTrip;
      return { ...db, trips };
    }

    if (date || time) {
      const nextDate = date || currentTrip.date;
      const nextTime = time || currentTrip.time;
      if (!isIsoDate(nextDate) || !isHHMM(nextTime) || !isWithinOfficeHours(nextDate, nextTime) || !isFutureOrNowSchedule(nextDate, nextTime)) {
        const err = new Error("Tour reschedules must stay within office hours and in the future.");
        err.statusCode = 400;
        throw err;
      }
      nextTrip.date = nextDate;
      nextTrip.time = nextTime;
    }

    if (status) {
      if (!isValidTransition("tour", currentTrip.status, status)) {
        const err = new Error(`Invalid tour status transition from ${currentTrip.status} to ${status}.`);
        err.statusCode = 400;
        throw err;
      }
      nextTrip.status = status;
      nextTrip = { ...nextTrip, ...buildLifecyclePatch(currentTrip, "tour", status) };
    }

    const sanitizedTrip = sanitizeTripRecord({
      ...nextTrip,
      notes: notes || nextTrip.notes || "",
      outcomeNotes: outcomeNotes || nextTrip.outcomeNotes || "",
      updatedAt: new Date().toISOString()
    });
    const trips = db.trips.slice();
    trips[idx] = sanitizedTrip;
    return { ...db, trips };
  });

  const updated = nextDb.trips.find((trip) => String(trip?.id) === id);
  const synced = updated ? await syncWorkflowRecordAndPersist("trip", updated) : updated;
  return res.json({ ok: true, data: synced || updated });
}));

api.delete("/trips/:id", requireRole(["admin", "agent"]), asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 80);
  const context = getRequestUserContext(req);

  const nextDb = await updateDb((db) => {
    const target = db.trips.find((trip) => String(trip?.id) === id);
    if (!target) {
      const err = new Error("Trip not found.");
      err.statusCode = 404;
      throw err;
    }
    if (!canAccessTrip(target, context)) {
      const err = new Error("You do not have access to delete this trip.");
      err.statusCode = 403;
      throw err;
    }
    const trips = db.trips.slice();
    const idx = trips.findIndex((trip) => String(trip?.id) === id);
    trips[idx] = sanitizeTripRecord({
      ...trips[idx],
      status: "cancelled",
      cancelledAt: trips[idx]?.cancelledAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return { ...db, trips };
  });

  const updated = nextDb.trips.find((trip) => String(trip?.id) === id);
  const synced = updated ? await syncWorkflowRecordAndPersist("trip", updated) : updated;
  return res.json({ ok: true, data: synced || updated });
}));

api.get("/office-meets", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const context = getRequestUserContext(req);
  const officeMeets = normalizeRecordCollection(db.officeMeets)
    .map((meet) => sanitizeOfficeMeetRecord(meet))
    .filter((meet) => canAccessOfficeMeet(meet, context));
  const result = listOrPaginated(officeMeets, req, { defaultLimit: 20, maxLimit: 100 });
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

api.post("/office-meets", requireRole(["customer", "admin"]), asyncHandler(async (req, res) => {
  const fullName = clean(req.body?.fullName, 90);
  const email = clean(req.body?.email, 120).toLowerCase();
  const phone = clean(req.body?.phone, 30);
  const customer = clean(req.body?.customer || req.body?.requestedBy || req.headers["x-user-username"], 60);
  const mode = clean(req.body?.mode, 20).toLowerCase() === "virtual" ? "virtual" : "office";
  const reason = clean(req.body?.reason, 600);
  const notes = clean(req.body?.notes, 1200);
  const relatedPropertyId = clean(req.body?.relatedPropertyId, 64);
  const date = clean(req.body?.date, 20);
  const time = clean(req.body?.time, 10);

  if (!fullName || !email || !phone || !customer || !reason || !isIsoDate(date) || !isHHMM(time)) {
    return res.status(400).json({ ok: false, message: "fullName, email, phone, customer, reason, valid date (YYYY-MM-DD), and time (HH:MM) are required." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, message: "Invalid email format." });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ ok: false, message: "Invalid phone format." });
  }
  if (!isWithinOfficeHours(date, time) || !isFutureOrNowSchedule(date, time)) {
    return res.status(400).json({ ok: false, message: "Office meetings must be within office hours and in the future." });
  }

  const nextDb = await updateDb((db) => {
    const context = getRequestUserContext(req);
    if (context.role === "customer" && !matchesUsername(customer, context.username)) {
      const err = new Error("Customers can only create their own office meeting requests.");
      err.statusCode = 403;
      throw err;
    }
    const customerRecord = assertRoleUser(db, customer, "customer", "Customer not found.");
    const customerUsername = String(customerRecord.username || "").trim();
    if (relatedPropertyId) ensureAccessibleProperty(findPropertyRecord(db, relatedPropertyId), "Related property not found.");
    const assignedAgent = normalizeRecordCollection(db.users)
      .map((user) => sanitizeUserRecord(user))
      .filter((user) => toRole(user?.role) === "agent" && normalizeAccountStatus(user?.accountStatus) === "active")
      .map((user) => clean(user?.username, 50))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))[0] || "";
    const meet = sanitizeOfficeMeetRecord({
      id: makeId("MEET"),
      fullName,
      email,
      phone,
      customer: customerUsername,
      requestedBy: customerUsername,
      mode,
      reason,
      notes,
      date,
      time,
      assignedAgent,
      agent: assignedAgent,
      relatedPropertyId,
      status: "pending",
      createdAt: new Date().toISOString()
    });
    return { ...db, officeMeets: [meet, ...db.officeMeets] };
  });

  const created = nextDb.officeMeets[0];
  const synced = await syncWorkflowRecordAndPersist("office_meeting", created);
  return res.status(201).json({ ok: true, data: synced || created });
}));

api.patch("/office-meets/:id/status", requireRole(["admin", "agent", "customer"]), asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 80);
  const status = req.body?.status === undefined ? "" : normalizeOfficeMeetingStatus(req.body?.status);
  const context = getRequestUserContext(req);
  const date = req.body?.date === undefined ? "" : clean(req.body?.date, 20);
  const time = req.body?.time === undefined ? "" : clean(req.body?.time, 10);
  const outcomeNotes = req.body?.outcomeNotes === undefined ? "" : clean(req.body?.outcomeNotes, 1500);
  const notes = req.body?.notes === undefined ? "" : clean(req.body?.notes, 1500);
  const assignedAgent = req.body?.assignedAgent === undefined ? "" : clean(req.body?.assignedAgent, 60);

  const nextDb = await updateDb((db) => {
    const idx = db.officeMeets.findIndex((m) => String(m.id) === id);
    if (idx < 0) {
      const err = new Error("Office meet not found.");
      err.statusCode = 404;
      throw err;
    }
    if (!isAdminContext(context) && !canAccessOfficeMeet(db.officeMeets[idx], context)) {
      const err = new Error("You do not have access to update this office meet.");
      err.statusCode = 403;
      throw err;
    }
    const current = sanitizeOfficeMeetRecord(db.officeMeets[idx]);
    let nextStatus = status || current.status;
    let nextDate = current.date;
    let nextTime = current.time;

    if (context.role === "customer") {
      const customerAllowed = nextStatus === "cancelled" && (current.status === "pending" || current.status === "confirmed" || current.status === "rescheduled");
      if (!customerAllowed || date || time || assignedAgent || outcomeNotes) {
        const err = new Error("Customers can only cancel their own active meeting requests.");
        err.statusCode = 403;
        throw err;
      }
    }

    if (date || time) {
      nextDate = date || current.date;
      nextTime = time || current.time;
      if (!isIsoDate(nextDate) || !isHHMM(nextTime) || !isWithinOfficeHours(nextDate, nextTime) || !isFutureOrNowSchedule(nextDate, nextTime)) {
        const err = new Error("Office meetings must stay within office hours and in the future.");
        err.statusCode = 400;
        throw err;
      }
      if (!status) nextStatus = "rescheduled";
    }

    if (!isValidTransition("office_meeting", current.status, nextStatus)) {
      const err = new Error(`Invalid office meeting status transition from ${current.status} to ${nextStatus}.`);
      err.statusCode = 400;
      throw err;
    }

    let nextAssignedAgent = current.assignedAgent || current.agent || "";
    if (assignedAgent) {
      if (context.role !== "admin") {
        const err = new Error("Only admin can assign or reassign office meetings.");
        err.statusCode = 403;
        throw err;
      }
      nextAssignedAgent = assertRoleUser(db, assignedAgent, "agent", "Agent not found.").username;
    }
    const officeMeets = db.officeMeets.slice();
    officeMeets[idx] = sanitizeOfficeMeetRecord({
      ...current,
      status: nextStatus,
      date: nextDate,
      time: nextTime,
      assignedAgent: nextAssignedAgent,
      agent: nextAssignedAgent || current.agent || "",
      notes: notes || current.notes || "",
      outcomeNotes: outcomeNotes || current.outcomeNotes || "",
      ...buildLifecyclePatch(current, "office_meeting", nextStatus)
    });
    return { ...db, officeMeets };
  });

  const updated = nextDb.officeMeets.find((m) => String(m.id) === id);
  const synced = updated ? await syncWorkflowRecordAndPersist("office_meeting", updated) : updated;
  return res.json({ ok: true, data: synced || updated });
}));

api.get("/reviews", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const context = getRequestUserContext(req);
  const reviews = normalizeRecordCollection(db.reviews).filter((review) => canAccessReview(review, context));
  const result = listOrPaginated(reviews, req, { defaultLimit: 20, maxLimit: 100 });
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

api.post("/reviews", requireRole(["customer", "admin"]), asyncHandler(async (req, res) => {
  const appointmentId = clean(req.body?.appointmentId, 80);
  const customer = clean(req.body?.customer || req.headers["x-user-username"], 60);
  const propertyId = clean(req.body?.propertyId, 80);
  const comment = clean(req.body?.comment, 500);
  const rating = parseNumber(req.body?.rating);
  const normalizedRating = Number.isFinite(rating) && rating >= 1 && rating <= 5 ? Math.round(rating) : null;

  if (!appointmentId || !customer || !propertyId) {
    return res.status(400).json({ ok: false, message: "appointmentId, customer, and propertyId are required." });
  }

  const nextDb = await updateDb((db) => {
    const context = getRequestUserContext(req);
    const appointment = db.appointments.find((a) => String(a?.id) === appointmentId);
    if (!appointment) {
      const err = new Error("Appointment not found.");
      err.statusCode = 404;
      throw err;
    }
    ensureAccessibleProperty(findPropertyRecord(db, propertyId), "Property not found.");
    const customerRecord = assertRoleUser(db, customer, "customer", "Customer not found.");
    const customerUsername = String(customerRecord.username || "").trim();
    if (context.role === "customer" && !matchesUsername(customerUsername, context.username)) {
      const err = new Error("Customers can only review their own completed appointments.");
      err.statusCode = 403;
      throw err;
    }
    if (String(sanitizeAppointmentRecord(appointment).customer || "").trim() !== customerUsername) {
      const err = new Error("This appointment does not belong to the current customer.");
      err.statusCode = 403;
      throw err;
    }
    if (normalizeAppointmentStatus(appointment.status) !== "completed") {
      const err = new Error("Only completed appointments can be reviewed.");
      err.statusCode = 400;
      throw err;
    }
    if (String(appointment.propertyId || "").trim() !== propertyId) {
      const err = new Error("Review property does not match the appointment.");
      err.statusCode = 400;
      throw err;
    }
    const alreadyReviewed = db.reviews.some((r) => String(r.appointmentId) === appointmentId && String(r.customer) === customerUsername);
    if (alreadyReviewed) {
      const err = new Error("Appointment already reviewed by this customer.");
      err.statusCode = 409;
      throw err;
    }
    const review = {
      id: makeId("REV"),
      appointmentId,
      customer: customerUsername,
      propertyId,
      agent: clean(appointment.assignedAgent || appointment.agent || "", 60),
      propertyTitle: clean(appointment.propertyTitle || ensureAccessibleProperty(findPropertyRecord(db, propertyId), "Property not found.")?.title, 120),
      location: clean(appointment.location || findPropertyRecord(db, propertyId)?.location, 140),
      rating: normalizedRating,
      comment,
      createdAt: new Date().toISOString()
    };
    return { ...db, reviews: [review, ...db.reviews] };
  });

  return res.status(201).json({ ok: true, data: nextDb.reviews[0] });
}));

api.patch("/reviews/:id", requireRole(["admin", "agent", "customer"]), asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 80);
  const context = getRequestUserContext(req);
  const rating = req.body?.rating === undefined ? null : parseNumber(req.body?.rating);
  const normalizedRating = Number.isFinite(rating) && rating >= 1 && rating <= 5 ? Math.round(rating) : null;
  const comment = req.body?.comment === undefined ? "" : clean(req.body?.comment, 500);
  const addressedAt = req.body?.addressedAt === undefined ? undefined : clean(req.body?.addressedAt, 80);
  const addressedBy = req.body?.addressedBy === undefined ? undefined : clean(req.body?.addressedBy, 60);
  const pinnedByAdmin = req.body?.pinnedByAdmin === undefined ? undefined : Boolean(req.body?.pinnedByAdmin);
  const pinnedByAgent = req.body?.pinnedByAgent === undefined ? undefined : Boolean(req.body?.pinnedByAgent);

  const nextDb = await updateDb((db) => {
    const idx = db.reviews.findIndex((review) => String(review?.id) === id);
    if (idx < 0) {
      const err = new Error("Review not found.");
      err.statusCode = 404;
      throw err;
    }

    const current = { ...db.reviews[idx] };
    if (!canAccessReview(current, context)) {
      const err = new Error("You do not have access to update this review.");
      err.statusCode = 403;
      throw err;
    }

    const nextReview = { ...current };

    if (context.role === "customer") {
      if (!matchesUsername(current.customer, context.username)) {
        const err = new Error("Customers can only edit their own reviews.");
        err.statusCode = 403;
        throw err;
      }
      if (req.body?.rating !== undefined) nextReview.rating = normalizedRating;
      if (req.body?.comment !== undefined) nextReview.comment = comment;
    } else if (context.role === "agent") {
      if (req.body?.addressedAt !== undefined) nextReview.addressedAt = addressedAt || "";
      if (req.body?.addressedBy !== undefined) nextReview.addressedBy = addressedBy || context.username;
      if (req.body?.pinnedByAgent !== undefined) nextReview.pinnedByAgent = pinnedByAgent;
    } else if (isAdminContext(context)) {
      if (req.body?.rating !== undefined) nextReview.rating = normalizedRating;
      if (req.body?.comment !== undefined) nextReview.comment = comment;
      if (req.body?.addressedAt !== undefined) nextReview.addressedAt = addressedAt || "";
      if (req.body?.addressedBy !== undefined) nextReview.addressedBy = addressedBy || context.username;
      if (req.body?.pinnedByAgent !== undefined) nextReview.pinnedByAgent = pinnedByAgent;
      if (req.body?.pinnedByAdmin !== undefined) nextReview.pinnedByAdmin = pinnedByAdmin;
    }

    const reviews = db.reviews.slice();
    reviews[idx] = {
      ...nextReview,
      updatedAt: new Date().toISOString()
    };
    return { ...db, reviews };
  });

  const updated = nextDb.reviews.find((review) => String(review?.id) === id);
  return res.json({ ok: true, data: updated });
}));

api.delete("/reviews/:id", requireRole(["admin", "customer"]), asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 80);
  const context = getRequestUserContext(req);

  const nextDb = await updateDb((db) => {
    const target = db.reviews.find((review) => String(review?.id) === id);
    if (!target) {
      const err = new Error("Review not found.");
      err.statusCode = 404;
      throw err;
    }
    if (!isAdminContext(context) && !matchesUsername(target.customer, context.username)) {
      const err = new Error("You do not have access to delete this review.");
      err.statusCode = 403;
      throw err;
    }
    return { ...db, reviews: db.reviews.filter((review) => String(review?.id) !== id) };
  });

  return res.json({ ok: true, data: { id, deleted: true, remaining: nextDb.reviews.length } });
}));

};