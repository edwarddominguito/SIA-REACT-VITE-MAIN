export const SYNC_KEYS = Object.freeze([
  "allUsers",
  "allProperties",
  "allAppointments",
  "officeMeets",
  "allTrips",
  "allReviews",
  "allNotifications"
]);

export const USER_ROLES = Object.freeze(["admin", "agent", "customer"]);
export const CURRENT_USER_KEY = "currentUser";
export const SESSION_SCOPED_DATA_KEYS = Object.freeze([...SYNC_KEYS]);

export const ADMIN_NAV_ITEMS = Object.freeze([
  { id: "dashboard", label: "Dashboard", icon: "bi-grid" },
  { id: "users", label: "Users", icon: "bi-people" },
  { id: "properties", label: "Properties", icon: "bi-buildings" },
  { id: "appointments", label: "Appointments", icon: "bi-calendar2-week" },
  { id: "office-meets", label: "Office Meetings", icon: "bi-building" },
  { id: "trips", label: "Trips", icon: "bi-car-front" },
  { id: "calendar", label: "Calendar", icon: "bi-calendar3" },
  { id: "messages", label: "Messages", icon: "bi-chat-dots" },
  { id: "reviews", label: "Reviews", icon: "bi-star" },
  { id: "profile", label: "Profile", icon: "bi-person-circle" }
]);

export const ADMIN_ADD_USER_NAV_ITEMS = Object.freeze([
  { id: "dashboard", label: "Dashboard", icon: "bi-grid" },
  { id: "users", label: "Users", icon: "bi-people" },
  { id: "properties", label: "Properties", icon: "bi-buildings" },
  { id: "appointments", label: "Appointments", icon: "bi-calendar2-week" },
  { id: "office-meets", label: "Office Meetings", icon: "bi-building" },
  { id: "trips", label: "Trips", icon: "bi-car-front" },
  { id: "calendar", label: "Calendar", icon: "bi-calendar3" },
  { id: "reviews", label: "Reviews", icon: "bi-star" },
  { id: "profile", label: "Profile", icon: "bi-person-circle" }
]);

export const AGENT_NAV_ITEMS = Object.freeze([
  { id: "dashboard", label: "Dashboard", icon: "bi-grid" },
  { id: "properties", label: "Properties", icon: "bi-house-door" },
  { id: "appointments", label: "Appointments", icon: "bi-calendar2-week" },
  { id: "meets", label: "Office Meetings", icon: "bi-building" },
  { id: "trips", label: "Trips", icon: "bi-car-front" },
  { id: "calendar", label: "Calendar", icon: "bi-calendar3" },
  { id: "messages", label: "Messages", icon: "bi-chat-dots" },
  { id: "reviews", label: "Reviews", icon: "bi-star" },
  { id: "profile", label: "Profile", icon: "bi-person-circle" }
]);

export const CUSTOMER_NAV_ITEMS = Object.freeze([
  { id: "dashboard", label: "Dashboard", icon: "bi-grid-1x2" },
  { id: "browse", label: "Book Appointment", icon: "bi-house-add" },
  { id: "appointments", label: "My Appointments", icon: "bi-calendar2-check" },
  { id: "meets", label: "Office Meetings", icon: "bi-building" },
  { id: "trips", label: "My Trips", icon: "bi-map" },
  { id: "calendar", label: "Calendar", icon: "bi-calendar3" },
  { id: "messages", label: "Messages", icon: "bi-chat-dots" },
  { id: "reviews", label: "Reviews", icon: "bi-star" },
  { id: "profile", label: "Profile", icon: "bi-person-circle" }
]);
