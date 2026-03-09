import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getCurrentUser, safeArray, saveArray, setCurrentUser as persistCurrentUser, subscribeKeys } from "../lib/storage.js";
import { apiRequest } from "../lib/apiClient.js";
import DashboardLayout from "../components/DashboardLayout.jsx";
import DashboardCalendar from "../components/DashboardCalendar.jsx";
import UIFeedback from "../components/UIFeedback.jsx";
import {
  applyPropertyImageFallback,
  formatClockTime,
  formatDateTimeLabel,
  makePropertyFallbackImage,
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
  isWithinOperatingHours,
  isValidEmail,
  isValidPhone,
  normalizeDateTimeInput
} from "../lib/inputUtils.js";

const MEET_REASON_TEMPLATES = [
  "Financing consultation",
  "Schedule property visit plan",
  "Contract and offer discussion",
  "Investment advice"
];

const appointmentStatusPriority = (statusLike) => {
  const status = String(statusLike || "pending").toLowerCase();
  if (status === "pending") return 0;
  if (status === "approved" || status === "rescheduled") return 1;
  if (status === "done" || status === "declined" || status === "cancelled") return 2;
  return 3;
};

function CustomerStatCard({ label, value, icon }) {
  return (
    <article className="agent-stat-card">
      <div className="agent-stat-top">
        <span>{label}</span>
        <i className={`bi ${icon}`}></i>
      </div>
      <strong>{value}</strong>
    </article>
  );
}

export default function CustomerDashboard() {
  const user = getCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();

  const tabFromPath = (pathname) => {
    const normalized = String(pathname || "").toLowerCase();
    if (normalized === "/customer/appointments") return "appointments";
    if (normalized === "/customer/meets") return "meets";
    if (normalized === "/customer/trips") return "trips";
    if (normalized === "/customer/calendar") return "calendar";
    if (normalized === "/customer/reviews") return "reviews";
    if (normalized === "/customer/profile") return "profile";
    return "browse";
  };

  const pathFromTab = (nextTab) => {
    if (nextTab === "appointments") return "/customer/appointments";
    if (nextTab === "meets") return "/customer/meets";
    if (nextTab === "trips") return "/customer/trips";
    if (nextTab === "calendar") return "/customer/calendar";
    if (nextTab === "reviews") return "/customer/reviews";
    if (nextTab === "profile") return "/customer/profile";
    return "/customer/home";
  };

  const [tab, setTab] = useState(() => tabFromPath(location.pathname));

  const [properties, setProperties] = useState([]);
  const [apps, setApps] = useState([]);
  const [trips, setTrips] = useState([]);
  const [meets, setMeets] = useState([]);
  const [reviews, setReviews] = useState([]);

  const [q, setQ] = useState("");
  const [appointmentQuery, setAppointmentQuery] = useState("");
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState("all");
  const [booking, setBooking] = useState({ propertyId: "", date: "", time: "" });
  const [bookingStep, setBookingStep] = useState(1);
  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || "",
    phone: user?.phone || "",
    email: user?.email || ""
  });
  const [meetForm, setMeetForm] = useState({
    fullName: user?.fullName || "",
    email: user?.email || "",
    date: "",
    time: "",
    reason: "",
    mode: "office"
  });
  const [meetTouched, setMeetTouched] = useState({
    date: false,
    time: false
  });
  const [reviewForm, setReviewForm] = useState({
    rating: "0",
    comment: ""
  });
  const [reviewTargetId, setReviewTargetId] = useState("");
  const feedback = useUiFeedback();

  const refreshAll = () => {
    const allProperties = safeArray("allProperties");
    const allAppointments = safeArray("allAppointments");
    const normalizedAppointments = normalizeAppointmentImages(allAppointments, allProperties);
    if (normalizedAppointments.changed) {
      saveArray("allAppointments", normalizedAppointments.next);
    }
    setProperties(allProperties);
    setApps(normalizedAppointments.next);
    setTrips(safeArray("allTrips"));
    setMeets(safeArray("officeMeets"));
    setReviews(safeArray("allReviews"));
  };

  useEffect(() => {
    refreshAll();
    return subscribeKeys(["allProperties", "allAppointments", "allTrips", "officeMeets", "allReviews"], refreshAll);
  }, []);

  useEffect(() => {
    const next = tabFromPath(location.pathname);
    setTab((prev) => (prev === next ? prev : next));
  }, [location.pathname]);

  useEffect(() => {
    if (String(location.pathname || "").toLowerCase() === "/customer/dashboard") {
      navigate("/customer/home", { replace: true });
    }
  }, [location.pathname, navigate]);

  const myApps = useMemo(() => apps.filter((a) => a.customer === user?.username), [apps, user]);
  const sortedMyApps = useMemo(
    () =>
      myApps
        .slice()
        .sort((a, b) => {
          const statusDiff = appointmentStatusPriority(a.status) - appointmentStatusPriority(b.status);
          if (statusDiff !== 0) return statusDiff;
          const aSchedule = `${a.date || ""} ${a.time || ""}`;
          const bSchedule = `${b.date || ""} ${b.time || ""}`;
          return bSchedule.localeCompare(aSchedule);
        }),
    [myApps]
  );
  const filteredMyApps = useMemo(() => {
    const q = appointmentQuery.trim().toLowerCase();
    return sortedMyApps.filter((a) => {
      const status = String(a.status || "pending").toLowerCase();
      const passStatus = appointmentStatusFilter === "all" || status === appointmentStatusFilter;
      if (!passStatus) return false;
      if (!q) return true;
      return [a.propertyTitle, a.location, a.date, a.time, a.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [sortedMyApps, appointmentQuery, appointmentStatusFilter]);

  const filteredProps = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return properties;
    return properties.filter((p) =>
      [p.title, p.location, p.description, p.agent].filter(Boolean).join(" ").toLowerCase().includes(s)
    );
  }, [properties, q]);

  const myPending = useMemo(() => myApps.filter((a) => (a.status || "pending") === "pending"), [myApps]);
  const selectedBookingProperty = useMemo(
    () => properties.find((p) => String(p.id) === String(booking.propertyId)),
    [properties, booking.propertyId]
  );
  const bookingOperatingHours = useMemo(
    () => getOperatingHoursForDate(booking.date),
    [booking.date]
  );
  const meetOperatingHours = useMemo(
    () => getOperatingHoursForDate(meetForm.date),
    [meetForm.date]
  );
  const meetReasonLength = useMemo(
    () => cleanText(meetForm.reason, 600).length,
    [meetForm.reason]
  );
  const saveAppsLocal = (next) => {
    saveArray("allAppointments", next);
    setApps(next);
  };
  const saveTripsLocal = (next) => {
    saveArray("allTrips", next);
    setTrips(next);
  };
  const saveMeetsLocal = (next) => {
    saveArray("officeMeets", next);
    setMeets(next);
  };
  const saveReviewsLocal = (next) => {
    saveArray("allReviews", next);
    setReviews(next);
  };
  const notifyRoles = ({ roles = [], includeUsers = [], title = "Notification", message = "", type = "general", meta = {} }) => {
    const users = safeArray("allUsers");
    const roleSet = new Set((roles || []).map((r) => String(r || "").toLowerCase()));
    const recipients = new Set((includeUsers || []).map((u) => String(u || "").trim()).filter(Boolean));

    users.forEach((u) => {
      const role = String(u?.role || "").toLowerCase();
      const username = String(u?.username || "").trim();
      if (roleSet.has(role) && username) recipients.add(username);
    });

    recipients.forEach((to) => {
      if (to === user?.username) return;
      pushNotification({ to, type, title, message, meta });
    });
  };

  const myReviews = useMemo(
    () => reviews.filter((r) => r.customer === user?.username).slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [reviews, user]
  );
  const sortedTrips = useMemo(
    () => trips.slice().sort((a, b) => `${b.date || ""} ${b.time || ""}`.localeCompare(`${a.date || ""} ${a.time || ""}`)),
    [trips]
  );
  const myTrips = useMemo(
    () => sortedTrips.filter((t) => t.customer === user?.username || tripAttendees(t).includes(user?.username)),
    [sortedTrips, user]
  );
  const upcomingTrips = useMemo(
    () => sortedTrips.filter((t) => {
      const st = tripStatus(t);
      return st !== "done" && st !== "cancelled";
    }),
    [sortedTrips]
  );
  const pastTrips = useMemo(
    () => myTrips.filter((t) => {
      const st = tripStatus(t);
      return st === "done" || st === "cancelled";
    }),
    [myTrips]
  );
  const reviewedAppointmentIds = useMemo(
    () => new Set(myReviews.map((r) => String(r.appointmentId))),
    [myReviews]
  );
  const reviewEligibleApps = useMemo(
    () => myApps.filter((a) => (a.status || "pending") === "done" && !reviewedAppointmentIds.has(String(a.id))),
    [myApps, reviewedAppointmentIds]
  );
  const avgMyRating = useMemo(() => {
    if (!myReviews.length) return 0;
    const total = myReviews.reduce((sum, r) => sum + Number(r.rating || 0), 0);
    return total / myReviews.length;
  }, [myReviews]);
  const customerCalendarEvents = useMemo(() => {
    const appointmentEvents = myApps.map((a) => ({
      id: `app-${a.id}`,
      title: a.propertyTitle || "Appointment",
      date: a.date,
      time: a.time,
      type: "appointment",
      status: a.status || "pending"
    }));
    const myMeets = meets.filter((m) => String(m.customer || m.requestedBy || "").trim() === user?.username);
    const meetEvents = myMeets.map((m) => ({
      id: `meet-${m.id}`,
      title: m.mode === "virtual" ? "Virtual Meet" : "Office Meet",
      date: m.date,
      time: m.time,
      type: "meet",
      status: m.status || "pending"
    }));
    const tripEvents = myTrips.map((t) => ({
      id: `trip-${t.id}`,
      title: t.title || "Property Tour",
      date: t.date,
      time: t.time,
      type: "trip",
      status: tripStatus(t)
    }));
    return [...appointmentEvents, ...meetEvents, ...tripEvents];
  }, [myApps, meets, myTrips, user]);
  const activeAppointments = useMemo(
    () =>
      myApps.filter((a) => {
        const st = String(a.status || "pending").toLowerCase();
        return st === "pending" || st === "approved" || st === "rescheduled";
      }),
    [myApps]
  );
  const nextUpcomingAppointment = useMemo(() => {
    const now = Date.now();
    const sorted = activeAppointments
      .map((a) => ({
        ...a,
        ts: new Date(`${a.date || ""}T${a.time || "00:00"}:00`).getTime()
      }))
      .filter((a) => Number.isFinite(a.ts))
      .sort((a, b) => a.ts - b.ts);
    return sorted.find((a) => a.ts >= now) || sorted[0] || null;
  }, [activeAppointments]);
  const upcomingCalendarEvents = useMemo(() => {
    const now = Date.now();
    return customerCalendarEvents
      .map((evt) => ({
        ...evt,
        ts: new Date(`${evt.date || ""}T${evt.time || "00:00"}:00`).getTime()
      }))
      .filter((evt) => Number.isFinite(evt.ts) && evt.ts >= now)
      .sort((a, b) => a.ts - b.ts)
      .slice(0, 5);
  }, [customerCalendarEvents]);
  const savedProperties = useMemo(() => {
    const ids = new Set();
    myApps.forEach((a) => ids.add(String(a.propertyId || "")));
    myTrips.forEach((t) => {
      const list = Array.isArray(t.propertyIds) ? t.propertyIds : [];
      list.forEach((pid) => ids.add(String(pid || "")));
    });
    return properties.filter((p) => ids.has(String(p.id))).slice(0, 4);
  }, [myApps, myTrips, properties]);

  const navItems = [
    { id: "browse", label: "Home", icon: "bi-house-door" },
    { id: "appointments", label: "Appointments", icon: "bi-calendar2-check" },
    { id: "meets", label: "Office Meets", icon: "bi-building" },
    { id: "trips", label: "Trips", icon: "bi-map" },
    { id: "calendar", label: "Calendar", icon: "bi-calendar3" },
    { id: "reviews", label: "Reviews", icon: "bi-star" },
    { id: "profile", label: "Profile", icon: "bi-person-circle" }
  ];
  const currentTabLabel = navItems.find((item) => item.id === tab)?.label || "Home";
  const handleCustomerTabChange = (nextTab) => {
    setTab(nextTab);
    const targetPath = pathFromTab(nextTab);
    if (location.pathname !== targetPath) {
      navigate(targetPath);
    }
  };
  const meetDateError = useMemo(() => {
    const date = String(meetForm.date || "").trim();
    if (!date) return "Please select a preferred date.";
    if (meetOperatingHours.isClosed) return "Office is closed on Sunday. Please choose another date.";
    return "";
  }, [meetForm.date, meetOperatingHours]);
  const meetTimeError = useMemo(() => {
    const date = String(meetForm.date || "").trim();
    const time = String(meetForm.time || "").trim();
    if (!date || !time) return time ? "" : "Please select a preferred time.";
    if (meetOperatingHours.isClosed) return "No available time on the selected day.";
    if (!isWithinOperatingHours(date, time)) return `Time must be within ${meetOperatingHours.label}.`;
    if (!isFutureOrNowSlot(date, time)) return "Time must be now or in the future.";
    return "";
  }, [meetForm.date, meetForm.time, meetOperatingHours]);

  const resetMeetForm = () => {
    setMeetForm((s) => ({
      ...s,
      date: "",
      time: "",
      reason: "",
      mode: "office"
    }));
    setMeetTouched({ date: false, time: false });
  };

  const toggleMeetReasonTemplate = (template) => {
    setMeetForm((s) => {
      const current = cleanText(s.reason, 600);
      const parts = current
        .split("|")
        .map((p) => cleanText(p, 120))
        .filter(Boolean);
      const exists = parts.includes(template);
      const nextParts = exists ? parts.filter((p) => p !== template) : [...parts, template];
      return { ...s, reason: nextParts.join(" | ") };
    });
  };

  const canSubmitMeetRequest = useMemo(() => {
    const fullName = cleanText(meetForm.fullName, 80);
    const email = cleanEmail(meetForm.email);
    const reason = cleanText(meetForm.reason, 600);
    const { date, time } = normalizeDateTimeInput(meetForm.date, meetForm.time);
    return Boolean(fullName && email && reason && date && time && !meetDateError && !meetTimeError);
  }, [meetForm, meetDateError, meetTimeError]);

  const submitMeetRequest = () => {
    setMeetTouched({ date: true, time: true });
    const fullName = cleanText(meetForm.fullName, 80);
    const email = cleanEmail(meetForm.email);
    const reason = cleanText(meetForm.reason, 600);
    const { date, time } = normalizeDateTimeInput(meetForm.date, meetForm.time);
    if (!fullName || !email || !date || !time || !reason) {
      feedback.notify("Please complete all office meet fields.", "error");
      return;
    }
    if (!isValidEmail(email)) {
      feedback.notify("Please provide a valid email.", "error");
      return;
    }
    if (!isWithinOperatingHours(date, time)) {
      if (meetOperatingHours.isClosed) {
        feedback.notify("Office meet requests are not available on Sunday.", "error");
      } else {
        feedback.notify(`Meet time must be within ${meetOperatingHours.label}.`, "error");
      }
      return;
    }
    if (!isFutureOrNowSlot(date, time)) {
      feedback.notify("Meet schedule must be now or in the future.", "error");
      return;
    }
    const duplicate = meets.some(
      (m) =>
        String(m.customer || m.requestedBy || "").trim() === user?.username &&
        String(m.mode || "office") === meetForm.mode &&
        String(m.date || "") === date &&
        String(m.time || "") === time &&
        String(m.status || "pending").toLowerCase() === "pending"
    );
    if (duplicate) {
      feedback.notify("You already have a pending request with the same mode, date, and time.", "error");
      return;
    }
    const newMeet = {
      id: createEntityId("MEET"),
      title: "Customer Office Meet Request",
      fullName,
      email,
      date,
      time,
      reason,
      mode: meetForm.mode,
      customer: user.username,
      requestedBy: user.username,
      requestedRole: "customer",
      status: "pending"
    };
    saveMeetsLocal([newMeet, ...meets]);
    notifyRoles({
      roles: ["admin", "agent"],
      type: "office-meet",
      title: "New Office Meet Request",
      message: `Customer @${user.username} requested a ${meetForm.mode === "virtual" ? "virtual" : "in-office"} meet on ${formatDateTimeLabel(date, time)}.`,
      meta: {
        customer: user.username,
        mode: meetForm.mode,
        date,
        time
      }
    });
    resetMeetForm();
    feedback.notify("Office meet request submitted.", "success");
  };

  const resetBookingFlow = () => {
    setBooking({ propertyId: "", date: "", time: "" });
    setBookingStep(1);
  };

  const submitReviewForAppointment = async (appointment) => {
    const appointmentId = String(appointment?.id || "");
    if (!appointmentId || !appointment) {
      feedback.notify("Invalid appointment.", "error");
      return;
    }
    if ((appointment.status || "pending") !== "done") {
      feedback.notify("Only completed appointments can be reviewed.", "error");
      return;
    }
    if (reviewedAppointmentIds.has(appointmentId)) {
      feedback.notify("You already reviewed this appointment.", "error");
      return;
    }
    const comment = cleanText(reviewForm.comment, 500);
    const rating = Number(reviewForm.rating || 0);
    if (!comment) {
      feedback.notify("Please add a comment.", "error");
      return;
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      feedback.notify("Please select a rating from 1 to 5 stars.", "error");
      return;
    }
    try {
      const res = await apiRequest("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          appointmentId,
          customer: user.username,
          propertyId: appointment.propertyId || "",
          rating,
          comment
        })
      });
      const saved = res?.data || {};
      const newReview = {
        id: saved.id || createEntityId("REV"),
        appointmentId,
        propertyId: appointment.propertyId || "",
        propertyImage: appointment.propertyImage || getPropertyImage(appointment),
        propertyTitle: appointment.propertyTitle || "",
        location: appointment.location || "",
        agent: appointment.agent || "",
        customer: user.username,
        rating,
        comment,
        createdAt: saved.createdAt || new Date().toISOString()
      };
      saveReviewsLocal([newReview, ...reviews]);
      setReviewForm({ rating: "0", comment: "" });
      setReviewTargetId("");
      feedback.notify("Review submitted.", "success");
    } catch (err) {
      feedback.notify(err?.message || "Failed to submit review.", "error");
    }
  };

  const startBookingForProperty = (propertyId) => {
    setBooking({ propertyId: String(propertyId), date: "", time: "" });
    setBookingStep(1);
  };

  const handlePropertyImageError = (e, propertyLike) => {
    applyPropertyImageFallback(e.currentTarget, propertyLike || { title: "Property" });
  };

  const getPropertyImage = (item) => {
    const explicit = String(item?.propertyImage || item?.imageUrl || "").trim();
    if (explicit) return explicit;
    const matched =
      properties.find((p) => String(p.id) === String(item?.propertyId)) ||
      properties.find((p) => p.title === item?.propertyTitle && p.location === item?.location);
    const resolved = withImage(
      matched || {
        id: item?.propertyId,
        title: item?.propertyTitle,
        location: item?.location,
        imageUrl: ""
      }
    );
    return resolved || makePropertyFallbackImage(item?.propertyTitle || "Property");
  };

  return (
    <DashboardLayout
      suiteLabel="Customer Suite"
      profileName={user?.fullName || "Customer"}
      profileRole="Customer"
      navItems={navItems}
      activeTab={tab}
      onTabChange={handleCustomerTabChange}
    >
        <section className="agent-hero">
          <div>
            <h1>{currentTabLabel}</h1>
            <p>Customer Dashboard</p>
          </div>
        </section>

        {tab === "dashboard" && (
          <>
            <section className="agent-stats-grid">
              <CustomerStatCard label="Total Appointments" value={myApps.length} icon="bi-calendar2-check" />
              <CustomerStatCard label="Pending Requests" value={myPending.length} icon="bi-hourglass-split" />
              <CustomerStatCard label="Upcoming Events" value={upcomingCalendarEvents.length} icon="bi-calendar3" />
              <CustomerStatCard label="Saved Properties" value={savedProperties.length} icon="bi-house-heart" />
            </section>

            <section className="agent-split-grid">
              <article className="agent-panel">
                <div className="agent-panel-head">
                  <h3>Upcoming Appointment</h3>
                </div>
                {nextUpcomingAppointment ? (
                  <div className="agent-mini-row trip">
                    <div>
                      <div className="fw-bold">{nextUpcomingAppointment.propertyTitle || "Property Appointment"}</div>
                      <div className="small muted">{formatDateTimeLabel(nextUpcomingAppointment.date, nextUpcomingAppointment.time)}</div>
                      <div className="small muted">{nextUpcomingAppointment.location || "-"}</div>
                    </div>
                    <span className={statusBadgeClass(nextUpcomingAppointment.status)}>{nextUpcomingAppointment.status || "pending"}</span>
                  </div>
                ) : (
                  <div className="agent-empty compact"><i className="bi bi-calendar2"></i><p>No upcoming appointment yet.</p></div>
                )}
              </article>

              <article className="agent-panel">
                <div className="agent-panel-head">
                  <h3>Upcoming Calendar Events</h3>
                </div>
                <div className="agent-stack">
                  {upcomingCalendarEvents.map((evt) => (
                    <div key={evt.id} className="agent-mini-row trip">
                      <div>
                        <div className="fw-bold">{evt.title || "Event"}</div>
                        <div className="small muted">{formatDateTimeLabel(evt.date, evt.time)}</div>
                      </div>
                      <span className={`badge badge-soft status-${String(evt.status || "pending").toLowerCase()}`}>{evt.status || "pending"}</span>
                    </div>
                  ))}
                  {!upcomingCalendarEvents.length && <div className="agent-empty compact"><i className="bi bi-calendar3"></i><p>No upcoming events.</p></div>}
                </div>
              </article>
            </section>

            <section className="agent-panel">
              <div className="agent-panel-head">
                <h3>Saved Properties</h3>
              </div>
              <div className="agent-property-grid">
                {savedProperties.map((p) => (
                  <article key={p.id} className="agent-property-card">
                    <img
                      src={withImage(p)}
                      alt={p.title}
                      onError={(e) => handlePropertyImageError(e, p)}
                    />
                    <div className="agent-property-body">
                      <h4>{p.title}</h4>
                      <p><i className="bi bi-geo-alt"></i> {p.location}</p>
                      <strong>PHP {money(p.price)}</strong>
                      <div className="agent-property-actions">
                        <Link className="btn btn-outline-dark btn-sm w-100" to={`/properties/${p.id}`}>
                          View Property
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
                {!savedProperties.length && (
                  <div className="agent-empty">
                    <i className="bi bi-house-heart"></i>
                    <p>Save properties by creating appointments or joining trips.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="agent-panel">
              <div className="agent-panel-head">
                <h3>Quick Actions</h3>
              </div>
              <div className="customer-quick-actions">
                <button type="button" className="btn btn-dark" onClick={() => setTab("browse")}>
                  Browse Listings
                </button>
                <button type="button" className="btn btn-outline-dark" onClick={() => setTab("appointments")}>
                  Manage Appointments
                </button>
                <button type="button" className="btn btn-outline-dark" onClick={() => setTab("calendar")}>
                  Open Calendar
                </button>
                <button type="button" className="btn btn-outline-dark" onClick={() => setTab("meets")}>
                  Request Office Meet
                </button>
              </div>
            </section>
          </>
        )}

        {tab === "browse" && (
          <>
            <section className="agent-search-wrap">
              <div className="input-group">
                <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                <input className="form-control" placeholder="Search listings by title, location, description, agent..." value={q} onChange={(e) => setQ(e.target.value)} />
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
                    <div className="d-flex justify-content-between gap-2 align-items-center">
                      <h4>{p.title}</h4>
                      <span className={`badge badge-soft status-${statusKey}`}>
                        {isAvailable ? "available" : "not available"}
                      </span>
                    </div>
                    <p><i className="bi bi-geo-alt"></i> {p.location}</p>
                    <strong>PHP {money(p.price)}</strong>
                    <div className="agent-property-actions">
                      <Link className="btn btn-outline-dark btn-sm customer-property-action" to={`/properties/${p.id}`}>
                        Details
                      </Link>
                      <button
                        className="btn btn-dark btn-sm customer-property-action"
                        onClick={() => startBookingForProperty(p.id)}
                        disabled={!isAvailable}
                        title={isAvailable ? "Book this property" : "This property is not available"}
                      >
                        {isAvailable ? "Book This Appointment" : "Not Available"}
                      </button>
                    </div>
                  </div>
                </article>
                );
              })}
              {!filteredProps.length && <div className="agent-empty large"><i className="bi bi-house-door"></i><p>No matching listings.</p></div>}
            </section>

            {!!booking.propertyId && !!selectedBookingProperty && (
              <section className="shop-booking-modal-wrap" onClick={resetBookingFlow}>
                <article className="shop-booking-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="shop-booking-head">
                    <h4>{selectedBookingProperty.title}</h4>
                    <button className="btn btn-outline-dark btn-sm" onClick={resetBookingFlow}>Close</button>
                  </div>
                  <div className="small muted mb-2"><i className="bi bi-geo-alt"></i> {selectedBookingProperty.location}</div>

                  <div className="appointment-steps" aria-label="Appointment booking progress">
                    <div className={bookingStep >= 1 ? "active" : ""}>1. Property</div>
                    <div className={bookingStep >= 2 ? "active" : ""}>2. Schedule</div>
                    <div className={bookingStep >= 3 ? "active" : ""}>3. Review</div>
                  </div>

                  <div className="shop-booking-step-body">
                  {bookingStep === 1 && (
                    <div className="row g-2 shop-booking-step">
                      <div className="col-12">
                        <div className="appointment-review-card">
                          <div className="fw-bold">{selectedBookingProperty.title}</div>
                          <div className="small muted">{selectedBookingProperty.location}</div>
                        </div>
                      </div>
                      <div className="col-12 d-flex gap-2 mt-2 shop-booking-actions">
                        <button className="btn btn-dark" onClick={() => setBookingStep(2)}>Next: Schedule</button>
                        <button className="btn btn-outline-dark" onClick={resetBookingFlow}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {bookingStep === 2 && (
                    <div className="row g-2 shop-booking-step">
                      <div className="col-md-6">
                        <label className="form-label">Date</label>
                        <input
                          type="date"
                          className="form-control"
                          value={booking.date}
                          onChange={(e) => {
                            const nextDate = e.target.value;
                            setBooking((b) => {
                              const keepTime = b.time && isWithinOperatingHours(nextDate, b.time);
                              return { ...b, date: nextDate, time: keepTime ? b.time : "" };
                            });
                          }}
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Time</label>
                        <input
                          type="time"
                          className="form-control"
                          min={bookingOperatingHours.minTime || undefined}
                          max={bookingOperatingHours.maxTime || undefined}
                          disabled={bookingOperatingHours.isClosed}
                          value={booking.time}
                          onChange={(e) => setBooking((b) => ({ ...b, time: e.target.value }))}
                        />
                      </div>
                      <div className="col-12">
                        <div className="small muted">
                          Operating hours: Mon-Fri 8:00 AM to 5:00 PM | Sat 8:00 AM to 1:00 PM | Sun closed
                        </div>
                        {!!booking.date && (
                          <div className="small muted mt-1">Selected day hours: {bookingOperatingHours.label}</div>
                        )}
                      </div>
                      <div className="col-12 d-flex gap-2 mt-2 shop-booking-actions">
                        <button className="btn btn-outline-dark" onClick={() => setBookingStep(1)}>Back</button>
                        <button
                          className="btn btn-dark"
                          onClick={() => {
                            if (!booking.date || !booking.time) {
                              feedback.notify("Set both date and time.", "error");
                              return;
                            }
                            if (!isWithinOperatingHours(booking.date, booking.time)) {
                              if (bookingOperatingHours.isClosed) {
                                feedback.notify("Appointments are not available on Sunday.", "error");
                              } else {
                                feedback.notify(`Appointment time must be within ${bookingOperatingHours.label}.`, "error");
                              }
                              return;
                            }
                            if (!isFutureOrNowSlot(booking.date, booking.time)) {
                              feedback.notify("Appointment schedule must be now or in the future.", "error");
                              return;
                            }
                            setBookingStep(3);
                          }}
                        >
                          Next: Review
                        </button>
                      </div>
                    </div>
                  )}

                  {bookingStep === 3 && (
                    <div className="row g-2 shop-booking-step">
                      <div className="col-12">
                        <div className="appointment-review-card">
                          <div className="fw-bold">Review Appointment</div>
                          <div className="small"><span className="muted">Property:</span> {selectedBookingProperty.title || "(unknown)"}</div>
                          <div className="small"><span className="muted">Location:</span> {selectedBookingProperty.location || "-"}</div>
                          <div className="small"><span className="muted">Schedule:</span> {formatDateTimeLabel(booking.date, booking.time, { joiner: " at " })}</div>
                        </div>
                      </div>
                      <div className="col-12 d-flex gap-2 mt-2 shop-booking-actions">
                        <button className="btn btn-outline-dark" onClick={() => setBookingStep(2)}>Back</button>
                        <button className="btn btn-dark" onClick={() => {
                          if (!booking.propertyId || !booking.date || !booking.time) {
                            feedback.notify("Please complete the booking form.", "error");
                            return;
                          }
                          if (!isWithinOperatingHours(booking.date, booking.time)) {
                            if (bookingOperatingHours.isClosed) {
                              feedback.notify("Appointments are not available on Sunday.", "error");
                            } else {
                              feedback.notify(`Appointment time must be within ${bookingOperatingHours.label}.`, "error");
                            }
                            return;
                          }
                          if (!isFutureOrNowSlot(booking.date, booking.time)) {
                            feedback.notify("Appointment schedule must be now or in the future.", "error");
                            return;
                          }
                          const pid = String(booking.propertyId);
                          const duplicate = apps.some((a) => a.customer === user.username && String(a.propertyId) === pid && a.date === booking.date && a.time === booking.time);
                          if (duplicate) {
                            feedback.notify("You already have a booking with the same property/date/time.", "error");
                            return;
                          }
                          saveAppsLocal([
                            {
                              id: createEntityId("APP"),
                              propertyId: pid,
                              propertyImage: getPropertyImage(selectedBookingProperty),
                              propertyTitle: selectedBookingProperty?.title || "(unknown)",
                              location: selectedBookingProperty?.location || "",
                              agent: selectedBookingProperty?.agent || "",
                              customer: user.username,
                              date: booking.date,
                              time: booking.time,
                              status: "pending"
                            },
                            ...apps
                          ]);
                          notifyRoles({
                            roles: ["admin"],
                            type: "appointment",
                            title: "New Appointment Request",
                            message: `Customer @${user.username} requested ${selectedBookingProperty?.title || "a property"} on ${formatDateTimeLabel(booking.date, booking.time)}.`,
                            meta: {
                              customer: user.username,
                              agent: selectedBookingProperty?.agent || "",
                              propertyId: pid,
                              propertyTitle: selectedBookingProperty?.title || "",
                              date: booking.date,
                              time: booking.time
                            }
                          });
                          resetBookingFlow();
                          feedback.notify("Appointment request submitted.", "success");
                        }}>Submit Appointment</button>
                      </div>
                    </div>
                  )}
                  </div>
                </article>
              </section>
            )}
          </>
        )}

        {tab === "calendar" && (
          <DashboardCalendar
            title="My Event Calendar"
            subtitle="View your appointment requests, meets, and trips."
            events={customerCalendarEvents}
          />
        )}

        {tab === "appointments" && (
          <section className="agent-panel appointment-status-panel">
            <div className="agent-panel-head">
              <h3>Booking Status</h3>
              <div className="appointment-status-badges">
                <span className="badge badge-soft">{myPending.length} pending</span>
                <span className="badge badge-soft">{reviewEligibleApps.length} to review</span>
              </div>
            </div>
            <div className="appointments-toolbar compact">
              <div className="input-group">
                <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                <input
                  className="form-control"
                  placeholder="Search property, date, status..."
                  value={appointmentQuery}
                  onChange={(e) => setAppointmentQuery(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn btn-outline-dark"
                onClick={() => {
                  setAppointmentQuery("");
                  setAppointmentStatusFilter("all");
                }}
              >
                Clear
              </button>
              <select className="form-select" value={appointmentStatusFilter} onChange={(e) => setAppointmentStatusFilter(e.target.value)}>
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="done">Done</option>
                <option value="declined">Declined</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="table-responsive">
              <table className="table align-middle appointment-status-table">
                <thead><tr><th>Property</th><th>Date</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {filteredMyApps.map((a) => {
                    const canReview = (a.status || "pending") === "done" && !reviewedAppointmentIds.has(String(a.id));
                    const isReviewing = reviewTargetId === String(a.id);
                    const appointmentImage = getPropertyImage(a);
                    return (
                      <React.Fragment key={a.id}>
                        <tr>
                          <td>
                            <div className="appointment-property-cell">
                              <img
                                className="appointment-property-thumb"
                                src={appointmentImage}
                                alt={a.propertyTitle || "Property"}
                                onError={(e) => {
                                  handlePropertyImageError(e, { id: a.propertyId, title: a.propertyTitle, location: a.location });
                                }}
                              />
                              <div>
                                <div className="fw-bold">{a.propertyTitle}</div>
                                <div className="small muted">{a.location}</div>
                              </div>
                            </div>
                          </td>
                          <td><div className="small fw-bold">{a.date}</div><div className="small muted">{formatClockTime(a.time)}</div></td>
                          <td><span className={statusBadgeClass(a.status)}>{a.status || "pending"}</span></td>
                          <td className="text-end">
                            {(a.status || "pending") === "pending" ? (
                              <button className="btn btn-outline-dark btn-sm" onClick={() => {
                                feedback.askConfirm({
                                  title: "Cancel Appointment",
                                  message: "Cancel this pending appointment?",
                                  confirmText: "Cancel appointment",
                                  variant: "danger",
                                  onConfirm: () => {
                                    saveAppsLocal(apps.filter((x) => x.id !== a.id));
                                    feedback.notify("Appointment cancelled.", "success");
                                  }
                                });
                              }}>Cancel</button>
                            ) : canReview ? (
                              <button
                                className="btn btn-outline-success btn-sm"
                                onClick={() => {
                                  setReviewTargetId((prev) => (prev === String(a.id) ? "" : String(a.id)));
                                  setReviewForm({ rating: "0", comment: "" });
                                }}
                              >
                                {isReviewing ? "Close Review" : "Review Now"}
                              </button>
                            ) : <span className="small muted">-</span>}
                          </td>
                        </tr>
                        {isReviewing && (
                          <tr>
                            <td colSpan="4">
                              <div className="appointment-review-inline">
                                <div className="row g-2">
                                  <div className="col-12">
                                    <label className="form-label">Stars</label>
                                    <div className="review-rating-preview" aria-label={`Selected rating ${reviewForm.rating} out of 5`}>
                                      {[1, 2, 3, 4, 5].map((n) => (
                                        <button
                                          key={n}
                                          type="button"
                                          className="review-star-btn"
                                          onClick={() =>
                                            setReviewForm((s) => ({
                                              ...s,
                                              rating: Number(s.rating || 0) === n ? "0" : String(n)
                                            }))
                                          }
                                          aria-label={`${n} star${n > 1 ? "s" : ""}`}
                                        >
                                          <i
                                            className={`bi ${n <= Number(reviewForm.rating || 0) ? "bi-star-fill" : "bi-star"} me-1`}
                                            aria-hidden="true"
                                          ></i>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="col-12">
                                    <label className="form-label">Comment</label>
                                    <textarea
                                      className="form-control"
                                      rows="3"
                                      placeholder="Share your experience..."
                                      value={reviewForm.comment}
                                      onChange={(e) => setReviewForm((s) => ({ ...s, comment: e.target.value }))}
                                    ></textarea>
                                  </div>
                                  <div className="col-12 d-flex gap-2 mt-1">
                                    <button className="btn btn-dark btn-sm" onClick={() => submitReviewForAppointment(a)}>Submit Review</button>
                                    <button className="btn btn-outline-dark btn-sm" onClick={() => setReviewTargetId("")}>Cancel</button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {!filteredMyApps.length && <tr><td colSpan="4" className="text-muted">No appointments found for the current filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "reviews" && (
          <section className="agent-panel reviews-list-panel">
            <div className="agent-panel-head">
              <h3>My Reviews</h3>
              <span className="badge badge-soft">{myReviews.length}</span>
            </div>
            <div className="reviews-meta-row">
              <span className="small muted">Average Rating</span>
              <strong>{avgMyRating ? `${avgMyRating.toFixed(1)}/5` : "-"}</strong>
            </div>
            <div className="reviews-modern-grid">
              {myReviews.map((reviewData) => {
                return (
                  <article key={reviewData.id} className="review-modern-card">
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
                        <span className="badge badge-soft status-done">reviewed</span>
                      </div>
                    </div>
                  </article>
                );
              })}
              {!myReviews.length && <div className="agent-empty"><i className="bi bi-star"></i><p>No reviews yet. Review completed appointments from the Appointments page.</p></div>}
            </div>
          </section>
        )}

        {tab === "trips" && (
          <section className="agent-panel">
            <div className="trip-page-head">
              <div>
                <h3>My Trips</h3>
                <p>View your scheduled property tours.</p>
              </div>
            </div>

            <div className="trip-section-title">Upcoming Tours</div>
            <div className="trip-list-stack">
              {upcomingTrips.map((t) => {
                const status = tripStatus(t);
                const statusLabel = status === "in-progress" ? "In Progress" : "Scheduled";
                const attendees = tripAttendees(t);
                const joined = attendees.includes(user.username);
                const selected = (Array.isArray(t.propertyIds) ? t.propertyIds : [])
                  .map((pid) => properties.find((p) => String(p.id) === String(pid)))
                  .filter(Boolean);
                return (
                  <article className="trip-item-card" key={t.id}>
                    <div className="trip-item-main">
                      <div className="trip-item-top">
                        <div className="trip-item-title-row">
                          <i className="bi bi-car-front"></i>
                          <strong>{t.title || "Property Tour"}</strong>
                          <span className={`trip-status-chip ${status}`}>{statusLabel}</span>
                        </div>
                        <div className="trip-item-meta">
                          <span><i className="bi bi-calendar3"></i> {formatDateTimeLabel(t.date, t.time)}</span>
                        </div>
                      </div>
                      <div className="trip-item-label">PROPERTIES TO VISIT:</div>
                      <div className="trip-chip-row">
                        {selected.length ? selected.map((p) => (
                          <span key={p.id} className="trip-property-chip">
                            <span>{p.title}</span>
                          </span>
                        )) : <span className="small muted">No properties selected.</span>}
                      </div>
                      {t.notes ? <div className="trip-notes-box">{t.notes}</div> : null}
                    </div>
                    <div className="trip-item-actions">
                      {joined ? (
                        <button
                          className="btn btn-outline-dark btn-sm"
                          onClick={() => {
                            saveTripsLocal(trips.map((x) =>
                              x.id === t.id
                                ? (() => {
                                    const nextAttendees = tripAttendees(x).filter((m) => m !== user.username);
                                    const currentCustomer = String(x.customer || "").trim();
                                    const clearCustomer = currentCustomer === user.username && nextAttendees.length === 0;
                                    return {
                                      ...x,
                                      attendees: nextAttendees,
                                      customer: clearCustomer ? "" : x.customer
                                    };
                                  })()
                                : x
                            ));
                            feedback.notify("You left the trip.", "success");
                          }}
                        >
                          Leave Trip
                        </button>
                      ) : (
                        <button
                          className="btn btn-dark btn-sm"
                          onClick={() => {
                            saveTripsLocal(trips.map((x) =>
                              x.id === t.id
                                ? (() => {
                                    const nextAttendees = Array.from(new Set([...tripAttendees(x), user.username]));
                                    const currentCustomer = String(x.customer || "").trim();
                                    return {
                                      ...x,
                                      attendees: nextAttendees,
                                      customer: currentCustomer || user.username
                                    };
                                  })()
                                : x
                            ));
                            feedback.notify("You joined the trip.", "success");
                          }}
                        >
                          Join Trip
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
              {!upcomingTrips.length && <div className="agent-empty"><i className="bi bi-car-front"></i><p>No upcoming tours.</p></div>}
            </div>

            <div className="trip-section-title mt-3">Past Tours</div>
            <div className="trip-list-stack">
              {pastTrips.map((t) => {
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
              {!pastTrips.length && <div className="agent-empty"><i className="bi bi-clock-history"></i><p>No past tours yet.</p></div>}
            </div>
          </section>
        )}

        {tab === "meets" && (
          <>
            <section className="agent-panel meets-unified-panel">
              <div className="office-meet-form-panel unique-meet meets-form-wrap">
                <div className="agent-panel-head">
                  <h3>Build Office Meet Request</h3>
                </div>
                <div className="meet-helper">
                  Share your preferred schedule and reason. Requests are reviewed in real time by admin and agents.
                </div>

                <div className="row g-2">
                  <div className="col-12">
                    <label className="form-label">Meeting Mode</label>
                    <div className="meet-mode-group">
                      <button
                        type="button"
                        className={meetForm.mode === "office" ? "active" : ""}
                        onClick={() => setMeetForm((s) => ({ ...s, mode: "office" }))}
                      >
                        <i className="bi bi-building"></i>In Office
                      </button>
                      <button
                        type="button"
                        className={meetForm.mode === "virtual" ? "active" : ""}
                        onClick={() => setMeetForm((s) => ({ ...s, mode: "virtual" }))}
                      >
                        <i className="bi bi-camera-video"></i>Virtual
                      </button>
                    </div>
                    <div className="meet-preview">
                      Selected: <strong>{meetForm.mode === "virtual" ? "Virtual Meeting" : "In Office Meeting"}</strong>
                    </div>
                  </div>
                <div className="col-md-6">
                  <label className="form-label">Full Name</label>
                  <input className="form-control" value={meetForm.fullName} onChange={(e) => setMeetForm((s) => ({ ...s, fullName: e.target.value }))} />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Email</label>
                  <input className="form-control" type="email" value={meetForm.email} onChange={(e) => setMeetForm((s) => ({ ...s, email: e.target.value }))} />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Preferred Date</label>
                  <input
                    className={`form-control ${meetTouched.date && meetDateError ? "is-invalid" : ""}`}
                    type="date"
                    value={meetForm.date}
                    onBlur={() => setMeetTouched((s) => ({ ...s, date: true }))}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      setMeetForm((s) => {
                        const keepTime = s.time && isWithinOperatingHours(nextDate, s.time);
                        return { ...s, date: nextDate, time: keepTime ? s.time : "" };
                      });
                    }}
                  />
                  {meetTouched.date && meetDateError && <div className="invalid-feedback d-block">{meetDateError}</div>}
                </div>
                <div className="col-md-6">
                  <label className="form-label">Preferred Time</label>
                  <input
                    className={`form-control ${meetTouched.time && meetTimeError ? "is-invalid" : ""}`}
                    type="time"
                    min={meetOperatingHours.minTime || undefined}
                    max={meetOperatingHours.maxTime || undefined}
                    disabled={meetOperatingHours.isClosed}
                    value={meetForm.time}
                    onBlur={() => setMeetTouched((s) => ({ ...s, time: true }))}
                    onChange={(e) => setMeetForm((s) => ({ ...s, time: e.target.value }))}
                  />
                  <div className="meet-preview">
                    Hours: {meetOperatingHours.label}
                  </div>
                  {meetTouched.time && meetTimeError && <div className="invalid-feedback d-block">{meetTimeError}</div>}
                </div>
                <div className="col-12">
                  <label className="form-label">Reason</label>
                  <div className="meet-reason-quick">
                    {MEET_REASON_TEMPLATES.map((item) => (
                      <button
                        type="button"
                        key={item}
                        className={meetForm.reason.includes(item) ? "active" : ""}
                        onClick={() => toggleMeetReasonTemplate(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <textarea className="form-control" rows="4" value={meetForm.reason} onChange={(e) => setMeetForm((s) => ({ ...s, reason: e.target.value }))}></textarea>
                  <div className="meet-char-count">{meetReasonLength}/600</div>
                </div>
                <div className="col-12">
                  <div className="meet-submit-row">
                    <button type="button" className="btn btn-outline-dark" onClick={resetMeetForm}>
                      Clear
                    </button>
                    <button
                      className="btn btn-dark"
                      disabled={!canSubmitMeetRequest}
                      onClick={submitMeetRequest}
                    >
                      Submit Request
                    </button>
                  </div>
                </div>
              </div>
              </div>

            </section>
          </>
        )}

        {tab === "profile" && (
          <section className="agent-panel customer-profile-panel">
            <div className="customer-profile-head">
              <div className="d-flex align-items-center gap-3">
                <span className="agent-avatar customer-profile-avatar">
                  {(profileForm.fullName || user?.username || "C").charAt(0).toUpperCase()}
                </span>
                <div>
                  <h3>{profileForm.fullName || "-"}</h3>
                  <div className="small muted">@{user?.username} | Customer</div>
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

                const users = safeArray("allUsers");
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
                saveArray("allUsers", nextUsers);

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
