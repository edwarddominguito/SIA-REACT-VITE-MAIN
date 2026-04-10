export const registerPropertiesServiceRoutes = (api, model) => {
  const deps = model.getDeps();
  const {
    asyncHandler,
    requireRole,
    clean,
    loadDb,
    updateDb,
    listOrPaginated,
    sanitizePropertyRecord,
    normalizeLocation,
    parseNumber,
    normalizeListingType,
    normalizePropertyType,
    normalizePropertyStatus,
    validatePropertyPayload,
    matchesUsername,
    makeId,
    getRequestUserContext,
    canManageProperty,
    isTerminalWorkflowStatus,
    sanitizeAppointmentRecord,
    sanitizeTripRecord,
    syncWorkflowRecordAndPersist,
    syncGoogleCalendarRecord
  } = deps;

api.get("/properties", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const result = listOrPaginated(db.properties.map((property) => sanitizePropertyRecord(property)), req, { defaultLimit: 20, maxLimit: 100 });
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

api.post("/properties", requireRole(["admin", "agent"]), asyncHandler(async (req, res) => {
  const title = clean(req.body?.title, 120);
  const location = normalizeLocation(req.body?.location);
  const description = clean(req.body?.description, 1200);
  const price = parseNumber(req.body?.price);
  const bedrooms = Math.max(0, Math.trunc(parseNumber(req.body?.bedrooms)));
  const bathrooms = Math.max(0, Math.trunc(parseNumber(req.body?.bathrooms)));
  const areaSqft = Math.max(0, Math.trunc(parseNumber(req.body?.areaSqft)));
  const listingType = normalizeListingType(req.body?.listingType, req.body);
  const propertyType = normalizePropertyType(req.body?.propertyType, req.body);
  const propertyStatus = normalizePropertyStatus(req.body?.propertyStatus || req.body?.status);
  const agent = clean(req.body?.agent || req.headers["x-user-username"], 60);

  const propertyError = validatePropertyPayload({ title, location, price, listingType, propertyType, propertyStatus, bedrooms, bathrooms, areaSqft });
  if (propertyError) {
    return res.status(400).json({ ok: false, message: propertyError });
  }

  const nextDb = await updateDb((db) => {
    if (req.headers["x-user-role"] === "agent" && !matchesUsername(agent, req.headers["x-user-username"])) {
      const err = new Error("Agents can only create properties assigned to themselves.");
      err.statusCode = 403;
      throw err;
    }
    const property = {
      id: makeId("PRO"),
      title,
      location,
      description,
      price,
      bedrooms,
      bathrooms,
      areaSqft,
      listingType,
      propertyType,
      propertyStatus,
      status: propertyStatus,
      agent,
      imageUrl: req.body?.imageUrl,
      imageUrls: req.body?.imageUrls,
      createdAt: new Date().toISOString()
    };
    return { ...db, properties: [sanitizePropertyRecord(property), ...db.properties] };
  });

  return res.status(201).json({ ok: true, data: nextDb.properties[0] });
}));

api.patch("/properties/:id", requireRole(["admin", "agent"]), asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 80);
  const context = getRequestUserContext(req);
  const title = clean(req.body?.title, 120);
  const location = normalizeLocation(req.body?.location);
  const description = clean(req.body?.description, 1200);
  const price = parseNumber(req.body?.price);
  const bedrooms = Math.max(0, Math.trunc(parseNumber(req.body?.bedrooms)));
  const bathrooms = Math.max(0, Math.trunc(parseNumber(req.body?.bathrooms)));
  const areaSqft = Math.max(0, Math.trunc(parseNumber(req.body?.areaSqft)));
  const listingType = normalizeListingType(req.body?.listingType, req.body);
  const propertyType = normalizePropertyType(req.body?.propertyType, req.body);
  const propertyStatus = normalizePropertyStatus(req.body?.propertyStatus || req.body?.status);
  const hasImageFields =
    Object.prototype.hasOwnProperty.call(req.body || {}, "imageUrl") ||
    Object.prototype.hasOwnProperty.call(req.body || {}, "imageUrls");

  const propertyError = validatePropertyPayload({ title, location, price, listingType, propertyType, propertyStatus, bedrooms, bathrooms, areaSqft });
  if (propertyError) {
    return res.status(400).json({ ok: false, message: propertyError });
  }

  const nextDb = await updateDb((db) => {
    const idx = db.properties.findIndex((property) => String(property?.id) === id);
    if (idx < 0) {
      const err = new Error("Property not found.");
      err.statusCode = 404;
      throw err;
    }
    if (!canManageProperty(db.properties[idx], context)) {
      const err = new Error("You do not have access to update this property.");
      err.statusCode = 403;
      throw err;
    }

    const properties = db.properties.slice();
    properties[idx] = {
      ...properties[idx],
      title,
      location,
      description,
      price,
      bedrooms,
      bathrooms,
      areaSqft,
      listingType,
      propertyType,
      propertyStatus,
      status: propertyStatus,
      ...(hasImageFields ? { imageUrl: req.body?.imageUrl, imageUrls: req.body?.imageUrls } : {}),
      updatedAt: new Date().toISOString()
    };
    properties[idx] = sanitizePropertyRecord(properties[idx]);
    return { ...db, properties };
  });

  const updated = nextDb.properties.find((property) => String(property?.id) === id);
  return res.json({ ok: true, data: updated });
}));

api.delete("/properties/:id", requireRole(["admin", "agent"]), asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 80);
  const context = getRequestUserContext(req);
  let cancelledAppointmentIds = [];
  let removedTripsForSync = [];

  const nextDb = await updateDb((db) => {
    const nowIso = new Date().toISOString();
    const target = db.properties.find((property) => String(property?.id) === id);
    if (!target) {
      const err = new Error("Property not found.");
      err.statusCode = 404;
      throw err;
    }
    if (!canManageProperty(target, context)) {
      const err = new Error("You do not have access to delete this property.");
      err.statusCode = 403;
      throw err;
    }

    const properties = db.properties.filter((property) => String(property?.id) !== id);

    cancelledAppointmentIds = db.appointments
      .filter((appointment) => String(appointment?.propertyId) === id && !isTerminalWorkflowStatus(appointment?.status))
      .map((appointment) => clean(appointment?.id, 64))
      .filter(Boolean);
    const appointments = db.appointments.map((appointment) => {
      if (String(appointment?.propertyId) !== id || isTerminalWorkflowStatus(appointment?.status)) return appointment;
      return sanitizeAppointmentRecord({
        ...appointment,
        status: "cancelled",
        cancelReason: appointment?.cancelReason || "Property deleted",
        updatedAt: nowIso,
        cancelledAt: appointment?.cancelledAt || nowIso
      });
    });

    const trips = [];
    removedTripsForSync = [];
    db.trips.forEach((trip) => {
      const currentTrip = sanitizeTripRecord(trip);
      const nextPropertyIds = currentTrip.propertyIds.filter((propertyId) => String(propertyId) !== id);
      if (nextPropertyIds.length > 0 || !clean(currentTrip?.id, 64)) {
        trips.push(sanitizeTripRecord({ ...currentTrip, propertyIds: nextPropertyIds }));
        return;
      }
      removedTripsForSync.push(sanitizeTripRecord({
        ...currentTrip,
        status: "cancelled",
        cancelledAt: currentTrip.cancelledAt || nowIso,
        updatedAt: nowIso
      }));
    });

    return {
      ...db,
      properties,
      appointments,
      trips
    };
  });

  for (const appointmentId of cancelledAppointmentIds) {
    const cancelledAppointment = nextDb.appointments.find((appointment) => String(appointment?.id) === appointmentId);
    if (cancelledAppointment) {
      await syncWorkflowRecordAndPersist("appointment", cancelledAppointment);
    }
  }
  for (const removedTrip of removedTripsForSync) {
    await syncGoogleCalendarRecord("trip", removedTrip);
  }

  return res.json({ ok: true, data: { id, deleted: true } });
}));

};
