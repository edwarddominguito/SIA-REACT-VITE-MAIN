import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getCurrentUser, safeArray, saveArray, setCurrentUser as persistCurrentUser, subscribeKeys } from "@/services/storageService.js";
import { apiRequest } from "@/api/client.js";
import DashboardLayout from "@/layout/DashboardLayout.jsx";
import DashboardCalendar from "@/components/DashboardCalendar.jsx";
import MessagingPanel from "@/components/MessagingPanel.jsx";
import UIFeedback from "@/ui/UIFeedback.jsx";
import CustomerStatCard from "@/components/CustomerStatCard.jsx";
import { CUSTOMER_NAV_ITEMS } from "@/data/constants.js";
import { appointmentStatusPriority } from "@/utils/workflow.js";
import {
  applyPropertyImageFallback,
  appointmentTypeLabel,
  eventDateTimeStamp,
  formatClockTime,
  formatDateTimeLabel,
  formatWorkflowStatus,
  isDisplayableProperty,
  isActiveStatus,
  listingTypeLabel,
  makePropertyFallbackImage,
  normalizePropertyStatus,
  normalizeWorkflowStatus,
  normalizeAppointmentImages,
  propertyPriceLabel,
  resolveAppointmentImage,
  propertyStatusLabel,
  statusBadgeClass,
  tripAttendees,
  tripStatus,
  withImage
} from "@/utils/domain.js";
import useUiFeedback from "@/hooks/useUiFeedback.js";
import { pushNotification } from "@/utils/notifications.js";
import {
  cleanUsername,
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
} from "@/utils/input.js";

const MEET_REASON_TEMPLATES = [
  "Financing consultation",
  "Schedule property visit plan",
  "Contract and offer discussion",
  "Investment advice"
];

const toLocalDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const createTimeSlots = (minTime, maxTime, stepMinutes = 30) => {
  const [minHour = "0", minMinute = "0"] = String(minTime || "").split(":");
  const [maxHour = "0", maxMinute = "0"] = String(maxTime || "").split(":");
  const start = (Number(minHour) * 60) + Number(minMinute);
  const end = (Number(maxHour) * 60) + Number(maxMinute);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return [];
  }

  const slots = [];
  for (let minutes = start; minutes <= end; minutes += stepMinutes) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
    const minute = String(minutes % 60).padStart(2, "0");
    const value = `${hour}:${minute}`;
    slots.push({
      value,
      label: formatClockTime(value)
    });
  }
  return slots;
};

const POPULAR_BOOKING_TIMES = new Set(["09:00", "10:00", "14:00"]);

const formatFriendlyBookingDate = (dateValue) => {
  const raw = String(dateValue || "").trim();
  if (!raw) return "Not selected";
  const selected = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(selected.getTime())) return raw;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (selected.getTime() === today.getTime()) return "Today";
  if (selected.getTime() === tomorrow.getTime()) return "Tomorrow";
  return selected.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const propertyFactItems = (property) => {
  const items = [];
  const bedrooms = Number(property?.bedrooms || 0);
  const bathrooms = Number(property?.bathrooms || 0);
  const areaSqft = Number(property?.areaSqft || 0);

  if (bedrooms > 0) {
    items.push({
      label: "Bedrooms",
      value: String(bedrooms)
    });
  }

  if (bathrooms > 0) {
    items.push({
      label: "Bathrooms",
      value: String(bathrooms)
    });
  }

  if (areaSqft > 0) {
    items.push({
      label: "Area (sqft)",
      value: areaSqft.toLocaleString()
    });
  }

  return items;
};

export default function CustomerDashboard() {
  const user = getCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();

  const tabFromPath = (pathname) => {
    const normalized = String(pathname || "").toLowerCase();
    if (normalized === "/customer" || normalized === "/customer/" || normalized === "/customer/home" || normalized === "/customer/dashboard") return "dashboard";
    if (normalized === "/customer/browse" || normalized === "/customer/book-appointment") return "browse";
    if (normalized === "/customer/appointments") return "appointments";
    if (normalized === "/customer/meets") return "meets";
    if (normalized === "/customer/trips") return "trips";
    if (normalized === "/customer/calendar") return "calendar";
    if (normalized === "/customer/messages") return "messages";
    if (normalized === "/customer/reviews") return "reviews";
    if (normalized === "/customer/profile") return "profile";
    return "dashboard";
  };

  const pathFromTab = (nextTab) => {
    if (nextTab === "dashboard") return "/customer/dashboard";
    if (nextTab === "browse") return "/customer/book-appointment";
    if (nextTab === "appointments") return "/customer/appointments";
    if (nextTab === "meets") return "/customer/meets";
    if (nextTab === "trips") return "/customer/trips";
    if (nextTab === "calendar") return "/customer/calendar";
    if (nextTab === "messages") return "/customer/messages";
    if (nextTab === "reviews") return "/customer/reviews";
    if (nextTab === "profile") return "/customer/profile";
    return "/customer/dashboard";
  };

  const [tab, setTab] = useState(() => tabFromPath(location.pathname));
  const [messageContact, setMessageContact] = useState("");

  const [properties, setProperties] = useState([]);
  const [apps, setApps] = useState([]);
  const [trips, setTrips] = useState([]);
  const [meets, setMeets] = useState([]);
  const [reviews, setReviews] = useState([]);

  const [q, setQ] = useState("");
  const [appointmentQuery, setAppointmentQuery] = useState("");
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState("all");
  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || "",
    phone: user?.phone || "",
    email: user?.email || ""
  });
  const [booking, setBooking] = useState({ propertyId: "", date: "", time: "", appointmentType: "property_viewing", fullName: "", email: "", phone: "", notes: "" });
  const [bookingStep, setBookingStep] = useState(1);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const [meetForm, setMeetForm] = useState({
    fullName: user?.fullName || "",
    email: user?.email || "",
    phone: user?.phone || "",
    date: "",
    time: "",
    reason: "",
    mode: "office",
    relatedPropertyId: "",
    notes: ""
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
  const [isSubmittingMeet, setIsSubmittingMeet] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const bookingModalRef = useRef(null);
  const bookingDateInputRef = useRef(null);
  const feedback = useUiFeedback();
  const canUsePortal = typeof document !== "undefined";

  const refreshAll = () => {
    const allProperties = safeArray("allProperties").filter(isDisplayableProperty);
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
    const normalizedPath = String(location.pathname || "").toLowerCase();
    if (normalizedPath === "/customer" || normalizedPath === "/customer/" || normalizedPath === "/customer/home") {
      navigate("/customer/dashboard", { replace: true });
      return;
    }
    if (normalizedPath === "/customer/browse") {
      navigate("/customer/book-appointment", { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    const requestedMessageContact = cleanUsername(location.state?.messageContact);
    if (!requestedMessageContact) return;

    setMessageContact(requestedMessageContact);
    setTab("messages");
    navigate("/customer/messages", { replace: true, state: null });
  }, [location.state, navigate]);

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
      const status = normalizeWorkflowStatus(a.status, "appointment");
      const passStatus = appointmentStatusFilter === "all" || status === appointmentStatusFilter;
      if (!passStatus) return false;
      if (!q) return true;
      return [a.propertyTitle, a.location, a.date, a.time, formatWorkflowStatus(a.status, "appointment")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [sortedMyApps, appointmentQuery, appointmentStatusFilter]);

  const filteredProps = useMemo(() => {
    const s = q.trim().toLowerCase();
    const visibleProperties = properties.filter(isDisplayableProperty);
    if (!s) return visibleProperties;
    return visibleProperties.filter((p) =>
      [p.title, p.location, p.description, p.agent, p.propertyType, p.listingType].filter(Boolean).join(" ").toLowerCase().includes(s)
    );
  }, [properties, q]);

  const myPending = useMemo(
    () => myApps.filter((a) => normalizeWorkflowStatus(a.status, "appointment") === "pending"),
    [myApps]
  );
  const selectedBookingProperty = useMemo(
    () => properties.find((p) => String(p.id) === String(booking.propertyId)),
    [properties, booking.propertyId]
  );
  useEffect(() => {
    if (!booking.propertyId || !selectedBookingProperty) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      bookingModalRef.current?.scrollTo?.({ top: 0, behavior: "auto" });
      bookingDateInputRef.current?.focus?.();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [booking.propertyId, selectedBookingProperty]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (booking.propertyId && selectedBookingProperty) return;
    document.body.style.overflow = "";
  }, [booking.propertyId, selectedBookingProperty]);

  const bookingOperatingHours = useMemo(
    () => getOperatingHoursForDate(booking.date),
    [booking.date]
  );
  const minBookingDate = useMemo(() => toLocalDateInputValue(), []);
  const bookingTimeOptions = useMemo(() => {
    if (!booking.date || bookingOperatingHours.isClosed) {
      return [];
    }
    return createTimeSlots(bookingOperatingHours.minTime, bookingOperatingHours.maxTime);
  }, [booking.date, bookingOperatingHours]);
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
    () => myTrips.filter((t) => {
      const st = tripStatus(t);
      return isActiveStatus(st, "tour");
    }),
    [myTrips]
  );
  const pastTrips = useMemo(
    () => myTrips.filter((t) => {
      const st = tripStatus(t);
      return !isActiveStatus(st, "tour");
    }),
    [myTrips]
  );
  const reviewedAppointmentIds = useMemo(
    () => new Set(myReviews.map((r) => String(r.appointmentId))),
    [myReviews]
  );
  const reviewEligibleApps = useMemo(
    () => myApps.filter((a) => normalizeWorkflowStatus(a.status, "appointment") === "completed" && !reviewedAppointmentIds.has(String(a.id))),
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
      subtitle: a.assignedAgent ? `Assigned agent: @${a.assignedAgent}` : "Awaiting agent assignment",
      date: a.date,
      time: a.time,
      type: "appointment",
      status: a.status || "pending"
    }));
    const myMeets = meets.filter((m) => String(m.customer || m.requestedBy || "").trim() === user?.username);
    const meetEvents = myMeets.map((m) => ({
      id: `meet-${m.id}`,
      title: m.mode === "virtual" ? "Virtual Office Meeting" : "Office Meeting",
      subtitle: m.assignedAgent ? `Assigned agent: @${m.assignedAgent}` : "Pending assignment",
      description: m.reason || "",
      date: m.date,
      time: m.time,
      type: "meet",
      status: m.status || "pending"
    }));
    const tripEvents = myTrips.map((t) => ({
      id: `trip-${t.id}`,
      title: t.title || "Property Tour",
      subtitle: t.location || "Property tour",
      description: t.notes || "",
      date: t.date,
      time: t.time,
      type: "trip",
      status: tripStatus(t)
    }));
    return [...appointmentEvents, ...meetEvents, ...tripEvents];
  }, [myApps, meets, myTrips, user]);
  const activeAppointments = useMemo(
    () => myApps.filter((a) => isActiveStatus(a.status, "appointment")),
    [myApps]
  );
  const nextUpcomingAppointment = useMemo(() => {
    const now = Date.now();
    const sorted = activeAppointments
      .map((a) => ({
        ...a,
        ts: eventDateTimeStamp(a.date, a.time)
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
        ts: eventDateTimeStamp(evt.date, evt.time)
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

  const currentTabLabel = tab === "appointments"
    ? "My Appointments"
    : tab === "trips"
      ? "My Tours"
    : CUSTOMER_NAV_ITEMS.find((item) => item.id === tab)?.label || "Dashboard";
  const propertyLinkState = { from: location.pathname };
  const handleCustomerTabChange = (nextTab) => {
    setTab(nextTab);
    if (nextTab !== "messages") {
      setMessageContact("");
    }
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
      phone: user?.phone || "",
      date: "",
      time: "",
      reason: "",
      mode: "office",
      relatedPropertyId: "",
      notes: ""
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
    const phone = cleanPhone(meetForm.phone);
    const reason = cleanText(meetForm.reason, 600);
    const { date, time } = normalizeDateTimeInput(meetForm.date, meetForm.time);
    return Boolean(fullName && email && phone && reason && date && time && !meetDateError && !meetTimeError);
  }, [meetForm, meetDateError, meetTimeError]);

  const submitMeetRequest = async () => {
    if (isSubmittingMeet) return;
    setMeetTouched({ date: true, time: true });
    const fullName = cleanText(meetForm.fullName, 80);
    const email = cleanEmail(meetForm.email);
    const phone = cleanPhone(meetForm.phone);
    const reason = cleanText(meetForm.reason, 600);
    const notes = cleanText(meetForm.notes, 1200);
    const relatedPropertyId = String(meetForm.relatedPropertyId || "").trim();
    const { date, time } = normalizeDateTimeInput(meetForm.date, meetForm.time);
    if (!fullName || !email || !phone || !date || !time || !reason) {
      feedback.notify("Please complete all office meeting fields.", "error");
      return;
    }
    if (!isValidEmail(email)) {
      feedback.notify("Please provide a valid email.", "error");
      return;
    }
    if (!isValidPhone(phone)) {
      feedback.notify("Please provide a valid phone number.", "error");
      return;
    }
    if (!isWithinOperatingHours(date, time)) {
      if (meetOperatingHours.isClosed) {
        feedback.notify("Office meeting requests are not available on Sunday.", "error");
      } else {
        feedback.notify(`Meeting time must be within ${meetOperatingHours.label}.`, "error");
      }
      return;
    }
    if (!isFutureOrNowSlot(date, time)) {
      feedback.notify("Meeting schedule must be now or in the future.", "error");
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
    try {
      setIsSubmittingMeet(true);
      const res = await apiRequest("/api/office-meets", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          email,
          phone,
          customer: user.username,
          requestedBy: user.username,
          date,
          time,
          reason,
          mode: meetForm.mode,
          relatedPropertyId,
          notes
        })
      });
      const savedMeet = res?.data;
      if (!savedMeet?.id) {
        throw new Error("Office meeting was not saved by the server.");
      }
      const assignedAgent = String(savedMeet.assignedAgent || savedMeet.agent || "").trim();
      saveMeetsLocal([
        savedMeet,
        ...meets.filter((meet) => String(meet?.id || "").trim() !== String(savedMeet.id))
      ]);
      notifyRoles({
        roles: ["admin"],
        includeUsers: assignedAgent ? [assignedAgent] : [],
        type: "office-meet",
        title: "New Office Meeting Request",
        message: `Customer @${user.username} requested a ${meetForm.mode === "virtual" ? "virtual" : "in-office"} office meeting on ${formatDateTimeLabel(date, time)}.`,
        meta: {
          customer: user.username,
          assignedAgent,
          mode: meetForm.mode,
          relatedPropertyId,
          date,
          time
        }
      });
      resetMeetForm();
      feedback.notify("Office meeting request submitted.", "success");
    } finally {
      setIsSubmittingMeet(false);
    }
  };

  const resetBookingFlow = () => {
    setBooking({ propertyId: "", date: "", time: "", appointmentType: "property_viewing", fullName: "", email: "", phone: "", notes: "" });
    setBookingStep(1);
    setBookingSuccess(null);
  };

  useEffect(() => {
    if (tab === "browse") return;
    if (!booking.propertyId) return;
    resetBookingFlow();
    document.body.style.overflow = "";
  }, [tab, booking.propertyId]);

  const submitReviewForAppointment = async (appointment) => {
    if (isSubmittingReview) return;
    const appointmentId = String(appointment?.id || "");
    if (!appointmentId || !appointment) {
      feedback.notify("Invalid appointment.", "error");
      return;
    }
    if (normalizeWorkflowStatus(appointment.status, "appointment") !== "completed") {
      feedback.notify("Only completed appointments can be reviewed.", "error");
      return;
    }
    if (reviewedAppointmentIds.has(appointmentId)) {
      feedback.notify("You already reviewed this appointment.", "error");
      return;
    }
    const comment = cleanText(reviewForm.comment, 500);
    const rating = Number(reviewForm.rating || 0);
    const normalizedRating = Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : 0;
    try {
      setIsSubmittingReview(true);
      const res = await apiRequest("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          appointmentId,
          customer: user.username,
          propertyId: appointment.propertyId || "",
          rating: normalizedRating,
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
        rating: Number(saved?.rating ?? normalizedRating ?? 0),
        comment: saved?.comment ?? comment,
        createdAt: saved.createdAt || new Date().toISOString()
      };
      saveReviewsLocal([newReview, ...reviews]);
      setReviewForm({ rating: "0", comment: "" });
      setReviewTargetId("");
      feedback.notify("Review submitted.", "success");
    } catch (err) {
      feedback.notify(err?.message || "Failed to submit review.", "error");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const startBookingForProperty = (propertyId) => {
    setBooking({
      propertyId: String(propertyId),
      date: "",
      time: "",
      appointmentType: "property_viewing",
      fullName: profileForm.fullName || user?.fullName || "",
      email: profileForm.email || user?.email || "",
      phone: profileForm.phone || user?.phone || "",
      notes: ""
    });
    setBookingStep(1);
    setBookingSuccess(null);
  };

  function getBookingRequiredMessage(date, time) {
    if (!date || !time) return "Select both date and time.";
    return "";
  }

  const { date: _normDate, time: _normTime } = normalizeDateTimeInput(booking.date, booking.time);
  const normalizedBooking = {
    date: _normDate,
    time: _normTime,
    fullName: cleanText(booking.fullName, 80),
    email: cleanEmail(booking.email),
    phone: cleanPhone(booking.phone),
    notes: cleanText(booking.notes, 500)
  };
  const bookingRequiredMessage = getBookingRequiredMessage(normalizedBooking.date, normalizedBooking.time);
  const canContinueBooking = Boolean(normalizedBooking.date && normalizedBooking.time) && !isSubmittingBooking;
  const canAdvanceToConfirm = Boolean(
    normalizedBooking.fullName &&
    normalizedBooking.email && isValidEmail(normalizedBooking.email) &&
    normalizedBooking.phone && isValidPhone(normalizedBooking.phone)
  );
  const canConfirmBooking = !bookingRequiredMessage && !isSubmittingBooking;

  const handlePropertyImageError = (e, propertyLike) => {
    applyPropertyImageFallback(e.currentTarget, propertyLike || { title: "Property" });
  };

  const getPropertyImage = (item) => {
    const resolved = resolveAppointmentImage(item, properties);
    return resolved || makePropertyFallbackImage(item?.propertyTitle || "Property");
  };

  return (
    <DashboardLayout
      suiteLabel="Customer Suite"
      profileName={user?.fullName || "Customer"}
      profileRole="Customer"
      role="customer"
      navItems={CUSTOMER_NAV_ITEMS}
      activeTab={tab}
      onTabChange={handleCustomerTabChange}
    >
        <section className="agent-hero">
          <div>
            <h1>{currentTabLabel}</h1>
          </div>
        </section>

        {tab === "dashboard" && (
          <>
            <section className="agent-stats-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
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
                    <span className={statusBadgeClass(nextUpcomingAppointment.status, "appointment")}>{formatWorkflowStatus(nextUpcomingAppointment.status, "appointment")}</span>
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
                      <span className={statusBadgeClass(evt.status, evt.type === "trip" ? "tour" : evt.type === "meet" ? "office_meeting" : "appointment")}>
                        {formatWorkflowStatus(evt.status, evt.type === "trip" ? "tour" : evt.type === "meet" ? "office_meeting" : "appointment")}
                      </span>
                    </div>
                  ))}
                  {!upcomingCalendarEvents.length && <div className="agent-empty compact"><i className="bi bi-calendar3"></i><p>No upcoming events.</p></div>}
                </div>
              </article>
            </section>
          </>
        )}

        {tab === "browse" && (
          <>
            <section className="agent-search-wrap customer-browse-search">
              <div className="input-group customer-browse-search-input">
                <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                <input className="form-control" placeholder="Search listings by title, location, description, agent..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </section>

            <section className="agent-property-grid full customer-browse-grid">
              {filteredProps.map((p) => {
                const normalizedStatus = normalizePropertyStatus(p.propertyStatus || p.status);
                const isAvailable = normalizedStatus === "available";
                const bedrooms = Number(p?.bedrooms || 0);
                const bathrooms = Number(p?.bathrooms || 0);
                const areaSqft = Number(p?.areaSqft || 0);
                const areaLabel = areaSqft > 0 ? `${areaSqft.toLocaleString()} sqft` : "Area pending";
                const detailLine = [
                  bedrooms > 0 ? `${bedrooms} Bed` : null,
                  bathrooms > 0 ? `${bathrooms} Bath` : null,
                  areaSqft > 0 ? `${areaSqft.toLocaleString()} sqft` : null
                ].filter(Boolean).join(" | ");
                return (
                <article key={p.id} className="agent-property-card customer-browse-card">
                  <div className="customer-browse-media">
                    <img
                      src={withImage(p)}
                      alt={p.title}
                      className="customer-browse-card-image"
                      onError={(e) => handlePropertyImageError(e, p)}
                    />
                    <span className={`badge badge-soft customer-browse-badge status-${normalizedStatus}`}>
                      {propertyStatusLabel(p)}
                    </span>
                  </div>
                  <div className="agent-property-body customer-browse-body">
                    <div className="customer-browse-summary">
                      <h4 className="customer-browse-headline">
                        <span className="customer-browse-title">{p.title}</span>
                      </h4>
                      <strong className="customer-browse-price">{propertyPriceLabel(p)}</strong>
                      <p className="customer-browse-detail-line">{detailLine}</p>
                      <p className="customer-browse-location">
                        <i className="bi bi-geo-alt"></i>
                        <span>{p.location}</span>
                      </p>
                    </div>
                    <div className="customer-browse-footer">
                      <Link
                        className="customer-browse-footer-action"
                        to={`/properties/${p.id}`}
                        state={propertyLinkState}
                      >
                        Show details
                      </Link>
                      <button
                        type="button"
                        className="customer-browse-footer-action dark"
                        onClick={() => startBookingForProperty(p.id)}
                        disabled={!isAvailable}
                      >
                        {isAvailable ? "Book appointment" : "Not available"}
                      </button>
                    </div>
                  </div>
                </article>
                );
              })}
              {!filteredProps.length && <div className="agent-empty large customer-browse-empty"><i className="bi bi-house-door"></i><p>No matching listings.</p></div>}
            </section>

            {!!booking.propertyId && !!selectedBookingProperty && canUsePortal && createPortal(
              <div className="bk-wrap" onClick={resetBookingFlow}>
                <div
                  ref={bookingModalRef}
                  className="bk-modal"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="bk-title"
                >
                  {/* Header */}
                  <div className="bk-header">
                    <div className="bk-header-left">
                      <span className="bk-eyebrow">Book Appointment</span>
                      <h4 id="bk-title" className="bk-title">{selectedBookingProperty.title}</h4>
                      <div className="bk-location"><i className="bi bi-geo-alt"></i> {selectedBookingProperty.location}</div>
                    </div>
                    <div className="bk-header-right">
                      <div className="bk-price-pill">{propertyPriceLabel(selectedBookingProperty)}</div>
                      <button type="button" className="bk-close" onClick={resetBookingFlow} aria-label="Close">
                        <i className="bi bi-x-lg"></i>
                      </button>
                    </div>
                  </div>

                  {/* Progress — only on steps 1–3 */}
                  {bookingStep < 4 && (
                    <div className="bk-progress" aria-label="Booking progress">
                      {["Schedule", "Your Details", "Confirm"].map((label, i) => {
                        const stepNum = i + 1;
                        const isActive = bookingStep === stepNum;
                        const isDone = bookingStep > stepNum;
                        return (
                          <React.Fragment key={label}>
                            <div className={`bk-step${isActive ? " bk-step--active" : ""}${isDone ? " bk-step--done" : ""}`}>
                              <div className="bk-step-dot">
                                {isDone ? <i className="bi bi-check-lg"></i> : stepNum}
                              </div>
                              <span>{label}</span>
                            </div>
                            {i < 2 && <div className="bk-step-line" />}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}

                  {/* Body */}
                  <div className="bk-body">

                    {/* ── Step 1: Schedule ── */}
                    {bookingStep === 1 && (
                      <div className="bk-step-content">
                        <div className="bk-step-header">
                          <strong>Choose a schedule</strong>
                          <p>Pick a day and time for your property visit.</p>
                        </div>

                        {/* Date */}
                        <div className="bk-field">
                          <label className="bk-label" htmlFor="bk-date">Preferred date</label>
                          <input
                            id="bk-date"
                            ref={bookingDateInputRef}
                            type="date"
                            className="bk-input"
                            min={minBookingDate}
                            value={booking.date}
                            onChange={(e) => {
                              const nextDate = e.target.value;
                              setBooking((b) => {
                                const keepTime = b.time && isWithinOperatingHours(nextDate, b.time);
                                return { ...b, date: nextDate, time: keepTime ? b.time : "" };
                              });
                            }}
                          />
                          <div className="bk-hint">Mon–Fri 8:00 AM–5:00 PM · Sat 8:00 AM–1:00 PM · Sun closed</div>
                        </div>

                        {/* Time slots */}
                        <div className="bk-field">
                          <label className="bk-label">
                            Time slot
                            {booking.time && <span className="bk-selected-badge">{formatClockTime(booking.time)}</span>}
                          </label>
                          <div
                            className={`bk-slots${!booking.date || bookingOperatingHours.isClosed ? " bk-slots--locked" : ""}`}
                            role="listbox"
                            aria-label="Available appointment times"
                          >
                            {!booking.date && <div className="bk-slots-empty">Select a date to see available times</div>}
                            {booking.date && bookingOperatingHours.isClosed && <div className="bk-slots-empty">Closed on Sundays — pick another day</div>}
                            {booking.date && !bookingOperatingHours.isClosed && !bookingTimeOptions.length && <div className="bk-slots-empty">No slots available for this date</div>}
                            {booking.date && !bookingOperatingHours.isClosed && bookingTimeOptions.map((slot) => (
                              <button
                                key={slot.value}
                                type="button"
                                className={`bk-slot${booking.time === slot.value ? " bk-slot--active" : ""}`}
                                onClick={() => setBooking((b) => ({ ...b, time: slot.value }))}
                                aria-pressed={booking.time === slot.value}
                              >
                                {slot.label}
                                {booking.time === slot.value
                                  ? <i className="bi bi-check2"></i>
                                  : POPULAR_BOOKING_TIMES.has(slot.value)
                                    ? <span className="bk-slot-pop">Popular</span>
                                    : null}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="bk-actions">
                          <button type="button" className="bk-btn bk-btn--ghost" onClick={resetBookingFlow}>Cancel</button>
                          <button
                            type="button"
                            className="bk-btn bk-btn--primary"
                            disabled={!canContinueBooking}
                            onClick={() => {
                              const message = getBookingRequiredMessage(normalizedBooking.date, normalizedBooking.time);
                              if (message) { feedback.notify(message, "error"); return; }
                              if (!isWithinOperatingHours(normalizedBooking.date, normalizedBooking.time)) {
                                feedback.notify(bookingOperatingHours.isClosed ? "Appointments are not available on Sunday." : `Appointment time must be within ${bookingOperatingHours.label}.`, "error");
                                return;
                              }
                              if (!isFutureOrNowSlot(normalizedBooking.date, normalizedBooking.time)) {
                                feedback.notify("Appointment schedule must be now or in the future.", "error");
                                return;
                              }
                              setBookingStep(2);
                            }}
                          >
                            Next: Your Details <i className="bi bi-arrow-right"></i>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Step 2: Contact Details ── */}
                    {bookingStep === 2 && (
                      <div className="bk-step-content">
                        <div className="bk-step-header">
                          <strong>Your details</strong>
                          <p>We'll use this to confirm your appointment.</p>
                        </div>
                        <div className="bk-fields-grid">
                          <div className="bk-field">
                            <label className="bk-label" htmlFor="bk-name">Full name</label>
                            <input
                              id="bk-name"
                              type="text"
                              className="bk-input"
                              placeholder="Juan Dela Cruz"
                              value={booking.fullName}
                              onChange={(e) => setBooking((b) => ({ ...b, fullName: e.target.value }))}
                            />
                          </div>
                          <div className="bk-field">
                            <label className="bk-label" htmlFor="bk-email">Email</label>
                            <input
                              id="bk-email"
                              type="email"
                              className="bk-input"
                              placeholder="you@email.com"
                              value={booking.email}
                              onChange={(e) => setBooking((b) => ({ ...b, email: e.target.value }))}
                            />
                          </div>
                          <div className="bk-field">
                            <label className="bk-label" htmlFor="bk-phone">Phone number</label>
                            <input
                              id="bk-phone"
                              type="tel"
                              className="bk-input"
                              placeholder="09XX XXX XXXX"
                              value={booking.phone}
                              onChange={(e) => setBooking((b) => ({ ...b, phone: e.target.value }))}
                            />
                          </div>
                          <div className="bk-field">
                            <label className="bk-label" htmlFor="bk-notes">Special requests <span className="bk-optional">(optional)</span></label>
                            <textarea
                              id="bk-notes"
                              className="bk-input bk-textarea"
                              rows="3"
                              placeholder="Accessibility needs, preferred language, any notes..."
                              value={booking.notes}
                              onChange={(e) => setBooking((b) => ({ ...b, notes: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="bk-actions">
                          <button type="button" className="bk-btn bk-btn--ghost" onClick={() => setBookingStep(1)}>Back</button>
                          <button
                            type="button"
                            className="bk-btn bk-btn--primary"
                            disabled={!canAdvanceToConfirm}
                            onClick={() => setBookingStep(3)}
                          >
                            Review Appointment <i className="bi bi-arrow-right"></i>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Step 3: Confirm ── */}
                    {bookingStep === 3 && (
                      <div className="bk-step-content">
                        <div className="bk-step-header">
                          <strong>Review &amp; confirm</strong>
                          <p>Check your details before submitting.</p>
                        </div>
                        <div className="bk-review">
                          {[
                            ["Property", selectedBookingProperty.title || "(unknown)"],
                            ["Location", selectedBookingProperty.location || "-"],
                            ["Date", formatFriendlyBookingDate(booking.date)],
                            ["Time", formatClockTime(booking.time)],
                            ["Price", propertyPriceLabel(selectedBookingProperty)],
                            ["Name", normalizedBooking.fullName || "-"],
                            ["Email", normalizedBooking.email || "-"],
                            ["Phone", normalizedBooking.phone || "-"]
                          ].map(([key, val]) => (
                            <div key={key} className="bk-review-row">
                              <span>{key}</span>
                              <strong>{val}</strong>
                            </div>
                          ))}
                          {normalizedBooking.notes && (
                            <div className="bk-review-row bk-review-row--notes">
                              <span>Notes</span>
                              <strong>{normalizedBooking.notes}</strong>
                            </div>
                          )}
                          <div className="bk-review-row">
                            <span>Status</span>
                            <strong className="bk-status-pending">Pending approval</strong>
                          </div>
                        </div>
                        <div className="bk-confirm-note">
                          <i className="bi bi-info-circle"></i>
                          Submitting sends your request to the real-estate team for review.
                        </div>
                        <div className="bk-actions">
                          <button type="button" className="bk-btn bk-btn--ghost" onClick={() => setBookingStep(2)}>Back</button>
                          <button
                            type="button"
                            className="bk-btn bk-btn--primary"
                            disabled={!canConfirmBooking || isSubmittingBooking}
                            onClick={async () => {
                              if (isSubmittingBooking) return;
                              if (!booking.propertyId || !normalizedBooking.date || !normalizedBooking.time) {
                                feedback.notify("Select both date and time.", "error");
                                return;
                              }
                              if (!isWithinOperatingHours(normalizedBooking.date, normalizedBooking.time)) {
                                feedback.notify(bookingOperatingHours.isClosed ? "Appointments are not available on Sunday." : `Appointment time must be within ${bookingOperatingHours.label}.`, "error");
                                return;
                              }
                              if (!isFutureOrNowSlot(normalizedBooking.date, normalizedBooking.time)) {
                                feedback.notify("Appointment schedule must be now or in the future.", "error");
                                return;
                              }
                              const pid = String(booking.propertyId);
                              const duplicate = apps.some((a) => a.customer === user.username && String(a.propertyId) === pid && a.date === normalizedBooking.date && a.time === normalizedBooking.time);
                              if (duplicate) {
                                feedback.notify("You already have a booking for this property at the same date and time.", "error");
                                return;
                              }
                              try {
                                setIsSubmittingBooking(true);
                                const res = await apiRequest("/api/appointments", {
                                  method: "POST",
                                  body: JSON.stringify({
                                    propertyId: pid,
                                    propertyTitle: selectedBookingProperty?.title || "(unknown)",
                                    location: selectedBookingProperty?.location || "",
                                    agent: selectedBookingProperty?.agent || "",
                                    customer: user.username,
                                    date: normalizedBooking.date,
                                    time: normalizedBooking.time,
                                    appointmentType: booking.appointmentType || "property_viewing",
                                    contactFullName: normalizedBooking.fullName,
                                    contactEmail: normalizedBooking.email,
                                    contactPhone: normalizedBooking.phone,
                                    notes: normalizedBooking.notes
                                  })
                                });
                                const savedAppointment = res?.data;
                                if (!savedAppointment?.id) throw new Error("Appointment was not saved by the server.");
                                saveAppsLocal([
                                  { ...savedAppointment, propertyImage: savedAppointment.propertyImage || getPropertyImage(selectedBookingProperty) },
                                  ...apps.filter((appointment) => String(appointment?.id || "") !== String(savedAppointment.id))
                                ]);
                                notifyRoles({
                                  roles: ["admin"],
                                  type: "appointment",
                                  title: "New Appointment Request",
                                  message: `Customer @${user.username} requested ${selectedBookingProperty?.title || "a property"} on ${formatDateTimeLabel(normalizedBooking.date, normalizedBooking.time)}.`,
                                  meta: {
                                    customer: user.username,
                                    agent: selectedBookingProperty?.agent || "",
                                    propertyId: pid,
                                    propertyTitle: selectedBookingProperty?.title || "",
                                    date: normalizedBooking.date,
                                    time: normalizedBooking.time
                                  }
                                });
                                setBookingSuccess({
                                  propertyTitle: selectedBookingProperty?.title || "(unknown)",
                                  location: selectedBookingProperty?.location || "",
                                  date: normalizedBooking.date,
                                  time: normalizedBooking.time,
                                  appointmentType: booking.appointmentType || "property_viewing",
                                  appointmentId: savedAppointment.id || "",
                                  contactFullName: normalizedBooking.fullName,
                                  contactEmail: normalizedBooking.email,
                                  contactPhone: normalizedBooking.phone,
                                  notes: normalizedBooking.notes
                                });
                                setBookingStep(4);
                              } catch (error) {
                                feedback.notify(error?.message || "Unable to submit appointment.", "error");
                              } finally {
                                setIsSubmittingBooking(false);
                              }
                            }}
                          >
                            {isSubmittingBooking ? "Submitting..." : "Submit Appointment"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Step 4: Success ── */}
                    {bookingStep === 4 && (
                      <div className="bk-success">
                        <div className="bk-success-icon"><i className="bi bi-check-lg"></i></div>
                        <h4 className="bk-success-title">Appointment requested!</h4>
                        <p className="bk-success-sub">Your viewing request is now pending agent approval.</p>
                        <div className="bk-review" style={{ width: "100%", textAlign: "left" }}>
                          {[
                            ["Property", bookingSuccess?.propertyTitle || selectedBookingProperty.title],
                            ["Schedule", formatDateTimeLabel(bookingSuccess?.date || booking.date, bookingSuccess?.time || booking.time, { joiner: " at " })],
                            ["Reference", bookingSuccess?.appointmentId || "—"]
                          ].map(([key, val]) => (
                            <div key={key} className="bk-review-row">
                              <span>{key}</span>
                              <strong>{val}</strong>
                            </div>
                          ))}
                          <div className="bk-review-row">
                            <span>Status</span>
                            <strong className="bk-status-pending">Pending approval</strong>
                          </div>
                        </div>
                        <div className="bk-next-steps">
                          {[
                            ["Request sent", "Your booking is now with the property team."],
                            ["Agent review", "The agent can confirm, reschedule, or cancel."],
                            ["You're notified", "Status updates appear in your dashboard."]
                          ].map(([title, desc], i) => (
                            <div key={title} className="bk-next-item">
                              <span className="bk-next-num">{i + 1}</span>
                              <div>
                                <strong>{title}</strong>
                                <p>{desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button type="button" className="bk-btn bk-btn--primary bk-btn--full" onClick={resetBookingFlow}>Done</button>
                      </div>
                    )}

                  </div>
                </div>
              </div>,
              document.body
            )}
          </>
        )}

        {tab === "calendar" && (
          <DashboardCalendar
            title="My Event Calendar"
            subtitle="View your appointments, office meetings, and tours."
            events={customerCalendarEvents}
            storageKey="dashboard-calendar-cursor:customer"
          />
        )}

        {tab === "messages" && (
          <MessagingPanel currentUser={user} feedback={feedback} preferredContact={messageContact} />
        )}

        {tab === "appointments" && (
          <section className="agent-panel appointment-status-panel">
            <div className="agent-panel-head">
              <h3>My Appointments</h3>
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
                <option value="confirmed">Confirmed</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div className="table-responsive">
              <table className="table align-middle appointment-status-table">
                <thead><tr><th>Property</th><th>Date</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {filteredMyApps.map((a) => {
                    const appointmentStatus = normalizeWorkflowStatus(a.status, "appointment");
                    const canReview = appointmentStatus === "completed" && !reviewedAppointmentIds.has(String(a.id));
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
                          <td><span className={statusBadgeClass(a.status, "appointment")}>{formatWorkflowStatus(a.status, "appointment")}</span></td>
                          <td className="text-end">
                            {appointmentStatus === "pending" || appointmentStatus === "confirmed" || appointmentStatus === "rescheduled" ? (
                              <button className="btn btn-outline-dark btn-sm" onClick={() => {
                                feedback.askConfirm({
                                  title: "Cancel Appointment",
                                  message: "Cancel this appointment?",
                                  confirmText: "Cancel appointment",
                                  variant: "danger",
                                  onConfirm: async () => {
                                    try {
                                      const res = await apiRequest(`/api/appointments/${a.id}`, {
                                        method: "PATCH",
                                        body: JSON.stringify({ status: "cancelled" })
                                      });
                                      const updatedAppointment = res?.data;
                                      saveAppsLocal(apps.map((appointment) =>
                                        appointment.id !== a.id
                                          ? appointment
                                          : (updatedAppointment || { ...appointment, status: "cancelled", updatedAt: new Date().toISOString() })
                                      ));
                                      feedback.notify("Appointment cancelled.", "success");
                                    } catch (error) {
                                      feedback.notify(error?.message || "Unable to cancel appointment.", "error");
                                    }
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
                                    <button className="btn btn-dark btn-sm" disabled={isSubmittingReview} onClick={() => submitReviewForAppointment(a)}>{isSubmittingReview ? "Submitting..." : "Submit Review"}</button>
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
                        <span className="badge badge-soft status-completed">Reviewed</span>
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
                <h3>My Tours</h3>
                <p>Track your grouped property visits and assigned schedules.</p>
              </div>
            </div>

            <div className="trip-section-title">Upcoming Tours</div>
            <div className="trip-list-stack">
              {upcomingTrips.map((t) => {
                const status = tripStatus(t);
                const statusLabel = formatWorkflowStatus(status, "tour");
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
                          onClick={async () => {
                            try {
                              const nextAttendees = tripAttendees(t).filter((member) => member !== user.username);
                              const res = await apiRequest(`/api/trips/${t.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({ attendees: nextAttendees })
                              });
                              const updatedTrip = res?.data;
                              if (!updatedTrip?.id) throw new Error("Unable to update your tour attendance.");
                              saveTripsLocal(trips.map((x) => (x.id === t.id ? updatedTrip : x)));
                              feedback.notify("You left the tour.", "success");
                            } catch (error) {
                              feedback.notify(error?.message || "Unable to leave the tour.", "error");
                            }
                          }}
                        >
                          Leave Tour
                        </button>
                      ) : (
                        <button
                          className="btn btn-dark btn-sm"
                          onClick={async () => {
                            try {
                              const nextAttendees = Array.from(new Set([...tripAttendees(t), user.username]));
                              const res = await apiRequest(`/api/trips/${t.id}`, {
                                method: "PATCH",
                                body: JSON.stringify({ attendees: nextAttendees })
                              });
                              const updatedTrip = res?.data;
                              if (!updatedTrip?.id) throw new Error("Unable to update your tour attendance.");
                              saveTripsLocal(trips.map((x) => (x.id === t.id ? updatedTrip : x)));
                              feedback.notify("You joined the tour.", "success");
                            } catch (error) {
                              feedback.notify(error?.message || "Unable to join the tour.", "error");
                            }
                          }}
                        >
                          Join Tour
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
          <section className="meet-page">
            <div className="meet-page-inner">
              {/* Page header */}
              <div className="meet-page-header">
                <div className="meet-page-icon"><i className="bi bi-calendar2-check"></i></div>
                <div>
                  <h2 className="meet-page-title">Request a Meeting</h2>
                  <p className="meet-page-subtitle">Share your preferred schedule, meeting mode, and reason.</p>
                </div>
              </div>

              {/* Form card */}
              <div className="meet-form-card">
                {/* Meeting Mode — inline row */}
                <div className="meet-mode-row">
                  <span className="meet-section-label">Mode</span>
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
                </div>

                <hr className="meet-divider" />

                {/* Personal Info + Schedule — 6-column grid */}
                <fieldset className="meet-section">
                  <legend className="meet-section-label">Details</legend>
                  <div className="meet-field-grid meet-grid-3">
                    <div className="meet-field">
                      <label className="form-label">Full Name</label>
                      <input className="form-control" value={meetForm.fullName} onChange={(e) => setMeetForm((s) => ({ ...s, fullName: e.target.value }))} />
                    </div>
                    <div className="meet-field">
                      <label className="form-label">Email</label>
                      <input className="form-control" type="email" value={meetForm.email} onChange={(e) => setMeetForm((s) => ({ ...s, email: e.target.value }))} />
                    </div>
                    <div className="meet-field">
                      <label className="form-label">Phone</label>
                      <input className="form-control" value={meetForm.phone} onChange={(e) => setMeetForm((s) => ({ ...s, phone: e.target.value }))} />
                    </div>
                    <div className="meet-field">
                      <label className="form-label">Date</label>
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
                    <div className="meet-field">
                      <label className="form-label">Time <span className="meet-hint-inline">{meetOperatingHours.label}</span></label>
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
                      {meetTouched.time && meetTimeError && <div className="invalid-feedback d-block">{meetTimeError}</div>}
                    </div>
                  </div>
                </fieldset>

                <hr className="meet-divider" />

                {/* Reason */}
                <fieldset className="meet-section">
                  <legend className="meet-section-label">Reason</legend>
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
                  <textarea className="form-control" rows="2" placeholder="Describe the purpose of your meeting..." value={meetForm.reason} onChange={(e) => setMeetForm((s) => ({ ...s, reason: e.target.value }))}></textarea>
                  <div className="meet-char-count">{meetReasonLength}/600</div>
                </fieldset>

                {/* Submit */}
                <div className="meet-submit-row">
                  <button type="button" className="btn btn-outline-dark" onClick={resetMeetForm}>
                    Clear
                  </button>
                  <button
                    className="btn btn-dark"
                    disabled={!canSubmitMeetRequest || isSubmittingMeet}
                    onClick={submitMeetRequest}
                  >
                    {isSubmittingMeet ? "Submitting..." : "Submit Request"}
                  </button>
                </div>
              </div>
            </div>
          </section>
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
              onSubmit={async (e) => {
                e.preventDefault();
                if (isSavingProfile) return;
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

                try {
                  setIsSavingProfile(true);
                  const res = await apiRequest(`/api/users/${user?.id || user?.username}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      fullName,
                      phone,
                      email
                    })
                  });
                  const updatedUser = res?.data;
                  if (!updatedUser?.id) {
                    throw new Error("Profile update failed.");
                  }
                  const users = safeArray("allUsers");
                  saveArray("allUsers", users.map((entry) => (
                    String(entry?.id || entry?.username) === String(updatedUser.id || updatedUser.username)
                      ? updatedUser
                      : entry
                  )));

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
                } catch (error) {
                  feedback.notify(error?.message || "Unable to update your profile.", "error");
                } finally {
                  setIsSavingProfile(false);
                }
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
                  <button className="btn btn-dark" disabled={isSavingProfile}>{isSavingProfile ? "Saving..." : "Save Profile"}</button>
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
        toastPlacement="dashboard-top"
      />
    </DashboardLayout>
  );
}
