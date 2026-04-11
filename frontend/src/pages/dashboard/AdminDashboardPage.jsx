import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getCurrentUser, safeArray, saveArray, setCurrentUser as persistCurrentUser, startApiSync, subscribeKeys } from "@/services/storageService.js";
import DashboardLayout from "@/layout/DashboardLayout.jsx";
import DashboardCalendar from "@/components/DashboardCalendar.jsx";
import MessagingPanel from "@/components/MessagingPanel.jsx";
import UIFeedback from "@/ui/UIFeedback.jsx";
import { apiRequest } from "@/api/client.js";
import { AdminMiniBarChart, AdminStatCard } from "@/components/AdminDashboardStats.jsx";
import { ADMIN_NAV_ITEMS } from "@/data/constants.js";
import {
  appointmentStatusPriority,
  getAgentAvailabilityStatus,
  isActiveAppointmentStatus,
  isActiveMeetStatus
} from "@/utils/workflow.js";
import {
  applyPropertyImageFallback,
  eventDateTimeStamp,
  formatWorkflowStatus,
  formatDateTimeLabel,
  isActiveStatus,
  listingTypeLabel,
  normalizePropertyStatus,
  normalizeWorkflowStatus,
  normalizeAppointmentImages,
  propertyPriceLabel,
  resolveAppointmentImage,
  propertyStatusLabel,
  statusBadgeClass,
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
  isValidEmail,
  isValidPhone
} from "@/utils/input.js";

const canAssignAppointment = (appointmentLike) => isActiveAppointmentStatus(appointmentLike?.status);

export default function AdminDashboard() {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const validTabSet = useMemo(() => new Set(ADMIN_NAV_ITEMS.map((item) => item.id)), []);

  const [tab, setTab] = useState("dashboard");
  const [messageContact, setMessageContact] = useState("");
  const [users, setUsers] = useState([]);
  const [apps, setApps] = useState([]);
  const [meets, setMeets] = useState([]);
  const [trips, setTrips] = useState([]);
  const [properties, setProperties] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [propertyQuery, setPropertyQuery] = useState("");
  const [appointmentQuery, setAppointmentQuery] = useState("");
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [reviewAgentFilter, setReviewAgentFilter] = useState("all");
  const [reviewQuery, setReviewQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [userPage, setUserPage] = useState(1);
  const USERS_PER_PAGE = 5;
  const [reassigningApptId, setReassigningApptId] = useState("");
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState(null);
  const [isLoadingGoogleCalendarStatus, setIsLoadingGoogleCalendarStatus] = useState(false);
  const [isSyncingGoogleCalendar, setIsSyncingGoogleCalendar] = useState(false);

  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || "",
    phone: user?.phone || "",
    email: user?.email || ""
  });
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [editingUserId, setEditingUserId] = useState("");
  const [editUserForm, setEditUserForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    role: "customer",
    availabilityStatus: "available"
  });
  const feedback = useUiFeedback();
  const propertyLinkState = {
    from: {
      pathname: location.pathname,
      state: { tab }
    }
  };
  const googleCalendarMissingFieldsLabel = useMemo(() => {
    const fields = Array.isArray(googleCalendarStatus?.config?.missingFields)
      ? googleCalendarStatus.config.missingFields
      : [];
    if (fields.length) return fields.join(", ");
    return "GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_REFRESH_TOKEN";
  }, [googleCalendarStatus]);
  const googleCalendarOpenUrl = useMemo(() => {
    const tz = String(googleCalendarStatus?.config?.timeZone || "Asia/Manila").trim();
    return `https://calendar.google.com/calendar/u/0/r?ctz=${encodeURIComponent(tz)}`;
  }, [googleCalendarStatus]);

  useEffect(() => {
    const refreshAll = () => {
      const allUsers = safeArray("allUsers");
      const allProperties = safeArray("allProperties");
      const allAppointments = safeArray("allAppointments");
      const normalizedAppointments = normalizeAppointmentImages(allAppointments, allProperties);
      if (normalizedAppointments.changed) {
        saveArray("allAppointments", normalizedAppointments.next);
      }
      setUsers(allUsers);
      setApps(normalizedAppointments.next);
      setMeets(safeArray("officeMeets"));
      setTrips(safeArray("allTrips"));
      setProperties(allProperties);
      setReviews(safeArray("allReviews"));
    };

    refreshAll();
    return subscribeKeys(["allUsers", "allAppointments", "officeMeets", "allTrips", "allProperties", "allReviews"], refreshAll);
  }, []);

  useEffect(() => {
    const requestedStateTab = location.state?.tab;
    const requestedMessageContact = cleanUsername(location.state?.messageContact);
    const shouldOpenMessages = Boolean(requestedMessageContact);
    const canApplyRequestedTab = requestedStateTab && validTabSet.has(requestedStateTab);
    if (!shouldOpenMessages && !canApplyRequestedTab) return;

    if (shouldOpenMessages) {
      setMessageContact(requestedMessageContact);
      setTab("messages");
    } else {
      setMessageContact("");
    }

    if (canApplyRequestedTab && !shouldOpenMessages) {
      setTab(requestedStateTab);
    }

    navigate("/admin", { replace: true, state: null });
  }, [location.state, navigate, validTabSet]);

  useEffect(() => {
    if (tab !== "calendar") return undefined;
    let cancelled = false;

    const loadGoogleCalendarStatus = async () => {
      setIsLoadingGoogleCalendarStatus(true);
      try {
        const res = await apiRequest("/api/calendar/google/status", { method: "GET" });
        if (!cancelled) setGoogleCalendarStatus(res?.data || null);
      } catch {
        if (!cancelled) setGoogleCalendarStatus(null);
      } finally {
        if (!cancelled) setIsLoadingGoogleCalendarStatus(false);
      }
    };

    loadGoogleCalendarStatus();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const agents = useMemo(() => users.filter((u) => u.role === "agent"), [users]);
  const agentNameByUsername = useMemo(() => {
    const map = new Map();
    agents.forEach((agent) => {
      const uname = String(agent?.username || "").trim();
      if (!uname) return;
      const fullName = cleanText(agent?.fullName || "", 80);
      map.set(uname, fullName || uname);
    });
    return map;
  }, [agents]);
  const formatAgentIdentity = (usernameLike) => {
    const uname = String(usernameLike || "").trim();
    if (!uname) return "-";
    const fullName = agentNameByUsername.get(uname);
    return fullName ? `${fullName} (${uname})` : uname;
  };
  const availableAgents = useMemo(
    () => agents.filter((a) => getAgentAvailabilityStatus(a) === "available"),
    [agents]
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
    return fullName ? `${fullName} (${uname})` : uname;
  };
  const getUserStatus = (userLike) => {
    const accountStatus = String(userLike?.accountStatus || "active").toLowerCase();
    if (accountStatus === "inactive") return "inactive";
    const role = String(userLike?.role || "").toLowerCase();
    if (role !== "agent") return "active";
    const availability = getAgentAvailabilityStatus(userLike);
    if (availability === "available") return "active";
    if (availability === "busy") return "busy";
    return "offline";
  };
  const getUserJoinedDate = (userLike) => {
    const raw = userLike?.createdAt || userLike?.created_at || userLike?.joinedAt || userLike?.joined_at || "";
    if (!raw) return "-";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };
  const getUserLastActiveLabel = (userLike) => {
    const raw = userLike?.lastActiveAt || userLike?.lastLoginAt || userLike?.updatedAt || userLike?.updated_at || "";
    if (!raw) return "-";
    const stamp = new Date(raw);
    if (Number.isNaN(stamp.getTime())) return "-";
    const deltaMs = Date.now() - stamp.getTime();
    const deltaMin = Math.floor(deltaMs / 60000);
    if (deltaMin < 1) return "just now";
    if (deltaMin < 60) return `${deltaMin} min ago`;
    const deltaHr = Math.floor(deltaMin / 60);
    if (deltaHr < 24) return `${deltaHr} hr ago`;
    const deltaDay = Math.floor(deltaHr / 24);
    if (deltaDay < 30) return `${deltaDay} day${deltaDay > 1 ? "s" : ""} ago`;
    const deltaMonth = Math.floor(deltaDay / 30);
    if (deltaMonth < 12) return `${deltaMonth} mo ago`;
    const deltaYear = Math.floor(deltaMonth / 12);
    return `${deltaYear} yr ago`;
  };
  const userInitials = (userLike) => {
    const fullName = String(userLike?.fullName || "").trim();
    if (fullName) {
      const parts = fullName.split(/\s+/).filter(Boolean);
      return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "U";
    }
    const uname = String(userLike?.username || "").trim();
    return (uname.slice(0, 2).toUpperCase() || "U");
  };
  const pendingApps = useMemo(
    () => apps.filter((a) => normalizeWorkflowStatus(a.status, "appointment") === "pending"),
    [apps]
  );
  const sortedAppointments = useMemo(
    () =>
      apps
        .slice()
        .sort((a, b) => {
          const statusDiff = appointmentStatusPriority(a.status) - appointmentStatusPriority(b.status);
          if (statusDiff !== 0) return statusDiff;
          const aSchedule = `${a.date || ""} ${a.time || ""}`;
          const bSchedule = `${b.date || ""} ${b.time || ""}`;
          return bSchedule.localeCompare(aSchedule);
        }),
    [apps]
  );
  const filteredAppointments = useMemo(() => {
    const q = appointmentQuery.trim().toLowerCase();
    return sortedAppointments.filter((a) => {
      const status = normalizeWorkflowStatus(a.status, "appointment");
      const assigned = String(a.assignedAgent || "").trim();
      const passStatus =
        appointmentStatusFilter === "all" ||
        (appointmentStatusFilter === "active" && (status === "pending" || status === "confirmed" || status === "rescheduled")) ||
        (appointmentStatusFilter === "finished" && (status === "completed" || status === "cancelled" || status === "no_show" || status === "expired")) ||
        status === appointmentStatusFilter;
      if (!passStatus) return false;
      const passAssignment =
        assignmentFilter === "all" ||
        (assignmentFilter === "assigned" && Boolean(assigned)) ||
        (assignmentFilter === "unassigned" && !assigned);
      if (!passAssignment) return false;
      if (!q) return true;
      return [
        a.propertyTitle,
        a.location,
        a.customer,
        a.agent,
        a.assignedAgent,
        a.date,
        a.time,
        formatWorkflowStatus(a.status, "appointment")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [sortedAppointments, appointmentQuery, appointmentStatusFilter, assignmentFilter]);
  const pendingMeets = useMemo(
    () => meets.filter((m) => normalizeWorkflowStatus(m.status, "office_meeting") === "pending"),
    [meets]
  );
  const filteredProperties = useMemo(() => {
    const q = propertyQuery.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter((p) =>
      [p.title, p.location, p.agent, p.description, p.listingType, p.propertyType, p.propertyStatus].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [properties, propertyQuery]);
  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return users.filter((u) => {
      const role = String(u.role || "").toLowerCase();
      const status = getUserStatus(u);
      if (userRoleFilter !== "all" && role !== userRoleFilter) return false;
      if (userStatusFilter !== "all" && status !== userStatusFilter) return false;
      if (!q) return true;
      return [u.username, u.fullName, u.phone, u.email, u.role, status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [users, userQuery, userRoleFilter, userStatusFilter]);
  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const userPageClamped = Math.min(userPage, userTotalPages);
  const paginatedUsers = useMemo(
    () => filteredUsers.slice((userPageClamped - 1) * USERS_PER_PAGE, userPageClamped * USERS_PER_PAGE),
    [filteredUsers, userPageClamped, USERS_PER_PAGE]
  );
  const sortedReviews = useMemo(
    () => reviews.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [reviews]
  );
  const filteredReviews = useMemo(() => {
    const q = reviewQuery.trim().toLowerCase();
    return sortedReviews.filter((r) => {
      const isAddressed = Boolean(r.addressedAt);
      const rating = Number(r.rating || 0);
      const passFilter =
        reviewFilter === "all" ||
        (reviewFilter === "pending" && !isAddressed) ||
        (reviewFilter === "addressed" && isAddressed) ||
        (reviewFilter === "low" && rating <= 2) ||
        (reviewFilter === "high" && rating >= 4) ||
        (reviewFilter === "pinned" && Boolean(r.pinnedByAdmin || r.pinnedByAgent));
      if (!passFilter) return false;
      if (reviewAgentFilter !== "all" && String(r.agent || "") !== reviewAgentFilter) return false;
      if (!q) return true;
      return [r.propertyTitle, r.location, r.comment, r.customer, r.agent]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [sortedReviews, reviewFilter, reviewAgentFilter, reviewQuery]);
  const avgReviewRating = useMemo(() => {
    if (!reviews.length) return 0;
    const total = reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0);
    return total / reviews.length;
  }, [reviews]);
  const pendingReviewCount = useMemo(() => reviews.filter((r) => !r.addressedAt).length, [reviews]);
  const lowRatingCount = useMemo(() => reviews.filter((r) => Number(r.rating || 0) <= 2).length, [reviews]);
  const doneAppointmentsCount = useMemo(
    () => apps.filter((a) => normalizeWorkflowStatus(a.status, "appointment") === "completed").length,
    [apps]
  );
  const assignedAppointmentsCount = useMemo(
    () => apps.filter((a) => String(a.assignedAgent || "").trim()).length,
    [apps]
  );
  const openPipelineCount = useMemo(() => {
    const openApps = apps.filter((a) => isActiveAppointmentStatus(a.status)).length;
    const openMeets = meets.filter((m) => isActiveMeetStatus(m.status)).length;
    const openTrips = trips.filter((t) => {
      const st = tripStatus(t);
      return isActiveStatus(st, "tour");
    }).length;
    return openApps + openMeets + openTrips;
  }, [apps, meets, trips]);
  const monthlyActivityData = useMemo(() => {
    const monthKeys = [];
    const monthLabels = [];
    const now = new Date();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthKeys.push(key);
      monthLabels.push(d.toLocaleDateString(undefined, { month: "short" }));
    }
    const bucket = new Map(monthKeys.map((key, idx) => [key, { key, label: monthLabels[idx], value: 0 }]));
    const absorb = (items, resolver) => {
      items.forEach((item) => {
        const stamp = resolver(item);
        if (!stamp) return;
        const dt = new Date(stamp);
        if (Number.isNaN(dt.getTime())) return;
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        if (!bucket.has(key)) return;
        const current = bucket.get(key);
        current.value += 1;
      });
    };
    absorb(apps, (a) => (a.date ? `${a.date}T${a.time || "00:00"}` : a.createdAt));
    absorb(meets, (m) => (m.date ? `${m.date}T${m.time || "00:00"}` : m.createdAt));
    absorb(trips, (t) => (t.date ? `${t.date}T${t.time || "00:00"}` : t.createdAt));
    return monthKeys.map((key) => bucket.get(key));
  }, [apps, meets, trips]);
  const appointmentDistribution = useMemo(() => {
    const counts = {
      pending: 0,
      confirmed: 0,
      rescheduled: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
      expired: 0
    };
    apps.forEach((a) => {
      const status = normalizeWorkflowStatus(a.status, "appointment");
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
    });
    return counts;
  }, [apps]);
  const recentActivity = useMemo(() => {
    const feed = [];
    apps.forEach((a) => {
      const dateLabel = formatDateTimeLabel(a.date, a.time);
      const stamp = eventDateTimeStamp(a.date, a.time) || new Date(a.createdAt || 0).getTime() || 0;
      feed.push({
        id: `appt-${a.id}`,
        type: "Appointment",
        icon: "bi-calendar2-check",
        title: a.propertyTitle || "Property appointment",
        subtitle: `${a.customer ? `@${a.customer}` : "Customer"} • ${dateLabel}`,
        status: String(a.status || "pending"),
        stamp
      });
    });
    meets.forEach((m) => {
      const dateLabel = formatDateTimeLabel(m.date, m.time);
      const stamp = eventDateTimeStamp(m.date, m.time) || new Date(m.createdAt || 0).getTime() || 0;
      feed.push({
        id: `meet-${m.id}`,
        type: "Office Meeting",
        icon: "bi-building",
        title: m.fullName || m.customer || "Office meeting request",
        subtitle: `${m.mode === "virtual" ? "Virtual" : "In Office"} • ${dateLabel}`,
        status: String(m.status || "pending"),
        stamp
      });
    });
    trips.forEach((t) => {
      const dateLabel = formatDateTimeLabel(t.date, t.time);
      const status = tripStatus(t);
      const stamp = eventDateTimeStamp(t.date, t.time) || new Date(t.createdAt || 0).getTime() || 0;
      feed.push({
        id: `trip-${t.id}`,
        type: "Tour",
        icon: "bi-car-front",
        title: t.title || "Property tour",
        subtitle: `${t.agent ? `@${t.agent}` : "Agent"} • ${dateLabel}`,
        status,
        stamp
      });
    });
    return feed
      .sort((a, b) => Number(b.stamp || 0) - Number(a.stamp || 0))
      .slice(0, 7);
  }, [apps, meets, trips]);
  const adminCalendarEvents = useMemo(() => {
    const appointmentEvents = apps.map((a) => ({
      id: `app-${a.id}`,
      title: a.propertyTitle || "Appointment",
      subtitle: `Customer: ${formatCustomerIdentity(a.customer)}`,
      date: a.date,
      time: a.time,
      type: "appointment",
      status: a.status || "pending"
    }));
    const meetEvents = meets.map((m) => ({
      id: `meet-${m.id}`,
      title: m.mode === "virtual" ? "Virtual Office Meeting" : "Office Meeting",
      subtitle: m.assignedAgent ? `Assigned agent: ${formatAgentIdentity(m.assignedAgent)}` : `Customer: ${formatCustomerIdentity(m.customer || m.requestedBy)}`,
      description: m.reason || "",
      date: m.date,
      time: m.time,
      type: "meet",
      status: m.status || "pending"
    }));
    const tripEvents = trips.map((t) => ({
      id: `trip-${t.id}`,
      title: t.title || "Property Tour",
      subtitle: t.agent ? `Agent: ${formatAgentIdentity(t.agent)}` : (t.location || "Property tour"),
      description: t.notes || "",
      date: t.date,
      time: t.time,
      type: "trip",
      status: tripStatus(t)
    }));
    return [...appointmentEvents, ...meetEvents, ...tripEvents];
  }, [apps, meets, trips]);
  const reviewAgents = useMemo(
    () => Array.from(new Set(reviews.map((r) => String(r.agent || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [reviews]
  );
  const upcomingAdminTrips = useMemo(
    () =>
      trips.filter((t) => {
        const st = tripStatus(t);
        return isActiveStatus(st, "tour");
      }),
    [trips]
  );
  const pastAdminTrips = useMemo(
    () =>
      trips.filter((t) => {
        const st = tripStatus(t);
        return !isActiveStatus(st, "tour");
      }),
    [trips]
  );
  const getPropertyImage = (appointment) => {
    return resolveAppointmentImage(appointment, properties);
  };
  const handlePropertyImageError = (event, propertyLike) => {
    applyPropertyImageFallback(event.currentTarget, propertyLike || { title: "Property" });
  };
  const openUserEditor = (userLike) => {
    setEditingUserId(String(userLike?.id || ""));
    setEditUserForm({
      fullName: String(userLike?.fullName || ""),
      phone: String(userLike?.phone || ""),
      email: String(userLike?.email || ""),
      role: String(userLike?.role || "customer"),
      availabilityStatus: getAgentAvailabilityStatus(userLike)
    });
  };
  const cancelUserEditor = () => {
    setEditingUserId("");
    setEditUserForm({
      fullName: "",
      phone: "",
      email: "",
      role: "customer",
      availabilityStatus: "available"
    });
  };
  const saveUserEdits = async () => {
    if (isSavingUser) return;
    const targetId = String(editingUserId || "").trim();
    if (!targetId) return;

    const fullName = cleanText(editUserForm.fullName, 80);
    const phone = cleanPhone(editUserForm.phone);
    const email = cleanEmail(editUserForm.email);
    const role = String(editUserForm.role || "customer").toLowerCase();
    const availabilityStatus = getAgentAvailabilityStatus({ availabilityStatus: editUserForm.availabilityStatus });

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
    if (!["admin", "agent", "customer"].includes(role)) {
      feedback.notify("Invalid role selected.", "error");
      return;
    }

    const target = users.find((u) => String(u.id) === targetId);
    if (!target) {
      feedback.notify("User no longer exists.", "error");
      cancelUserEditor();
      return;
    }

    try {
      setIsSavingUser(true);
      const res = await apiRequest(`/api/users/${targetId}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName,
          phone,
          email,
          role,
          availabilityStatus: role === "agent" ? availabilityStatus : "offline"
        })
      });
      const updatedUser = res?.data;
      if (!updatedUser?.id) {
        throw new Error("User update failed.");
      }
      saveUsers(users.map((entry) => (
        String(entry?.id || entry?.username) === String(updatedUser.id || updatedUser.username)
          ? updatedUser
          : entry
      )));

      if (user?.id === target.id || user?.username === target.username) {
        persistCurrentUser({
          ...user,
          fullName,
          phone,
          email,
          role
        });
      }

      feedback.notify(`Updated user ${target.username}.`, "success");
      cancelUserEditor();
    } catch (error) {
      feedback.notify(error?.message || "Unable to update user.", "error");
    } finally {
      setIsSavingUser(false);
    }
  };

  const currentTabLabel = tab === "dashboard"
    ? "Overview"
    : tab === "appointments"
    ? "Appointment Management"
    : tab === "users"
    ? "User Management"
    : tab === "properties"
    ? "Property Listings"
    : tab === "calendar"
    ? "Operations Calendar"
    : tab === "messages"
    ? "Inbox"
    : tab === "reviews"
    ? "Client Feedback"
    : tab === "office-meets"
    ? "Office Meetings"
    : tab === "trips"
    ? "Trip Scheduler"
    : tab === "profile"
    ? "My Account"
    : ADMIN_NAV_ITEMS.find((item) => item.id === tab)?.label || "Overview";

  const saveUsers = (next) => {
    saveArray("allUsers", next);
    setUsers(next);
  };
  const saveApps = (next) => {
    saveArray("allAppointments", next);
    setApps(next);
  };
  const saveMeets = (next) => {
    saveArray("officeMeets", next);
    setMeets(next);
  };
  const saveTrips = (next) => {
    saveArray("allTrips", next);
    setTrips(next);
  };
  const saveProps = (next) => {
    saveArray("allProperties", next);
    setProperties(next);
  };
  const saveReviews = (next) => {
    saveArray("allReviews", next);
    setReviews(next);
  };
  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    if (nextTab !== "messages") {
      setMessageContact("");
    }
  };
  const isAgentAvailableForAppointment = (agentUsername, appointment) => {
    const uname = String(agentUsername || "").trim();
    if (!uname) return false;
    const agent = users.find((u) => u.role === "agent" && u.username === uname);
    if (!agent) return false;
    if (getAgentAvailabilityStatus(agent) !== "available") return false;

    const targetDate = String(appointment?.date || "").trim();
    const targetTime = String(appointment?.time || "").trim();
    if (!targetDate) return true;

    const appointmentConflict = apps.some((a) => {
      if (String(a.id) === String(appointment?.id)) return false;
      if (String(a.assignedAgent || "").trim() !== uname) return false;
      if (!isActiveAppointmentStatus(a.status)) return false;
      return String(a.date || "").trim() === targetDate && String(a.time || "").trim() === targetTime;
    });
    if (appointmentConflict) return false;

    const meetConflict = meets.some((m) => {
      const assigned = String(m.assignedAgent || m.agent || "").trim();
      if (assigned !== uname) return false;
      if (!isActiveMeetStatus(m.status)) return false;
      return String(m.date || "").trim() === targetDate && String(m.time || "").trim() === targetTime;
    });
    if (meetConflict) return false;

    const tripConflict = trips.some((t) => {
      if (String(t.agent || "").trim() !== uname) return false;
      const st = tripStatus(t);
      if (!isActiveStatus(st, "tour")) return false;
      return String(t.date || "").trim() === targetDate && String(t.time || "").trim() === targetTime;
    });
    return !tripConflict;
  };
  const getAssignableAgentsForAppointment = (appointment) =>
    availableAgents.filter((a) => isAgentAvailableForAppointment(a.username, appointment));
  const assignAppointmentAgent = async (appointmentId, assignedAgentUsername) => {
    const selected = String(assignedAgentUsername || "").trim();
    const targetAppointment = apps.find((a) => String(a.id) === String(appointmentId));
    if (!targetAppointment) {
      feedback.notify("Appointment not found.", "error");
      return;
    }
    if (!canAssignAppointment(targetAppointment)) {
      feedback.notify("Cannot assign agent because this appointment is already finished.", "error");
      return;
    }
    const target = selected ? users.find((u) => u.role === "agent" && u.username === selected) : null;
    if (selected && !target) {
      feedback.notify("Selected agent was not found.", "error");
      return;
    }
    if (target && !isAgentAvailableForAppointment(target.username, targetAppointment)) {
      feedback.notify("Selected agent is not available on this appointment schedule.", "error");
      return;
    }

    let updatedAppointment = null;
    try {
      const res = await apiRequest(`/api/appointments/${appointmentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          assignedAgent: selected
        })
      });
      updatedAppointment = res?.data;
      if (!updatedAppointment?.id) throw new Error("Appointment assignment failed.");
      saveApps(apps.map((appointment) => (
        String(appointment?.id) === String(appointmentId)
          ? updatedAppointment
          : appointment
      )));
    } catch (error) {
      feedback.notify(error?.message || "Unable to update assignment.", "error");
      return;
    }

    if (selected) {
      pushNotification({
        to: selected,
        type: "appointment",
        title: "New Appointment Assignment",
        message: `Admin assigned ${updatedAppointment.propertyTitle || "an appointment"} on ${formatDateTimeLabel(updatedAppointment.date, updatedAppointment.time)} to you.`,
        appointmentId: updatedAppointment.id,
        meta: {
          appointmentId: updatedAppointment.id,
          propertyId: updatedAppointment.propertyId || "",
          propertyTitle: updatedAppointment.propertyTitle || "",
          customer: updatedAppointment.customer || "",
          assignedBy: user?.username || ""
        }
      });
      if (updatedAppointment.customer) {
        pushNotification({
          to: updatedAppointment.customer,
          type: "appointment",
          title: "Agent Assigned",
          message: `Admin assigned Agent @${selected} to your appointment for ${updatedAppointment.propertyTitle || "the property"}.`,
          appointmentId: updatedAppointment.id,
          meta: {
            appointmentId: updatedAppointment.id,
            assignedAgent: selected,
            propertyId: updatedAppointment.propertyId || "",
            propertyTitle: updatedAppointment.propertyTitle || ""
          }
        });
      }
      feedback.notify(`Assigned @${selected} to appointment.`, "success");
      return;
    }
    feedback.notify("Appointment unassigned.", "success");
  };

  const handleGoogleCalendarSync = async () => {
    setIsSyncingGoogleCalendar(true);
    try {
      const res = await apiRequest("/api/calendar/google/sync", { method: "POST" });
      await startApiSync(true);
      setGoogleCalendarStatus(res?.data || null);
      const syncedCount = Number(res?.data?.totals?.synced || 0);
      const errorCount = Number(res?.data?.totals?.error || 0);
      feedback.notify(
        errorCount > 0
          ? `Google Calendar sync finished with ${errorCount} issue(s). ${syncedCount} record(s) are synced.`
          : `Google Calendar sync finished. ${syncedCount} record(s) are synced.`,
        errorCount > 0 ? "warning" : "success"
      );
    } catch (error) {
      feedback.notify(error?.message || "Unable to sync Google Calendar.", "error");
    } finally {
      setIsSyncingGoogleCalendar(false);
    }
  };

  return (
    <DashboardLayout
      suiteLabel="Admin Suite"
      profileName={user?.fullName || "Admin"}
      profileRole="Administrator"
      role="admin"
      navItems={ADMIN_NAV_ITEMS}
      activeTab={tab}
      onTabChange={handleTabChange}
    >
        <section className="agent-hero">
          <div>
            <h1>{currentTabLabel}</h1>
          </div>
        </section>

        {tab === "dashboard" && (
          <>
            <section className="dash-header">
              <div className="dash-header-pills">
                <span className="dash-pill"><i className="bi bi-lightning-charge"></i>{openPipelineCount} active</span>
                <span className="dash-pill"><i className="bi bi-person-check"></i>{availableAgents.length}/{agents.length} agents</span>
                <span className="dash-pill"><i className="bi bi-star"></i>{reviews.length ? avgReviewRating.toFixed(1) : "0.0"} rating</span>
              </div>
            </section>

            <section className="dash-stats">
              <div className="dash-stat">
                <div className="dash-stat-icon blue"><i className="bi bi-people"></i></div>
                <div className="dash-stat-body">
                  <span className="dash-stat-value">{users.length}</span>
                  <span className="dash-stat-label">Users</span>
                </div>
                <span className="dash-stat-sub">{agents.length} agents · {customers.length} customers</span>
              </div>
              <div className="dash-stat">
                <div className="dash-stat-icon amber"><i className="bi bi-clock"></i></div>
                <div className="dash-stat-body">
                  <span className="dash-stat-value">{openPipelineCount}</span>
                  <span className="dash-stat-label">Pending</span>
                </div>
                <span className="dash-stat-sub">{pendingApps.length} appointments · {pendingMeets.length} meetings</span>
              </div>
              <div className="dash-stat">
                <div className="dash-stat-icon green"><i className="bi bi-check2-circle"></i></div>
                <div className="dash-stat-body">
                  <span className="dash-stat-value">{doneAppointmentsCount}</span>
                  <span className="dash-stat-label">Completed</span>
                </div>
                <span className="dash-stat-sub">{assignedAppointmentsCount} assigned · {trips.length} trips</span>
              </div>
              <div className="dash-stat">
                <div className="dash-stat-icon violet"><i className="bi bi-chat-heart"></i></div>
                <div className="dash-stat-body">
                  <span className="dash-stat-value">{reviews.length}</span>
                  <span className="dash-stat-label">Reviews</span>
                </div>
                <span className="dash-stat-sub">{lowRatingCount} low · {pendingReviewCount} need action</span>
              </div>
            </section>

            <section className="dash-bottom-grid">
              <article className="dash-card dash-pipeline">
                <div className="dash-card-head">
                  <h3>Pipeline Summary</h3>
                </div>
                <div className="dash-pipeline-rows">
                  <div className="dash-pipeline-row"><span>Pending</span><strong>{appointmentDistribution.pending}</strong></div>
                  <div className="dash-pipeline-row"><span>Confirmed</span><strong>{appointmentDistribution.confirmed}</strong></div>
                  <div className="dash-pipeline-row"><span>Rescheduled</span><strong>{appointmentDistribution.rescheduled}</strong></div>
                  <div className="dash-pipeline-row"><span>Completed</span><strong>{appointmentDistribution.completed}</strong></div>
                </div>
              </article>

              <article className="dash-card dash-activity">
                <div className="dash-card-head">
                  <h3>Recent Activity</h3>
                  <span className="badge badge-soft">{recentActivity.length}</span>
                </div>
                <div className="dash-activity-list">
                  {recentActivity.slice(0, 5).map((item) => (
                    <div key={item.id} className="dash-activity-row">
                      <i className={`bi ${item.icon} dash-activity-icon`}></i>
                      <div className="dash-activity-body">
                        <strong>{item.title}</strong>
                        <span className="dash-activity-meta">{item.type} · {item.subtitle}</span>
                      </div>
                      <span className={statusBadgeClass(item.status, item.type === "Office Meeting" ? "office_meeting" : item.type === "Tour" ? "tour" : "appointment")}>
                        {formatWorkflowStatus(item.status, item.type === "Office Meeting" ? "office_meeting" : item.type === "Tour" ? "tour" : "appointment")}
                      </span>
                    </div>
                  ))}
                  {!recentActivity.length && (
                    <div className="agent-empty">
                      <i className="bi bi-clock-history"></i>
                      <p>No recent activity yet.</p>
                    </div>
                  )}
                </div>
              </article>
            </section>
          </>
        )}

        {tab === "calendar" && (
          <>
            <section className="agent-panel">
              <div className="agent-panel-head">
                <div>
                  <h3>Google Calendar Sync</h3>
                  <p className="muted mb-0">Use this before your defense to push the latest appointments, meetings, and trips into your demo calendar.</p>
                </div>
                <span className={`badge ${googleCalendarStatus?.config?.enabled ? "badge-soft" : "bg-secondary-subtle text-secondary"}`}>
                  {googleCalendarStatus?.config?.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>

              <div className="d-flex flex-wrap gap-3 align-items-center justify-content-between">
                <div className="d-flex flex-wrap gap-3">
                  <div>
                    <div className="small muted">Calendar ID</div>
                    <strong>{googleCalendarStatus?.config?.calendarId || "primary"}</strong>
                  </div>
                  <div>
                    <div className="small muted">Time Zone</div>
                    <strong>{googleCalendarStatus?.config?.timeZone || "-"}</strong>
                  </div>
                  <div>
                    <div className="small muted">Synced</div>
                    <strong>{googleCalendarStatus?.totals?.synced ?? 0}</strong>
                  </div>
                  <div>
                    <div className="small muted">Pending</div>
                    <strong>{googleCalendarStatus?.totals?.pending ?? 0}</strong>
                  </div>
                  <div>
                    <div className="small muted">Errors</div>
                    <strong>{googleCalendarStatus?.totals?.error ?? 0}</strong>
                  </div>
                </div>

                <div className="d-flex flex-wrap gap-2">
                  <a
                    className="btn btn-outline-dark btn-sm"
                    href={googleCalendarOpenUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Google Calendar
                  </a>
                  <button
                    type="button"
                    className="btn btn-dark btn-sm"
                    disabled={isSyncingGoogleCalendar || isLoadingGoogleCalendarStatus}
                    onClick={handleGoogleCalendarSync}
                  >
                    {isSyncingGoogleCalendar ? "Syncing..." : "Sync All to Google Calendar"}
                  </button>
                </div>
              </div>

              <div className="mt-3 small muted">
                {isLoadingGoogleCalendarStatus
                  ? "Checking Google Calendar sync status..."
                  : googleCalendarStatus?.config?.enabled
                    ? googleCalendarStatus?.config?.configured
                      ? `Last successful sync: ${googleCalendarStatus?.lastSyncedAt ? new Date(googleCalendarStatus.lastSyncedAt).toLocaleString() : "No successful sync yet."}`
                      : (
                        <>
                          Google Calendar sync is enabled, but the backend is still missing OAuth settings: {googleCalendarMissingFieldsLabel}. Add the client ID and client secret, then run <code>npm run google-calendar:token</code> in <code>backend</code> to save the refresh token automatically.
                        </>
                      )
                    : "Google Calendar sync is currently turned off in the backend environment settings."}
              </div>
            </section>

            <DashboardCalendar
              title="Operations Calendar"
              subtitle="Appointments, office meetings, and trips in one monthly view."
              events={adminCalendarEvents}
              storageKey="dashboard-calendar-cursor:admin"
            />
          </>
        )}

        {tab === "messages" && (
          <MessagingPanel currentUser={user} feedback={feedback} preferredContact={messageContact} />
        )}

        {tab === "users" && (
          <section className="agent-panel admin-users-management">
            <div className="admin-users-toolbar-shell">
              <div className="admin-users-toolbar">
                <div className="input-group">
                  <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                  <input
                    className="form-control"
                    placeholder="Search full name, email, username..."
                    value={userQuery}
                    onChange={(e) => { setUserQuery(e.target.value); setUserPage(1); }}
                  />
                </div>
                <select className="form-select" value={userRoleFilter} onChange={(e) => { setUserRoleFilter(e.target.value); setUserPage(1); }}>
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="agent">Agent</option>
                  <option value="customer">Customer</option>
                </select>
                <select className="form-select" value={userStatusFilter} onChange={(e) => { setUserStatusFilter(e.target.value); setUserPage(1); }}>
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="busy">Busy</option>
                  <option value="offline">Offline</option>
                  <option value="inactive">Inactive</option>
                </select>
                <button
                  type="button"
                  className="btn btn-dark"
                  onClick={() => navigate("/admin/add-user")}
                >
                  <i className="bi bi-plus-lg me-1"></i>
                  Add User
                </button>
              </div>
            </div>

            <div className="table-responsive admin-users-table-wrap">
              {editingUserId && (
                <article className="admin-users-add-card admin-user-edit-card">
                  <div className="agent-panel-head admin-users-panel-head">
                    <div>
                      <h3>Edit User</h3>
                      <p>Update user profile details and role.</p>
                    </div>
                  </div>
                  <form
                    className="admin-agent-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveUserEdits();
                    }}
                  >
                    <div className="admin-agent-form-grid">
                      <div className="admin-field">
                        <label>Full Name</label>
                        <input
                          className="form-control"
                          value={editUserForm.fullName}
                          onChange={(e) => setEditUserForm((s) => ({ ...s, fullName: e.target.value }))}
                        />
                      </div>
                      <div className="admin-field">
                        <label>Phone</label>
                        <input
                          className="form-control"
                          value={editUserForm.phone}
                          onChange={(e) => setEditUserForm((s) => ({ ...s, phone: e.target.value }))}
                        />
                      </div>
                      <div className="admin-field">
                        <label>Email</label>
                        <input
                          className="form-control"
                          type="email"
                          value={editUserForm.email}
                          onChange={(e) => setEditUserForm((s) => ({ ...s, email: e.target.value }))}
                        />
                      </div>
                      <div className="admin-field">
                        <label>Role</label>
                        <select
                          className="form-select"
                          value={editUserForm.role}
                          onChange={(e) => setEditUserForm((s) => ({ ...s, role: e.target.value }))}
                        >
                          <option value="admin">Admin</option>
                          <option value="agent">Agent</option>
                          <option value="customer">Customer</option>
                        </select>
                      </div>
                      {editUserForm.role === "agent" && (
                        <div className="admin-field">
                          <label>Availability</label>
                          <select
                            className="form-select"
                            value={editUserForm.availabilityStatus}
                            onChange={(e) => setEditUserForm((s) => ({ ...s, availabilityStatus: e.target.value }))}
                          >
                            <option value="available">Available</option>
                            <option value="busy">Busy</option>
                            <option value="offline">Offline</option>
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="admin-create-user-actions">
                      <button type="button" className="btn btn-outline-dark" onClick={cancelUserEditor} disabled={isSavingUser}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-dark" disabled={isSavingUser}>
                        {isSavingUser ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </form>
                </article>
              )}

              <table className="table align-middle admin-users-table admin-modern-table">
                <thead>
                  <tr>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Username</th>
                    <th>Status</th>
                    <th>Role</th>
                    <th>Joined Date</th>
                    <th>Last Active</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((u) => {
                    const status = getUserStatus(u);
                    const isInactive = status === "inactive";
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="admin-user-name-cell">
                            <span className={`admin-user-avatar avatar-role-${u.role || "customer"}`}>{userInitials(u)}</span>
                            <div className="admin-user-identity">
                              <strong>{u.fullName || u.username}</strong>
                              <span>{u.username}</span>
                            </div>
                          </div>
                        </td>
                        <td>{u.email || "-"}</td>
                        <td>{u.username || "-"}</td>
                        <td><span className={`admin-status-pill ${status}`}>{status}</span></td>
                        <td><span className={`badge badge-soft admin-role-badge role-${u.role}`}>{u.role}</span></td>
                        <td>{getUserJoinedDate(u)}</td>
                        <td>{getUserLastActiveLabel(u)}</td>
                        <td className="text-center">
                          <div className="admin-user-actions">
                            <button
                              type="button"
                              className="btn btn-link btn-sm"
                              onClick={() => openUserEditor(u)}
                              aria-label={`edit ${u.username}`}
                            >
                              <i className="bi bi-pencil-square"></i>
                            </button>
                            {u.role !== "admin" ? (
                              <button
                                type="button"
                                className={`btn btn-link btn-sm ${isInactive ? "text-success" : "text-danger"}`}
                                onClick={() => {
                                  feedback.askConfirm({
                                    title: isInactive ? "Reactivate User" : "Deactivate User",
                                    message: isInactive
                                      ? `Reactivate ${u.username} and restore account access?`
                                      : `Deactivate ${u.username}? Operational history will be preserved.`,
                                    confirmText: isInactive ? "Reactivate" : "Deactivate",
                                    variant: isInactive ? "primary" : "danger",
                                    onConfirm: async () => {
                                      try {
                                        const res = isInactive
                                          ? await apiRequest(`/api/users/${u.id}`, {
                                            method: "PATCH",
                                            body: JSON.stringify({ accountStatus: "active" })
                                          })
                                          : await apiRequest(`/api/users/${u.id}`, { method: "DELETE" });
                                        const updatedUser = res?.data;
                                        if (!updatedUser?.id) throw new Error("User deactivation failed.");
                                        saveUsers(users.map((entry) => (
                                          String(entry?.id || entry?.username) === String(updatedUser.id || updatedUser.username)
                                            ? updatedUser
                                            : entry
                                        )));
                                        feedback.notify(`User ${u.username} ${isInactive ? "reactivated" : "deactivated"}.`, "success");
                                      } catch (error) {
                                        feedback.notify(error?.message || `Unable to ${isInactive ? "reactivate" : "deactivate"} user.`, "error");
                                      }
                                    }
                                  });
                                }}
                                aria-label={`${isInactive ? "reactivate" : "deactivate"} ${u.username}`}
                              >
                                <i className={`bi ${isInactive ? "bi-arrow-clockwise" : "bi-person-x"}`}></i>
                              </button>
                            ) : (
                              <span className="small muted">-</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredUsers.length && (
                    <tr><td colSpan="8" className="text-center text-muted py-4">No users found for current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="admin-users-footer">
              <span>
                Showing {filteredUsers.length === 0 ? 0 : (userPageClamped - 1) * USERS_PER_PAGE + 1}–{Math.min(userPageClamped * USERS_PER_PAGE, filteredUsers.length)} of {filteredUsers.length} {filteredUsers.length !== users.length ? `filtered (${users.length} total)` : "users"}
              </span>
              {userTotalPages > 1 && (
                <div className="admin-users-pagination">
                  <button
                    type="button"
                    className="admin-page-btn"
                    onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                    disabled={userPageClamped <= 1}
                    aria-label="Previous page"
                  >
                    <i className="bi bi-chevron-left"></i>
                  </button>
                  {Array.from({ length: userTotalPages }, (_, i) => i + 1).map((pg) => (
                    <button
                      key={pg}
                      type="button"
                      className={`admin-page-btn${pg === userPageClamped ? " active" : ""}`}
                      onClick={() => setUserPage(pg)}
                      aria-label={`Page ${pg}`}
                      aria-current={pg === userPageClamped ? "page" : undefined}
                    >
                      {pg}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="admin-page-btn"
                    onClick={() => setUserPage((p) => Math.min(userTotalPages, p + 1))}
                    disabled={userPageClamped >= userTotalPages}
                    aria-label="Next page"
                  >
                    <i className="bi bi-chevron-right"></i>
                  </button>
                </div>
              )}
              <span>Admins: {users.filter((u) => u.role === "admin").length} | Agents: {agents.length} | Customers: {customers.length}</span>
            </div>
          </section>
        )}

        {tab === "properties" && (
          <section className="agent-panel">
            <div className="agent-panel-head"><h3>All Properties</h3><span className="badge badge-soft">{properties.length}</span></div>
            <section className="agent-search-wrap">
              <div className="input-group">
                <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                <input
                  className="form-control"
                  placeholder="Search properties by title, location, agent..."
                  value={propertyQuery}
                  onChange={(e) => setPropertyQuery(e.target.value)}
                />
              </div>
            </section>
            <div className="agent-property-grid full">
              {filteredProperties.slice().reverse().map((p) => {
                const normalizedStatus = normalizePropertyStatus(p.propertyStatus || p.status);
                return (
                <article key={p.id} className="agent-property-card">
                  <img
                    src={withImage(p)}
                    alt={p.title || "Property"}
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
                    {p.agent ? (
                      <div className="public-home-property-tags">
                        <span>{formatAgentIdentity(p.agent)}</span>
                      </div>
                    ) : null}
                    <strong>{propertyPriceLabel(p)}</strong>
                    <div className="agent-property-meta">
                      <span><i className="bi bi-door-open"></i> {Number(p.bedrooms || 0)} bed</span>
                      <span><i className="bi bi-droplet"></i> {Number(p.bathrooms || 0)} bath</span>
                      <span><i className="bi bi-aspect-ratio"></i> {Number(p.areaSqft || 0)} sqft</span>
                    </div>
                    <div className="agent-property-actions">
                      <Link className="btn btn-outline-dark btn-sm w-100" to={`/properties/${p.id}`} state={propertyLinkState}>
                        Details
                      </Link>
                    </div>
                  </div>
                </article>
                );
              })}
              {!filteredProperties.length && (
                <div className="agent-empty large">
                  <i className="bi bi-buildings"></i>
                  <p>No matching properties found.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "appointments" && (
          <section className="agent-panel section-appointments">
            <div className="agent-panel-head"><h3>All Appointments</h3><span className="badge badge-soft">{filteredAppointments.length}</span></div>
            <div className="appointments-toolbar">
              <div className="input-group">
                <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                <input
                  className="form-control"
                  placeholder="Search property, customer, agent, date..."
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
                  setAssignmentFilter("all");
                }}
              >
                Clear
              </button>
              <select className="form-select" value={appointmentStatusFilter} onChange={(e) => setAppointmentStatusFilter(e.target.value)}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="finished">Finished</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="no_show">No-show</option>
                <option value="expired">Expired</option>
              </select>
              <select className="form-select" value={assignmentFilter} onChange={(e) => setAssignmentFilter(e.target.value)}>
                <option value="all">All Assignment</option>
                <option value="unassigned">Unassigned</option>
                <option value="assigned">Assigned</option>
              </select>
            </div>
            <div className="table-responsive">
              <table className="table align-middle admin-modern-table">
                <thead><tr><th>Property</th><th>Customer</th><th>Assigned Agent</th><th>Date / Time</th><th>Status</th><th>Assignment</th></tr></thead>
                <tbody>
                  {filteredAppointments.map((a) => {
                    const canAssign = canAssignAppointment(a);
                    const assignableAgents = getAssignableAgentsForAppointment(a);
                    const isReassigning = reassigningApptId === a.id;
                    const isAutoAssigned = Boolean(a.assignedAgent);
                    return (
                    <tr key={a.id}>
                      <td>
                        <div className="appointment-property-cell appt-property-compact">
                          <img
                            className="appointment-property-thumb appt-thumb-sm"
                            src={getPropertyImage(a)}
                            alt={a.propertyTitle || "Property"}
                            onError={(e) => handlePropertyImageError(e, { id: a.propertyId, title: a.propertyTitle, location: a.location })}
                          />
                          <div>
                            <div className="fw-semibold appt-prop-title">{a.propertyTitle}</div>
                            <div className="appt-prop-loc">{a.location}</div>
                          </div>
                        </div>
                      </td>
                      <td className="appt-customer-cell">{formatCustomerIdentity(a.customer)}</td>
                      <td>{a.assignedAgent ? formatAgentIdentity(a.assignedAgent) : <span className="small muted">—</span>}</td>
                      <td className="appt-datetime-cell">{formatDateTimeLabel(a.date, a.time)}</td>
                      <td><span className={statusBadgeClass(a.status, "appointment")}>{formatWorkflowStatus(a.status, "appointment")}</span></td>
                      <td>
                        {canAssign ? (
                          isReassigning ? (
                            <div className="appt-assign-inline">
                              <select
                                className="form-select form-select-sm"
                                defaultValue={a.assignedAgent || ""}
                                autoFocus
                                onChange={(e) => {
                                  assignAppointmentAgent(a.id, e.target.value);
                                  setReassigningApptId("");
                                }}
                              >
                                <option value="">Unassign</option>
                                {assignableAgents.map((agent) => (
                                  <option key={agent.id} value={agent.username}>
                                    {formatAgentIdentity(agent.username)}
                                  </option>
                                ))}
                                {!!a.assignedAgent &&
                                  !availableAgents.some((agent) => agent.username === a.assignedAgent) && (
                                    <option value={a.assignedAgent}>
                                      {formatAgentIdentity(a.assignedAgent)} (unavailable)
                                    </option>
                                  )}
                              </select>
                              <button
                                type="button"
                                className="btn btn-link btn-sm appt-assign-cancel"
                                onClick={() => setReassigningApptId("")}
                                aria-label="Cancel reassignment"
                              >
                                <i className="bi bi-x"></i>
                              </button>
                            </div>
                          ) : isAutoAssigned ? (
                            <div className="appt-assigned-cell">
                              <span className="appt-assigned-badge">
                                <i className="bi bi-person-check-fill"></i>
                                {formatAgentIdentity(a.assignedAgent)}
                              </span>
                              <button
                                type="button"
                                className="btn btn-link btn-sm appt-reassign-btn"
                                onClick={() => setReassigningApptId(a.id)}
                                title="Reassign agent"
                                aria-label="Reassign agent"
                              >
                                <i className="bi bi-arrow-repeat"></i>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm appt-assign-btn"
                              onClick={() => setReassigningApptId(a.id)}
                            >
                              <i className="bi bi-person-plus"></i> Assign Agent
                            </button>
                          )
                        ) : (
                          <span className="appt-finished-label"><i className="bi bi-check2-circle"></i> Finished</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                  {!filteredAppointments.length && <tr><td colSpan="6" className="text-center text-muted py-4">No appointments found for the current filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="small muted mt-2">Available agents right now: {availableAgents.length} of {agents.length}. Assignment list also checks date/time availability.</div>
          </section>
        )}

        {tab === "reviews" && (
          <>
            <section className="dash-stats">
              <div className="dash-stat">
                <div className="dash-stat-icon blue"><i className="bi bi-chat-left-text"></i></div>
                <div className="dash-stat-body">
                  <span className="dash-stat-value">{reviews.length}</span>
                  <span className="dash-stat-label">Reviews</span>
                </div>
              </div>
              <div className="dash-stat">
                <div className="dash-stat-icon amber"><i className="bi bi-star-fill"></i></div>
                <div className="dash-stat-body">
                  <span className="dash-stat-value">{reviews.length ? `${avgReviewRating.toFixed(1)}/5` : "-"}</span>
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
              <div className="reviews-toolbar split">
                <div className="input-group">
                  <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                  <input
                    className="form-control"
                    placeholder="Search by property, comment, customer, agent..."
                    value={reviewQuery}
                    onChange={(e) => setReviewQuery(e.target.value)}
                  />
                </div>
                <div className="reviews-toolbar-right">
                  <select className="form-select reviews-filter-select" value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value)}>
                    <option value="all">All Reviews</option>
                    <option value="pending">Needs Action</option>
                    <option value="addressed">Addressed</option>
                    <option value="low">Low Rating (1-2)</option>
                    <option value="high">High Rating (4-5)</option>
                    <option value="pinned">Pinned Insights</option>
                  </select>
                  <select className="form-select reviews-filter-select" value={reviewAgentFilter} onChange={(e) => setReviewAgentFilter(e.target.value)}>
                    <option value="all">All Agents</option>
                    {reviewAgents.map((agent) => (
                      <option key={agent} value={agent}>{formatAgentIdentity(agent)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="reviews-modern-grid">
                {filteredReviews.map((reviewData) => {
                  const addressed = Boolean(reviewData.addressedAt);
                  return (
                    <article key={reviewData.id} className={`review-modern-card ${addressed ? "review-addressed" : "review-pending"}`}>
                      <div className="review-modern-media">
                        <img
                          className="review-modern-thumb"
                          src={getPropertyImage(reviewData)}
                          alt={reviewData.propertyTitle || "Property"}
                          onError={(e) => handlePropertyImageError(e, { id: reviewData.propertyId, title: reviewData.propertyTitle, location: reviewData.location })}
                        />
                      </div>
                      <div className="review-modern-body">
                        <div className="review-modern-top">
                          <div>
                            <div className="fw-bold">{reviewData.propertyTitle || "Property"}</div>
                            <div className="small muted">{reviewData.location || "-"} | {formatAgentIdentity(reviewData.agent)}</div>
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

        {tab === "office-meets" && (
          <section className="agent-panel">
            <div className="agent-panel-head"><h3>All Office Meeting Requests</h3><span className="badge badge-soft">{meets.length}</span></div>
            <div className="table-responsive">
              <table className="table align-middle admin-modern-table">
                <thead><tr><th>Requester</th><th>Date/Time</th><th>Mode</th><th>Status</th></tr></thead>
                <tbody>
                  {meets.slice().reverse().map((m) => {
                    const st = normalizeWorkflowStatus(m.status, "office_meeting");
                    return (
                      <tr key={m.id}>
                        <td>
                          <div className="fw-bold">{m.fullName || m.customer || m.requestedBy || "-"}</div>
                          <div className="small muted">{m.email || "-"}</div>
                          <div className="small muted">@{m.customer || m.requestedBy || "-"}</div>
                        </td>
                        <td>{formatDateTimeLabel(m.date, m.time)}</td>
                        <td>{m.mode === "virtual" ? "Virtual" : "In Office"}</td>
                        <td><span className={statusBadgeClass(st, "office_meeting")}>{formatWorkflowStatus(st, "office_meeting")}</span></td>
                      </tr>
                    );
                  })}
                  {!meets.length && <tr><td colSpan="4" className="text-muted">No office meeting requests yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "trips" && (
          <section className="agent-panel">
            <div className="trip-page-head">
              <div>
                <h3>All Trips</h3>
                <p>Monitor all scheduled property trips.</p>
              </div>
              <span className="badge badge-soft">{trips.length}</span>
            </div>

            <div className="trip-section-title">Upcoming Trips</div>
            <div className="trip-list-stack">
              {upcomingAdminTrips.slice().reverse().map((t) => {
                const status = tripStatus(t);
                const statusLabel = formatWorkflowStatus(status, "tour");
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
                          <span><i className="bi bi-person"></i> {formatAgentIdentity(t.agent)}</span>
                          <span><i className="bi bi-person"></i> Customer: {t.customer ? `@${t.customer}` : "-"}</span>
                          <span><i className="bi bi-calendar3"></i> {formatDateTimeLabel(t.date, t.time)}</span>
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
                  </article>
                );
              })}
              {!upcomingAdminTrips.length && <div className="agent-empty"><i className="bi bi-car-front"></i><p>No upcoming trips.</p></div>}
            </div>

            <div className="trip-section-title mt-3">Past Trips</div>
            <div className="trip-list-stack">
              {pastAdminTrips.slice().reverse().map((t) => {
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
              {!trips.length ? (
                <div className="agent-empty large trip-empty-clean">
                  <i className="bi bi-car-front"></i>
                  <h4>No trips available</h4>
                  <p>Trips scheduled by agents will appear here.</p>
                </div>
              ) : !pastAdminTrips.length ? (
                <div className="agent-empty"><i className="bi bi-clock-history"></i><p>No past trips yet.</p></div>
              ) : null}
            </div>
          </section>
        )}

        {tab === "profile" && (
          <section className="agent-panel customer-profile-panel">
            <div className="customer-profile-head">
              <div className="d-flex align-items-center gap-3">
                <span className="agent-avatar customer-profile-avatar">
                  {(profileForm.fullName || user?.username || "A").charAt(0).toUpperCase()}
                </span>
                <div>
                  <h3>{profileForm.fullName || "-"}</h3>
                  <div className="small muted">@{user?.username} | Administrator</div>
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
