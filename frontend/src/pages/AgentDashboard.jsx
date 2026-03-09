import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getCurrentUser, safeArray, saveArray, setCurrentUser as persistCurrentUser, subscribeKeys } from "../lib/storage.js";
import DashboardLayout from "../components/DashboardLayout.jsx";
import DashboardCalendar from "../components/DashboardCalendar.jsx";
import UIFeedback from "../components/UIFeedback.jsx";
import {
  applyPropertyImageFallback,
  autoPropertyImage,
  formatDateTimeLabel,
  money,
  normalizeAppointmentImages,
  statusBadgeClass,
  tripAttendees,
  tripStatus,
  withImage
} from "../lib/dashboardUtils.js";
import useUiFeedback from "../lib/useUiFeedback.js";
import { pushNotification } from "../lib/notificationUtils.js";
import {
  cleanEmail,
  cleanPhone,
  cleanText,
  createEntityId,
  getOperatingHoursForDate,
  isFutureOrNowSlot,
  isValidEmail,
  isValidPhone,
  isWithinOperatingHours,
  normalizeDateTimeInput,
  toNonNegativeNumber
} from "../lib/inputUtils.js";

const propertyEditorFrom = (property) => ({
  id: property.id,
  title: property.title || "",
  location: property.location || "",
  price: String(property.price || ""),
  bedrooms: String(property.bedrooms || ""),
  bathrooms: String(property.bathrooms || ""),
  areaSqft: String(property.areaSqft || ""),
  description: property.description || ""
});

const getAgentAvailabilityStatus = (agentLike) => {
  const raw = String(agentLike?.availabilityStatus || "available").trim().toLowerCase();
  if (raw === "busy" || raw === "offline") return raw;
  return "available";
};

const appointmentStatusPriority = (statusLike) => {
  const status = String(statusLike || "pending").toLowerCase();
  if (status === "pending") return 0;
  if (status === "approved" || status === "rescheduled") return 1;
  if (status === "done" || status === "declined" || status === "cancelled") return 2;
  return 3;
};

export default function AgentDashboard() {
  const user = getCurrentUser();

  const [section, setSection] = useState("dashboard");
  const [appFilter, setAppFilter] = useState("all");
  const [appQuery, setAppQuery] = useState("");
  const [query, setQuery] = useState("");
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [showAddTrip, setShowAddTrip] = useState(false);

  const [properties, setProperties] = useState([]);
  const [users, setUsers] = useState([]);
  const [apps, setApps] = useState([]);
  const [trips, setTrips] = useState([]);
  const [meets, setMeets] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reviewFilter, setReviewFilter] = useState("all");
  const [reviewQuery, setReviewQuery] = useState("");
  const [rescheduleTargetId, setRescheduleTargetId] = useState("");
  const [rescheduleForm, setRescheduleForm] = useState({ date: "", time: "" });
  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || "",
    phone: user?.phone || "",
    email: user?.email || ""
  });
  const rescheduleOperatingHours = useMemo(
    () => getOperatingHoursForDate(rescheduleForm.date),
    [rescheduleForm.date]
  );

  const [editProp, setEditProp] = useState(null);
  const [pForm, setPForm] = useState({
    title: "",
    location: "",
    price: "",
    bedrooms: "",
    bathrooms: "",
    areaSqft: "",
    description: ""
  });
  const [tForm, setTForm] = useState({ customer: "", date: "", time: "", propertyIds: [], notes: "" });
  const tripOperatingHours = useMemo(
    () => getOperatingHoursForDate(tForm.date),
    [tForm.date]
  );
  const feedback = useUiFeedback();

  const refreshAll = () => {
    const allProperties = safeArray("allProperties");
    const allUsers = safeArray("allUsers");
    const allAppointments = safeArray("allAppointments");
    const normalizedAppointments = normalizeAppointmentImages(allAppointments, allProperties);
    if (normalizedAppointments.changed) {
      saveArray("allAppointments", normalizedAppointments.next);
    }
    setProperties(allProperties);
    setUsers(allUsers);
    setApps(normalizedAppointments.next);
    setTrips(safeArray("allTrips"));
    setMeets(safeArray("officeMeets"));
    setReviews(safeArray("allReviews"));
  };

  useEffect(() => {
    refreshAll();
    return subscribeKeys(["allProperties", "allUsers", "allAppointments", "allTrips", "officeMeets", "allReviews"], refreshAll);
  }, []);

  const saveProps = (next) => {
    saveArray("allProperties", next);
    setProperties(next);
  };
  const saveUsers = (next) => {
    saveArray("allUsers", next);
    setUsers(next);
  };
  const saveApps = (next) => {
    saveArray("allAppointments", next);
    setApps(next);
  };
  const saveTrips = (next) => {
    saveArray("allTrips", next);
    setTrips(next);
  };
  const saveMeets = (next) => {
    saveArray("officeMeets", next);
    setMeets(next);
  };
  const saveReviews = (next) => {
    saveArray("allReviews", next);
    setReviews(next);
  };

  const notifyCustomerForAppointment = (appointment, status, context = {}) => {
    if (!appointment?.customer) return;
    const propertyLabel = appointment.propertyTitle || "your appointment";
    const nextDate = context.date || appointment.date || "-";
    const nextTime = context.time || appointment.time || "-";
    const previousDate = context.previousDate || "";
    const previousTime = context.previousTime || "";

    let message = "";
    if (status === "approved") {
      message = `Agent @${user?.username} confirmed ${propertyLabel} on ${formatDateTimeLabel(nextDate, nextTime)}.`;
    } else if (status === "rescheduled") {
      const previousSlot = previousDate && previousTime ? ` from ${formatDateTimeLabel(previousDate, previousTime)}` : "";
      message = `Agent @${user?.username} rescheduled ${propertyLabel}${previousSlot} to ${formatDateTimeLabel(nextDate, nextTime)}.`;
    } else if (status === "cancelled") {
      message = `Agent @${user?.username} cancelled ${propertyLabel} scheduled on ${formatDateTimeLabel(nextDate, nextTime)}.`;
    } else {
      return;
    }

    pushNotification({
      to: appointment.customer,
      type: "appointment",
      title: "Appointment Update",
      message,
      appointmentId: appointment.id,
      meta: {
        status,
        propertyId: appointment.propertyId || "",
        propertyTitle: appointment.propertyTitle || "",
        agent: user?.username || "",
        date: nextDate,
        time: nextTime
      }
    });
  };

  const updateAppStatus = (id, status, options = {}) => {
    let updated = null;
    const next = apps.map((x) => {
      if (x.id !== id) return x;
      updated = { ...x, status, ...(options.patch || {}) };
      return updated;
    });
    saveApps(next);
    if (updated && options.notifyCustomer !== false) {
      notifyCustomerForAppointment(updated, status, {
        date: updated.date,
        time: updated.time,
        previousDate: options.previousDate,
        previousTime: options.previousTime
      });
    }
  };

  const notifyCustomerForMeet = (meet, status) => {
    const to = String(meet?.customer || meet?.requestedBy || "").trim();
    if (!to) return;

    const modeLabel = meet?.mode === "virtual" ? "virtual" : "in-office";
    const date = meet?.date || "-";
    const time = meet?.time || "-";
    const statusLabel = status === "approved" ? "approved" : status === "declined" ? "declined" : status === "done" ? "completed" : status;

    pushNotification({
      to,
      type: "office-meet",
      title: "Office Meet Update",
      message: `Agent @${user?.username} marked your ${modeLabel} office meet as ${statusLabel} (${formatDateTimeLabel(date, time)}).`,
      meta: {
        meetId: meet?.id || "",
        status,
        date,
        time,
        mode: meet?.mode || "office",
        agent: user?.username || ""
      }
    });
  };

  const updateMeetStatus = (meetId, status) => {
    let updated = null;
    const next = meets.map((x) => {
      if (x.id !== meetId) return x;
      updated = { ...x, status, assignedAgent: user.username, agent: user.username };
      return updated;
    });
    saveMeets(next);
    if (updated) notifyCustomerForMeet(updated, status);
  };

  const myUserProfile = useMemo(
    () => users.find((u) => u.username === user?.username),
    [users, user]
  );
  const myAvailabilityStatus = useMemo(
    () => getAgentAvailabilityStatus(myUserProfile),
    [myUserProfile]
  );
  const updateMyAvailabilityStatus = (nextStatusValue) => {
    const nextStatus = String(nextStatusValue || "").trim().toLowerCase();
    if (!["available", "busy", "offline"].includes(nextStatus)) return;
    const nextUsers = users.map((u) =>
      u.username === user?.username
        ? { ...u, availabilityStatus: nextStatus }
        : u
    );
    saveUsers(nextUsers);
    feedback.notify(`Status updated to ${nextStatus}.`, "success");
  };

  const mineProps = useMemo(() => properties.filter((p) => p.agent === user?.username), [properties, user]);
  const customers = useMemo(() => users.filter((u) => u.role === "customer"), [users]);
  const customerNameByUsername = useMemo(() => {
    const map = new Map();
    customers.forEach((customer) => {
      const uname = String(customer?.username || "").trim();
      if (!uname) return;
      const fullName = cleanText(customer?.fullName || "", 80);
      map.set(uname, fullName || uname);
    });
    return map;
  }, [customers]);
  const formatCustomerIdentity = (usernameLike) => {
    const uname = String(usernameLike || "").trim();
    if (!uname) return "-";
    const fullName = customerNameByUsername.get(uname);
    return fullName ? `${fullName} (@${uname})` : `@${uname}`;
  };
  const mineApps = useMemo(
    () => apps.filter((a) => String(a.assignedAgent || "").trim() === user?.username),
    [apps, user]
  );
  const sortedMineApps = useMemo(
    () =>
      mineApps
        .slice()
        .sort((a, b) => {
          const statusDiff = appointmentStatusPriority(a.status) - appointmentStatusPriority(b.status);
          if (statusDiff !== 0) return statusDiff;
          const aSchedule = `${a.date || ""} ${a.time || ""}`;
          const bSchedule = `${b.date || ""} ${b.time || ""}`;
          return bSchedule.localeCompare(aSchedule);
        }),
    [mineApps]
  );
  const mineTrips = useMemo(() => trips.filter((t) => t.agent === user?.username), [trips, user]);
  const upcomingAgentTrips = useMemo(
    () => mineTrips.filter((t) => {
      const st = tripStatus(t);
      return st !== "done" && st !== "cancelled";
    }),
    [mineTrips]
  );
  const pastAgentTrips = useMemo(
    () => mineTrips.filter((t) => {
      const st = tripStatus(t);
      return st === "done" || st === "cancelled";
    }),
    [mineTrips]
  );
  const customerMeets = useMemo(
    () => meets.filter((m) => m.requestedRole === "customer" || m.customer || m.requestedBy),
    [meets]
  );
  const mineMeets = useMemo(
    () => customerMeets.filter((m) => !m.assignedAgent || m.assignedAgent === user?.username || (m.status || "pending") === "pending"),
    [customerMeets, user]
  );
  const agentCalendarEvents = useMemo(() => {
    const appointmentEvents = mineApps.map((a) => ({
      id: `app-${a.id}`,
      title: a.propertyTitle || "Appointment",
      date: a.date,
      time: a.time,
      type: "appointment",
      status: a.status || "pending"
    }));
    const meetEvents = mineMeets.map((m) => ({
      id: `meet-${m.id}`,
      title: m.mode === "virtual" ? "Virtual Meet" : "Office Meet",
      date: m.date,
      time: m.time,
      type: "meet",
      status: m.status || "pending"
    }));
    const tripEvents = mineTrips.map((t) => ({
      id: `trip-${t.id}`,
      title: t.title || "Property Tour",
      date: t.date,
      time: t.time,
      type: "trip",
      status: tripStatus(t)
    }));
    return [...appointmentEvents, ...meetEvents, ...tripEvents];
  }, [mineApps, mineMeets, mineTrips]);

  const filteredProps = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mineProps;
    return mineProps.filter((p) =>
      [p.title, p.location, p.description].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [mineProps, query]);

  const filteredApps = useMemo(() => {
    const byStatus = appFilter === "all"
      ? mineApps
      : mineApps.filter((a) => (a.status || "pending") === appFilter);
    const q = appQuery.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((a) =>
      [a.propertyTitle, a.location, a.customer, a.date, a.time, a.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [mineApps, appFilter, appQuery]);
  const sortedApps = useMemo(() => {
    const statusRank = {
      pending: 0,
      approved: 1,
      rescheduled: 1,
      done: 2,
      declined: 2,
      cancelled: 2
    };
    return filteredApps
      .slice()
      .sort((a, b) => {
        const aStatus = String(a.status || "pending").toLowerCase();
        const bStatus = String(b.status || "pending").toLowerCase();
        const aRank = Object.prototype.hasOwnProperty.call(statusRank, aStatus) ? statusRank[aStatus] : 3;
        const bRank = Object.prototype.hasOwnProperty.call(statusRank, bStatus) ? statusRank[bStatus] : 3;
        if (aRank !== bRank) return aRank - bRank;

        const aSchedule = `${a.date || ""} ${a.time || ""}`;
        const bSchedule = `${b.date || ""} ${b.time || ""}`;
        return bSchedule.localeCompare(aSchedule);
      });
  }, [filteredApps]);
  const mineReviews = useMemo(
    () => reviews.filter((r) => r.agent === user?.username).slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [reviews, user]
  );
  const filteredReviews = useMemo(() => {
    const q = reviewQuery.trim().toLowerCase();
    return mineReviews.filter((r) => {
      const isAddressed = Boolean(r.addressedAt);
      const rating = Number(r.rating || 0);
      const passFilter =
        reviewFilter === "all" ||
        (reviewFilter === "pending" && !isAddressed) ||
        (reviewFilter === "addressed" && isAddressed) ||
        (reviewFilter === "low" && rating <= 2) ||
        (reviewFilter === "high" && rating >= 4);
      if (!passFilter) return false;
      if (!q) return true;
      return [r.propertyTitle, r.location, r.comment, r.customer]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [mineReviews, reviewFilter, reviewQuery]);
  const avgReviewRating = useMemo(() => {
    if (!mineReviews.length) return 0;
    const total = mineReviews.reduce((sum, r) => sum + Number(r.rating || 0), 0);
    return total / mineReviews.length;
  }, [mineReviews]);
  const lowRatingCount = useMemo(() => mineReviews.filter((r) => Number(r.rating || 0) <= 2).length, [mineReviews]);
  const pendingReviewCount = useMemo(() => mineReviews.filter((r) => !r.addressedAt).length, [mineReviews]);
  const updateReview = (reviewId, patch) => {
    saveReviews(reviews.map((r) => (String(r.id) === String(reviewId) ? { ...r, ...patch } : r)));
  };
  const getPropertyImage = (appointment) => {
    const explicit = String(appointment?.propertyImage || "").trim();
    if (explicit) return explicit;
    const matchedProperty = properties.find((p) => String(p.id) === String(appointment?.propertyId));
    return withImage(matchedProperty || { id: appointment?.propertyId, title: appointment?.propertyTitle, location: appointment?.location });
  };
  const handlePropertyImageError = (event, propertyLike) => {
    applyPropertyImageFallback(event.currentTarget, propertyLike || { title: "Property" });
  };

  if (!user) return null;

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "bi-grid" },
    { id: "properties", label: "Properties", icon: "bi-house-door" },
    { id: "appointments", label: "Appointments", icon: "bi-calendar2-week" },
    { id: "meets", label: "Office Meets", icon: "bi-building" },
    { id: "trips", label: "Trips", icon: "bi-car-front" },
    { id: "calendar", label: "Calendar", icon: "bi-calendar3" },
    { id: "reviews", label: "Reviews", icon: "bi-star" },
    { id: "profile", label: "Profile", icon: "bi-person-circle" }
  ];

  return (
    <DashboardLayout
      suiteLabel="Agent Suite"
      profileName={user.fullName || user.username}
      profileRole="Agent"
      navItems={navItems}
      activeTab={section}
      onTabChange={setSection}
    >
        {section === "dashboard" && (
          <>
            <section className="agent-hero">
              <div>
                <h1>Dashboard</h1>
                <p>Agent Dashboard</p>
              </div>
            </section>

            <section className="agent-panel">
              <div className="agent-panel-head">
                <h3>My Listings</h3>
                <button className="btn btn-dark btn-sm" onClick={() => setSection("properties")}>
                  Manage Properties
                </button>
              </div>
              <div className="agent-property-grid">
                {mineProps.slice(0, 3).map((p) => {
                  const rawStatus = String(p.status || "available").toLowerCase();
                  const isAvailable = rawStatus === "available";
                  const statusKey = isAvailable ? "available" : "unavailable";
                  return (
                  <article key={p.id} className="agent-property-card">
                    <img
                      src={withImage(p)}
                      alt={p.title}
                      onError={(e) => handlePropertyImageError(e, p)}
                    />
                    <div className="agent-property-body">
                      <div className="d-flex justify-content-between align-items-center gap-2">
                        <h4>{p.title}</h4>
                        <span className={`badge badge-soft status-${statusKey}`}>
                          {isAvailable ? "available" : "not available"}
                        </span>
                      </div>
                      <p><i className="bi bi-geo-alt"></i> {p.location}</p>
                      <strong>PHP {money(p.price)}</strong>
                      <div className="agent-property-actions">
                        <Link className="btn btn-outline-dark btn-sm w-100" to={`/properties/${p.id}`}>
                          Details
                        </Link>
                      </div>
                    </div>
                  </article>
                  );
                })}
                {!mineProps.length && (
                  <div className="agent-empty">
                    <i className="bi bi-house-door"></i>
                    <p>You do not have property listings yet.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="agent-panel">
              <div className="agent-panel-head">
                <h3>Upcoming Appointments</h3>
                <span className="badge badge-soft">{mineApps.length}</span>
              </div>
              <div className="agent-stack">
                {sortedMineApps.slice(0, 4).map((a) => (
                  <div className="agent-mini-row" key={a.id}>
                    <div>
                      <div className="fw-bold">{a.propertyTitle}</div>
                      <div className="small muted">{formatDateTimeLabel(a.date, a.time, { joiner: " at " })}</div>
                    </div>
                    <span className={statusBadgeClass(a.status)}>{a.status || "pending"}</span>
                  </div>
                ))}
                {!sortedMineApps.length && (
                  <div className="agent-empty compact">
                    <i className="bi bi-calendar2"></i>
                    <p>No upcoming appointments.</p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {section === "calendar" && (
          <DashboardCalendar
            title="My Calendar"
            subtitle="Track your assigned appointments, office meets, and tours."
            events={agentCalendarEvents}
          />
        )}

        {section === "properties" && (
          <>
            <section className="agent-hero rowed">
              <div>
                <h1>My Properties</h1>
                <p>Manage your property listings with consistent presentation.</p>
              </div>
              <button className="btn btn-dark" onClick={() => setShowAddProperty((v) => !v)}>
                <i className="bi bi-plus-lg me-1"></i>{showAddProperty ? "Close Form" : "Add Property"}
              </button>
            </section>

            {showAddProperty && (
              <section className="agent-panel">
                <div className="agent-panel-head"><h3>Create Property</h3></div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const title = cleanText(pForm.title, 90);
                    const location = cleanText(pForm.location, 120);
                    const description = cleanText(pForm.description, 500);
                    const price = toNonNegativeNumber(pForm.price, -1);
                    const bedrooms = toNonNegativeNumber(pForm.bedrooms, 0);
                    const bathrooms = toNonNegativeNumber(pForm.bathrooms, 0);
                    const areaSqft = toNonNegativeNumber(pForm.areaSqft, 0);

                    if (!title || !location || price <= 0) {
                      feedback.notify("Title, location, and price are required.", "error");
                      return;
                    }
                    const draft = {
                      id: createEntityId("PROP"),
                      title,
                      location,
                      price,
                      bedrooms,
                      bathrooms,
                      areaSqft,
                      description,
                      imageUrl: "",
                      status: "available",
                      agent: user.username
                    };
                    const next = { ...draft, imageUrl: draft.imageUrl || autoPropertyImage(draft) };
                    saveProps([next, ...properties]);
                    setShowAddProperty(false);
                    setPForm({
                      title: "",
                      location: "",
                      price: "",
                      bedrooms: "",
                      bathrooms: "",
                      areaSqft: "",
                      description: ""
                    });
                  }}
                >
                  <div className="row g-2">
                    <div className="col-md-6"><input className="form-control" placeholder="Title" value={pForm.title} onChange={(e) => setPForm((s) => ({ ...s, title: e.target.value }))} /></div>
                    <div className="col-md-6"><input className="form-control" placeholder="Location" value={pForm.location} onChange={(e) => setPForm((s) => ({ ...s, location: e.target.value }))} /></div>
                    <div className="col-md-4"><input className="form-control" type="number" placeholder="Price" value={pForm.price} onChange={(e) => setPForm((s) => ({ ...s, price: e.target.value }))} /></div>
                    <div className="col-md-4"><input className="form-control" type="number" placeholder="Bedrooms" value={pForm.bedrooms} onChange={(e) => setPForm((s) => ({ ...s, bedrooms: e.target.value }))} /></div>
                    <div className="col-md-4"><input className="form-control" type="number" placeholder="Bathrooms" value={pForm.bathrooms} onChange={(e) => setPForm((s) => ({ ...s, bathrooms: e.target.value }))} /></div>
                    <div className="col-md-6"><input className="form-control" type="number" placeholder="Area sqft" value={pForm.areaSqft} onChange={(e) => setPForm((s) => ({ ...s, areaSqft: e.target.value }))} /></div>
                    <div className="col-12">
                      <textarea
                        className="form-control"
                        rows="3"
                        placeholder="Description"
                        value={pForm.description}
                        onChange={(e) => setPForm((s) => ({ ...s, description: e.target.value }))}
                      ></textarea>
                    </div>
                  </div>
                  <div className="d-flex gap-2 mt-3">
                    <button className="btn btn-dark">Save Property</button>
                    <button
                      type="button"
                      className="btn btn-outline-dark"
                      onClick={() => setPForm({ title: "", location: "", price: "", bedrooms: "", bathrooms: "", areaSqft: "", description: "" })}
                    >
                      Clear
                    </button>
                  </div>
                </form>
              </section>
            )}

            {editProp && (
              <section className="agent-panel">
                <div className="agent-panel-head">
                  <h3>Edit Property</h3>
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setEditProp(null)}>Close</button>
                </div>
                <div className="row g-2">
                  <div className="col-md-6"><input className="form-control" value={editProp.title} onChange={(e) => setEditProp((s) => ({ ...s, title: e.target.value }))} /></div>
                  <div className="col-md-6"><input className="form-control" value={editProp.location} onChange={(e) => setEditProp((s) => ({ ...s, location: e.target.value }))} /></div>
                  <div className="col-md-4"><input className="form-control" type="number" value={editProp.price} onChange={(e) => setEditProp((s) => ({ ...s, price: e.target.value }))} /></div>
                  <div className="col-md-4"><input className="form-control" type="number" value={editProp.bedrooms} onChange={(e) => setEditProp((s) => ({ ...s, bedrooms: e.target.value }))} /></div>
                  <div className="col-md-4"><input className="form-control" type="number" value={editProp.bathrooms} onChange={(e) => setEditProp((s) => ({ ...s, bathrooms: e.target.value }))} /></div>
                  <div className="col-12"><input className="form-control" type="number" value={editProp.areaSqft} onChange={(e) => setEditProp((s) => ({ ...s, areaSqft: e.target.value }))} /></div>
                  <div className="col-12"><textarea className="form-control" rows="3" value={editProp.description} onChange={(e) => setEditProp((s) => ({ ...s, description: e.target.value }))}></textarea></div>
                </div>
                <button
                  className="btn btn-dark mt-3"
                  onClick={() => {
                    const title = cleanText(editProp.title, 90);
                    const location = cleanText(editProp.location, 120);
                    const description = cleanText(editProp.description, 500);
                    const price = toNonNegativeNumber(editProp.price, -1);
                    if (!title || !location || price <= 0) {
                      feedback.notify("Title, location, and a valid price are required.", "error");
                      return;
                    }
                    const next = properties.map((p) =>
                      p.id !== editProp.id
                        ? p
                        : {
                            ...p,
                            ...editProp,
                            title,
                            location,
                            description,
                            price,
                            bedrooms: toNonNegativeNumber(editProp.bedrooms, 0),
                            bathrooms: toNonNegativeNumber(editProp.bathrooms, 0),
                            areaSqft: toNonNegativeNumber(editProp.areaSqft, 0),
                            imageUrl: p.imageUrl || autoPropertyImage(editProp)
                          }
                    );
                    saveProps(next);
                    setEditProp(null);
                  }}
                >
                  Save Changes
                </button>
              </section>
            )}

            <section className="agent-search-wrap">
              <div className="input-group">
                <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                <input className="form-control" placeholder="Search properties..." value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
            </section>

            <section className="agent-property-grid full">
              {filteredProps.map((p) => {
                const rawStatus = String(p.status || "available").toLowerCase();
                const isAvailable = rawStatus === "available";
                const statusKey = isAvailable ? "available" : "unavailable";
                return (
                <article key={p.id} className="agent-property-card">
                  <img
                    src={withImage(p)}
                    alt={p.title}
                    onError={(e) => handlePropertyImageError(e, p)}
                  />
                  <div className="agent-property-body">
                    <div className="d-flex justify-content-between align-items-center gap-2">
                      <h4>{p.title}</h4>
                      <span className={`badge badge-soft status-${statusKey}`}>
                        {isAvailable ? "available" : "not available"}
                      </span>
                    </div>
                    <p><i className="bi bi-geo-alt"></i> {p.location}</p>
                    <strong>PHP {money(p.price)}</strong>
                    <div className="agent-property-meta">
                      <span><i className="bi bi-door-open"></i> {Number(p.bedrooms || 0)} bed</span>
                      <span><i className="bi bi-droplet"></i> {Number(p.bathrooms || 0)} bath</span>
                      <span><i className="bi bi-aspect-ratio"></i> {Number(p.areaSqft || 0)} sqft</span>
                    </div>
                    <div className="agent-property-actions">
                      <Link className="btn btn-outline-dark btn-sm" to={`/properties/${p.id}`}>Details</Link>
                      <button className="btn btn-outline-dark btn-sm" onClick={() => setEditProp(propertyEditorFrom(p))}>Edit</button>
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => {
                          feedback.askConfirm({
                            title: "Delete Property",
                            message: "Delete this property and linked appointments?",
                            confirmText: "Delete",
                            variant: "danger",
                            onConfirm: () => {
                              saveProps(properties.filter((x) => x.id !== p.id));
                              saveApps(apps.filter((a) => a.propertyId !== p.id));
                              feedback.notify("Property deleted.", "success");
                            }
                          });
                        }}
                      >
                        <i className="bi bi-trash3"></i>
                      </button>
                    </div>
                  </div>
                </article>
                );
              })}
              {!filteredProps.length && (
                <div className="agent-empty large">
                  <i className="bi bi-buildings"></i>
                  <p>No properties found. Add your first listing to begin.</p>
                </div>
              )}
            </section>
          </>
        )}

        {section === "appointments" && (
          <>
            <section className="agent-hero rowed">
              <div>
                <h1>My Appointments</h1>
                <p>Confirm, reschedule, or cancel customer viewings with automatic notifications.</p>
              </div>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <span className={`badge badge-soft ${myAvailabilityStatus === "available" ? "status-available" : "status-unavailable"}`}>
                  {myAvailabilityStatus}
                </span>
                <select
                  className="form-select agent-filter"
                  value={myAvailabilityStatus}
                  onChange={(e) => updateMyAvailabilityStatus(e.target.value)}
                  title="Set your communication availability"
                >
                  <option value="available">Available</option>
                  <option value="busy">Busy</option>
                  <option value="offline">Offline</option>
                </select>
                <select className="form-select agent-filter" value={appFilter} onChange={(e) => setAppFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rescheduled">Rescheduled</option>
                  <option value="done">Done</option>
                  <option value="declined">Declined</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </section>

            <section className="agent-panel">
              <div className="appointments-toolbar compact">
                <div className="input-group">
                  <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                  <input
                    className="form-control"
                    placeholder="Search property, customer, date..."
                    value={appQuery}
                    onChange={(e) => setAppQuery(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-outline-dark"
                  onClick={() => {
                    setAppQuery("");
                    setAppFilter("all");
                  }}
                >
                  Clear
                </button>
              </div>
              {filteredApps.length ? (
                <div className="table-responsive">
                  <table className="table align-middle">
                    <thead>
                      <tr><th>Property</th><th>Customer</th><th>Date/Time</th><th>Status</th><th></th></tr>
                    </thead>
                    <tbody>
                      {sortedApps.map((a) => {
                          const st = a.status || "pending";
                          const isRescheduling = String(a.id) === rescheduleTargetId;
                          return (
                            <React.Fragment key={a.id}>
                              <tr>
                                <td>
                                  <div className="appointment-property-cell">
                                    <img
                                      className="appointment-property-thumb"
                                      src={getPropertyImage(a)}
                                      alt={a.propertyTitle || "Property"}
                                      onError={(e) => handlePropertyImageError(e, { id: a.propertyId, title: a.propertyTitle, location: a.location })}
                                    />
                                    <div>
                                      <div className="fw-bold">{a.propertyTitle}</div>
                                      <div className="small muted">{a.location}</div>
                                    </div>
                                  </div>
                                </td>
                                <td>{formatCustomerIdentity(a.customer)}</td>
                                <td>{formatDateTimeLabel(a.date, a.time)}</td>
                                <td><span className={statusBadgeClass(st)}>{st}</span></td>
                                <td className="text-end">
                                  {(st === "pending" || st === "approved" || st === "rescheduled") && (
                                    <div className="d-flex justify-content-end gap-2 flex-wrap">
                                      {st !== "approved" && (
                                        <button
                                          className="btn btn-outline-success btn-sm"
                                          onClick={() => {
                                            updateAppStatus(a.id, "approved");
                                            feedback.notify("Appointment confirmed and customer notified.", "success");
                                          }}
                                        >
                                          Confirm
                                        </button>
                                      )}
                                      {(st === "approved" || st === "rescheduled") && (
                                        <button
                                          className="btn btn-outline-success btn-sm"
                                          onClick={() => updateAppStatus(a.id, "done", { notifyCustomer: false })}
                                        >
                                          Mark Done
                                        </button>
                                      )}
                                      <button
                                        className="btn btn-outline-primary btn-sm"
                                        onClick={() => {
                                          setRescheduleTargetId(String(a.id));
                                          setRescheduleForm({ date: a.date || "", time: a.time || "" });
                                        }}
                                      >
                                        Reschedule
                                      </button>
                                      <button
                                        className="btn btn-outline-danger btn-sm"
                                        onClick={() => {
                                          feedback.askConfirm({
                                            title: "Cancel Appointment",
                                            message: "Cancel this appointment and notify the customer?",
                                            confirmText: "Cancel",
                                            variant: "danger",
                                            onConfirm: () => {
                                              updateAppStatus(a.id, "cancelled");
                                              setRescheduleTargetId((current) => (current === String(a.id) ? "" : current));
                                              feedback.notify("Appointment cancelled and customer notified.", "success");
                                            }
                                          });
                                        }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  )}
                                  {(st === "declined" || st === "done" || st === "cancelled") && (
                                    <button
                                      className="btn btn-outline-secondary btn-sm"
                                      onClick={() => {
                                        feedback.askConfirm({
                                          title: "Remove Appointment",
                                          message: "Remove this appointment record?",
                                          confirmText: "Remove",
                                          variant: "danger",
                                          onConfirm: () => {
                                            saveApps(apps.filter((x) => x.id !== a.id));
                                            feedback.notify("Appointment record removed.", "success");
                                          }
                                        });
                                      }}
                                    >
                                      Remove
                                    </button>
                                  )}
                                </td>
                              </tr>
                              {isRescheduling && (
                                <tr>
                                  <td colSpan="5">
                                    <div className="appointment-review-inline">
                                      <div className="row g-2">
                                        <div className="col-sm-4">
                                          <label className="form-label mb-1">New Date</label>
                                          <input
                                            type="date"
                                            className="form-control"
                                            value={rescheduleForm.date}
                                            onChange={(e) => {
                                              const nextDate = e.target.value;
                                              setRescheduleForm((s) => {
                                                const keepTime = s.time && isWithinOperatingHours(nextDate, s.time);
                                                return { ...s, date: nextDate, time: keepTime ? s.time : "" };
                                              });
                                            }}
                                          />
                                        </div>
                                        <div className="col-sm-3">
                                          <label className="form-label mb-1">New Time</label>
                                          <input
                                            type="time"
                                            className="form-control"
                                            min={rescheduleOperatingHours.minTime || undefined}
                                            max={rescheduleOperatingHours.maxTime || undefined}
                                            disabled={rescheduleOperatingHours.isClosed}
                                            value={rescheduleForm.time}
                                            onChange={(e) => setRescheduleForm((s) => ({ ...s, time: e.target.value }))}
                                          />
                                        </div>
                                        <div className="col-sm-12">
                                          <div className="small muted">
                                            Operating hours: Mon-Fri 8:00 AM to 5:00 PM | Sat 8:00 AM to 1:00 PM | Sun closed
                                          </div>
                                          {!!rescheduleForm.date && (
                                            <div className="small muted mt-1">Selected day hours: {rescheduleOperatingHours.label}</div>
                                          )}
                                        </div>
                                        <div className="col-sm-5 d-flex gap-2 align-items-end">
                                          <button
                                            className="btn btn-dark btn-sm"
                                            onClick={() => {
                                              const normalized = normalizeDateTimeInput(rescheduleForm.date, rescheduleForm.time);
                                              if (!normalized.date || !normalized.time) {
                                                feedback.notify("Set both date and time.", "error");
                                                return;
                                              }
                                              if (!isWithinOperatingHours(normalized.date, normalized.time)) {
                                                if (rescheduleOperatingHours.isClosed) {
                                                  feedback.notify("Appointments are not available on Sunday.", "error");
                                                } else {
                                                  feedback.notify(`Appointment time must be within ${rescheduleOperatingHours.label}.`, "error");
                                                }
                                                return;
                                              }
                                              if (!isFutureOrNowSlot(normalized.date, normalized.time)) {
                                                feedback.notify("Rescheduled time must be now or in the future.", "error");
                                                return;
                                              }
                                              updateAppStatus(a.id, "rescheduled", {
                                                patch: {
                                                  date: normalized.date,
                                                  time: normalized.time,
                                                  rescheduledAt: new Date().toISOString(),
                                                  rescheduledBy: user?.username || ""
                                                },
                                                previousDate: a.date,
                                                previousTime: a.time
                                              });
                                              setRescheduleTargetId("");
                                              setRescheduleForm({ date: "", time: "" });
                                              feedback.notify("Appointment rescheduled and customer notified.", "success");
                                            }}
                                          >
                                            Save Reschedule
                                          </button>
                                          <button className="btn btn-outline-dark btn-sm" onClick={() => setRescheduleTargetId("")}>Close</button>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="agent-empty large">
                  <i className="bi bi-calendar2"></i>
                  <p>No appointments found for this filter.</p>
                </div>
              )}
            </section>
          </>
        )}

        {section === "reviews" && (
          <>
            <section className="agent-hero">
              <div>
                <h1>Property Reviews</h1>
                <p>Track feedback quality and mark follow-up actions.</p>
              </div>
            </section>

            <section className="agent-stats-grid reviews-stats-grid">
              <article className="agent-stat-card">
                <div className="agent-stat-top"><span>Total Reviews</span><i className="bi bi-chat-left-text"></i></div>
                <strong>{mineReviews.length}</strong>
              </article>
              <article className="agent-stat-card">
                <div className="agent-stat-top"><span>Average Rating</span><i className="bi bi-star-fill"></i></div>
                <strong>{mineReviews.length ? `${avgReviewRating.toFixed(1)}/5` : "-"}</strong>
              </article>
              <article className="agent-stat-card">
                <div className="agent-stat-top"><span>Needs Action</span><i className="bi bi-exclamation-circle"></i></div>
                <strong>{pendingReviewCount}</strong>
              </article>
              <article className="agent-stat-card">
                <div className="agent-stat-top"><span>Low Ratings</span><i className="bi bi-emoji-frown"></i></div>
                <strong>{lowRatingCount}</strong>
              </article>
            </section>

            <section className="agent-panel">
              <div className="reviews-toolbar">
                <div className="input-group">
                  <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                  <input
                    className="form-control"
                    placeholder="Search by property, location, comment, customer..."
                    value={reviewQuery}
                    onChange={(e) => setReviewQuery(e.target.value)}
                  />
                </div>
                <select className="form-select reviews-filter-select" value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value)}>
                  <option value="all">All Reviews</option>
                  <option value="pending">Needs Action</option>
                  <option value="addressed">Addressed</option>
                  <option value="low">Low Rating (1-2)</option>
                  <option value="high">High Rating (4-5)</option>
                </select>
              </div>

              <div className="reviews-modern-grid">
                {filteredReviews.map((reviewData) => {
                  const addressed = Boolean(reviewData.addressedAt);
                  const pinned = Boolean(reviewData.pinnedByAgent);
                  return (
                    <article key={reviewData.id} className={`review-modern-card ${addressed ? "review-addressed" : "review-pending"}`}>
                      <div className="review-modern-media">
                        <img
                          className="review-modern-thumb"
                          src={getPropertyImage(reviewData)}
                          alt={reviewData.propertyTitle || "Property"}
                          onError={(e) => {
                            handlePropertyImageError(e, { id: reviewData.propertyId, title: reviewData.propertyTitle, location: reviewData.location });
                          }}
                        />
                      </div>
                      <div className="review-modern-body">
                        <div className="review-modern-top">
                          <div>
                            <div className="fw-bold">{reviewData.propertyTitle || "Property"}</div>
                            <div className="small muted">{reviewData.location || "-"}</div>
                          </div>
                          <div className="small muted">{reviewData.createdAt ? new Date(reviewData.createdAt).toLocaleString() : "-"}</div>
                        </div>
                        <div className="review-stars">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <i
                              key={n}
                              className={`bi ${n <= Number(reviewData?.rating || 0) ? "bi-star-fill" : "bi-star"} me-1`}
                              aria-hidden="true"
                            ></i>
                          ))}
                        </div>
                        <div className="small review-comment">{reviewData?.comment || "-"}</div>
                        <div className="review-modern-actions">
                          <div className="d-flex align-items-center gap-2 flex-wrap">
                            <span className={`badge badge-soft ${addressed ? "status-done" : "status-pending"}`}>{addressed ? "addressed" : "needs action"}</span>
                            <span className="small muted">Customer: @{reviewData.customer || "-"}</span>
                          </div>
                          <div className="d-flex align-items-center gap-2">
                            <button
                              className={`btn btn-sm ${addressed ? "btn-outline-secondary" : "btn-outline-success"}`}
                              onClick={() =>
                                updateReview(reviewData.id, addressed
                                  ? { addressedAt: "", addressedBy: "" }
                                  : { addressedAt: new Date().toISOString(), addressedBy: user.username })
                              }
                            >
                              {addressed ? "Reopen" : "Mark Addressed"}
                            </button>
                            <button
                              className={`btn btn-sm ${pinned ? "btn-dark" : "btn-outline-dark"}`}
                              onClick={() =>
                                updateReview(reviewData.id, pinned
                                  ? { pinnedByAgent: false }
                                  : { pinnedByAgent: true })
                              }
                            >
                              {pinned ? "Pinned" : "Pin Insight"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {!filteredReviews.length && (
                  <div className="agent-empty">
                    <i className="bi bi-star"></i>
                    <p>No reviews found for the current filters.</p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {section === "trips" && (
          <>
            <section className="agent-hero rowed">
              <div>
                <h1>Property Trips</h1>
                <p>Manage scheduled property tours for customers.</p>
              </div>
              <button className="btn btn-dark" onClick={() => setShowAddTrip(true)}>
                <i className="bi bi-plus-lg me-1"></i>Schedule Trip
              </button>
            </section>

            {showAddTrip && (
              <section className="trip-modal-wrap" onClick={() => setShowAddTrip(false)}>
                <article className="trip-modal-card" onClick={(e) => e.stopPropagation()}>
                  <div className="trip-modal-head">
                    <div>
                      <h3>Schedule Property Trip</h3>
                      <p>Create a new property tour for a customer.</p>
                    </div>
                    <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => setShowAddTrip(false)}>
                      <i className="bi bi-x-lg"></i>
                    </button>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const customer = cleanText(tForm.customer, 40);
                      const { date, time } = normalizeDateTimeInput(tForm.date, tForm.time);
                      const propertyIds = Array.from(new Set((tForm.propertyIds || []).map((id) => String(id))));
                      const notes = cleanText(tForm.notes, 400);

                      if (!customer || !date || !time || !propertyIds.length) {
                        feedback.notify("Customer, date, time, and at least one property are required.", "error");
                        return;
                      }
                      if (!isFutureOrNowSlot(date, time)) {
                        feedback.notify("Trip schedule must be now or in the future.", "error");
                        return;
                      }
                      if (!isWithinOperatingHours(date, time)) {
                        if (tripOperatingHours.isClosed) {
                          feedback.notify("Trips are not available on Sunday.", "error");
                        } else {
                          feedback.notify(`Trip time must be within ${tripOperatingHours.label}.`, "error");
                        }
                        return;
                      }

                      const selectedProperties = propertyIds
                        .map((pid) => mineProps.find((p) => String(p.id) === String(pid)))
                        .filter(Boolean);
                      const primaryProperty = selectedProperties[0];

                      saveTrips([{
                        id: createEntityId("TRIP"),
                        title: `${primaryProperty?.title || "Property"} Tour`,
                        location: primaryProperty?.location || "Davao City",
                        date,
                        time,
                        status: "planned",
                        customer,
                        propertyIds,
                        notes,
                        attendees: [customer],
                        agent: user.username
                      }, ...trips]);

                      setTForm({ customer: "", date: "", time: "", propertyIds: [], notes: "" });
                      setShowAddTrip(false);
                      feedback.notify("Trip scheduled.", "success");
                    }}
                  >
                    <div className="row g-2">
                      <div className="col-12">
                        <label className="form-label">Customer *</label>
                        <select
                          className="form-select"
                          value={tForm.customer}
                          onChange={(e) => setTForm((s) => ({ ...s, customer: e.target.value }))}
                        >
                          <option value="">Select customer</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.username}>
                              {c.fullName || c.username} (@{c.username})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Date *</label>
                        <input
                          className="form-control"
                          type="date"
                          value={tForm.date}
                          onChange={(e) => {
                            const nextDate = e.target.value;
                            setTForm((s) => {
                              const keepTime = s.time && isWithinOperatingHours(nextDate, s.time);
                              return { ...s, date: nextDate, time: keepTime ? s.time : "" };
                            });
                          }}
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Time *</label>
                        <input
                          className="form-control"
                          type="time"
                          min={tripOperatingHours.minTime || undefined}
                          max={tripOperatingHours.maxTime || undefined}
                          disabled={tripOperatingHours.isClosed}
                          value={tForm.time}
                          onChange={(e) => setTForm((s) => ({ ...s, time: e.target.value }))}
                        />
                        <div className="small muted mt-1">
                          Operating hours: Mon-Fri 8:00 AM to 5:00 PM | Sat 8:00 AM to 1:00 PM | Sun closed
                        </div>
                        {!!tForm.date && (
                          <div className="small muted mt-1">Selected day hours: {tripOperatingHours.label}</div>
                        )}
                      </div>
                      <div className="col-12">
                        <label className="form-label">Properties to Visit *</label>
                        <div className="trip-pick-scroll">
                          {mineProps.map((p) => {
                            const checked = (tForm.propertyIds || []).includes(String(p.id));
                            return (
                              <label key={p.id} className="trip-pick-item">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setTForm((s) => ({
                                      ...s,
                                      propertyIds: e.target.checked
                                        ? [...(s.propertyIds || []), String(p.id)]
                                        : (s.propertyIds || []).filter((id) => String(id) !== String(p.id))
                                    }))
                                  }
                                />
                                <span>{p.title}</span>
                              </label>
                            );
                          })}
                          {!mineProps.length && <div className="small muted">No properties available.</div>}
                        </div>
                      </div>
                      <div className="col-12">
                        <label className="form-label">Notes</label>
                        <textarea
                          className="form-control"
                          rows="3"
                          placeholder="Add notes for this trip..."
                          value={tForm.notes}
                          onChange={(e) => setTForm((s) => ({ ...s, notes: e.target.value }))}
                        ></textarea>
                      </div>
                    </div>
                    <div className="trip-modal-actions">
                      <button type="button" className="btn btn-outline-dark" onClick={() => setShowAddTrip(false)}>Cancel</button>
                      <button className="btn btn-dark">Schedule Trip</button>
                    </div>
                  </form>
                </article>
              </section>
            )}

            <section className="agent-panel">
              {mineTrips.length ? (
                <>
                  <div className="trip-section-title">Upcoming Tours</div>
                  <div className="trip-list-stack">
                    {upcomingAgentTrips.map((t) => {
                      const status = tripStatus(t);
                      const statusLabel =
                        status === "done" ? "Completed" :
                          status === "in-progress" ? "In Progress" :
                            status === "cancelled" ? "Cancelled" : "Scheduled";
                      const attendees = tripAttendees(t);
                      const customerLabel = String(t.customer || "").trim() || (attendees[0] ? `@${attendees[0]}` : "-");
                      const selected = (Array.isArray(t.propertyIds) ? t.propertyIds : [])
                        .map((pid) => mineProps.find((p) => String(p.id) === String(pid)))
                        .filter(Boolean);
                      return (
                        <article key={t.id} className="trip-item-card">
                          <div className="trip-item-main">
                            <div className="trip-item-top">
                              <div className="trip-item-title-row">
                                <i className="bi bi-car-front"></i>
                                <strong>{t.title || "Property Tour"}</strong>
                                <span className={`trip-status-chip ${status}`}>{statusLabel}</span>
                              </div>
                              <div className="trip-item-meta">
                                <span><i className="bi bi-person"></i> {customerLabel}</span>
                                <span><i className="bi bi-calendar3"></i> {formatDateTimeLabel(t.date, t.time)}</span>
                                <span><i className="bi bi-people"></i> {attendees.length} joined</span>
                              </div>
                            </div>
                            <div className="trip-item-label">PROPERTIES:</div>
                            <div className="trip-chip-row">
                              {selected.length ? selected.map((p) => (
                                <span key={p.id} className="trip-property-chip"><span>{p.title}</span></span>
                              )) : <span className="small muted">No properties selected.</span>}
                            </div>
                            {t.notes ? <div className="trip-notes-box">{t.notes}</div> : null}
                          </div>
                          <div className="trip-item-actions">
                            {status === "planned" && (
                              <>
                                <button className="btn btn-dark btn-sm" onClick={() => saveTrips(trips.map((x) => (x.id === t.id ? { ...x, status: "in-progress" } : x)))}>Start Trip</button>
                                <button className="btn btn-outline-dark btn-sm" onClick={() => saveTrips(trips.map((x) => (x.id === t.id ? { ...x, status: "cancelled" } : x)))}>Cancel</button>
                              </>
                            )}
                            {status === "in-progress" && (
                              <button className="btn btn-dark btn-sm" onClick={() => saveTrips(trips.map((x) => (x.id === t.id ? { ...x, status: "done" } : x)))}>Complete Trip</button>
                            )}
                            <button
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => {
                                feedback.askConfirm({
                                  title: "Delete Trip",
                                  message: "Delete this trip?",
                                  confirmText: "Delete",
                                  variant: "danger",
                                  onConfirm: () => {
                                    saveTrips(trips.filter((x) => x.id !== t.id));
                                    feedback.notify("Trip deleted.", "success");
                                  }
                                });
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    {!upcomingAgentTrips.length && <div className="agent-empty"><i className="bi bi-car-front"></i><p>No upcoming tours.</p></div>}
                  </div>

                  <div className="trip-section-title mt-3">Past Tours</div>
                  <div className="trip-list-stack">
                    {pastAgentTrips.map((t) => {
                      const status = tripStatus(t);
                      const statusLabel = status === "cancelled" ? "Cancelled" : "Completed";
                      return (
                        <article className="trip-item-card trip-item-compact" key={t.id}>
                          <div className="trip-item-title-row">
                            <i className="bi bi-car-front"></i>
                            <strong>{t.title || "Property Tour"}</strong>
                            <span className={`trip-status-chip ${status}`}>{statusLabel}</span>
                          </div>
                          <div className="small muted">{formatDateTimeLabel(t.date, t.time)}</div>
                        </article>
                      );
                    })}
                    {!pastAgentTrips.length && <div className="agent-empty"><i className="bi bi-clock-history"></i><p>No past tours yet.</p></div>}
                  </div>
                </>
              ) : (
                <div className="agent-empty large trip-empty-clean">
                  <i className="bi bi-car-front"></i>
                  <h4>No trips scheduled</h4>
                  <p>Schedule a property tour to get started.</p>
                </div>
              )}
            </section>
          </>
        )}

        {section === "meets" && (
          <>
            <section className="agent-hero">
              <div>
                <h1>Office Meets</h1>
                <p>Handle customer office meet requests and update their status.</p>
              </div>
            </section>

            <section className="agent-panel">
              {mineMeets.length ? (
                <div className="table-responsive">
                  <table className="table align-middle">
                    <thead>
                      <tr><th>Customer</th><th>Date/Time</th><th>Mode</th><th>Reason</th><th>Status</th><th></th></tr>
                    </thead>
                    <tbody>
                      {mineMeets.slice().reverse().map((m) => {
                        const st = m.status || "pending";
                        const isMine = m.assignedAgent === user.username;
                        return (
                          <tr key={m.id}>
                            <td>
                              <div className="fw-bold">{m.fullName || m.customer || m.requestedBy || "-"}</div>
                              <div className="small muted">{m.email || "-"}</div>
                              <div className="small muted">@{m.customer || m.requestedBy || "-"}</div>
                            </td>
                            <td>{formatDateTimeLabel(m.date, m.time)}</td>
                            <td>{m.mode === "virtual" ? "Virtual" : "In Office"}</td>
                            <td className="small">{m.reason || "-"}</td>
                            <td><span className={statusBadgeClass(st)}>{st}</span></td>
                            <td className="text-end">
                              {st === "pending" && (
                                <div className="d-flex justify-content-end gap-2">
                                  <button
                                    className="btn btn-outline-success btn-sm"
                                    onClick={() => updateMeetStatus(m.id, "approved")}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    className="btn btn-outline-danger btn-sm"
                                    onClick={() => updateMeetStatus(m.id, "declined")}
                                  >
                                    Decline
                                  </button>
                                </div>
                              )}
                              {st === "approved" && isMine && (
                                <button
                                  className="btn btn-outline-success btn-sm"
                                  onClick={() => updateMeetStatus(m.id, "done")}
                                >
                                  Mark Done
                                </button>
                              )}
                              {(st === "declined" || st === "done") && (
                                <button
                                  className="btn btn-outline-secondary btn-sm"
                                  onClick={() => {
                                    feedback.askConfirm({
                                      title: "Remove Office Meet",
                                      message: "Remove this office meet record?",
                                      confirmText: "Remove",
                                      variant: "danger",
                                      onConfirm: () => {
                                        saveMeets(meets.filter((x) => x.id !== m.id));
                                        feedback.notify("Office meet record removed.", "success");
                                      }
                                    });
                                  }}
                                >
                                  Remove
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="agent-empty large">
                  <i className="bi bi-building"></i>
                  <p>No office meet requests to handle.</p>
                </div>
              )}
            </section>
          </>
        )}

        {section === "profile" && (
          <section className="agent-panel customer-profile-panel">
            <div className="customer-profile-head">
              <div className="d-flex align-items-center gap-3">
                <span className="agent-avatar customer-profile-avatar">
                  {(profileForm.fullName || user?.username || "A").charAt(0).toUpperCase()}
                </span>
                <div>
                  <h3>{profileForm.fullName || "-"}</h3>
                  <div className="small muted">@{user?.username} | Agent</div>
                </div>
              </div>
              <div className="customer-profile-meta">
                <span><i className="bi bi-envelope"></i> {profileForm.email || "-"}</span>
                <span><i className="bi bi-telephone"></i> {profileForm.phone || "-"}</span>
              </div>
            </div>

            <form
              className="customer-profile-form"
              onSubmit={(e) => {
                e.preventDefault();
                const fullName = cleanText(profileForm.fullName, 80);
                const phone = cleanPhone(profileForm.phone);
                const email = cleanEmail(profileForm.email);
                if (!fullName || !phone || !email) {
                  feedback.notify("Full name, phone, and email are required.", "error");
                  return;
                }
                if (!isValidPhone(phone)) {
                  feedback.notify("Invalid phone format.", "error");
                  return;
                }
                if (!isValidEmail(email)) {
                  feedback.notify("Invalid email format.", "error");
                  return;
                }

                const idx = users.findIndex((u) => u.id === user?.id || u.username === user?.username);
                if (idx < 0) {
                  feedback.notify("Unable to update profile. User not found.", "error");
                  return;
                }

                const updatedUser = {
                  ...users[idx],
                  fullName,
                  phone,
                  email
                };
                const nextUsers = [...users];
                nextUsers[idx] = updatedUser;
                saveUsers(nextUsers);

                persistCurrentUser({
                  id: updatedUser.id,
                  username: updatedUser.username,
                  role: updatedUser.role,
                  fullName: updatedUser.fullName,
                  phone: updatedUser.phone,
                  email: updatedUser.email,
                  photoUrl: updatedUser.photoUrl || ""
                });

                feedback.notify("Profile updated successfully.", "success");
              }}
            >
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label">Full Name</label>
                  <input className="form-control" value={profileForm.fullName} onChange={(e) => setProfileForm((s) => ({ ...s, fullName: e.target.value }))} />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Phone</label>
                  <input className="form-control" value={profileForm.phone} onChange={(e) => setProfileForm((s) => ({ ...s, phone: e.target.value }))} />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Email</label>
                  <input className="form-control" type="email" value={profileForm.email} onChange={(e) => setProfileForm((s) => ({ ...s, email: e.target.value }))} />
                </div>
                <div className="col-12 d-flex gap-2 mt-1">
                  <button className="btn btn-dark">Save Profile</button>
                  <button
                    type="button"
                    className="btn btn-outline-dark"
                    onClick={() => setProfileForm({
                      fullName: user?.fullName || "",
                      phone: user?.phone || "",
                      email: user?.email || ""
                    })}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}
      <UIFeedback
        toasts={feedback.toasts}
        closeToast={feedback.closeToast}
        confirmState={feedback.confirmState}
        cancelConfirm={feedback.cancelConfirm}
        confirm={feedback.confirm}
      />
    </DashboardLayout>
  );
}
