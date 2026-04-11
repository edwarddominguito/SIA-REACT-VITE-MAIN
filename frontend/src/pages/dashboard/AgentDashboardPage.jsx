import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getCurrentUser, safeArray, saveArray, setCurrentUser as persistCurrentUser, subscribeKeys } from "@/services/storageService.js";
import { apiRequest } from "@/api/client.js";
import DashboardLayout from "@/layout/DashboardLayout.jsx";
import DashboardCalendar from "@/components/DashboardCalendar.jsx";
import MessagingPanel from "@/components/MessagingPanel.jsx";
import UIFeedback from "@/ui/UIFeedback.jsx";
import { AGENT_NAV_ITEMS } from "@/data/constants.js";
import {
  appointmentStatusPriority,
  getAgentAvailabilityStatus,
  isActiveAppointmentStatus,
  isActiveMeetStatus
} from "@/utils/workflow.js";
import {
  applyPropertyImageFallback,
  autoPropertyImage,
  formatWorkflowStatus,
  formatDateTimeLabel,
  isDisplayableProperty,
  isActiveStatus,
  normalizePropertyStatus,
  normalizeWorkflowStatus,
  normalizeAppointmentImages,
  propertyAssetImageNames,
  propertyPriceLabel,
  resolveAppointmentImage,
  resolvePropertyImageSource,
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
  isValidEmail,
  isValidPhone,
  isWithinOperatingHours,
  normalizeDateTimeInput,
  toNonNegativeNumber
} from "@/utils/input.js";

const PROPERTY_IMAGE_SLOT_COUNT = 5;
const PROPERTY_IMAGE_EXTENSION_RE = /\.(png|jpe?g|webp|gif|avif|svg)(?:[?#].*)?$/i;
const MEETS_PER_PAGE = 7;

const emptyPropertyImageFields = () => Array.from({ length: PROPERTY_IMAGE_SLOT_COUNT }, () => "");

const cleanPropertyImageInput = (value) => {
  const candidate = String(value || "").trim().replace(/\\/g, "/");
  if (!candidate) return "";
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(candidate)) return candidate;
  if (candidate.startsWith("/")) return PROPERTY_IMAGE_EXTENSION_RE.test(candidate) ? candidate : "";
  return PROPERTY_IMAGE_EXTENSION_RE.test(candidate) ? candidate : "";
};

const propertyImageFieldsFrom = (property) => {
  const next = [];
  const seen = new Set();
  const push = (value) => {
    const candidate = cleanPropertyImageInput(value);
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    next.push(candidate);
  };

  push(property?.imageUrl);
  if (Array.isArray(property?.imageUrls)) {
    property.imageUrls.forEach(push);
  }

  return Array.from({ length: PROPERTY_IMAGE_SLOT_COUNT }, (_, index) => next[index] || "");
};

const propertyImagePayloadFrom = (imageUrls) => {
  const next = [];
  const seen = new Set();
  (Array.isArray(imageUrls) ? imageUrls : []).forEach((value) => {
    const candidate = cleanPropertyImageInput(value);
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    next.push(candidate);
  });
  return next.slice(0, PROPERTY_IMAGE_SLOT_COUNT);
};

const createEmptyPropertyForm = () => ({
  title: "",
  location: "",
  price: "",
  listingType: "sale",
  propertyType: "property",
  propertyStatus: "available",
  bedrooms: "",
  bathrooms: "",
  areaSqft: "",
  description: "",
  imageUrls: emptyPropertyImageFields()
});

const propertySaveErrorMessage = (error, fallback) => {
  const message = String(error?.message || "").trim();
  if (/payload too large/i.test(message)) {
    return "The backend is still using the old upload limit. Restart the backend, then try uploading the photo again.";
  }
  return message || fallback;
};

const propertyEditorFrom = (property) => ({
  id: property.id,
  title: property.title || "",
  location: property.location || "",
  price: String(property.price || ""),
  listingType: property.listingType || "sale",
  propertyType: property.propertyType || "property",
  propertyStatus: property.propertyStatus || property.status || "available",
  bedrooms: String(property.bedrooms || ""),
  bathrooms: String(property.bathrooms || ""),
  areaSqft: String(property.areaSqft || ""),
  description: property.description || "",
  imageUrls: propertyImageFieldsFrom(property)
});

const buildTripTitle = (selectedProperties) => {
  const picks = Array.isArray(selectedProperties) ? selectedProperties.filter(Boolean) : [];
  if (!picks.length) return "Property Tour";
  if (picks.length === 1) return `${picks[0].title || "Property"} Tour`;
  return `${picks.length} Property Tour`;
};

const buildTripLocation = (selectedProperties) => {
  const locations = Array.from(
    new Set(
      (Array.isArray(selectedProperties) ? selectedProperties : [])
        .map((property) => String(property?.location || "").trim())
        .filter(Boolean)
    )
  );
  if (!locations.length) return "Davao City";
  if (locations.length === 1) return locations[0];
  return "Multiple Properties";
};

export default function AgentDashboard() {
  const user = getCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();

  const [section, setSection] = useState("dashboard");
  const [messageContact, setMessageContact] = useState("");
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
  const [meetQuery, setMeetQuery] = useState("");
  const [meetPage, setMeetPage] = useState(1);
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
  const [isSavingProperty, setIsSavingProperty] = useState(false);
  const [isSavingTrip, setIsSavingTrip] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const rescheduleOperatingHours = useMemo(
    () => getOperatingHoursForDate(rescheduleForm.date),
    [rescheduleForm.date]
  );

  const [editProp, setEditProp] = useState(null);
  const [pForm, setPForm] = useState(createEmptyPropertyForm);
  const [tForm, setTForm] = useState({ customer: "", date: "", time: "", propertyIds: [], notes: "" });
  const tripOperatingHours = useMemo(
    () => getOperatingHoursForDate(tForm.date),
    [tForm.date]
  );
  const feedback = useUiFeedback();

  const refreshAll = () => {
    const allProperties = safeArray("allProperties").filter(isDisplayableProperty);
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

  useEffect(() => {
    const requestedSection = location.state?.section;
    const requestedMessageContact = cleanUsername(location.state?.messageContact);
    if (!requestedSection && !requestedMessageContact) return;

    if (requestedMessageContact) {
      setMessageContact(requestedMessageContact);
      setSection("messages");
    } else {
      setMessageContact("");
      setSection(requestedSection);
    }

    navigate("/agent", { replace: true, state: null });
  }, [location.state, navigate]);

  useEffect(() => {
    if (!showAddTrip || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setShowAddTrip(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showAddTrip]);

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

  const removePropertyImageAt = (index, setter) => {
    setter((current) => {
      const nextImages = Array.isArray(current?.imageUrls) ? current.imageUrls.slice(0, PROPERTY_IMAGE_SLOT_COUNT) : [];
      nextImages.splice(index, 1, "");
      return {
        ...current,
        imageUrls: Array.from({ length: PROPERTY_IMAGE_SLOT_COUNT }, (_, imageIndex) => nextImages[imageIndex] || "")
      };
    });
  };

  const updatePropertyImageAt = (index, value, setter) => {
    setter((current) => ({
      ...current,
      imageUrls: Array.from({ length: PROPERTY_IMAGE_SLOT_COUNT }, (_, imageIndex) => (
        imageIndex === index
          ? value
          : Array.isArray(current?.imageUrls)
            ? current.imageUrls[imageIndex] || ""
            : ""
      ))
    }));
  };

  const fillWithDetectedAssetImages = (setter) => {
    setter((current) => ({
      ...current,
      imageUrls: Array.from(
        { length: PROPERTY_IMAGE_SLOT_COUNT },
        (_, imageIndex) => propertyAssetImageNames[imageIndex] || (Array.isArray(current?.imageUrls) ? current.imageUrls[imageIndex] || "" : "")
      )
    }));
  };

  const notifyCustomerForAppointment = (appointment, status, context = {}) => {
    if (!appointment?.customer) return;
    const propertyLabel = appointment.propertyTitle || "your appointment";
    const nextDate = context.date || appointment.date || "-";
    const nextTime = context.time || appointment.time || "-";
    const previousDate = context.previousDate || "";
    const previousTime = context.previousTime || "";

    let message = "";
    if (status === "confirmed") {
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

  const updateAppStatus = async (id, status, options = {}) => {
    try {
      const res = await apiRequest(`/api/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, ...(options.patch || {}) })
      });
      const updated = res?.data;
      if (!updated?.id) throw new Error("Appointment update failed.");
      saveApps(apps.map((appointment) => (appointment.id === id ? updated : appointment)));
      if (options.notifyCustomer !== false) {
        notifyCustomerForAppointment(updated, status, {
          date: updated.date,
          time: updated.time,
          previousDate: options.previousDate,
          previousTime: options.previousTime
        });
      }
    } catch (error) {
      feedback.notify(error?.message || "Unable to update appointment.", "error");
    }
  };

  const notifyCustomerForMeet = (meet, status) => {
    const to = String(meet?.customer || meet?.requestedBy || "").trim();
    if (!to) return;

    const modeLabel = meet?.mode === "virtual" ? "virtual" : "in-office";
    const date = meet?.date || "-";
    const time = meet?.time || "-";
    const statusLabel = formatWorkflowStatus(status, "office_meeting").toLowerCase();

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

  const updateMeetStatus = async (meetId, status) => {
    try {
      const res = await apiRequest(`/api/office-meets/${meetId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      const updated = res?.data;
      if (!updated?.id) throw new Error("Office meet update failed.");
      saveMeets(meets.map((meet) => (meet.id === meetId ? updated : meet)));
      notifyCustomerForMeet(updated, status);
    } catch (error) {
      feedback.notify(error?.message || "Unable to update office meet.", "error");
    }
  };

  const myUserProfile = useMemo(
    () => users.find((u) => u.username === user?.username),
    [users, user]
  );
  const myAvailabilityStatus = useMemo(
    () => getAgentAvailabilityStatus(myUserProfile),
    [myUserProfile]
  );
  const updateMyAvailabilityStatus = async (nextStatusValue) => {
    const nextStatus = String(nextStatusValue || "").trim().toLowerCase();
    if (!["available", "busy", "offline"].includes(nextStatus)) return;
    try {
      const res = await apiRequest(`/api/users/${user?.id || user?.username}`, {
        method: "PATCH",
        body: JSON.stringify({ availabilityStatus: nextStatus })
      });
      const updatedUser = res?.data;
      if (!updatedUser?.id) throw new Error("Unable to update your availability.");
      saveUsers(users.map((entry) => (
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
      feedback.notify(`Status updated to ${nextStatus}.`, "success");
    } catch (error) {
      feedback.notify(error?.message || "Unable to update your availability.", "error");
    }
  };

  const mineProps = useMemo(
    () => properties.filter((p) => p.agent === user?.username && isDisplayableProperty(p)),
    [properties, user]
  );
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
  const hasAgentScheduleConflict = (date, time) => {
    const agentUsername = String(user?.username || "").trim();
    if (!agentUsername || !date || !time) return false;

    const appointmentConflict = apps.some((appointment) => {
      if (String(appointment?.assignedAgent || appointment?.agent || "").trim() !== agentUsername) return false;
      if (!isActiveAppointmentStatus(appointment?.status)) return false;
      return String(appointment?.date || "").trim() === date && String(appointment?.time || "").trim() === time;
    });
    if (appointmentConflict) return true;

    const meetConflict = meets.some((meet) => {
      if (String(meet?.assignedAgent || meet?.agent || "").trim() !== agentUsername) return false;
      if (!isActiveMeetStatus(meet?.status)) return false;
      return String(meet?.date || "").trim() === date && String(meet?.time || "").trim() === time;
    });
    if (meetConflict) return true;

    return trips.some((trip) => {
      if (String(trip?.agent || "").trim() !== agentUsername) return false;
      const status = tripStatus(trip);
      if (!isActiveStatus(status, "tour")) return false;
      return String(trip?.date || "").trim() === date && String(trip?.time || "").trim() === time;
    });
  };
  const hasCustomerScheduleConflict = (customerUsername, date, time) => {
    const customer = String(customerUsername || "").trim();
    if (!customer || !date || !time) return false;

    const appointmentConflict = apps.some((appointment) => {
      if (String(appointment?.customer || "").trim() !== customer) return false;
      if (!isActiveAppointmentStatus(appointment?.status)) return false;
      return String(appointment?.date || "").trim() === date && String(appointment?.time || "").trim() === time;
    });
    if (appointmentConflict) return true;

    const meetConflict = meets.some((meet) => {
      const requestedBy = String(meet?.customer || meet?.requestedBy || "").trim();
      if (requestedBy !== customer) return false;
      if (!isActiveMeetStatus(meet?.status)) return false;
      return String(meet?.date || "").trim() === date && String(meet?.time || "").trim() === time;
    });
    if (meetConflict) return true;

    return trips.some((trip) => {
      const status = tripStatus(trip);
      if (!isActiveStatus(status, "tour")) return false;
      const primaryCustomer = String(trip?.customer || "").trim();
      const attendees = tripAttendees(trip);
      if (primaryCustomer !== customer && !attendees.includes(customer)) return false;
      return String(trip?.date || "").trim() === date && String(trip?.time || "").trim() === time;
    });
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
  const canScheduleTrip = customers.length > 0 && mineProps.length > 0;
  const upcomingAgentTrips = useMemo(
    () => mineTrips.filter((t) => {
      const st = tripStatus(t);
      return isActiveStatus(st, "tour");
    }),
    [mineTrips]
  );
  const pastAgentTrips = useMemo(
    () => mineTrips.filter((t) => {
      const st = tripStatus(t);
      return !isActiveStatus(st, "tour");
    }),
    [mineTrips]
  );
  const customerMeets = useMemo(
    () => meets.filter((m) => m.requestedRole === "customer" || m.customer || m.requestedBy),
    [meets]
  );
  const mineMeets = useMemo(
    () => customerMeets.filter((m) => String(m.assignedAgent || m.agent || "").trim() === user?.username),
    [customerMeets, user]
  );
  const sortedMeets = useMemo(() => {
    const statusRank = {
      pending: 0,
      confirmed: 1,
      rescheduled: 1,
      completed: 2,
      declined: 2,
      cancelled: 2,
      no_show: 2,
      expired: 2
    };
    return mineMeets
      .slice()
      .sort((a, b) => {
        const aStatus = normalizeWorkflowStatus(a.status, "office_meeting");
        const bStatus = normalizeWorkflowStatus(b.status, "office_meeting");
        const aRank = Object.prototype.hasOwnProperty.call(statusRank, aStatus) ? statusRank[aStatus] : 3;
        const bRank = Object.prototype.hasOwnProperty.call(statusRank, bStatus) ? statusRank[bStatus] : 3;
        if (aRank !== bRank) return aRank - bRank;

        const aSchedule = `${a.date || ""} ${a.time || ""}`;
        const bSchedule = `${b.date || ""} ${b.time || ""}`;
        return bSchedule.localeCompare(aSchedule);
      });
  }, [mineMeets]);
  const filteredMeets = useMemo(() => {
    const q = meetQuery.trim().toLowerCase();
    if (!q) return sortedMeets;
    return sortedMeets.filter((m) => (
      (m.fullName || m.customer || m.requestedBy || "").toLowerCase().includes(q) ||
      (m.email || "").toLowerCase().includes(q) ||
      (m.reason || "").toLowerCase().includes(q) ||
      (m.mode || "").toLowerCase().includes(q)
    ));
  }, [sortedMeets, meetQuery]);
  const meetTotalPages = Math.max(1, Math.ceil(filteredMeets.length / MEETS_PER_PAGE));
  const pagedMeets = useMemo(
    () => filteredMeets.slice((meetPage - 1) * MEETS_PER_PAGE, meetPage * MEETS_PER_PAGE),
    [filteredMeets, meetPage]
  );
  const agentCalendarEvents = useMemo(() => {
    const appointmentEvents = mineApps.map((a) => ({
      id: `app-${a.id}`,
      title: a.propertyTitle || "Appointment",
      subtitle: formatCustomerIdentity(a.customer),
      date: a.date,
      time: a.time,
      type: "appointment",
      status: a.status || "pending"
    }));
    const meetEvents = mineMeets.map((m) => ({
      id: `meet-${m.id}`,
      title: m.mode === "virtual" ? "Virtual Office Meeting" : "Office Meeting",
      subtitle: formatCustomerIdentity(m.customer || m.requestedBy),
      description: m.reason || "",
      date: m.date,
      time: m.time,
      type: "meet",
      status: m.status || "pending"
    }));
    const tripEvents = mineTrips.map((t) => ({
      id: `trip-${t.id}`,
      title: t.title || "Property Tour",
      subtitle: t.location || `${tripAttendees(t).length} attendees`,
      description: t.notes || "",
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
      [p.title, p.location, p.description, p.propertyType, p.listingType, p.propertyStatus].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [mineProps, query]);

  const filteredApps = useMemo(() => {
    const byStatus = appFilter === "all"
      ? mineApps
      : mineApps.filter((a) => normalizeWorkflowStatus(a.status, "appointment") === appFilter);
    const q = appQuery.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((a) =>
      [a.propertyTitle, a.location, a.customer, a.date, a.time, formatWorkflowStatus(a.status, "appointment")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [mineApps, appFilter, appQuery]);
  const sortedApps = useMemo(() => {
    const statusRank = {
      pending: 0,
      confirmed: 1,
      rescheduled: 1,
      completed: 2,
      cancelled: 2,
      no_show: 2,
      expired: 2
    };
    return filteredApps
      .slice()
      .sort((a, b) => {
        const aStatus = normalizeWorkflowStatus(a.status, "appointment");
        const bStatus = normalizeWorkflowStatus(b.status, "appointment");
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
  const updateReview = async (reviewId, patch) => {
    try {
      const res = await apiRequest(`/api/reviews/${reviewId}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      const updatedReview = res?.data;
      if (!updatedReview?.id) throw new Error("Review update failed.");
      saveReviews(reviews.map((review) => (
        String(review.id) === String(reviewId) ? updatedReview : review
      )));
      feedback.notify("Review updated.", "success");
    } catch (error) {
      feedback.notify(error?.message || "Unable to update review.", "error");
    }
  };
  const getPropertyImage = (appointment) => {
    return resolveAppointmentImage(appointment, properties);
  };
  const handlePropertyImageError = (event, propertyLike) => {
    applyPropertyImageFallback(event.currentTarget, propertyLike || { title: "Property" });
  };

  if (!user) return null;

  const currentSectionLabel = section === "dashboard"
    ? "Overview"
    : section === "properties"
    ? "My Listings"
    : section === "appointments"
    ? "Client Appointments"
    : section === "meets"
    ? "Office Meetings"
    : section === "trips"
    ? "Trip Scheduler"
    : section === "calendar"
    ? "My Calendar"
    : section === "messages"
    ? "Inbox"
    : section === "reviews"
    ? "Client Feedback"
    : section === "profile"
    ? "My Account"
    : AGENT_NAV_ITEMS.find((item) => item.id === section)?.label || "Overview";
  const handleSectionChange = (nextSection) => {
    setSection(nextSection);
    if (nextSection !== "messages") {
      setMessageContact("");
    }
  };
  const propertyLinkState = {
    from: {
      pathname: location.pathname,
      state: { section }
    }
  };
  const tripModal = showAddTrip && typeof document !== "undefined"
    ? createPortal(
        <section className="trip-modal-wrap" onClick={() => setShowAddTrip(false)}>
          <article className="trip-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="trip-modal-head">
              <div>
                <h3>Schedule Property Tour</h3>
                <p>Create a new property tour for a customer.</p>
              </div>
              <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => setShowAddTrip(false)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (isSavingTrip) return;
                const customer = cleanText(tForm.customer, 40);
                const customerRecord = customers.find((entry) => String(entry?.username || "").trim() === customer);
                const { date, time } = normalizeDateTimeInput(tForm.date, tForm.time);
                const propertyIds = Array.from(new Set((tForm.propertyIds || []).map((id) => String(id))));
                const notes = cleanText(tForm.notes, 400);

                if (!customer || !date || !time || !propertyIds.length) {
                  feedback.notify("Customer, date, time, and at least one property are required.", "error");
                  return;
                }
                if (!isFutureOrNowSlot(date, time)) {
                  feedback.notify("Tour schedule must be now or in the future.", "error");
                  return;
                }
                if (!isWithinOperatingHours(date, time)) {
                  if (tripOperatingHours.isClosed) {
                    feedback.notify("Trips are not available on Sunday.", "error");
                  } else {
                    feedback.notify(`Tour time must be within ${tripOperatingHours.label}.`, "error");
                  }
                  return;
                }

                const selectedProperties = propertyIds
                  .map((pid) => mineProps.find((p) => String(p.id) === String(pid)))
                  .filter(Boolean);
                if (!customerRecord) {
                  feedback.notify("Select a valid customer before scheduling the trip.", "error");
                  return;
                }
                if (!selectedProperties.length || selectedProperties.length !== propertyIds.length) {
                  feedback.notify("Select at least one valid property from your listings.", "error");
                  return;
                }
                if (hasAgentScheduleConflict(date, time)) {
                  feedback.notify("You already have an appointment, office meet, or trip at that schedule.", "error");
                  return;
                }
                if (hasCustomerScheduleConflict(customer, date, time)) {
                  feedback.notify("That customer already has another appointment, meet, or trip at that schedule.", "error");
                  return;
                }

                try {
                  setIsSavingTrip(true);
                  const res = await apiRequest("/api/trips", {
                    method: "POST",
                    body: JSON.stringify({
                      customer,
                      title: buildTripTitle(selectedProperties),
                      location: buildTripLocation(selectedProperties),
                      date,
                      time,
                      propertyIds: selectedProperties.map((property) => String(property.id)),
                      notes
                    })
                  });
                  const nextTrip = res?.data;
                  if (!nextTrip?.id) {
                    throw new Error("Tour was not saved by the server.");
                  }
                  saveTrips([nextTrip, ...trips.filter((trip) => String(trip?.id || "") !== String(nextTrip.id))]);
                  pushNotification({
                    to: customer,
                    type: "trip",
                    title: "Property Tour Scheduled",
                    message: `Agent @${user?.username} scheduled your property tour on ${formatDateTimeLabel(date, time)}.`,
                    meta: {
                      tripId: nextTrip.id,
                      agent: user?.username || "",
                      date,
                      time,
                      propertyIds: nextTrip.propertyIds
                    }
                  });

                  setTForm({ customer: "", date: "", time: "", propertyIds: [], notes: "" });
                  setShowAddTrip(false);
                  feedback.notify("Tour scheduled.", "success");
                } catch (error) {
                  feedback.notify(error?.message || "Unable to schedule tour.", "error");
                } finally {
                  setIsSavingTrip(false);
                }
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
                  {!customers.length && <div className="small muted mt-1">No customer accounts are available yet.</div>}
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
                <button type="button" className="btn btn-outline-dark" onClick={() => setShowAddTrip(false)} disabled={isSavingTrip}>Cancel</button>
                <button className="btn btn-dark" disabled={isSavingTrip || !canScheduleTrip}>{isSavingTrip ? "Scheduling..." : "Schedule Tour"}</button>
              </div>
            </form>
          </article>
        </section>,
        document.body
      )
    : null;

  return (
    <DashboardLayout
      suiteLabel="Agent Suite"
      profileName={user.fullName || user.username}
      profileRole="Agent"
      role="agent"
      navItems={AGENT_NAV_ITEMS}
      activeTab={section}
      onTabChange={handleSectionChange}
    >
        {propertyAssetImageNames.length ? (
          <datalist id="property-asset-image-list">
            {propertyAssetImageNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        ) : null}
        <section className="agent-hero">
          <div>
            <h1>{currentSectionLabel}</h1>
          </div>
        </section>
        {section === "dashboard" && (
          <>
            <section className="dash-stats">
              <div className="dash-stat">
                <div className="dash-stat-icon blue"><i className="bi bi-house-door"></i></div>
                <div className="dash-stat-body">
                  <span className="dash-stat-value">{mineProps.length}</span>
                  <span className="dash-stat-label">Listings</span>
                </div>
                <span className="dash-stat-sub">{mineProps.filter(p => normalizePropertyStatus(p.propertyStatus || p.status) === "available").length} available</span>
              </div>
              <div className="dash-stat">
                <div className="dash-stat-icon amber"><i className="bi bi-calendar2-week"></i></div>
                <div className="dash-stat-body">
                  <span className="dash-stat-value">{mineApps.length}</span>
                  <span className="dash-stat-label">Appointments</span>
                </div>
                <span className="dash-stat-sub">{mineApps.filter(a => normalizeWorkflowStatus(a.status, "appointment") === "pending").length} pending</span>
              </div>
              <div className="dash-stat">
                <div className="dash-stat-icon green"><i className="bi bi-car-front"></i></div>
                <div className="dash-stat-body">
                  <span className="dash-stat-value">{mineTrips.length}</span>
                  <span className="dash-stat-label">Trips</span>
                </div>
                <span className="dash-stat-sub">{upcomingAgentTrips.length} upcoming</span>
              </div>
              <div className="dash-stat">
                <div className="dash-stat-icon violet"><i className="bi bi-star"></i></div>
                <div className="dash-stat-body">
                  <span className="dash-stat-value">{mineReviews.length}</span>
                  <span className="dash-stat-label">Reviews</span>
                </div>
                <span className="dash-stat-sub">{mineReviews.filter(r => !r.addressedAt).length} need action</span>
              </div>
            </section>

            <section className="dash-bottom-grid">
              <article className="dash-card">
                <div className="dash-card-head">
                  <h3>My Listings</h3>
                  <button className="btn btn-dark btn-sm" onClick={() => setSection("properties")}>View All</button>
                </div>
                <div className="dash-activity-list">
                  {mineProps.slice(0, 4).map((p) => (
                    <div key={p.id} className="dash-activity-row">
                      <i className="bi bi-house-door dash-activity-icon"></i>
                      <div className="dash-activity-body">
                        <strong>{p.title}</strong>
                        <span className="dash-activity-meta">{p.location} · {propertyPriceLabel(p)}</span>
                      </div>
                      <span className={`badge badge-soft status-${normalizePropertyStatus(p.propertyStatus || p.status)}`}>{propertyStatusLabel(p)}</span>
                    </div>
                  ))}
                  {!mineProps.length && <div className="agent-empty compact"><i className="bi bi-house-door"></i><p>No listings yet.</p></div>}
                </div>
              </article>

              <article className="dash-card">
                <div className="dash-card-head">
                  <h3>Upcoming Appointments</h3>
                  <span className="badge badge-soft">{mineApps.length}</span>
                </div>
                <div className="dash-activity-list">
                  {sortedMineApps.slice(0, 5).map((a) => (
                    <div className="dash-activity-row" key={a.id}>
                      <i className="bi bi-calendar2-check dash-activity-icon"></i>
                      <div className="dash-activity-body">
                        <strong>{a.propertyTitle}</strong>
                        <span className="dash-activity-meta">{formatDateTimeLabel(a.date, a.time, { joiner: " at " })}</span>
                      </div>
                      <span className={statusBadgeClass(a.status)}>{a.status || "pending"}</span>
                    </div>
                  ))}
                  {!sortedMineApps.length && <div className="agent-empty compact"><i className="bi bi-calendar2"></i><p>No upcoming appointments.</p></div>}
                </div>
              </article>
            </section>
          </>
        )}

        {section === "calendar" && (
          <DashboardCalendar
            title="My Calendar"
            subtitle="Track your assigned appointments, office meets, and trips."
            events={agentCalendarEvents}
            storageKey="dashboard-calendar-cursor:agent"
          />
        )}

        {section === "messages" && (
          <MessagingPanel currentUser={user} feedback={feedback} preferredContact={messageContact} />
        )}

        {section === "properties" && (
          <>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',margin:'0 0 6px'}}>
              <h1 style={{fontSize:'1.4rem',fontWeight:700,margin:0}}>My Properties</h1>
              <button className="btn btn-dark btn-sm" onClick={() => navigate('/agent/add-property')}>
                <i className="bi bi-plus-lg me-1"></i>Add Property
              </button>
            </div>

            {editProp && (
              <section className="agent-panel">
                <div className="agent-panel-head">
                  <h3>Edit Property</h3>
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setEditProp(null)}>Close</button>
                </div>
                <div className="row g-2">
                  <div className="col-md-6"><input className="form-control" value={editProp.title} onChange={(e) => setEditProp((s) => ({ ...s, title: e.target.value }))} /></div>
                  <div className="col-md-6"><input className="form-control" value={editProp.location} onChange={(e) => setEditProp((s) => ({ ...s, location: e.target.value }))} /></div>
                  <div className="col-md-6"><input className="form-control" type="number" value={editProp.price} onChange={(e) => setEditProp((s) => ({ ...s, price: e.target.value }))} /></div>
                  <div className="col-md-6">
                    <select className="form-select" value={editProp.propertyStatus || "available"} onChange={(e) => setEditProp((s) => ({ ...s, propertyStatus: e.target.value }))}>
                      <option value="available">Available</option>
                      <option value="reserved">Reserved</option>
                      <option value="inactive">Inactive</option>
                      <option value="sold">Sold</option>
                      <option value="rented">Rented</option>
                    </select>
                  </div>
                  <div className="col-md-4"><input className="form-control" type="number" value={editProp.bedrooms} onChange={(e) => setEditProp((s) => ({ ...s, bedrooms: e.target.value }))} /></div>
                  <div className="col-md-4"><input className="form-control" type="number" value={editProp.bathrooms} onChange={(e) => setEditProp((s) => ({ ...s, bathrooms: e.target.value }))} /></div>
                  <div className="col-md-4"><input className="form-control" type="number" value={editProp.areaSqft} onChange={(e) => setEditProp((s) => ({ ...s, areaSqft: e.target.value }))} /></div>
                  <div className="col-12"><textarea className="form-control" rows="3" value={editProp.description} onChange={(e) => setEditProp((s) => ({ ...s, description: e.target.value }))}></textarea></div>
                  <div className="col-12">
                    <div className="small text-muted">
                      Enter one image at a time. Files from <code>frontend/src/assets/images/</code> and <code>frontend/public/property-images/</code> are both supported.
                      Image 1 stays the cover image for cards and listings.
                    </div>
                  </div>
                  {propertyAssetImageNames.length ? (
                    <div className="col-12">
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <div className="small text-muted">
                          Detected asset images: {propertyAssetImageNames.join(", ")}
                        </div>
                        <button
                          type="button"
                          className="btn btn-outline-dark btn-sm"
                          onClick={() => fillWithDetectedAssetImages(setEditProp)}
                        >
                          Use Detected Images
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {editProp.imageUrls.map((imageUrl, index) => {
                    const previewSrc = resolvePropertyImageSource(imageUrl);
                    return (
                      <div key={`edit-property-image-${index}`} className="col-md-6">
                        <label className="form-label small text-muted mb-1">
                          Image {index + 1}{index === 0 ? " (cover)" : ""}
                        </label>
                        <div className="d-flex gap-2">
                          <input
                            className="form-control"
                            placeholder={index === 0 ? "597272628_...jpg" : `image-${index + 1}.jpg`}
                            list="property-asset-image-list"
                            value={imageUrl}
                            onChange={(e) => updatePropertyImageAt(index, e.target.value, setEditProp)}
                            onBlur={(e) => updatePropertyImageAt(index, cleanPropertyImageInput(e.target.value), setEditProp)}
                          />
                          {imageUrl ? (
                            <button
                              type="button"
                              className="btn btn-outline-dark"
                              onClick={() => removePropertyImageAt(index, setEditProp)}
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                        {previewSrc ? (
                          <div className="card mt-2 overflow-hidden">
                            <img
                              src={previewSrc}
                              alt={`Property preview ${index + 1}`}
                              className="w-100"
                              style={{ aspectRatio: "4 / 3", objectFit: "contain", background: "#f4f4f5" }}
                              onError={(e) => handlePropertyImageError(e, { title: editProp.title || "Property", location: editProp.location || "" })}
                            />
                            <div className="card-body py-2">
                              <div className="small text-muted text-truncate">{previewSrc}</div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <button
                  className="btn btn-dark mt-3"
                  disabled={isSavingProperty}
                  onClick={async () => {
                    if (isSavingProperty) return;
                    const title = cleanText(editProp.title, 90);
                    const location = cleanText(editProp.location, 120);
                    const description = cleanText(editProp.description, 500);
                    const price = toNonNegativeNumber(editProp.price, -1);
                    const listingType = String(editProp.listingType || "sale").toLowerCase();
                    const propertyType = cleanText(editProp.propertyType || "property", 40).toLowerCase();
                    const propertyStatus = String(editProp.propertyStatus || "available").toLowerCase();
                    const imageSlots = propertyImagePayloadFrom(editProp.imageUrls);
                    const coverImage = imageSlots[0] || "";
                    const galleryImages = imageSlots.slice(1, PROPERTY_IMAGE_SLOT_COUNT);
                    if (!title || !location || price <= 0) {
                      feedback.notify("Title, location, and price are required.", "error");
                      return;
                    }
                    try {
                      setIsSavingProperty(true);
                      const res = await apiRequest(`/api/properties/${editProp.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          title,
                          location,
                          description,
                          price,
                          listingType,
                          propertyType,
                          propertyStatus,
                          bedrooms: toNonNegativeNumber(editProp.bedrooms, 0),
                          bathrooms: toNonNegativeNumber(editProp.bathrooms, 0),
                          areaSqft: toNonNegativeNumber(editProp.areaSqft, 0),
                          imageUrl: coverImage,
                          imageUrls: galleryImages
                        })
                      });
                      const updatedProperty = res?.data;
                      if (!updatedProperty?.id) throw new Error("Property update failed.");
                      const next = properties.map((p) =>
                        p.id !== editProp.id
                          ? p
                          : {
                              ...updatedProperty,
                              imageUrl: updatedProperty.imageUrl || coverImage || p.imageUrl || autoPropertyImage(updatedProperty),
                              imageUrls: Array.isArray(updatedProperty.imageUrls) ? updatedProperty.imageUrls : galleryImages
                            }
                      );
                      saveProps(next);
                      setEditProp(null);
                    } catch (error) {
                      feedback.notify(propertySaveErrorMessage(error, "Unable to save property changes."), "error");
                    } finally {
                      setIsSavingProperty(false);
                    }
                  }}
                >
                  {isSavingProperty ? "Saving..." : "Save Changes"}
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
                const normalizedStatus = normalizePropertyStatus(p.propertyStatus || p.status);
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
                      <span className={`badge badge-soft status-${normalizedStatus}`}>
                        {propertyStatusLabel(p)}
                      </span>
                    </div>
                    <p><i className="bi bi-geo-alt"></i> {p.location}</p>
                    <strong>{propertyPriceLabel(p)}</strong>
                    <div className="agent-property-meta">
                      <span><i className="bi bi-door-open"></i> {Number(p.bedrooms || 0)} bed</span>
                      <span><i className="bi bi-droplet"></i> {Number(p.bathrooms || 0)} bath</span>
                      <span><i className="bi bi-aspect-ratio"></i> {Number(p.areaSqft || 0)} sqft</span>
                    </div>
                    <div className="agent-property-actions">
                      <Link className="btn btn-outline-dark btn-sm" to={`/properties/${p.id}`} state={propertyLinkState}>Details</Link>
                      <button className="btn btn-outline-dark btn-sm" onClick={() => setEditProp(propertyEditorFrom(p))}>Edit</button>
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => {
                          feedback.askConfirm({
                            title: "Delete Property",
                            message: "Delete this property and cancel active linked appointments?",
                            confirmText: "Delete",
                            variant: "danger",
                            onConfirm: async () => {
                              try {
                                await apiRequest(`/api/properties/${p.id}`, { method: "DELETE" });
                                saveProps(properties.filter((entry) => String(entry?.id) !== String(p.id)));
                                saveApps(apps.map((appointment) => (
                                  String(appointment?.propertyId) === String(p.id) && isActiveStatus(appointment?.status, "appointment")
                                    ? { ...appointment, status: "cancelled", cancelReason: "Property deleted" }
                                    : appointment
                                )));
                                feedback.notify("Property deleted.", "success");
                              } catch (error) {
                                feedback.notify(error?.message || "Unable to delete property.", "error");
                              }
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
            <h1 style={{fontSize:'1.2rem',fontWeight:700,margin:'0 0 4px'}}>Appointment Management</h1>

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
                  <table className="table align-middle appointment-status-table">
                    <thead>
                      <tr><th>Property</th><th>Customer</th><th>Date/Time</th><th>Status</th><th></th></tr>
                    </thead>
                    <tbody>
                      {sortedApps.map((a) => {
                          const st = normalizeWorkflowStatus(a.status, "appointment");
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
                                      <div style={{fontWeight:600,fontSize:'.82rem',lineHeight:1.3}}>{a.propertyTitle}</div>
                                      <div style={{fontSize:'.75rem',color:'var(--muted)'}}>{a.location}</div>
                                    </div>
                                  </div>
                                </td>
                                <td>{formatCustomerIdentity(a.customer)}</td>
                                <td>{formatDateTimeLabel(a.date, a.time)}</td>
                                <td><span className={statusBadgeClass(st, "appointment")}>{formatWorkflowStatus(st, "appointment")}</span></td>
                                <td className="text-end">
                                  {(st === "pending" || st === "confirmed" || st === "rescheduled") && (
                                    <div className="d-flex justify-content-end gap-2 flex-wrap">
                                      {st !== "confirmed" && (
                                        <button
                                          className="btn btn-outline-success btn-sm"
                                          onClick={() => {
                                            updateAppStatus(a.id, "confirmed");
                                            feedback.notify("Appointment confirmed and customer notified.", "success");
                                          }}
                                        >
                                          Confirm
                                        </button>
                                      )}
                                      {(st === "confirmed" || st === "rescheduled") && (
                                        <button
                                          className="btn btn-outline-success btn-sm"
                                          onClick={() => updateAppStatus(a.id, "completed", { notifyCustomer: false })}
                                        >
                                          Mark Completed
                                        </button>
                                      )}
                                      {(st === "confirmed" || st === "rescheduled") && (
                                        <button
                                          className="btn btn-outline-secondary btn-sm"
                                          onClick={() => updateAppStatus(a.id, "no_show", { notifyCustomer: false })}
                                        >
                                          Mark No-show
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
                                  {(st === "completed" || st === "cancelled" || st === "no_show" || st === "expired") && (
                                    <button
                                      className="btn btn-outline-secondary btn-sm"
                                      disabled
                                    >
                                      Closed
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
            <section className="dash-stats">
              <div className="dash-stat">
                <div className="dash-stat-icon blue"><i className="bi bi-chat-left-text"></i></div>
                <div className="dash-stat-body">
                  <span className="dash-stat-value">{mineReviews.length}</span>
                  <span className="dash-stat-label">Reviews</span>
                </div>
              </div>
              <div className="dash-stat">
                <div className="dash-stat-icon amber"><i className="bi bi-star-fill"></i></div>
                <div className="dash-stat-body">
                  <span className="dash-stat-value">{mineReviews.length ? `${avgReviewRating.toFixed(1)}/5` : "-"}</span>
                  <span className="dash-stat-label">Avg Rating</span>
                </div>
              </div>
              <div className="dash-stat">
                <div className="dash-stat-icon green"><i className="bi bi-exclamation-circle"></i></div>
                <div className="dash-stat-body">
                  <span className="dash-stat-value">{pendingReviewCount}</span>
                  <span className="dash-stat-label">Needs Action</span>
                </div>
              </div>
              <div className="dash-stat">
                <div className="dash-stat-icon violet"><i className="bi bi-emoji-frown"></i></div>
                <div className="dash-stat-body">
                  <span className="dash-stat-value">{lowRatingCount}</span>
                  <span className="dash-stat-label">Low Ratings</span>
                </div>
              </div>
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
                            <span className={`badge badge-soft ${addressed ? "status-completed" : "status-pending"}`}>{addressed ? "addressed" : "needs action"}</span>
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
            <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',margin:'0 0 10px'}}>
              <button className="btn btn-dark" onClick={() => navigate("/agent/schedule-trip")}>
                <i className="bi bi-plus-lg me-1"></i>Schedule Trip
              </button>
            </div>

            <section className="agent-panel">
              {mineTrips.length ? (
                <>
                  <div className="trip-section-title">Upcoming Trips</div>
                  <div className="trip-list-stack">
                    {upcomingAgentTrips.map((t) => {
                      const status = tripStatus(t);
                      const statusLabel = formatWorkflowStatus(status, "tour");
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
                              {(status === "confirmed" || status === "rescheduled") && (
                                <>
                                  <button
                                    className="btn btn-outline-dark btn-sm"
                                    onClick={async () => {
                                      try {
                                        const res = await apiRequest(`/api/trips/${t.id}`, {
                                          method: "PATCH",
                                          body: JSON.stringify({ status: "cancelled" })
                                        });
                                        const updatedTrip = res?.data;
                                        if (!updatedTrip?.id) throw new Error("Trip update failed.");
                                        saveTrips(trips.map((x) => (x.id === t.id ? updatedTrip : x)));
                                      } catch (error) {
                                        feedback.notify(error?.message || "Unable to cancel trip.", "error");
                                      }
                                    }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    className="btn btn-dark btn-sm"
                                    onClick={async () => {
                                      try {
                                        const res = await apiRequest(`/api/trips/${t.id}`, {
                                          method: "PATCH",
                                          body: JSON.stringify({ status: "completed" })
                                        });
                                        const updatedTrip = res?.data;
                                        if (!updatedTrip?.id) throw new Error("Trip update failed.");
                                        saveTrips(trips.map((x) => (x.id === t.id ? updatedTrip : x)));
                                        feedback.notify("Tour marked completed.", "success");
                                      } catch (error) {
                                        feedback.notify(error?.message || "Unable to complete tour.", "error");
                                      }
                                    }}
                                  >
                                    Mark Completed
                                  </button>
                                </>
                              )}
                            <button
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => {
                                feedback.askConfirm({
                                  title: "Cancel Tour",
                                  message: "Cancel this tour?",
                                  confirmText: "Cancel Tour",
                                  variant: "danger",
                                  onConfirm: async () => {
                                    try {
                                      const res = await apiRequest(`/api/trips/${t.id}`, { method: "DELETE" });
                                      const updatedTrip = res?.data;
                                      if (!updatedTrip?.id) throw new Error("Trip cancellation failed.");
                                      saveTrips(trips.map((x) => (x.id === t.id ? updatedTrip : x)));
                                      feedback.notify("Tour cancelled.", "success");
                                    } catch (error) {
                                      feedback.notify(error?.message || "Unable to cancel tour.", "error");
                                    }
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
                    {!upcomingAgentTrips.length && <div className="agent-empty"><i className="bi bi-car-front"></i><p>No upcoming trips.</p></div>}
                  </div>

                  <div className="trip-section-title mt-3">Past Trips</div>
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
                    {!pastAgentTrips.length && <div className="agent-empty"><i className="bi bi-clock-history"></i><p>No past trips yet.</p></div>}
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
            <section className="agent-panel meets-panel-inner">


              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--line-soft)" }}>
                <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
                  <i className="bi bi-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: "0.85rem", pointerEvents: "none" }} />
                  <input
                    type="search"
                    className="form-control"
                    placeholder="Search customer, reason, mode…"
                    value={meetQuery}
                    onChange={(e) => { setMeetQuery(e.target.value); setMeetPage(1); }}
                    style={{ paddingLeft: 36, borderRadius: 8, fontSize: "0.875rem" }}
                  />
                </div>
                <span style={{ color: "var(--muted)", fontSize: "0.80rem", whiteSpace: "nowrap" }}>
                  {filteredMeets.length} {filteredMeets.length === 1 ? "result" : "results"}
                </span>
              </div>

              {filteredMeets.length ? (
                <>
                  <div className="meets-scroll-body">
                    <div className="table-responsive">
                      <table className="table align-middle">
                        <thead>
                          <tr><th>Customer</th><th>Date/Time</th><th>Mode</th><th>Reason</th><th>Status</th><th></th></tr>
                        </thead>
                        <tbody>
                          {pagedMeets.map((m) => {
                            const st = normalizeWorkflowStatus(m.status, "office_meeting");
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
                                <td><span className={statusBadgeClass(st, "office_meeting")}>{formatWorkflowStatus(st, "office_meeting")}</span></td>
                                <td className="text-end">
                                  {st === "pending" && (
                                    <div className="d-flex justify-content-end gap-2">
                                      <button
                                        className="btn btn-outline-success btn-sm"
                                        onClick={() => updateMeetStatus(m.id, "confirmed")}
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        className="btn btn-outline-danger btn-sm"
                                        onClick={() => updateMeetStatus(m.id, "declined")}
                                      >
                                        Decline
                                      </button>
                                    </div>
                                  )}
                                  {(st === "confirmed" || st === "rescheduled") && isMine && (
                                    <button
                                      className="btn btn-outline-success btn-sm"
                                      onClick={() => updateMeetStatus(m.id, "completed")}
                                    >
                                      Mark Completed
                                    </button>
                                  )}
                                  {(st === "declined" || st === "completed" || st === "cancelled" || st === "no_show" || st === "expired") && (
                                    <button
                                      className="btn btn-outline-secondary btn-sm"
                                      disabled
                                    >
                                      Closed
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {meetTotalPages > 1 && (
                    <div className="meets-panel-footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.80rem", color: "var(--muted)" }}>
                        Page {meetPage} of {meetTotalPages} &middot; {filteredMeets.length} total
                      </span>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-outline-dark btn-sm"
                          disabled={meetPage <= 1}
                          onClick={() => setMeetPage((p) => p - 1)}
                        >
                          <i className="bi bi-chevron-left"></i>
                        </button>
                        {Array.from({ length: meetTotalPages }, (_, i) => i + 1).map((page) => (
                          <button
                            key={page}
                            className={`btn btn-sm ${meetPage === page ? "btn-dark" : "btn-outline-dark"}`}
                            onClick={() => setMeetPage(page)}
                          >
                            {page}
                          </button>
                        ))}
                        <button
                          className="btn btn-outline-dark btn-sm"
                          disabled={meetPage >= meetTotalPages}
                          onClick={() => setMeetPage((p) => p + 1)}
                        >
                          <i className="bi bi-chevron-right"></i>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="agent-empty large">
                  <i className="bi bi-building"></i>
                  <p>{meetQuery.trim() ? "No matches found." : "No office meet requests to handle."}</p>
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
                  saveUsers(users.map((entry) => (
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
                    disabled={isSavingProfile}
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
