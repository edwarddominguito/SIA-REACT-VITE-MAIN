export const registerDashboardServiceRoutes = (api, model) => {
  const deps = model.getDeps();
  const {
    asyncHandler,
    loadDb,
    normalizeAppointmentStatus,
    normalizeOfficeMeetingStatus,
    sanitizeTripRecord,
    isPastSchedule,
    normalizeTripStatusForStorage,
    toRole,
    normalizeAccountStatus,
    isTerminalWorkflowStatus,
    sanitizeAppointmentRecord
  } = deps;

api.get("/dashboard/stats", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const pendingAppointments = db.appointments.filter((a) => normalizeAppointmentStatus(a.status) === "pending").length;
  const pendingMeets = db.officeMeets.filter((m) => normalizeOfficeMeetingStatus(m.status) === "pending").length;
  const upcomingTours = db.trips.filter((trip) => {
    const normalized = sanitizeTripRecord(trip);
    return (normalized.status === "confirmed" || normalized.status === "rescheduled") && !isPastSchedule(normalized.date, normalized.time);
  }).length;
  const completedOperations =
    db.appointments.filter((a) => normalizeAppointmentStatus(a.status) === "completed").length +
    db.officeMeets.filter((m) => normalizeOfficeMeetingStatus(m.status) === "completed").length +
    db.trips.filter((t) => normalizeTripStatusForStorage(t.status) === "completed").length;
  const activeAgents = db.users.filter((user) => toRole(user.role) === "agent" && normalizeAccountStatus(user.accountStatus) === "active").length;
  const lowRatings = db.reviews.filter((review) => Number(review.rating || 0) > 0 && Number(review.rating || 0) <= 2).length;
  const unassignedAppointments = db.appointments.filter((appointment) => {
    const normalized = sanitizeAppointmentRecord(appointment);
    return !normalized.assignedAgent && !isTerminalWorkflowStatus(normalized.status);
  }).length;

  return res.json({
    ok: true,
    data: {
      users: db.users.length,
      activeAgents,
      properties: db.properties.length,
      appointments: db.appointments.length,
      pendingAppointments,
      officeMeets: db.officeMeets.length,
      pendingOfficeMeets: pendingMeets,
      reviews: db.reviews.length,
      notifications: db.notifications.length,
      trips: db.trips.length,
      upcomingTours,
      completedOperations,
      lowRatings,
      unassignedAppointments
    }
  });
}));

};