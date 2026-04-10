const LEGACY_REAL_ESTATE_IMAGE_POOL = [
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1572120360610-d971b9d7767c?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600607687644-c7f34b5fba5f?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600607686527-6fb886090705?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600121848594-d8644e57abab?auto=format&fit=crop&w=1600&q=80"
];

const PREVIOUS_AUTO_IMAGE_POOL = [
  ...LEGACY_REAL_ESTATE_IMAGE_POOL,
  "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1600&q=80"
];

const REAL_ESTATE_IMAGE_POOL = [
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1576941089067-2de3c901e126?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600607687644-c7f34b5fba5f?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600607686527-6fb886090705?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1572120360610-d971b9d7767c?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1600121848594-d8644e57abab?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1560185007-5f0bb1866cab?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1480074568708-e7b720bb3f09?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1501183638710-841dd1904471?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1516455590571-18256e5bb9ff?auto=format&fit=crop&w=1600&q=80"
];

const LEGACY_IMAGE_SET = new Set(PREVIOUS_AUTO_IMAGE_POOL);
const AUTO_IMAGE_MAP_KEY = "propertyAutoImageMapV2";
const IMAGE_FILE_EXTENSION_RE = /\.(png|jpe?g|webp|gif|avif|svg)(?:[?#].*)?$/i;
const PROPERTY_ASSET_IMAGES = import.meta.glob("../assets/images/*.{png,jpg,jpeg,webp,gif,avif,svg}", {
  eager: true,
  import: "default"
});
const PROPERTY_ASSET_IMAGE_MAP = new Map();
const PROPERTY_ASSET_IMAGE_NAMES = [];

Object.entries(PROPERTY_ASSET_IMAGES).forEach(([sourcePath, assetUrl]) => {
  const normalizedSourcePath = String(sourcePath || "").replace(/\\/g, "/");
  const filename = normalizedSourcePath.split("/").pop() || "";
  const normalizedAssetUrl = String(assetUrl || "").trim();
  if (!filename || !normalizedAssetUrl) return;

  PROPERTY_ASSET_IMAGE_NAMES.push(filename);
  const candidates = [
    filename,
    `assets/images/${filename}`,
    `src/assets/images/${filename}`,
    normalizedSourcePath.replace(/^\.\.\//, "")
  ];
  candidates.forEach((candidate) => {
    PROPERTY_ASSET_IMAGE_MAP.set(candidate.toLowerCase(), normalizedAssetUrl);
  });
});

export const propertyAssetImageNames = Array.from(new Set(PROPERTY_ASSET_IMAGE_NAMES)).sort((a, b) => a.localeCompare(b));

const isUsableImageUrl = (value) => {
  const candidate = String(value || "").trim();
  if (!candidate) return false;

  const normalized = candidate.toLowerCase();
  if (normalized.startsWith("c:\\") || normalized.startsWith("file:") || normalized.includes("fakepath")) {
    return false;
  }

  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("data:image/") ||
    normalized.startsWith("blob:") ||
    (normalized.startsWith("/") && IMAGE_FILE_EXTENSION_RE.test(candidate))
  );
};

export const resolvePropertyImageSource = (value) => {
  const candidate = String(value || "").trim().replace(/\\/g, "/");
  if (!candidate) return "";
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(candidate)) return candidate;
  if (candidate.startsWith("/")) {
    return IMAGE_FILE_EXTENSION_RE.test(candidate) ? candidate : "";
  }

  const normalized = candidate.replace(/^\.\/+/, "").replace(/^\/+/, "");
  const bundled = PROPERTY_ASSET_IMAGE_MAP.get(normalized.toLowerCase()) || PROPERTY_ASSET_IMAGE_MAP.get((normalized.split("/").pop() || "").toLowerCase());
  if (bundled) return bundled;
  if (!IMAGE_FILE_EXTENSION_RE.test(normalized)) return "";
  if (normalized.startsWith("property-images/")) return `/${normalized}`;
  if (!normalized.includes("/")) return `/property-images/${normalized}`;
  return `/${normalized}`;
};

export const propertyCoverImage = (property) => {
  const explicitCover = resolvePropertyImageSource(property?.imageUrl);
  if (explicitCover && !LEGACY_IMAGE_SET.has(explicitCover) && isUsableImageUrl(explicitCover)) {
    return explicitCover;
  }

  if (Array.isArray(property?.imageUrls)) {
    for (const candidate of property.imageUrls) {
      const resolved = resolvePropertyImageSource(candidate);
      if (resolved && !LEGACY_IMAGE_SET.has(resolved) && isUsableImageUrl(resolved)) {
        return resolved;
      }
    }
  }

  return autoPropertyImage(property);
};

export const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0 });

const STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  rescheduled: "Rescheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  no_show: "No-show",
  expired: "Expired"
};

const APPOINTMENT_TYPE_LABELS = {
  property_viewing: "Property Viewing",
  virtual_tour: "Virtual Tour",
  consultation: "Consultation"
};

export const normalizeWorkflowStatus = (statusLike, kind = "generic") => {
  const raw = String(statusLike || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!raw) {
    return kind === "tour" ? "confirmed" : "pending";
  }
  if (raw === "approved") return "confirmed";
  if (raw === "done" || raw === "completed") return "completed";
  if (raw === "planned" || raw === "scheduled" || raw === "ongoing" || raw === "in_progress") {
    return kind === "tour" ? "confirmed" : "confirmed";
  }
  if (raw === "canceled") return "cancelled";
  if (raw === "declined" && kind === "appointment") return "cancelled";
  if (raw in STATUS_LABELS) return raw;
  return kind === "tour" ? "confirmed" : "pending";
};

export const formatWorkflowStatus = (statusLike, kind = "generic") => STATUS_LABELS[normalizeWorkflowStatus(statusLike, kind)] || "Pending";
export const isTerminalStatus = (statusLike, kind = "generic") => {
  const normalized = normalizeWorkflowStatus(statusLike, kind);
  return normalized === "completed" || normalized === "cancelled" || normalized === "declined" || normalized === "no_show" || normalized === "expired";
};
export const isActiveStatus = (statusLike, kind = "generic") => !isTerminalStatus(statusLike, kind);

export const normalizeListingType = (listingTypeLike, propertyLike = {}) => {
  const raw = String(listingTypeLike || "").trim().toLowerCase();
  if (raw === "for rent" || raw === "for_rent") return "rent";
  if (raw === "for sale" || raw === "for_sale") return "sale";
  if (raw === "rent" || raw === "sale") return raw;
  const searchable = `${propertyLike?.title || ""} ${propertyLike?.description || ""}`.toLowerCase();
  if (/\b(rent|rental|lease|monthly)\b/.test(searchable)) return "rent";
  return "sale";
};

export const normalizePropertyStatus = (statusLike) => {
  const raw = String(statusLike || "").trim().toLowerCase();
  if (raw === "pending") return "reserved";
  if (raw === "unavailable") return "inactive";
  if (raw === "available" || raw === "reserved" || raw === "sold" || raw === "rented" || raw === "archived" || raw === "inactive") return raw;
  return "available";
};

export const isDisplayableProperty = (propertyLike) => {
  const normalized = normalizePropertyStatus(propertyLike?.propertyStatus || propertyLike?.status);
  return normalized !== "archived";
};

export const propertyPriceLabel = (propertyLike) => {
  return `PHP ${money(propertyLike?.price)}`;
};

export const listingTypeLabel = (propertyLike) => normalizeListingType(propertyLike?.listingType, propertyLike) === "rent" ? "For Rent" : "For Sale";
export const propertyStatusLabel = (propertyLike) => {
  const normalized = normalizePropertyStatus(propertyLike?.propertyStatus || propertyLike?.status);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export const appointmentTypeLabel = (typeLike) => {
  const normalized = String(typeLike || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return APPOINTMENT_TYPE_LABELS[normalized] || "Property Viewing";
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/;

export const dateOnlyValue = (dateLike) => {
  if (!dateLike) return "";
  if (dateLike instanceof Date && !Number.isNaN(dateLike.getTime())) {
    const year = dateLike.getFullYear();
    const month = String(dateLike.getMonth() + 1).padStart(2, "0");
    const day = String(dateLike.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const raw = String(dateLike || "").trim();
  if (!raw) return "";
  if (DATE_ONLY_RE.test(raw)) return raw;
  const match = raw.match(ISO_DATE_PREFIX_RE);
  if (match?.[1]) return match[1];

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const eventDateTimeStamp = (dateLike, timeLike = "") => {
  const normalizedDate = dateOnlyValue(dateLike);
  if (!normalizedDate) return Number.NaN;

  const [year, month, day] = normalizedDate.split("-").map(Number);
  if (![year, month, day].every(Number.isInteger)) return Number.NaN;

  const rawTime = String(timeLike || "").trim();
  const match = rawTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  const hours = match ? Number(match[1]) : 0;
  const minutes = match ? Number(match[2]) : 0;

  const stamp = new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
  return Number.isNaN(stamp) ? Number.NaN : stamp;
};

export const formatClockTime = (timeLike, fallback = "-") => {
  const raw = String(timeLike || "").trim();
  if (!raw) return fallback;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return raw;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return raw;
  }
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
};

export const formatDateTimeLabel = (dateLike, timeLike, options = {}) => {
  const date = String(dateLike || "").trim();
  const time = formatClockTime(timeLike, "");
  const joiner = options?.joiner || " ";
  if (date && time) return `${date}${joiner}${time}`;
  if (date) return date;
  if (time) return time;
  return options?.fallback || "-";
};

export const statusBadgeClass = (status, kind = "generic") => `badge badge-soft status-${normalizeWorkflowStatus(status, kind)}`;

const dedupeTripPeople = (values = []) => {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  });
  return out;
};

export const tripAttendees = (trip) => {
  if (Array.isArray(trip?.attendees)) return dedupeTripPeople(trip.attendees);
  if (Array.isArray(trip?.members)) return dedupeTripPeople(trip.members);
  if (trip?.customer) return dedupeTripPeople([trip.customer]);
  return [];
};

export const tripStatus = (trip) => {
  return normalizeWorkflowStatus(trip?.status || "confirmed", "tour");
};

const hashString = (value) => {
  const input = String(value || "");
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const readAutoImageMap = () => {
  try {
    const raw = localStorage.getItem(AUTO_IMAGE_MAP_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeAutoImageMap = (map) => {
  try {
    localStorage.setItem(AUTO_IMAGE_MAP_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage failures and just use in-memory fallback behavior.
  }
};

const propertyImageKey = (property) => {
  const id = String(property?.id || "").trim();
  if (id) return `id:${id}`;
  const title = String(property?.title || "property").trim().toLowerCase();
  const location = String(property?.location || "city").trim().toLowerCase();
  const price = String(property?.price || "").trim();
  return `meta:${title}|${location}|${price}`;
};

const pickUniquePoolImage = (key, map) => {
  const existing = map[key];
  if (existing && REAL_ESTATE_IMAGE_POOL.includes(existing)) return existing;

  const used = new Set(Object.values(map));
  const start = hashString(key) % REAL_ESTATE_IMAGE_POOL.length;
  let chosen = REAL_ESTATE_IMAGE_POOL[start];

  for (let step = 0; step < REAL_ESTATE_IMAGE_POOL.length; step += 1) {
    const idx = (start + step) % REAL_ESTATE_IMAGE_POOL.length;
    const candidate = REAL_ESTATE_IMAGE_POOL[idx];
    if (!used.has(candidate)) {
      chosen = candidate;
      break;
    }
  }

  map[key] = chosen;
  writeAutoImageMap(map);
  return chosen;
};

export const autoPropertyImage = (property) => {
  const key = propertyImageKey(property);
  const map = readAutoImageMap();
  return pickUniquePoolImage(key, map);
};

export const makePropertyFallbackImage = (label) => {
  const safeLabel = String(label || "Property").slice(0, 28);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='700' viewBox='0 0 1200 700'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='#dbe7f6'/>
        <stop offset='100%' stop-color='#f0e6d8'/>
      </linearGradient>
    </defs>
    <rect width='1200' height='700' fill='url(#g)'/>
    <g fill='#1f3a5f' opacity='0.25'>
      <rect x='120' y='250' width='230' height='170' rx='12'/>
      <rect x='385' y='210' width='320' height='210' rx='12'/>
      <rect x='740' y='165' width='340' height='255' rx='12'/>
    </g>
    <text x='600' y='520' text-anchor='middle' font-family='Segoe UI, sans-serif' font-size='40' fill='#1d232f'>${safeLabel}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export const applyPropertyImageFallback = (image, property) => {
  if (!image) return;

  const poolSize = REAL_ESTATE_IMAGE_POOL.length;
  if (poolSize <= 0) {
    image.onerror = null;
    image.src = makePropertyFallbackImage(property?.title || "Property");
    return;
  }

  const startIndex = Number(image.dataset.poolStartIndex || "-1");
  const attempts = Number(image.dataset.poolAttempts || "0");

  if (startIndex < 0 || attempts <= 0) {
    const firstFallback = autoPropertyImage(property || {});
    const firstIndex = REAL_ESTATE_IMAGE_POOL.indexOf(firstFallback);
    if (firstIndex < 0 || !firstFallback) {
      image.onerror = null;
      image.src = makePropertyFallbackImage(property?.title || "Property");
      return;
    }
    image.dataset.poolStartIndex = String(firstIndex);
    image.dataset.poolAttempts = "1";
    image.src = firstFallback;
    return;
  }

  if (attempts < poolSize) {
    const nextIndex = (startIndex + attempts) % poolSize;
    image.dataset.poolAttempts = String(attempts + 1);
    image.src = REAL_ESTATE_IMAGE_POOL[nextIndex];
    return;
  }

  if (image.dataset.localFallbackApplied !== "1") {
    image.dataset.localFallbackApplied = "1";
    image.onerror = null;
    image.src = makePropertyFallbackImage(property?.title || "Property");
  }
};

export const propertyGalleryImages = (property, { includeCover = true } = {}) => {
  const images = [];
  const seen = new Set();
  const push = (candidate) => {
    const cleaned = resolvePropertyImageSource(candidate);
    if (!cleaned || seen.has(cleaned) || LEGACY_IMAGE_SET.has(cleaned) || !isUsableImageUrl(cleaned)) return;
    seen.add(cleaned);
    images.push(cleaned);
  };

  const coverImage = propertyCoverImage(property);
  if (includeCover) {
    push(coverImage);
  } else if (coverImage) {
    seen.add(coverImage);
  }
  if (Array.isArray(property?.imageUrls)) {
    property.imageUrls.forEach(push);
  }

  if (!images.length) {
    images.push(autoPropertyImage(property));
  }

  return images.slice(0, includeCover ? 5 : 4);
};

export const withImage = (property) => {
  return propertyCoverImage(property) || autoPropertyImage(property);
};

export const resolveAppointmentImage = (appointment, properties = []) => {
  const explicit = resolvePropertyImageSource(appointment?.propertyImage);
  if (explicit && !LEGACY_IMAGE_SET.has(explicit) && isUsableImageUrl(explicit)) {
    return explicit;
  }

  const matchedProperty =
    properties.find((p) => String(p.id) === String(appointment?.propertyId)) ||
    properties.find((p) => p.title === appointment?.propertyTitle && p.location === appointment?.location);

  return withImage(
    matchedProperty || {
      id: appointment?.propertyId,
      title: appointment?.propertyTitle,
      location: appointment?.location,
      imageUrl: appointment?.imageUrl || "",
      imageUrls: Array.isArray(appointment?.imageUrls) ? appointment.imageUrls : []
    }
  );
};

export const normalizeAppointmentImages = (appointments = [], properties = []) => {
  let changed = false;
  const next = appointments.map((appointment) => {
    const resolved = resolveAppointmentImage(appointment, properties);
    if (String(appointment?.propertyImage || "").trim() === resolved) return appointment;
    changed = true;
    return { ...appointment, propertyImage: resolved };
  });
  return { next, changed };
};
