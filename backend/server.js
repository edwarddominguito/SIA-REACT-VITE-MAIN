import "dotenv/config";
import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import fs from "fs";
import helmet from "helmet";
import hpp from "hpp";
import mysql from "mysql2/promise";
import morgan from "morgan";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { fileURLToPath } from "url";

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || 3000);
const REQUEST_SIZE_LIMIT = process.env.REQUEST_SIZE_LIMIT || "200kb";
const IDEMPOTENCY_TTL_MS = Number(process.env.IDEMPOTENCY_TTL_MS || 30000);
const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "sia_realestate";

app.disable("x-powered-by");
app.set("trust proxy", 1);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const legacyDbPath = path.join(__dirname, "data", "db.json");

const defaultDb = {
  users: [],
  properties: [],
  appointments: [],
  officeMeets: [],
  reviews: [],
  notifications: [],
  trips: []
};

const demoUsers = [
  {
    id: "demo_admin",
    username: "admin",
    password: "admin123",
    role: "admin",
    fullName: "System Admin",
    phone: "09123456789",
    email: "admin@email.com",
    photoUrl: "",
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "demo_agent",
    username: "agent",
    password: "agent123",
    role: "agent",
    fullName: "Demo Agent",
    phone: "09999999999",
    email: "agent@email.com",
    photoUrl: "",
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "demo_customer",
    username: "customer",
    password: "customer123",
    role: "customer",
    fullName: "Demo Customer",
    phone: "09888888888",
    email: "customer@email.com",
    photoUrl: "",
    createdAt: "2026-01-01T00:00:00.000Z"
  }
];

let cachedDb = null;
let updateQueue = Promise.resolve();
const idempotencyStore = new Map();
let schemaReadyPromise = null;
const dbPool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0
});

const ensureDbSchema = async () => {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(90) NOT NULL,
      email VARCHAR(120),
      phone VARCHAR(30),
      role ENUM('admin','agent','customer') NOT NULL DEFAULT 'customer',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS properties (
      id VARCHAR(64) PRIMARY KEY,
      agent_user_id VARCHAR(64) NULL,
      title VARCHAR(120) NOT NULL,
      location VARCHAR(140) NOT NULL,
      price DECIMAL(14,2) NOT NULL DEFAULT 0,
      bedrooms INT NULL,
      bathrooms INT NULL,
      area_sqft INT NULL,
      description TEXT NULL,
      image_url TEXT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'available',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_properties_agent
        FOREIGN KEY (agent_user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id VARCHAR(64) PRIMARY KEY,
      property_id VARCHAR(64) NOT NULL,
      customer_user_id VARCHAR(64) NOT NULL,
      assigned_agent_user_id VARCHAR(64) NULL,
      assigned_by_admin_user_id VARCHAR(64) NULL,
      appointment_date DATE NOT NULL,
      appointment_time TIME NOT NULL,
      status ENUM('pending','approved','rescheduled','done','declined','cancelled') NOT NULL DEFAULT 'pending',
      notes TEXT NULL,
      assigned_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_appointments_property
        FOREIGN KEY (property_id) REFERENCES properties(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_appointments_customer
        FOREIGN KEY (customer_user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_appointments_agent
        FOREIGN KEY (assigned_agent_user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_appointments_admin
        FOREIGN KEY (assigned_by_admin_user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS office_meets (
      id VARCHAR(64) PRIMARY KEY,
      customer_user_id VARCHAR(64) NOT NULL,
      assigned_agent_user_id VARCHAR(64) NULL,
      mode ENUM('office','virtual') NOT NULL DEFAULT 'office',
      reason TEXT NOT NULL,
      meet_date DATE NOT NULL,
      meet_time TIME NOT NULL,
      status ENUM('pending','approved','declined','done','cancelled') NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_office_meets_customer
        FOREIGN KEY (customer_user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_office_meets_agent
        FOREIGN KEY (assigned_agent_user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id VARCHAR(64) PRIMARY KEY,
      appointment_id VARCHAR(64) NOT NULL,
      customer_user_id VARCHAR(64) NOT NULL,
      property_id VARCHAR(64) NOT NULL,
      rating TINYINT NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
      CONSTRAINT uq_reviews_appointment_customer UNIQUE (appointment_id, customer_user_id),
      CONSTRAINT fk_reviews_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_reviews_customer
        FOREIGN KEY (customer_user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_reviews_property
        FOREIGN KEY (property_id) REFERENCES properties(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS trips (
      id VARCHAR(64) PRIMARY KEY,
      created_by_agent_user_id VARCHAR(64) NULL,
      customer_user_id VARCHAR(64) NULL,
      trip_date DATE NULL,
      trip_time TIME NULL,
      status ENUM('planned','scheduled','ongoing','done','cancelled') NOT NULL DEFAULT 'planned',
      notes TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_trips_created_by
        FOREIGN KEY (created_by_agent_user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_trips_customer
        FOREIGN KEY (customer_user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS trip_properties (
      trip_id VARCHAR(64) NOT NULL,
      property_id VARCHAR(64) NOT NULL,
      stop_order INT NOT NULL,
      PRIMARY KEY (trip_id, property_id),
      UNIQUE KEY uq_trip_stop_order (trip_id, stop_order),
      CONSTRAINT fk_trip_properties_trip
        FOREIGN KEY (trip_id) REFERENCES trips(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_trip_properties_property
        FOREIGN KEY (property_id) REFERENCES properties(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) PRIMARY KEY,
      recipient_user_id VARCHAR(64) NOT NULL,
      appointment_id VARCHAR(64) NULL,
      office_meet_id VARCHAR(64) NULL,
      type VARCHAR(60) NOT NULL DEFAULT 'general',
      title VARCHAR(120) NOT NULL DEFAULT 'Notification',
      message TEXT NOT NULL,
      meta JSON NULL,
      read_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_notifications_recipient
        FOREIGN KEY (recipient_user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_notifications_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_notifications_office_meet
        FOREIGN KEY (office_meet_id) REFERENCES office_meets(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
};
const ensureDbReady = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = ensureDbSchema().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  await schemaReadyPromise;
};

const normalizeCollection = (value) => (Array.isArray(value) ? value : []);
const clone = (value) => JSON.parse(JSON.stringify(value));
const clean = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const toIso = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
};
const toSqlDateTime = (value, fallbackNow = false) => {
  if (!value && !fallbackNow) return null;
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return fallbackNow ? new Date().toISOString().slice(0, 19).replace("T", " ") : null;
  return d.toISOString().slice(0, 19).replace("T", " ");
};
const toSqlDate = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (isIsoDate(raw)) return raw;
  if (/^[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}$/.test(raw)) {
    const year = new Date().getFullYear();
    const d = new Date(`${raw} ${year}`);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};
const toIsoDateOnly = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const toSqlTime = (value) => {
  const raw = String(value || "").trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return `${raw}:00`;
  if (/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(raw)) return raw;
  return null;
};
const ensureObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const enumOr = (value, allowed, fallback) => {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
};
const toRole = (value) => clean(value, 20).toLowerCase();
const dedupeUsersByUsername = (usersLike) => {
  const list = normalizeCollection(usersLike);
  const byUsername = new Map();
  for (const u of list) {
    const username = String(u?.username || "").trim().toLowerCase();
    if (!username) continue;
    const existing = byUsername.get(username);
    if (!existing) {
      byUsername.set(username, u);
      continue;
    }
    const existingId = String(existing?.id || "");
    const incomingId = String(u?.id || "");
    const existingIsDemo = /^demo_/i.test(existingId);
    const incomingIsDemo = /^demo_/i.test(incomingId);
    if (existingIsDemo && !incomingIsDemo) {
      byUsername.set(username, u);
    }
  }
  return Array.from(byUsername.values());
};
const ensureDemoUsers = (db) => {
  const users = dedupeUsersByUsername(db.users);
  const existingUsernames = new Set(users.map((u) => String(u?.username ?? "").trim().toLowerCase()));
  const missing = demoUsers.filter((u) => !existingUsernames.has(u.username.toLowerCase()));
  if (!missing.length) return { ...db, users };
  return { ...db, users: [...users, ...missing.map((u) => ({ ...u }))] };
};
const parseNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const isHHMM = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const loadDb = async ({ forceReload = false } = {}) => {
  await ensureDbReady();

  const [usersRows] = await dbPool.query(`
    SELECT id, username, password_hash, full_name, email, phone, role, created_at, updated_at
    FROM users
    ORDER BY created_at DESC, id DESC
  `);
  const idToUsername = new Map(usersRows.map((u) => [String(u.id), String(u.username)]));

  const [propertiesRows] = await dbPool.query(`
    SELECT p.id, p.title, p.location, p.price, p.bedrooms, p.bathrooms, p.area_sqft, p.description, p.image_url, p.status,
           p.created_at, p.updated_at, p.agent_user_id, au.username AS agent_username
    FROM properties p
    LEFT JOIN users au ON au.id = p.agent_user_id
    ORDER BY p.created_at DESC, p.id DESC
  `);

  const [appointmentsRows] = await dbPool.query(`
    SELECT a.id, a.property_id, a.customer_user_id, a.assigned_agent_user_id, a.assigned_by_admin_user_id,
           a.appointment_date, a.appointment_time, a.status, a.notes, a.assigned_at, a.created_at, a.updated_at,
           p.title AS property_title, p.location AS property_location, p.image_url AS property_image,
           cu.username AS customer_username, au.username AS assigned_agent_username, ad.username AS assigned_by_admin_username
    FROM appointments a
    LEFT JOIN properties p ON p.id = a.property_id
    LEFT JOIN users cu ON cu.id = a.customer_user_id
    LEFT JOIN users au ON au.id = a.assigned_agent_user_id
    LEFT JOIN users ad ON ad.id = a.assigned_by_admin_user_id
    ORDER BY a.created_at DESC, a.id DESC
  `);

  const [officeMeetRows] = await dbPool.query(`
    SELECT m.id, m.customer_user_id, m.assigned_agent_user_id, m.mode, m.reason, m.meet_date, m.meet_time, m.status, m.created_at, m.updated_at,
           cu.username AS customer_username, cu.full_name AS customer_full_name, cu.email AS customer_email,
           au.username AS assigned_agent_username
    FROM office_meets m
    LEFT JOIN users cu ON cu.id = m.customer_user_id
    LEFT JOIN users au ON au.id = m.assigned_agent_user_id
    ORDER BY m.created_at DESC, m.id DESC
  `);

  const [reviewsRows] = await dbPool.query(`
    SELECT r.id, r.appointment_id, r.customer_user_id, r.property_id, r.rating, r.comment, r.created_at,
           cu.username AS customer_username
    FROM reviews r
    LEFT JOIN users cu ON cu.id = r.customer_user_id
    ORDER BY r.created_at DESC, r.id DESC
  `);

  const [tripsRows] = await dbPool.query(`
    SELECT t.id, t.created_by_agent_user_id, t.customer_user_id, t.trip_date, t.trip_time, t.status, t.notes, t.created_at, t.updated_at,
           ag.username AS agent_username, cu.username AS customer_username
    FROM trips t
    LEFT JOIN users ag ON ag.id = t.created_by_agent_user_id
    LEFT JOIN users cu ON cu.id = t.customer_user_id
    ORDER BY t.created_at DESC, t.id DESC
  `);
  const [tripPropertyRows] = await dbPool.query(`
    SELECT trip_id, property_id, stop_order
    FROM trip_properties
    ORDER BY trip_id ASC, stop_order ASC
  `);
  const tripPropertyMap = new Map();
  tripPropertyRows.forEach((row) => {
    const key = String(row.trip_id);
    const list = tripPropertyMap.get(key) || [];
    list.push(String(row.property_id));
    tripPropertyMap.set(key, list);
  });

  const [notificationsRows] = await dbPool.query(`
    SELECT n.id, n.recipient_user_id, n.appointment_id, n.office_meet_id, n.type, n.title, n.message, n.meta, n.read_at, n.created_at,
           ru.username AS recipient_username
    FROM notifications n
    LEFT JOIN users ru ON ru.id = n.recipient_user_id
    ORDER BY n.created_at DESC, n.id DESC
  `);

  const normalized = {
    ...defaultDb,
    users: usersRows.map((u) => ({
      id: u.id,
      username: u.username,
      password: u.password_hash,
      role: u.role,
      fullName: u.full_name || "",
      email: u.email || "",
      phone: u.phone || "",
      createdAt: toIso(u.created_at),
      updatedAt: toIso(u.updated_at)
    })),
    properties: propertiesRows.map((p) => ({
      id: p.id,
      title: p.title || "",
      location: p.location || "",
      price: parseNumber(p.price),
      bedrooms: p.bedrooms ?? null,
      bathrooms: p.bathrooms ?? null,
      areaSqft: p.area_sqft ?? null,
      description: p.description || "",
      imageUrl: p.image_url || "",
      status: p.status || "available",
      agent: p.agent_username || "",
      createdAt: toIso(p.created_at),
      updatedAt: toIso(p.updated_at)
    })),
    appointments: appointmentsRows.map((a) => ({
      id: a.id,
      propertyId: a.property_id,
      propertyTitle: a.property_title || "",
      location: a.property_location || "",
      propertyImage: a.property_image || "",
      customer: a.customer_username || "",
      agent: a.assigned_agent_username || "",
      assignedAgent: a.assigned_agent_username || "",
      assignedByAdmin: a.assigned_by_admin_username || "",
      date: toIsoDateOnly(a.appointment_date),
      time: a.appointment_time ? String(a.appointment_time).slice(0, 5) : "",
      status: a.status || "pending",
      notes: a.notes || "",
      assignedAt: toIso(a.assigned_at),
      createdAt: toIso(a.created_at),
      updatedAt: toIso(a.updated_at)
    })),
    officeMeets: officeMeetRows.map((m) => ({
      id: m.id,
      fullName: m.customer_full_name || "",
      email: m.customer_email || "",
      customer: m.customer_username || "",
      requestedBy: m.customer_username || "",
      mode: m.mode || "office",
      reason: m.reason || "",
      date: toIsoDateOnly(m.meet_date),
      time: m.meet_time ? String(m.meet_time).slice(0, 5) : "",
      status: m.status || "pending",
      assignedAgent: m.assigned_agent_username || "",
      agent: m.assigned_agent_username || "",
      createdAt: toIso(m.created_at),
      updatedAt: toIso(m.updated_at)
    })),
    reviews: reviewsRows.map((r) => ({
      id: r.id,
      appointmentId: r.appointment_id,
      customer: r.customer_username || "",
      propertyId: r.property_id,
      rating: Number(r.rating || 0),
      comment: r.comment || "",
      createdAt: toIso(r.created_at)
    })),
    notifications: notificationsRows.map((n) => ({
      id: n.id,
      to: n.recipient_username || "",
      type: n.type || "general",
      title: n.title || "Notification",
      message: n.message || "",
      appointmentId: n.appointment_id || "",
      officeMeetId: n.office_meet_id || "",
      meta: ensureObject(typeof n.meta === "string" ? (() => {
        try { return JSON.parse(n.meta); } catch { return {}; }
      })() : n.meta),
      readAt: toIso(n.read_at) || null,
      createdAt: toIso(n.created_at)
    })),
    trips: tripsRows.map((t) => ({
      id: t.id,
      createdBy: t.agent_username || "",
      agent: t.agent_username || "",
      customer: t.customer_username || "",
      date: toIsoDateOnly(t.trip_date),
      time: t.trip_time ? String(t.trip_time).slice(0, 5) : "",
      status: t.status || "planned",
      notes: t.notes || "",
      propertyIds: tripPropertyMap.get(String(t.id)) || [],
      createdAt: toIso(t.created_at),
      updatedAt: toIso(t.updated_at)
    }))
  };
  idToUsername.clear();
  cachedDb = ensureDemoUsers(normalized);
  return clone(cachedDb);
};

const saveDb = async (nextDb) => {
  const normalized = ensureDemoUsers({
    ...defaultDb,
    ...nextDb,
    users: normalizeCollection(nextDb?.users),
    properties: normalizeCollection(nextDb?.properties),
    appointments: normalizeCollection(nextDb?.appointments),
    officeMeets: normalizeCollection(nextDb?.officeMeets),
    reviews: normalizeCollection(nextDb?.reviews),
    notifications: normalizeCollection(nextDb?.notifications),
    trips: normalizeCollection(nextDb?.trips)
  });
  const nextSnapshot = clone(normalized);
  await ensureDbReady();
  const users = dedupeUsersByUsername(nextSnapshot.users);
  nextSnapshot.users = users;
  const properties = normalizeCollection(nextSnapshot.properties);
  const appointments = normalizeCollection(nextSnapshot.appointments);
  const officeMeets = normalizeCollection(nextSnapshot.officeMeets);
  const reviews = normalizeCollection(nextSnapshot.reviews);
  const notifications = normalizeCollection(nextSnapshot.notifications);
  const trips = normalizeCollection(nextSnapshot.trips);

  const usernameToId = new Map();
  const idSet = new Set();
  users.forEach((u) => {
    const id = String(u?.id || "").trim();
    const username = String(u?.username || "").trim();
    if (id) idSet.add(id);
    if (username && id) usernameToId.set(username, id);
  });

  const resolveUserId = (value) => {
    const v = String(value || "").trim();
    if (!v) return null;
    if (idSet.has(v)) return v;
    return usernameToId.get(v) || null;
  };

  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query("DELETE FROM notifications");
    await conn.query("DELETE FROM reviews");
    await conn.query("DELETE FROM trip_properties");
    await conn.query("DELETE FROM appointments");
    await conn.query("DELETE FROM office_meets");
    await conn.query("DELETE FROM trips");
    await conn.query("DELETE FROM properties");
    await conn.query("DELETE FROM users");

    for (const u of users) {
      const id = String(u?.id || "").trim();
      const username = clean(u?.username, 50);
      const password = clean(u?.password, 255);
      const fullName = clean(u?.fullName, 90) || username || "User";
      if (!id || !username || !password) continue;
      const roleRaw = toRole(u?.role);
      const role = roleRaw === "admin" || roleRaw === "agent" ? roleRaw : "customer";
      await conn.query(
        `INSERT INTO users (id, username, password_hash, full_name, email, phone, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          username,
          password,
          fullName,
          clean(u?.email, 120) || null,
          clean(u?.phone, 30) || null,
          role,
          toSqlDateTime(u?.createdAt, true),
          toSqlDateTime(u?.updatedAt, false)
        ]
      );
    }

    const validPropertyIds = new Set();
    for (const p of properties) {
      const id = String(p?.id || "").trim();
      const title = clean(p?.title, 120);
      const location = clean(p?.location, 140);
      if (!id || !title || !location) continue;
      const agentUserId = resolveUserId(p?.agent || p?.agentUserId);
      await conn.query(
        `INSERT INTO properties (id, agent_user_id, title, location, price, bedrooms, bathrooms, area_sqft, description, image_url, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          agentUserId,
          title,
          location,
          parseNumber(p?.price),
          Number.isFinite(Number(p?.bedrooms)) ? Number(p.bedrooms) : null,
          Number.isFinite(Number(p?.bathrooms)) ? Number(p.bathrooms) : null,
          Number.isFinite(Number(p?.areaSqft)) ? Number(p.areaSqft) : null,
          clean(p?.description, 800) || null,
          clean(p?.imageUrl, 1000) || null,
          clean(p?.status, 30) || "available",
          toSqlDateTime(p?.createdAt, true),
          toSqlDateTime(p?.updatedAt, false)
        ]
      );
      validPropertyIds.add(id);
    }

    const validTripIds = new Set();
    const tripPropertyRows = [];
    for (const t of trips) {
      const id = String(t?.id || "").trim();
      if (!id) continue;
      const createdByAgentUserId = resolveUserId(t?.createdBy || t?.agent);
      const customerUserId = resolveUserId(t?.customer);
      await conn.query(
        `INSERT INTO trips (id, created_by_agent_user_id, customer_user_id, trip_date, trip_time, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          createdByAgentUserId,
          customerUserId,
          toSqlDate(t?.date),
          toSqlTime(t?.time),
          enumOr(t?.status, new Set(["planned", "scheduled", "ongoing", "done", "cancelled"]), "planned"),
          clean(t?.notes, 1200) || null,
          toSqlDateTime(t?.createdAt, true),
          toSqlDateTime(t?.updatedAt, false)
        ]
      );
      validTripIds.add(id);
      const propertyIds = Array.isArray(t?.propertyIds)
        ? t.propertyIds
        : Array.isArray(t?.properties)
          ? t.properties
          : t?.propertyId
            ? [t.propertyId]
            : [];
      const seenTripPropertyIds = new Set();
      propertyIds.forEach((propertyId, index) => {
        const pid = String(propertyId || "").trim();
        if (!pid || !validPropertyIds.has(pid)) return;
        if (seenTripPropertyIds.has(pid)) return;
        seenTripPropertyIds.add(pid);
        tripPropertyRows.push([id, pid, index + 1]);
      });
    }

    const validAppointmentIds = new Set();
    for (const a of appointments) {
      const id = String(a?.id || "").trim();
      const propertyId = String(a?.propertyId || "").trim();
      const customerUserId = resolveUserId(a?.customer);
      const appointmentDate = toSqlDate(a?.date);
      const appointmentTime = toSqlTime(a?.time);
      if (!id || !propertyId || !validPropertyIds.has(propertyId) || !customerUserId || !appointmentDate || !appointmentTime) continue;
      const assignedAgentUserId = resolveUserId(a?.assignedAgent || a?.agent);
      const assignedByAdminUserId = resolveUserId(a?.assignedByAdmin);
      await conn.query(
        `INSERT INTO appointments (id, property_id, customer_user_id, assigned_agent_user_id, assigned_by_admin_user_id, appointment_date, appointment_time, status, notes, assigned_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          propertyId,
          customerUserId,
          assignedAgentUserId,
          assignedByAdminUserId,
          appointmentDate,
          appointmentTime,
          enumOr(a?.status, new Set(["pending", "approved", "rescheduled", "done", "declined", "cancelled"]), "pending"),
          clean(a?.notes, 1500) || null,
          toSqlDateTime(a?.assignedAt, false),
          toSqlDateTime(a?.createdAt, true),
          toSqlDateTime(a?.updatedAt, false)
        ]
      );
      validAppointmentIds.add(id);
    }

    const validOfficeMeetIds = new Set();
    for (const m of officeMeets) {
      const id = String(m?.id || "").trim();
      const customerUserId = resolveUserId(m?.customer || m?.requestedBy);
      const meetDate = toSqlDate(m?.date);
      const meetTime = toSqlTime(m?.time);
      if (!id || !customerUserId || !meetDate || !meetTime) continue;
      const mode = clean(m?.mode, 20).toLowerCase() === "virtual" ? "virtual" : "office";
      const assignedAgentUserId = resolveUserId(m?.assignedAgent || m?.agent);
      await conn.query(
        `INSERT INTO office_meets (id, customer_user_id, assigned_agent_user_id, mode, reason, meet_date, meet_time, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          customerUserId,
          assignedAgentUserId,
          mode,
          clean(m?.reason, 1200) || "Meeting request",
          meetDate,
          meetTime,
          enumOr(m?.status, new Set(["pending", "approved", "declined", "done", "cancelled"]), "pending"),
          toSqlDateTime(m?.createdAt, true),
          toSqlDateTime(m?.updatedAt, false)
        ]
      );
      validOfficeMeetIds.add(id);
    }

    for (const r of reviews) {
      const id = String(r?.id || "").trim();
      const appointmentId = String(r?.appointmentId || "").trim();
      const propertyId = String(r?.propertyId || "").trim();
      const customerUserId = resolveUserId(r?.customer);
      const rating = Number(r?.rating);
      if (!id || !appointmentId || !propertyId || !customerUserId || !validAppointmentIds.has(appointmentId) || !validPropertyIds.has(propertyId)) continue;
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) continue;
      await conn.query(
        `INSERT INTO reviews (id, appointment_id, customer_user_id, property_id, rating, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          appointmentId,
          customerUserId,
          propertyId,
          Math.round(rating),
          clean(r?.comment, 1500) || "",
          toSqlDateTime(r?.createdAt, true)
        ]
      );
    }

    for (const [tripId, propertyId, stopOrder] of tripPropertyRows) {
      if (!validTripIds.has(tripId) || !validPropertyIds.has(propertyId)) continue;
      await conn.query(
        `INSERT INTO trip_properties (trip_id, property_id, stop_order) VALUES (?, ?, ?)`,
        [tripId, propertyId, stopOrder]
      );
    }

    for (const n of notifications) {
      const id = String(n?.id || "").trim();
      const recipientUserId = resolveUserId(n?.to);
      if (!id || !recipientUserId) continue;
      const appointmentIdRaw = String(n?.appointmentId || "").trim();
      const officeMeetIdRaw = String(n?.officeMeetId || n?.meta?.meetId || "").trim();
      const appointmentId = validAppointmentIds.has(appointmentIdRaw) ? appointmentIdRaw : null;
      const officeMeetId = validOfficeMeetIds.has(officeMeetIdRaw) ? officeMeetIdRaw : null;
      await conn.query(
        `INSERT INTO notifications (id, recipient_user_id, appointment_id, office_meet_id, type, title, message, meta, read_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)`,
        [
          id,
          recipientUserId,
          appointmentId,
          officeMeetId,
          clean(n?.type, 60) || "general",
          clean(n?.title, 120) || "Notification",
          clean(n?.message, 1500) || "",
          JSON.stringify(ensureObject(n?.meta)),
          toSqlDateTime(n?.readAt, false),
          toSqlDateTime(n?.createdAt, true)
        ]
      );
    }

    await conn.commit();
    cachedDb = null;
    await loadDb({ forceReload: true });
  } catch (error) {
    await conn.rollback();
    cachedDb = null;
    throw error;
  } finally {
    conn.release();
  }
};

const updateDb = async (updater) => {
  const task = updateQueue.then(async () => {
    const current = await loadDb({ forceReload: true });
    const next = await updater(current);
    await saveDb(next);
    return await loadDb({ forceReload: true });
  });
  updateQueue = task.catch(() => {});
  return task;
};

const mergeById = (primary, secondary) => {
  const out = [];
  const seen = new Set();
  const add = (item) => {
    if (!item || typeof item !== "object") return;
    const id = String(item.id ?? "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(item);
  };
  normalizeCollection(primary).forEach(add);
  normalizeCollection(secondary).forEach(add);
  return out;
};

const bootstrapFromLegacyJsonIfNeeded = async () => {
  await ensureDbReady();
  if (!fs.existsSync(legacyDbPath)) return;

  try {
    const raw = fs.readFileSync(legacyDbPath, "utf-8");
    const parsed = raw ? JSON.parse(raw) : {};
    const legacyDb = {
      users: normalizeCollection(parsed?.users),
      properties: normalizeCollection(parsed?.properties),
      appointments: normalizeCollection(parsed?.appointments),
      officeMeets: normalizeCollection(parsed?.officeMeets),
      reviews: normalizeCollection(parsed?.reviews),
      notifications: normalizeCollection(parsed?.notifications),
      trips: normalizeCollection(parsed?.trips)
    };
    const hasLegacyData =
      legacyDb.appointments.length > 0 ||
      legacyDb.officeMeets.length > 0 ||
      legacyDb.reviews.length > 0 ||
      legacyDb.notifications.length > 0 ||
      legacyDb.trips.length > 0;
    if (!hasLegacyData) return;
    const current = await loadDb({ forceReload: true });
    const merged = {
      ...defaultDb,
      users: mergeById(current.users, legacyDb.users),
      properties: mergeById(current.properties, legacyDb.properties),
      appointments: mergeById(current.appointments, legacyDb.appointments),
      officeMeets: mergeById(current.officeMeets, legacyDb.officeMeets),
      reviews: mergeById(current.reviews, legacyDb.reviews),
      notifications: mergeById(current.notifications, legacyDb.notifications),
      trips: mergeById(current.trips, legacyDb.trips)
    };
    const changed =
      merged.users.length !== normalizeCollection(current.users).length ||
      merged.properties.length !== normalizeCollection(current.properties).length ||
      merged.appointments.length !== normalizeCollection(current.appointments).length ||
      merged.officeMeets.length !== normalizeCollection(current.officeMeets).length ||
      merged.reviews.length !== normalizeCollection(current.reviews).length ||
      merged.notifications.length !== normalizeCollection(current.notifications).length ||
      merged.trips.length !== normalizeCollection(current.trips).length;
    if (!changed) return;

    await saveDb(merged);
    console.log("Reconciled MySQL data from backend/data/db.json.");
  } catch (error) {
    console.error("Failed to reconcile backend/data/db.json:", error);
  }
};

const parsePositiveInt = (value, fallback) => {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
};

const paginate = (items, req, { defaultLimit = 25, maxLimit = 100 } = {}) => {
  const page = parsePositiveInt(req.query?.page, 1);
  const limit = Math.min(parsePositiveInt(req.query?.limit, defaultLimit), maxLimit);
  const total = items.length;
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  const data = items.slice(start, start + limit);

  return {
    data,
    pagination: {
      page: safePage,
      limit,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1
    }
  };
};

const listOrPaginated = (items, req, options) => {
  const wantsPagination = req.query?.page !== undefined || req.query?.limit !== undefined;
  if (!wantsPagination) return { data: items, pagination: null };
  return paginate(items, req, options);
};

const requireRole = (allowed = []) => (req, res, next) => {
  if (!allowed.length) return next();
  const role = toRole(req.headers["x-user-role"]);
  if (!allowed.includes(role)) {
    return res.status(403).json({ ok: false, message: "Forbidden. Missing required role." });
  }
  return next();
};

const allowedOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

morgan.token("requestId", (req) => req.requestId || "-");
app.use(
  morgan(isProduction ? ":remote-addr :method :url :status :response-time ms req_id=:requestId" : "dev", {
    skip: (req) => req.path === "/health" || req.path === "/api/health"
  })
);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(hpp());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 86400
  })
);

app.use(compression());
app.use(express.json({ limit: REQUEST_SIZE_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: REQUEST_SIZE_LIMIT, parameterLimit: 200 }));

const apiRateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || 400),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Too many requests. Please try again later." }
});

const authRateLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Too many auth attempts. Please wait and retry." }
});

const createRequestFingerprint = (req) => {
  const method = req.method.toUpperCase();
  const url = req.originalUrl || req.url || "";
  const role = clean(req.headers["x-user-role"], 20);
  const idemHeader = clean(req.headers["x-idempotency-key"], 180);
  const bodyString = JSON.stringify(req.body || {});
  const bodyHash = createHash("sha1").update(bodyString).digest("hex");
  return idemHeader || `${method}:${url}:${role}:${bodyHash}`;
};

const idempotencyMiddleware = (req, res, next) => {
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next();

  const key = createRequestFingerprint(req);
  const now = Date.now();
  const existing = idempotencyStore.get(key);
  if (existing && existing.expiresAt > now) {
    if (existing.inFlight) {
      return res.status(409).json({ ok: false, message: "Duplicate request in progress. Please wait." });
    }
    if (existing.body) {
      res.setHeader("X-Idempotent-Replay", "true");
      return res.status(existing.statusCode || 200).json(existing.body);
    }
  }

  const record = { inFlight: true, statusCode: null, body: null, expiresAt: now + IDEMPOTENCY_TTL_MS };
  idempotencyStore.set(key, record);

  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    record.inFlight = false;
    record.statusCode = res.statusCode;
    record.body = payload;
    record.expiresAt = Date.now() + IDEMPOTENCY_TTL_MS;
    return originalJson(payload);
  };

  res.on("close", () => {
    if (record.inFlight) idempotencyStore.delete(key);
  });

  return next();
};

const idempotencyGc = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of idempotencyStore.entries()) {
    if (!record || record.expiresAt <= now) {
      idempotencyStore.delete(key);
    }
  }
}, 30000);
idempotencyGc.unref();

const api = express.Router();
api.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
api.use(apiRateLimiter);
api.use(idempotencyMiddleware);
api.use("/auth", authRateLimiter);

api.get("/health", (req, res) => {
  res.json({ ok: true, service: "api", time: new Date().toISOString() });
});

api.post("/auth/login", asyncHandler(async (req, res) => {
  const username = clean(req.body?.username, 50);
  const password = clean(req.body?.password, 120);

  if (!username || !password) {
    return res.status(400).json({ ok: false, message: "Username and password are required." });
  }

  const db = await loadDb();
  const user = db.users.find((u) => clean(u.username, 50) === username && clean(u.password, 120) === password);
  if (!user) {
    return res.status(401).json({ ok: false, message: "Invalid credentials." });
  }

  const safeUser = {
    id: user.id,
    username: user.username,
    fullName: user.fullName || "",
    email: user.email || "",
    phone: user.phone || "",
    role: user.role || "customer"
  };

  return res.json({ ok: true, data: safeUser });
}));

api.post("/auth/register", asyncHandler(async (req, res) => {
  const username = clean(req.body?.username, 50);
  const password = clean(req.body?.password, 120);
  const fullName = clean(req.body?.fullName, 90);
  const email = clean(req.body?.email, 120);
  const phone = clean(req.body?.phone, 30);
  const role = toRole(req.body?.role) || "customer";

  if (!username || !password || !fullName) {
    return res.status(400).json({ ok: false, message: "username, password, and fullName are required." });
  }

  const nextDb = await updateDb((db) => {
    const exists = db.users.some((u) => clean(u.username, 50).toLowerCase() === username.toLowerCase());
    if (exists) {
      const err = new Error("Username already exists.");
      err.statusCode = 409;
      throw err;
    }

    const user = {
      id: makeId("USR"),
      username,
      password,
      fullName,
      email,
      phone,
      role: role === "admin" || role === "agent" ? role : "customer",
      createdAt: new Date().toISOString()
    };
    return { ...db, users: [user, ...db.users] };
  });

  const created = nextDb.users[0];
  return res.status(201).json({
    ok: true,
    data: {
      id: created.id,
      username: created.username,
      fullName: created.fullName,
      email: created.email,
      phone: created.phone,
      role: created.role
    }
  });
}));

api.post("/auth/reset-password", asyncHandler(async (req, res) => {
  const username = clean(req.body?.username, 50);
  const email = clean(req.body?.email, 120);
  const newPassword = clean(req.body?.newPassword, 120);

  if (!username || !email || !newPassword) {
    return res.status(400).json({ ok: false, message: "username, email, and newPassword are required." });
  }

  await updateDb((db) => {
    const idx = db.users.findIndex(
      (u) => clean(u.username, 50).toLowerCase() === username.toLowerCase() && clean(u.email, 120).toLowerCase() === email.toLowerCase()
    );
    if (idx < 0) {
      const err = new Error("No account matches that username and email.");
      err.statusCode = 404;
      throw err;
    }

    const users = db.users.slice();
    users[idx] = {
      ...users[idx],
      password: newPassword,
      updatedAt: new Date().toISOString()
    };
    return { ...db, users };
  });

  return res.json({ ok: true });
}));

api.get("/state", asyncHandler(async (req, res) => {
  const db = await loadDb();
  return res.json({
    ok: true,
    data: {
      allUsers: db.users,
      allProperties: db.properties,
      allAppointments: db.appointments,
      officeMeets: db.officeMeets,
      allReviews: db.reviews,
      allNotifications: db.notifications,
      allTrips: db.trips
    }
  });
}));

api.put("/state", asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const nextDb = await updateDb((db) => {
    const next = { ...db };
    if (Array.isArray(body.allUsers)) next.users = dedupeUsersByUsername(body.allUsers);
    if (Array.isArray(body.allProperties)) next.properties = body.allProperties;
    if (Array.isArray(body.allAppointments)) next.appointments = body.allAppointments;
    if (Array.isArray(body.officeMeets)) next.officeMeets = body.officeMeets;
    if (Array.isArray(body.allReviews)) next.reviews = body.allReviews;
    if (Array.isArray(body.allNotifications)) next.notifications = body.allNotifications;
    if (Array.isArray(body.allTrips)) next.trips = body.allTrips;
    return next;
  });

  return res.json({
    ok: true,
    data: {
      allUsers: nextDb.users,
      allProperties: nextDb.properties,
      allAppointments: nextDb.appointments,
      officeMeets: nextDb.officeMeets,
      allReviews: nextDb.reviews,
      allNotifications: nextDb.notifications,
      allTrips: nextDb.trips
    }
  });
}));

api.get("/users", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const db = await loadDb();
  const users = db.users.map((u) => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName || "",
    email: u.email || "",
    phone: u.phone || "",
    role: u.role || "customer",
    createdAt: u.createdAt || ""
  }));
  const result = listOrPaginated(users, req);
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

api.patch("/users/:id", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 60);
  const nextDb = await updateDb((db) => {
    const idx = db.users.findIndex((u) => String(u.id) === id);
    if (idx < 0) {
      const err = new Error("User not found.");
      err.statusCode = 404;
      throw err;
    }
    const current = db.users[idx];
    const nextUser = {
      ...current,
      fullName: clean(req.body?.fullName ?? current.fullName, 90),
      email: clean(req.body?.email ?? current.email, 120),
      phone: clean(req.body?.phone ?? current.phone, 30),
      role: toRole(req.body?.role ?? current.role) || "customer",
      updatedAt: new Date().toISOString()
    };
    const users = db.users.slice();
    users[idx] = nextUser;
    return { ...db, users };
  });

  const updated = nextDb.users.find((u) => String(u.id) === id);
  return res.json({ ok: true, data: updated });
}));

api.delete("/users/:id", requireRole(["admin"]), asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 60);
  await updateDb((db) => {
    const users = db.users.filter((u) => String(u.id) !== id);
    if (users.length === db.users.length) {
      const err = new Error("User not found.");
      err.statusCode = 404;
      throw err;
    }
    return { ...db, users };
  });
  return res.json({ ok: true });
}));

api.get("/properties", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const result = listOrPaginated(db.properties, req, { defaultLimit: 20, maxLimit: 100 });
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

api.post("/properties", requireRole(["admin", "agent"]), asyncHandler(async (req, res) => {
  const title = clean(req.body?.title, 120);
  const location = clean(req.body?.location, 140);
  const description = clean(req.body?.description, 800);
  const price = parseNumber(req.body?.price);

  if (!title || !location) {
    return res.status(400).json({ ok: false, message: "title and location are required." });
  }

  const nextDb = await updateDb((db) => {
    const property = {
      id: makeId("PRO"),
      title,
      location,
      description,
      price,
      status: clean(req.body?.status, 30) || "available",
      agent: clean(req.body?.agent, 60),
      imageUrl: clean(req.body?.imageUrl, 500),
      createdAt: new Date().toISOString()
    };
    return { ...db, properties: [property, ...db.properties] };
  });

  return res.status(201).json({ ok: true, data: nextDb.properties[0] });
}));

api.get("/appointments", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const result = listOrPaginated(db.appointments, req, { defaultLimit: 20, maxLimit: 100 });
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

api.post("/appointments", asyncHandler(async (req, res) => {
  const propertyId = clean(req.body?.propertyId, 80);
  const customer = clean(req.body?.customer, 60);
  const date = clean(req.body?.date, 20);
  const time = clean(req.body?.time, 10);
  if (!propertyId || !customer || !isIsoDate(date) || !isHHMM(time)) {
    return res.status(400).json({ ok: false, message: "propertyId, customer, valid date (YYYY-MM-DD), and time (HH:MM) are required." });
  }

  const nextDb = await updateDb((db) => {
    const propertyExists = db.properties.some((p) => String(p?.id) === propertyId);
    if (!propertyExists) {
      const err = new Error("Property not found.");
      err.statusCode = 404;
      throw err;
    }
    const customerRecord = db.users.find((u) => String(u?.username) === customer || String(u?.id) === customer);
    if (!customerRecord) {
      const err = new Error("Customer not found.");
      err.statusCode = 404;
      throw err;
    }
    const customerUsername = String(customerRecord.username || "").trim();
    if (!customerUsername) {
      const err = new Error("Invalid customer record.");
      err.statusCode = 400;
      throw err;
    }
    const duplicatePending = db.appointments.some((a) =>
      String(a.propertyId) === propertyId &&
      String(a.customer) === customerUsername &&
      String(a.date) === date &&
      String(a.time) === time &&
      String(a.status || "pending").toLowerCase() === "pending"
    );
    if (duplicatePending) {
      const err = new Error("You already have a pending appointment for this schedule.");
      err.statusCode = 409;
      throw err;
    }

    const appointment = {
      id: makeId("APP"),
      propertyId,
      propertyTitle: clean(req.body?.propertyTitle, 120),
      location: clean(req.body?.location, 140),
      customer: customerUsername,
      agent: clean(req.body?.agent, 60),
      date,
      time,
      status: "pending",
      notes: clean(req.body?.notes, 500),
      createdAt: new Date().toISOString()
    };
    return { ...db, appointments: [appointment, ...db.appointments] };
  });

  return res.status(201).json({ ok: true, data: nextDb.appointments[0] });
}));

api.patch("/appointments/:id/status", requireRole(["admin", "agent"]), asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 80);
  const status = clean(req.body?.status, 30).toLowerCase();
  const allowed = new Set(["pending", "approved", "rescheduled", "done", "declined", "cancelled"]);
  if (!allowed.has(status)) {
    return res.status(400).json({ ok: false, message: "Invalid status." });
  }

  const nextDb = await updateDb((db) => {
    const idx = db.appointments.findIndex((a) => String(a.id) === id);
    if (idx < 0) {
      const err = new Error("Appointment not found.");
      err.statusCode = 404;
      throw err;
    }
    const appointments = db.appointments.slice();
    appointments[idx] = { ...appointments[idx], status, updatedAt: new Date().toISOString() };
    return { ...db, appointments };
  });

  const updated = nextDb.appointments.find((a) => String(a.id) === id);
  return res.json({ ok: true, data: updated });
}));

api.get("/office-meets", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const result = listOrPaginated(db.officeMeets, req, { defaultLimit: 20, maxLimit: 100 });
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

api.post("/office-meets", asyncHandler(async (req, res) => {
  const fullName = clean(req.body?.fullName, 90);
  const email = clean(req.body?.email, 120);
  const customer = clean(req.body?.customer || req.body?.requestedBy, 60);
  const mode = clean(req.body?.mode, 20).toLowerCase() === "virtual" ? "virtual" : "office";
  const reason = clean(req.body?.reason, 600);
  const date = clean(req.body?.date, 20);
  const time = clean(req.body?.time, 10);

  if (!fullName || !email || !customer || !reason || !isIsoDate(date) || !isHHMM(time)) {
    return res.status(400).json({ ok: false, message: "fullName, email, customer, reason, valid date (YYYY-MM-DD), and time (HH:MM) are required." });
  }

  const nextDb = await updateDb((db) => {
    const customerRecord = db.users.find((u) => String(u?.username) === customer || String(u?.id) === customer);
    if (!customerRecord) {
      const err = new Error("Customer not found.");
      err.statusCode = 404;
      throw err;
    }
    const customerUsername = String(customerRecord.username || "").trim();
    if (!customerUsername) {
      const err = new Error("Invalid customer record.");
      err.statusCode = 400;
      throw err;
    }
    const meet = {
      id: makeId("MEET"),
      fullName,
      email,
      customer: customerUsername,
      requestedBy: customerUsername,
      mode,
      reason,
      date,
      time,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    return { ...db, officeMeets: [meet, ...db.officeMeets] };
  });

  return res.status(201).json({ ok: true, data: nextDb.officeMeets[0] });
}));

api.patch("/office-meets/:id/status", requireRole(["admin", "agent"]), asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 80);
  const status = clean(req.body?.status, 30).toLowerCase();
  const allowed = new Set(["pending", "approved", "declined", "done", "cancelled"]);
  if (!allowed.has(status)) {
    return res.status(400).json({ ok: false, message: "Invalid status." });
  }

  const nextDb = await updateDb((db) => {
    const idx = db.officeMeets.findIndex((m) => String(m.id) === id);
    if (idx < 0) {
      const err = new Error("Office meet not found.");
      err.statusCode = 404;
      throw err;
    }
    const officeMeets = db.officeMeets.slice();
    officeMeets[idx] = { ...officeMeets[idx], status, updatedAt: new Date().toISOString() };
    return { ...db, officeMeets };
  });

  const updated = nextDb.officeMeets.find((m) => String(m.id) === id);
  return res.json({ ok: true, data: updated });
}));

api.get("/reviews", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const result = listOrPaginated(db.reviews, req, { defaultLimit: 20, maxLimit: 100 });
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

api.post("/reviews", asyncHandler(async (req, res) => {
  const appointmentId = clean(req.body?.appointmentId, 80);
  const customer = clean(req.body?.customer, 60);
  const propertyId = clean(req.body?.propertyId, 80);
  const comment = clean(req.body?.comment, 500);
  const rating = parseNumber(req.body?.rating);

  if (!appointmentId || !customer || !propertyId || !comment || rating < 1 || rating > 5) {
    return res.status(400).json({ ok: false, message: "appointmentId, customer, propertyId, comment, and rating(1-5) are required." });
  }

  const nextDb = await updateDb((db) => {
    const appointmentExists = db.appointments.some((a) => String(a?.id) === appointmentId);
    if (!appointmentExists) {
      const err = new Error("Appointment not found.");
      err.statusCode = 404;
      throw err;
    }
    const propertyExists = db.properties.some((p) => String(p?.id) === propertyId);
    if (!propertyExists) {
      const err = new Error("Property not found.");
      err.statusCode = 404;
      throw err;
    }
    const customerRecord = db.users.find((u) => String(u?.username) === customer || String(u?.id) === customer);
    if (!customerRecord) {
      const err = new Error("Customer not found.");
      err.statusCode = 404;
      throw err;
    }
    const customerUsername = String(customerRecord.username || "").trim();
    if (!customerUsername) {
      const err = new Error("Invalid customer record.");
      err.statusCode = 400;
      throw err;
    }
    const alreadyReviewed = db.reviews.some((r) => String(r.appointmentId) === appointmentId && String(r.customer) === customerUsername);
    if (alreadyReviewed) {
      const err = new Error("Appointment already reviewed by this customer.");
      err.statusCode = 409;
      throw err;
    }
    const review = {
      id: makeId("REV"),
      appointmentId,
      customer: customerUsername,
      propertyId,
      rating,
      comment,
      createdAt: new Date().toISOString()
    };
    return { ...db, reviews: [review, ...db.reviews] };
  });

  return res.status(201).json({ ok: true, data: nextDb.reviews[0] });
}));

api.get("/notifications", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const to = clean(req.query?.to, 60);
  const notifications = to ? db.notifications.filter((n) => String(n.to) === to) : db.notifications;
  const result = listOrPaginated(notifications, req, { defaultLimit: 30, maxLimit: 100 });
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

api.post("/notifications", asyncHandler(async (req, res) => {
  const to = clean(req.body?.to, 60);
  const title = clean(req.body?.title, 120) || "Notification";
  const message = clean(req.body?.message, 500);
  const type = clean(req.body?.type, 60) || "general";

  if (!to || !message) {
    return res.status(400).json({ ok: false, message: "to and message are required." });
  }

  const nextDb = await updateDb((db) => {
    const recipientRecord = db.users.find((u) => String(u?.username) === to || String(u?.id) === to);
    if (!recipientRecord) {
      const err = new Error("Recipient user not found.");
      err.statusCode = 404;
      throw err;
    }
    const recipientUsername = String(recipientRecord.username || "").trim();
    if (!recipientUsername) {
      const err = new Error("Invalid recipient user.");
      err.statusCode = 400;
      throw err;
    }
    const notif = {
      id: makeId("NOTIF"),
      to: recipientUsername,
      title,
      message,
      type,
      meta: req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : {},
      readAt: null,
      createdAt: new Date().toISOString()
    };
    return { ...db, notifications: [notif, ...db.notifications] };
  });

  return res.status(201).json({ ok: true, data: nextDb.notifications[0] });
}));

api.patch("/notifications/:id/read", asyncHandler(async (req, res) => {
  const id = clean(req.params.id, 80);
  const nextDb = await updateDb((db) => {
    const idx = db.notifications.findIndex((n) => String(n.id) === id);
    if (idx < 0) {
      const err = new Error("Notification not found.");
      err.statusCode = 404;
      throw err;
    }
    const notifications = db.notifications.slice();
    notifications[idx] = { ...notifications[idx], readAt: new Date().toISOString() };
    return { ...db, notifications };
  });

  const updated = nextDb.notifications.find((n) => String(n.id) === id);
  return res.json({ ok: true, data: updated });
}));

api.get("/calendar/events", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const appointmentEvents = db.appointments.map((a) => ({
    id: `app_${a.id}`,
    type: "appointment",
    title: a.propertyTitle || "Appointment",
    date: a.date || "",
    time: a.time || "",
    status: a.status || "pending",
    meta: { appointmentId: a.id, customer: a.customer || "", agent: a.agent || "" }
  }));
  const meetEvents = db.officeMeets.map((m) => ({
    id: `meet_${m.id}`,
    type: "office-meet",
    title: m.mode === "virtual" ? "Virtual Meet" : "Office Meet",
    date: m.date || "",
    time: m.time || "",
    status: m.status || "pending",
    meta: { officeMeetId: m.id, customer: m.customer || "" }
  }));
  const tripEvents = db.trips.map((t) => ({
    id: `trip_${t.id}`,
    type: "trip",
    title: t.title || "Trip",
    date: t.date || "",
    time: t.time || "",
    status: t.status || "scheduled",
    meta: { tripId: t.id }
  }));

  const events = [...appointmentEvents, ...meetEvents, ...tripEvents];
  const result = listOrPaginated(events, req, { defaultLimit: 50, maxLimit: 200 });
  return res.json({ ok: true, data: result.data, ...(result.pagination ? { pagination: result.pagination } : {}) });
}));

api.get("/dashboard/stats", asyncHandler(async (req, res) => {
  const db = await loadDb();
  const pendingAppointments = db.appointments.filter((a) => String(a.status || "").toLowerCase() === "pending").length;
  const pendingMeets = db.officeMeets.filter((m) => String(m.status || "").toLowerCase() === "pending").length;

  return res.json({
    ok: true,
    data: {
      users: db.users.length,
      properties: db.properties.length,
      appointments: db.appointments.length,
      pendingAppointments,
      officeMeets: db.officeMeets.length,
      pendingOfficeMeets: pendingMeets,
      reviews: db.reviews.length,
      notifications: db.notifications.length,
      trips: db.trips.length
    }
  });
}));

api.use((req, res) => {
  res.status(404).json({ ok: false, message: "API route not found." });
});

app.use("/api", api);

const distPath = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.get("/health", (req, res) => {
  res.json({ ok: true, uptimeSeconds: Number(process.uptime().toFixed(0)) });
});

app.get(/.*/, (req, res) => {
  const indexHtml = path.join(distPath, "index.html");
  if (!fs.existsSync(indexHtml)) {
    return res
      .status(500)
      .send("Frontend build not found. Go to /frontend and run: npm install && npm run build");
  }
  return res.sendFile(indexHtml);
});

app.use((err, req, res, next) => {
  const tooLarge = err?.type === "entity.too.large";
  const statusCode = tooLarge ? 413 : Number(err?.statusCode || err?.status || 500);
  const message = tooLarge
    ? `Payload too large. Max request size is ${REQUEST_SIZE_LIMIT}.`
    : clean(err?.message || "Internal server error.", 400);

  if (statusCode >= 500) {
    console.error(`[${new Date().toISOString()}] requestId=${req?.requestId || "-"} API error:`, err);
  }
  res.status(statusCode).json({ ok: false, message, requestId: req?.requestId || null });
});

let server = null;
let shuttingDown = false;

const gracefulShutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received. Starting graceful shutdown...`);

  const forceExitTimer = setTimeout(() => {
    console.error("Graceful shutdown timeout reached. Forcing exit.");
    process.exit(1);
  }, 15000);
  forceExitTimer.unref();

  if (!server) {
    process.exit(0);
    return;
  }

  server.close(() => {
    dbPool
      .end()
      .catch((err) => {
        console.error("Error while closing database pool:", err);
      })
      .finally(() => {
        clearTimeout(forceExitTimer);
        console.log("HTTP server and DB pool closed. Shutdown complete.");
        process.exit(0);
      });
  });
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection:", reason);
  gracefulShutdown("unhandledRejection");
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  gracefulShutdown("uncaughtException");
});

ensureDbReady()
  .then(() => bootstrapFromLegacyJsonIfNeeded())
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
