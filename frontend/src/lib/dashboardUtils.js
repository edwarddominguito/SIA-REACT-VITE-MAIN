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

export const REAL_ESTATE_IMAGE_POOL = [
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
    normalized.startsWith("/")
  );
};

export const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0 });

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

export const statusBadgeClass = (status) => `badge badge-soft status-${(status || "pending").toLowerCase()}`;

export const tripAttendees = (trip) => {
  if (Array.isArray(trip?.attendees)) return trip.attendees;
  if (Array.isArray(trip?.members)) return trip.members;
  return [];
};

export const tripStatus = (trip) => String(trip?.status || "planned").toLowerCase();

export const tripCustomerLabel = (trip) => {
  const explicit = String(trip?.customer || "").trim();
  if (explicit) return explicit;
  const attendees = tripAttendees(trip);
  return attendees.length ? attendees[0] : "-";
};

export const tripPropertyIds = (trip) => {
  if (Array.isArray(trip?.propertyIds)) return trip.propertyIds.map((id) => String(id));
  if (Array.isArray(trip?.properties)) return trip.properties.map((id) => String(id));
  if (trip?.propertyId) return [String(trip.propertyId)];
  return [];
};

export const estimateTripTravelMinutes = (stopCount) => {
  const n = Number(stopCount || 0);
  if (n <= 0) return 0;
  if (n === 1) return 12;
  return 12 + (n - 1) * 18;
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

export const withImage = (property) => {
  const candidate = String(property?.imageUrl || "").trim();
  if (candidate && !LEGACY_IMAGE_SET.has(candidate) && isUsableImageUrl(candidate)) return candidate;
  return autoPropertyImage(property);
};

export const resolveAppointmentImage = (appointment, properties = []) => {
  const explicit = String(appointment?.propertyImage || "").trim();
  if (explicit) return explicit;
  const matchedProperty = properties.find((p) => String(p.id) === String(appointment?.propertyId));
  return withImage(
    matchedProperty || {
      id: appointment?.propertyId,
      title: appointment?.propertyTitle,
      location: appointment?.location,
      imageUrl: ""
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
