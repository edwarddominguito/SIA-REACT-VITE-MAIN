const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/i;
const PHONE_RE = /^[0-9+\-()\s]{7,20}$/;

export function cleanText(value, maxLen = 240) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export function cleanEmail(value) {
  return cleanText(value, 120).toLowerCase();
}

export function cleanUsername(value) {
  return cleanText(value, 40).replace(/\s+/g, "").toLowerCase();
}

export function cleanPhone(value) {
  return cleanText(value, 30);
}

export function isValidEmail(value) {
  return EMAIL_RE.test(cleanEmail(value));
}

export function isValidUsername(value) {
  return USERNAME_RE.test(cleanUsername(value));
}

export function isValidPhone(value) {
  return PHONE_RE.test(cleanPhone(value));
}

export function isStrongEnoughPassword(value, min = 6) {
  return String(value || "").trim().length >= min;
}

export function toNonNegativeNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export function createEntityId(prefix = "ID") {
  const upperPrefix = String(prefix || "ID").toUpperCase();
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${upperPrefix}-${crypto.randomUUID().split("-")[0].toUpperCase()}`;
    }
  } catch {
    // noop fallback below
  }
  const rand = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `${upperPrefix}-${rand}`;
}

export function isFutureOrNowSlot(dateValue, timeValue) {
  const date = String(dateValue || "");
  const time = String(timeValue || "");
  if (!date || !time) return false;
  const dt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getTime() >= Date.now();
}

function parseTimeInMinutes(timeValue) {
  const value = String(timeValue || "").trim();
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

export function getOperatingHoursForDate(dateValue) {
  const fallback = {
    isClosed: false,
    minTime: "08:00",
    maxTime: "17:00",
    label: "8:00 AM to 5:00 PM"
  };
  const date = String(dateValue || "").trim();
  if (!date) return fallback;
  const dt = new Date(`${date}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return fallback;
  const day = dt.getDay();
  if (day === 0) {
    return {
      isClosed: true,
      minTime: "",
      maxTime: "",
      label: "Closed on Sunday"
    };
  }
  if (day === 6) {
    return {
      isClosed: false,
      minTime: "08:00",
      maxTime: "13:00",
      label: "8:00 AM to 1:00 PM (Saturday)"
    };
  }
  return fallback;
}

export function isWithinOperatingHours(dateValue, timeValue) {
  const totalMinutes = parseTimeInMinutes(timeValue);
  if (totalMinutes === null) return false;
  const hours = getOperatingHoursForDate(dateValue);
  if (hours.isClosed) return false;
  const minMinutes = parseTimeInMinutes(hours.minTime);
  const maxMinutes = parseTimeInMinutes(hours.maxTime);
  if (minMinutes === null || maxMinutes === null) return false;
  return totalMinutes >= minMinutes && totalMinutes <= maxMinutes;
}

export function normalizeDateTimeInput(dateValue, timeValue) {
  return {
    date: String(dateValue || "").trim(),
    time: String(timeValue || "").trim()
  };
}
