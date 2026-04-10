import "dotenv/config";
import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import fs from "fs";
import helmet from "helmet";
import hpp from "hpp";
import morgan from "morgan";
import path from "path";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { fileURLToPath } from "url";
import { env, validateDbConfigOrThrow } from "./config/env.js";
import { dbPool } from "./db/pool.js";
import { createApp } from "./app/create-app.js";
import { registerGracefulShutdown } from "./app/graceful-shutdown.js";
import { startServer } from "./app/start-server.js";
import { attachRequestMeta } from "./middleware/request-meta.js";
import { asyncHandler } from "./shared/http/async-handler.js";
import { registerHealthRoutes } from "./modules/health/health.routes.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerStateRoutes } from "./modules/state/state.routes.js";
import { registerUserRoutes } from "./modules/users/users.routes.js";
import { registerPropertyRoutes } from "./modules/properties/properties.routes.js";
import { registerWorkflowRoutes } from "./modules/workflow/workflow.routes.js";
import { registerMessageRoutes } from "./modules/messages/messages.routes.js";
import { registerNotificationRoutes } from "./modules/notifications/notifications.routes.js";
import { registerCalendarRoutes } from "./modules/calendar/calendar.routes.js";
import { registerDashboardRoutes } from "./modules/dashboard/dashboard.routes.js";

export const app = createApp();
const isProduction = env.isProduction;
const PORT = env.port;
const REQUEST_SIZE_LIMIT = env.requestSizeLimit;
const IDEMPOTENCY_TTL_MS = env.idempotencyTtlMs;
const DB_NAME = env.db.name;
const DB_CLIENT = String(env.db.client || "mysql").toLowerCase();
const isVercelRuntime = Boolean(process.env.VERCEL || process.env.VERCEL_URL || process.env.VERCEL_ENV);
const GOOGLE_CALENDAR_SYNC_ENABLED = env.googleCalendar.enabled;
const GOOGLE_CALENDAR_CLIENT_ID = env.googleCalendar.clientId;
const GOOGLE_CALENDAR_CLIENT_SECRET = env.googleCalendar.clientSecret;
const GOOGLE_CALENDAR_REFRESH_TOKEN = env.googleCalendar.refreshToken;
const GOOGLE_CALENDAR_ID = env.googleCalendar.calendarId;
const GOOGLE_CALENDAR_TIME_ZONE = env.googleCalendar.timeZone;
const GOOGLE_CALENDAR_SYNC_TIMEOUT_MS = env.googleCalendar.timeoutMs;
const GOOGLE_CALENDAR_SEND_UPDATES = env.googleCalendar.sendUpdates;
const GOOGLE_CALENDAR_APPOINTMENT_DURATION_MINUTES = env.googleCalendar.appointmentDurationMinutes;
const GOOGLE_CALENDAR_MEETING_DURATION_MINUTES = env.googleCalendar.meetingDurationMinutes;
const GOOGLE_CALENDAR_TRIP_DURATION_MINUTES = env.googleCalendar.tripDurationMinutes;
const HTTPSMS_ENABLED = env.httpsms.enabled;
const HTTPSMS_API_BASE_URL = env.httpsms.apiBaseUrl;
const HTTPSMS_API_KEY = env.httpsms.apiKey;
const HTTPSMS_FROM = env.httpsms.from;
const HTTPSMS_DEFAULT_COUNTRY_CODE = env.httpsms.defaultCountryCode;
const HTTPSMS_TIMEOUT_MS = env.httpsms.timeoutMs;
const HTTPSMS_WEBHOOK_SIGNING_SECRET = env.httpsms.webhookSigningSecret;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const legacyDbPath = path.join(__dirname, "..", "data", "db.json");

const defaultDb = {
  users: [],
  properties: [],
  appointments: [],
  officeMeets: [],
  calendarEvents: [],
  reviews: [],
  notifications: [],
  trips: [],
  messages: []
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
const startupRuntimeState = {
  attempted: false,
  phase: "pending",
  ready: false,
  lastError: null,
  lastAttemptAt: "",
  lastSuccessAt: ""
};
let googleCalendarTokenCache = { accessToken: "", expiresAt: 0 };
let googleCalendarMetadataCache = { calendarId: "", requestedTimeZone: "", remoteTimeZone: "", checkedAt: 0 };
const messageStreamClients = new Map();
let nextMessageStreamClientId = 0;
const PROPERTY_IMAGE_EXTENSION_RE = /\.(png|jpe?g|webp|gif|avif|svg)(?:[?#].*)?$/i;

const isLikelyPropertyImageReference = (value) => {
  const candidate = clean(value, 1000);
  if (!candidate) return false;
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(candidate)) return true;
  if (candidate.startsWith("/")) return PROPERTY_IMAGE_EXTENSION_RE.test(candidate);
  return PROPERTY_IMAGE_EXTENSION_RE.test(candidate);
};

const validateStartupConfig = async () => {
  validateDbConfigOrThrow();
};

const ensurePostgresColumn = async (tableName, columnName, definition) => {
  await dbPool.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnName} ${definition}`);
};

const ensurePostgresSchema = async () => {
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(90) NOT NULL,
      email VARCHAR(120),
      phone VARCHAR(30),
      role VARCHAR(20) NOT NULL DEFAULT 'customer',
      photo_url TEXT,
      account_status VARCHAR(20) NOT NULL DEFAULT 'active',
      availability_status VARCHAR(20) NOT NULL DEFAULT 'available',
      last_active_at TIMESTAMP NULL,
      deactivated_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS properties (
      id VARCHAR(64) PRIMARY KEY,
      agent_user_id VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      title VARCHAR(120) NOT NULL,
      location VARCHAR(140) NOT NULL,
      price NUMERIC(14,2) NOT NULL DEFAULT 0,
      bedrooms INT NULL,
      bathrooms INT NULL,
      area_sqft INT NULL,
      description TEXT NULL,
      image_url TEXT NULL,
      image_urls_json JSON NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'available',
      listing_type VARCHAR(20) NOT NULL DEFAULT 'sale',
      property_type VARCHAR(40) NOT NULL DEFAULT 'house',
      property_status VARCHAR(20) NOT NULL DEFAULT 'available',
      archived_at TIMESTAMP NULL,
      archived_by_user_id VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL
    );
  `);
  await dbPool.query("ALTER TABLE properties ADD COLUMN IF NOT EXISTS image_urls_json JSON NULL");

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id VARCHAR(64) PRIMARY KEY,
      property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE ON UPDATE CASCADE,
      customer_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      assigned_agent_user_id VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      assigned_by_admin_user_id VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      appointment_date DATE NOT NULL,
      appointment_time TIME NOT NULL,
      appointment_type VARCHAR(40) NOT NULL DEFAULT 'property_viewing',
      contact_full_name VARCHAR(90) NULL,
      contact_email VARCHAR(120) NULL,
      contact_phone VARCHAR(30) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      notes TEXT NULL,
      outcome_notes TEXT NULL,
      cancel_reason TEXT NULL,
      assigned_at TIMESTAMP NULL,
      completed_at TIMESTAMP NULL,
      cancelled_at TIMESTAMP NULL,
      rescheduled_at TIMESTAMP NULL,
      expired_at TIMESTAMP NULL,
      no_show_at TIMESTAMP NULL,
      google_event_id VARCHAR(255) NULL,
      google_html_link TEXT NULL,
      google_sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      google_sync_error TEXT NULL,
      google_synced_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS office_meets (
      id VARCHAR(64) PRIMARY KEY,
      customer_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      assigned_agent_user_id VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      mode VARCHAR(20) NOT NULL DEFAULT 'office',
      reason TEXT NOT NULL,
      phone VARCHAR(30) NULL,
      related_property_id VARCHAR(64) NULL REFERENCES properties(id) ON DELETE SET NULL ON UPDATE CASCADE,
      notes TEXT NULL,
      outcome_notes TEXT NULL,
      meet_date DATE NOT NULL,
      meet_time TIME NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      completed_at TIMESTAMP NULL,
      cancelled_at TIMESTAMP NULL,
      rescheduled_at TIMESTAMP NULL,
      expired_at TIMESTAMP NULL,
      no_show_at TIMESTAMP NULL,
      google_event_id VARCHAR(255) NULL,
      google_html_link TEXT NULL,
      google_sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      google_sync_error TEXT NULL,
      google_synced_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id VARCHAR(64) PRIMARY KEY,
      appointment_id VARCHAR(64) NOT NULL REFERENCES appointments(id) ON DELETE CASCADE ON UPDATE CASCADE,
      customer_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE ON UPDATE CASCADE,
      rating INT NULL CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
      comment TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_reviews_appointment_customer UNIQUE (appointment_id, customer_user_id)
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS trips (
      id VARCHAR(64) PRIMARY KEY,
      created_by_agent_user_id VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      customer_user_id VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      title VARCHAR(120) NULL,
      location VARCHAR(140) NULL,
      trip_date DATE NULL,
      trip_time TIME NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'confirmed',
      notes TEXT NULL,
      outcome_notes TEXT NULL,
      attendees_json JSON NULL,
      completed_at TIMESTAMP NULL,
      cancelled_at TIMESTAMP NULL,
      rescheduled_at TIMESTAMP NULL,
      expired_at TIMESTAMP NULL,
      google_event_id VARCHAR(255) NULL,
      google_html_link TEXT NULL,
      google_sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      google_sync_error TEXT NULL,
      google_synced_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS trip_properties (
      trip_id VARCHAR(64) NOT NULL REFERENCES trips(id) ON DELETE CASCADE ON UPDATE CASCADE,
      property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE ON UPDATE CASCADE,
      stop_order INT NOT NULL,
      PRIMARY KEY (trip_id, property_id),
      CONSTRAINT uq_trip_stop_order UNIQUE (trip_id, stop_order)
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) PRIMARY KEY,
      recipient_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      appointment_id VARCHAR(64) NULL REFERENCES appointments(id) ON DELETE CASCADE ON UPDATE CASCADE,
      office_meet_id VARCHAR(64) NULL REFERENCES office_meets(id) ON DELETE CASCADE ON UPDATE CASCADE,
      type VARCHAR(60) NOT NULL DEFAULT 'general',
      title VARCHAR(120) NOT NULL DEFAULT 'Notification',
      message TEXT NOT NULL,
      meta JSON NULL,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(64) PRIMARY KEY,
      sender_user_id VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      recipient_user_id VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
      direction VARCHAR(20) NOT NULL DEFAULT 'outbound',
      channel VARCHAR(20) NOT NULL DEFAULT 'app',
      provider VARCHAR(30) NOT NULL DEFAULT 'internal',
      provider_message_id VARCHAR(128) NULL,
      provider_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      sender_phone VARCHAR(32) NOT NULL,
      recipient_phone VARCHAR(32) NOT NULL,
      content TEXT NOT NULL,
      error_message TEXT NULL,
      meta JSON NULL,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL
    );
  `);

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id VARCHAR(96) PRIMARY KEY,
      source_kind VARCHAR(30) NOT NULL,
      source_record_id VARCHAR(64) NOT NULL,
      title VARCHAR(160) NOT NULL,
      event_date DATE NULL,
      event_time TIME NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      customer_username VARCHAR(50) NULL,
      agent_username VARCHAR(50) NULL,
      property_id VARCHAR(64) NULL,
      location VARCHAR(160) NULL,
      notes TEXT NULL,
      meta_json JSON NULL,
      google_event_id VARCHAR(255) NULL,
      google_html_link TEXT NULL,
      google_sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      google_sync_error TEXT NULL,
      google_synced_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL
    );
  `);

  // Existing Postgres databases may predate newer fields that current queries expect.
  await ensurePostgresColumn("users", "photo_url", "TEXT NULL");
  await ensurePostgresColumn("users", "account_status", "VARCHAR(20) NOT NULL DEFAULT 'active'");
  await ensurePostgresColumn("users", "availability_status", "VARCHAR(20) NOT NULL DEFAULT 'available'");
  await ensurePostgresColumn("users", "last_active_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("users", "deactivated_at", "TIMESTAMP NULL");

  await ensurePostgresColumn("properties", "listing_type", "VARCHAR(20) NOT NULL DEFAULT 'sale'");
  await ensurePostgresColumn("properties", "property_type", "VARCHAR(40) NOT NULL DEFAULT 'house'");
  await ensurePostgresColumn("properties", "property_status", "VARCHAR(20) NOT NULL DEFAULT 'available'");
  await ensurePostgresColumn("properties", "image_urls_json", "JSON NULL");
  await ensurePostgresColumn("properties", "archived_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("properties", "archived_by_user_id", "VARCHAR(64) NULL");

  await ensurePostgresColumn("appointments", "completed_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("appointments", "cancelled_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("appointments", "rescheduled_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("appointments", "expired_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("appointments", "appointment_type", "VARCHAR(40) NOT NULL DEFAULT 'property_viewing'");
  await ensurePostgresColumn("appointments", "contact_full_name", "VARCHAR(90) NULL");
  await ensurePostgresColumn("appointments", "contact_email", "VARCHAR(120) NULL");
  await ensurePostgresColumn("appointments", "contact_phone", "VARCHAR(30) NULL");
  await ensurePostgresColumn("appointments", "outcome_notes", "TEXT NULL");
  await ensurePostgresColumn("appointments", "cancel_reason", "TEXT NULL");
  await ensurePostgresColumn("appointments", "no_show_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("appointments", "google_event_id", "VARCHAR(255) NULL");
  await ensurePostgresColumn("appointments", "google_html_link", "TEXT NULL");
  await ensurePostgresColumn("appointments", "google_sync_status", "VARCHAR(20) NOT NULL DEFAULT 'pending'");
  await ensurePostgresColumn("appointments", "google_sync_error", "TEXT NULL");
  await ensurePostgresColumn("appointments", "google_synced_at", "TIMESTAMP NULL");

  await ensurePostgresColumn("office_meets", "phone", "VARCHAR(30) NULL");
  await ensurePostgresColumn("office_meets", "related_property_id", "VARCHAR(64) NULL");
  await ensurePostgresColumn("office_meets", "notes", "TEXT NULL");
  await ensurePostgresColumn("office_meets", "outcome_notes", "TEXT NULL");
  await ensurePostgresColumn("office_meets", "completed_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("office_meets", "cancelled_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("office_meets", "rescheduled_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("office_meets", "expired_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("office_meets", "no_show_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("office_meets", "google_event_id", "VARCHAR(255) NULL");
  await ensurePostgresColumn("office_meets", "google_html_link", "TEXT NULL");
  await ensurePostgresColumn("office_meets", "google_sync_status", "VARCHAR(20) NOT NULL DEFAULT 'pending'");
  await ensurePostgresColumn("office_meets", "google_sync_error", "TEXT NULL");
  await ensurePostgresColumn("office_meets", "google_synced_at", "TIMESTAMP NULL");

  await ensurePostgresColumn("trips", "title", "VARCHAR(120) NULL");
  await ensurePostgresColumn("trips", "location", "VARCHAR(140) NULL");
  await ensurePostgresColumn("trips", "attendees_json", "JSON NULL");
  await ensurePostgresColumn("trips", "completed_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("trips", "cancelled_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("trips", "rescheduled_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("trips", "expired_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("trips", "outcome_notes", "TEXT NULL");
  await ensurePostgresColumn("trips", "google_event_id", "VARCHAR(255) NULL");
  await ensurePostgresColumn("trips", "google_html_link", "TEXT NULL");
  await ensurePostgresColumn("trips", "google_sync_status", "VARCHAR(20) NOT NULL DEFAULT 'pending'");
  await ensurePostgresColumn("trips", "google_sync_error", "TEXT NULL");
  await ensurePostgresColumn("trips", "google_synced_at", "TIMESTAMP NULL");

  await ensurePostgresColumn("notifications", "appointment_id", "VARCHAR(64) NULL");
  await ensurePostgresColumn("notifications", "office_meet_id", "VARCHAR(64) NULL");
  await ensurePostgresColumn("notifications", "type", "VARCHAR(60) NOT NULL DEFAULT 'general'");
  await ensurePostgresColumn("notifications", "title", "VARCHAR(120) NOT NULL DEFAULT 'Notification'");
  await ensurePostgresColumn("notifications", "meta", "JSON NULL");
  await ensurePostgresColumn("notifications", "read_at", "TIMESTAMP NULL");

  await ensurePostgresColumn("messages", "direction", "VARCHAR(20) NOT NULL DEFAULT 'outbound'");
  await ensurePostgresColumn("messages", "channel", "VARCHAR(20) NOT NULL DEFAULT 'app'");
  await ensurePostgresColumn("messages", "provider", "VARCHAR(30) NOT NULL DEFAULT 'internal'");
  await ensurePostgresColumn("messages", "provider_message_id", "VARCHAR(128) NULL");
  await ensurePostgresColumn("messages", "provider_status", "VARCHAR(30) NOT NULL DEFAULT 'pending'");
  await ensurePostgresColumn("messages", "error_message", "TEXT NULL");
  await ensurePostgresColumn("messages", "meta", "JSON NULL");
  await ensurePostgresColumn("messages", "read_at", "TIMESTAMP NULL");
  await ensurePostgresColumn("messages", "updated_at", "TIMESTAMP NULL");

  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_properties_agent_user_id ON properties(agent_user_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_properties_archived_at ON properties(archived_at)");

  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_appointments_property_id ON appointments(property_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_appointments_customer_user_id ON appointments(customer_user_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_appointments_assigned_agent_user_id ON appointments(assigned_agent_user_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_appointments_schedule ON appointments(appointment_date, appointment_time)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status)");

  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_office_meets_customer_user_id ON office_meets(customer_user_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_office_meets_assigned_agent_user_id ON office_meets(assigned_agent_user_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_office_meets_schedule ON office_meets(meet_date, meet_time)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_office_meets_status ON office_meets(status)");

  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_reviews_customer_user_id ON reviews(customer_user_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_reviews_property_id ON reviews(property_id)");

  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_trips_created_by_agent_user_id ON trips(created_by_agent_user_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_trips_customer_user_id ON trips(customer_user_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_trips_schedule ON trips(trip_date, trip_time)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status)");

  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_calendar_events_source ON calendar_events(source_kind, source_record_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_calendar_events_schedule ON calendar_events(event_date, event_time)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status)");

  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user_id ON notifications(recipient_user_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_notifications_appointment_id ON notifications(appointment_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_notifications_office_meet_id ON notifications(office_meet_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)");

  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_messages_sender_user_id ON messages(sender_user_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_messages_recipient_user_id ON messages(recipient_user_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_messages_provider_message_id ON messages(provider_message_id)");
  await dbPool.query("CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)");
};

const ensureColumn = async (tableName, columnName, definition) => {
  const [rows] = await dbPool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [DB_NAME, tableName, columnName]
  );
  if (Array.isArray(rows) && rows.length > 0) return;
  await dbPool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
};

const ensureIndex = async (tableName, indexName, definition) => {
  const [rows] = await dbPool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?
     LIMIT 1`,
    [DB_NAME, tableName, indexName]
  );
  if (Array.isArray(rows) && rows.length > 0) return;
  await dbPool.query(`ALTER TABLE ${tableName} ADD INDEX ${indexName} ${definition}`);
};

const ensureCheckConstraint = async (tableName, constraintName, definition) => {
  const [rows] = await dbPool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'CHECK'
     LIMIT 1`,
    [DB_NAME, tableName, constraintName]
  );
  if (Array.isArray(rows) && rows.length > 0) {
    await dbPool.query(`ALTER TABLE ${tableName} DROP CHECK ${constraintName}`);
  }
  await dbPool.query(`ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} CHECK ${definition}`);
};

const ensureDbSchema = async () => {
  if (DB_CLIENT === "postgres") {
    await ensurePostgresSchema();
    return;
  }

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
      image_urls_json JSON NULL,
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
      appointment_type VARCHAR(40) NOT NULL DEFAULT 'property_viewing',
      contact_full_name VARCHAR(90) NULL,
      contact_email VARCHAR(120) NULL,
      contact_phone VARCHAR(30) NULL,
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
      rating TINYINT NULL,
      comment TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_reviews_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
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
  await dbPool.query("ALTER TABLE reviews MODIFY COLUMN rating TINYINT NULL");
  await dbPool.query("ALTER TABLE reviews MODIFY COLUMN comment TEXT NULL");
  await ensureCheckConstraint("reviews", "chk_reviews_rating", "(rating IS NULL OR rating BETWEEN 1 AND 5)");

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS trips (
      id VARCHAR(64) PRIMARY KEY,
      created_by_agent_user_id VARCHAR(64) NULL,
      customer_user_id VARCHAR(64) NULL,
      title VARCHAR(120) NULL,
      location VARCHAR(140) NULL,
      trip_date DATE NULL,
      trip_time TIME NULL,
      status ENUM('planned','scheduled','ongoing','done','cancelled') NOT NULL DEFAULT 'planned',
      notes TEXT NULL,
      attendees_json JSON NULL,
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
    CREATE TABLE IF NOT EXISTS calendar_events (
      id VARCHAR(96) PRIMARY KEY,
      source_kind VARCHAR(30) NOT NULL,
      source_record_id VARCHAR(64) NOT NULL,
      title VARCHAR(160) NOT NULL,
      event_date DATE NULL,
      event_time TIME NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      customer_username VARCHAR(50) NULL,
      agent_username VARCHAR(50) NULL,
      property_id VARCHAR(64) NULL,
      location VARCHAR(160) NULL,
      notes TEXT NULL,
      meta_json JSON NULL,
      google_event_id VARCHAR(255) NULL,
      google_html_link TEXT NULL,
      google_sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      google_sync_error TEXT NULL,
      google_synced_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await ensureColumn("trips", "title", "VARCHAR(120) NULL AFTER customer_user_id");
  await ensureColumn("trips", "location", "VARCHAR(140) NULL AFTER title");
  await ensureColumn("trips", "attendees_json", "JSON NULL AFTER notes");
  await ensureIndex("properties", "idx_properties_agent_user_id", "(agent_user_id)");
  await ensureIndex("appointments", "idx_appointments_property_id", "(property_id)");
  await ensureIndex("appointments", "idx_appointments_customer_user_id", "(customer_user_id)");
  await ensureIndex("appointments", "idx_appointments_assigned_agent_user_id", "(assigned_agent_user_id)");
  await ensureIndex("appointments", "idx_appointments_schedule", "(appointment_date, appointment_time)");
  await ensureIndex("office_meets", "idx_office_meets_customer_user_id", "(customer_user_id)");
  await ensureIndex("office_meets", "idx_office_meets_assigned_agent_user_id", "(assigned_agent_user_id)");
  await ensureIndex("office_meets", "idx_office_meets_schedule", "(meet_date, meet_time)");
  await ensureIndex("reviews", "idx_reviews_customer_user_id", "(customer_user_id)");
  await ensureIndex("reviews", "idx_reviews_property_id", "(property_id)");
  await ensureIndex("trips", "idx_trips_created_by_agent_user_id", "(created_by_agent_user_id)");
  await ensureIndex("trips", "idx_trips_customer_user_id", "(customer_user_id)");
  await ensureIndex("trips", "idx_trips_schedule", "(trip_date, trip_time)");
  await ensureIndex("calendar_events", "idx_calendar_events_source", "(source_kind, source_record_id)");
  await ensureIndex("calendar_events", "idx_calendar_events_schedule", "(event_date, event_time)");
  await ensureIndex("calendar_events", "idx_calendar_events_status", "(status)");

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
  await ensureIndex("notifications", "idx_notifications_recipient_user_id", "(recipient_user_id)");
  await ensureIndex("notifications", "idx_notifications_appointment_id", "(appointment_id)");
  await ensureIndex("notifications", "idx_notifications_office_meet_id", "(office_meet_id)");
  await ensureIndex("notifications", "idx_notifications_created_at", "(created_at)");

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(64) PRIMARY KEY,
      sender_user_id VARCHAR(64) NULL,
      recipient_user_id VARCHAR(64) NULL,
      direction ENUM('outbound','inbound','system') NOT NULL DEFAULT 'outbound',
      channel ENUM('app','sms') NOT NULL DEFAULT 'app',
      provider VARCHAR(30) NOT NULL DEFAULT 'internal',
      provider_message_id VARCHAR(128) NULL,
      provider_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      sender_phone VARCHAR(32) NOT NULL,
      recipient_phone VARCHAR(32) NOT NULL,
      content TEXT NOT NULL,
      error_message TEXT NULL,
      meta JSON NULL,
      read_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_messages_sender
        FOREIGN KEY (sender_user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_messages_recipient
        FOREIGN KEY (recipient_user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await ensureIndex("messages", "idx_messages_sender_user_id", "(sender_user_id)");
  await ensureIndex("messages", "idx_messages_recipient_user_id", "(recipient_user_id)");
  await ensureIndex("messages", "idx_messages_provider_message_id", "(provider_message_id)");
  await ensureIndex("messages", "idx_messages_created_at", "(created_at)");
  await dbPool.query("ALTER TABLE messages MODIFY COLUMN channel ENUM('app','sms') NOT NULL DEFAULT 'app'");
  await dbPool.query("ALTER TABLE messages MODIFY COLUMN provider VARCHAR(30) NOT NULL DEFAULT 'internal'");

  await dbPool.query("ALTER TABLE appointments MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'pending'");
  await dbPool.query("ALTER TABLE office_meets MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'pending'");
  await dbPool.query("ALTER TABLE trips MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'confirmed'");

  await ensureColumn("users", "photo_url", "TEXT NULL");
  await ensureColumn("users", "account_status", "VARCHAR(20) NOT NULL DEFAULT 'active'");
  await ensureColumn("users", "availability_status", "VARCHAR(20) NOT NULL DEFAULT 'available'");
  await ensureColumn("users", "last_active_at", "DATETIME NULL");
  await ensureColumn("users", "deactivated_at", "DATETIME NULL");

  await ensureColumn("properties", "listing_type", "VARCHAR(20) NOT NULL DEFAULT 'sale'");
  await ensureColumn("properties", "property_type", "VARCHAR(40) NOT NULL DEFAULT 'house'");
  await ensureColumn("properties", "property_status", "VARCHAR(20) NOT NULL DEFAULT 'available'");
  await ensureColumn("properties", "image_urls_json", "JSON NULL");
  await ensureColumn("properties", "archived_at", "DATETIME NULL");
  await ensureColumn("properties", "archived_by_user_id", "VARCHAR(64) NULL");

  await ensureColumn("appointments", "completed_at", "DATETIME NULL");
  await ensureColumn("appointments", "cancelled_at", "DATETIME NULL");
  await ensureColumn("appointments", "rescheduled_at", "DATETIME NULL");
  await ensureColumn("appointments", "expired_at", "DATETIME NULL");
  await ensureColumn("appointments", "appointment_type", "VARCHAR(40) NOT NULL DEFAULT 'property_viewing'");
  await ensureColumn("appointments", "contact_full_name", "VARCHAR(90) NULL");
  await ensureColumn("appointments", "contact_email", "VARCHAR(120) NULL");
  await ensureColumn("appointments", "contact_phone", "VARCHAR(30) NULL");
  await ensureColumn("appointments", "outcome_notes", "TEXT NULL");
  await ensureColumn("appointments", "cancel_reason", "TEXT NULL");
  await ensureColumn("appointments", "no_show_at", "DATETIME NULL");
  await ensureColumn("appointments", "google_event_id", "VARCHAR(255) NULL");
  await ensureColumn("appointments", "google_html_link", "TEXT NULL");
  await ensureColumn("appointments", "google_sync_status", "VARCHAR(20) NOT NULL DEFAULT 'pending'");
  await ensureColumn("appointments", "google_sync_error", "TEXT NULL");
  await ensureColumn("appointments", "google_synced_at", "DATETIME NULL");

  await ensureColumn("office_meets", "phone", "VARCHAR(30) NULL");
  await ensureColumn("office_meets", "related_property_id", "VARCHAR(64) NULL");
  await ensureColumn("office_meets", "notes", "TEXT NULL");
  await ensureColumn("office_meets", "outcome_notes", "TEXT NULL");
  await ensureColumn("office_meets", "completed_at", "DATETIME NULL");
  await ensureColumn("office_meets", "cancelled_at", "DATETIME NULL");
  await ensureColumn("office_meets", "rescheduled_at", "DATETIME NULL");
  await ensureColumn("office_meets", "expired_at", "DATETIME NULL");
  await ensureColumn("office_meets", "no_show_at", "DATETIME NULL");
  await ensureColumn("office_meets", "google_event_id", "VARCHAR(255) NULL");
  await ensureColumn("office_meets", "google_html_link", "TEXT NULL");
  await ensureColumn("office_meets", "google_sync_status", "VARCHAR(20) NOT NULL DEFAULT 'pending'");
  await ensureColumn("office_meets", "google_sync_error", "TEXT NULL");
  await ensureColumn("office_meets", "google_synced_at", "DATETIME NULL");

  await ensureColumn("trips", "completed_at", "DATETIME NULL");
  await ensureColumn("trips", "cancelled_at", "DATETIME NULL");
  await ensureColumn("trips", "rescheduled_at", "DATETIME NULL");
  await ensureColumn("trips", "expired_at", "DATETIME NULL");
  await ensureColumn("trips", "outcome_notes", "TEXT NULL");
  await ensureColumn("trips", "google_event_id", "VARCHAR(255) NULL");
  await ensureColumn("trips", "google_html_link", "TEXT NULL");
  await ensureColumn("trips", "google_sync_status", "VARCHAR(20) NOT NULL DEFAULT 'pending'");
  await ensureColumn("trips", "google_sync_error", "TEXT NULL");
  await ensureColumn("trips", "google_synced_at", "DATETIME NULL");

  await ensureIndex("properties", "idx_properties_archived_at", "(archived_at)");
  await ensureIndex("appointments", "idx_appointments_status", "(status)");
  await ensureIndex("office_meets", "idx_office_meets_status", "(status)");
  await ensureIndex("trips", "idx_trips_status", "(status)");
};
const ensureDbReady = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = ensureDbSchema().catch((err) => {
      schemaReadyPromise = null;
      if (err && !err.startupPhase) {
        err.startupPhase = "schema init";
      }
      throw err;
    });
  }
  await schemaReadyPromise;
};

const normalizeCollection = (value) => (Array.isArray(value) ? value : []);
const normalizeRecordCollection = (value) =>
  normalizeCollection(value).filter((item) => item && typeof item === "object" && !Array.isArray(item));
const clone = (value) => JSON.parse(JSON.stringify(value));
const clean = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const toStartupError = (errorLike) =>
  errorLike instanceof Error ? errorLike : new Error(String(errorLike || "Unknown startup error"));
const markStartupAttempt = (phase) => {
  startupRuntimeState.attempted = true;
  startupRuntimeState.phase = clean(phase || "startup", 60) || "startup";
  startupRuntimeState.lastAttemptAt = new Date().toISOString();
};
const markStartupReady = () => {
  startupRuntimeState.phase = "ready";
  startupRuntimeState.ready = true;
  startupRuntimeState.lastError = null;
  startupRuntimeState.lastSuccessAt = new Date().toISOString();
};
const markStartupFailure = (errorLike) => {
  const error = toStartupError(errorLike);
  startupRuntimeState.phase = clean(error?.startupPhase || "startup", 60) || "startup";
  startupRuntimeState.ready = false;
  startupRuntimeState.lastError = error;
  startupRuntimeState.lastAttemptAt = new Date().toISOString();
  return error;
};
const buildStartupHealthPayload = ({ scope = "app" } = {}) => {
  const error = startupRuntimeState.lastError;
  return {
    ok: true,
    service: scope,
    time: new Date().toISOString(),
    uptimeSeconds: Number(process.uptime().toFixed(0)),
    startup: {
      attempted: startupRuntimeState.attempted,
      phase: startupRuntimeState.phase,
      ready: startupRuntimeState.ready,
      degraded: Boolean(error),
      lastAttemptAt: startupRuntimeState.lastAttemptAt || null,
      lastSuccessAt: startupRuntimeState.lastSuccessAt || null
    },
    database: {
      client: DB_CLIENT,
      ready: startupRuntimeState.ready,
      endpoint: env.db.connectionString ? "configured" : `${env.db.host}:${env.db.port}`
    },
    error: error
      ? {
          phase: clean(error?.startupPhase || startupRuntimeState.phase, 60) || "startup",
          message: clean(error?.message || "Startup failed.", 300),
          hint: error?.hint ? clean(error.hint, 500) : "",
          details: error?.details || null
        }
      : null
  };
};
const buildServiceUnavailablePayload = () => {
  const error = startupRuntimeState.lastError;
  return {
    ok: false,
    message: "API is running in degraded mode because the database is unavailable.",
    startupPhase: startupRuntimeState.phase,
    hint: error?.hint ? clean(error.hint, 500) : "Check the database connection and try again.",
    details: error?.details || null
  };
};
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/;
const formatLocalDateOnly = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const extractDateOnlyString = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (DATE_ONLY_RE.test(raw)) return raw;
  const match = raw.match(ISO_DATE_PREFIX_RE);
  if (match?.[1]) return match[1];
  return "";
};
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
  if (value instanceof Date) {
    return formatLocalDateOnly(value) || null;
  }
  const raw = String(value).trim();
  const extracted = extractDateOnlyString(raw);
  if (extracted) return extracted;
  if (/^[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}$/.test(raw)) {
    const year = new Date().getFullYear();
    const d = new Date(`${raw} ${year}`);
    if (!Number.isNaN(d.getTime())) return formatLocalDateOnly(d) || null;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return formatLocalDateOnly(d) || null;
};
const toIsoDateOnly = (value) => {
  if (!value) return "";
  if (value instanceof Date) {
    return formatLocalDateOnly(value);
  }
  const raw = String(value).trim();
  const extracted = extractDateOnlyString(raw);
  if (extracted) return extracted;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : formatLocalDateOnly(d);
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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/i;
const PHONE_RE = /^[0-9+\-()\s]{7,20}$/;
const isValidEmail = (value) => EMAIL_RE.test(clean(value, 120).toLowerCase());
const isValidUsername = (value) => USERNAME_RE.test(clean(value, 50).replace(/\s+/g, "").toLowerCase());
const isValidPhone = (value) => PHONE_RE.test(clean(value, 30));
const normalizeSmsPhone = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/[^\d+]/g, "");
  if (!compact) return "";
  if (compact.startsWith("+")) {
    const digits = compact.slice(1).replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : "";
  }
  if (compact.startsWith("00")) {
    const digits = compact.slice(2).replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : "";
  }
  const digits = compact.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0") && HTTPSMS_DEFAULT_COUNTRY_CODE) {
    const local = digits.replace(/^0+/, "");
    const normalized = `${HTTPSMS_DEFAULT_COUNTRY_CODE}${local}`;
    return normalized.length >= 8 && normalized.length <= 15 ? `+${normalized}` : "";
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return "";
};
const isStrongPassword = (value, min = 6) => String(value || "").trim().length >= min;
const startOfToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};
const isFutureOrToday = (dateValue) => {
  if (!isIsoDate(dateValue)) return false;
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() >= startOfToday().getTime();
};
const sanitizeStateMeta = (value) => ensureObject(value);
const SHARED_STATUS_VALUES = new Set(["pending", "confirmed", "rescheduled", "completed", "cancelled", "declined", "no_show", "expired"]);
const APPOINTMENT_STATUS_VALUES = new Set(["pending", "confirmed", "rescheduled", "completed", "cancelled", "no_show", "expired"]);
const OFFICE_MEETING_STATUS_VALUES = new Set(["pending", "confirmed", "rescheduled", "completed", "cancelled", "declined", "no_show", "expired"]);
const TOUR_STATUS_VALUES = new Set(["confirmed", "rescheduled", "completed", "cancelled", "expired"]);
const ACCOUNT_STATUS_VALUES = new Set(["active", "inactive"]);
const AVAILABILITY_STATUS_VALUES = new Set(["available", "busy", "offline"]);
const LISTING_TYPE_VALUES = new Set(["sale", "rent"]);
const PROPERTY_STATUS_VALUES = new Set(["available", "reserved", "sold", "rented", "archived", "inactive"]);
const RESIDENTIAL_PROPERTY_TYPES = new Set(["house", "villa", "condo", "townhouse", "apartment", "duplex"]);
const LOW_DETAIL_PROPERTY_TYPES = new Set(["studio", "lot", "land", "commercial", "office"]);
const APPOINTMENT_TRANSITIONS = {
  pending: new Set(["confirmed", "cancelled", "expired"]),
  confirmed: new Set(["completed", "cancelled", "rescheduled", "no_show", "expired"]),
  rescheduled: new Set(["confirmed", "cancelled", "expired"]),
  completed: new Set(),
  cancelled: new Set(),
  no_show: new Set(),
  expired: new Set()
};
const OFFICE_MEETING_TRANSITIONS = {
  pending: new Set(["confirmed", "declined", "cancelled", "expired"]),
  confirmed: new Set(["completed", "rescheduled", "cancelled", "no_show", "expired"]),
  rescheduled: new Set(["confirmed", "cancelled", "expired"]),
  completed: new Set(),
  declined: new Set(),
  cancelled: new Set(),
  no_show: new Set(),
  expired: new Set()
};
const TOUR_TRANSITIONS = {
  confirmed: new Set(["completed", "cancelled", "rescheduled", "expired"]),
  rescheduled: new Set(["confirmed", "cancelled", "expired"]),
  completed: new Set(),
  cancelled: new Set(),
  expired: new Set()
};
const OFFICE_MEETING_START_MINUTES = 8 * 60;
const OFFICE_MEETING_WEEKDAY_END_MINUTES = 17 * 60;
const OFFICE_MEETING_SATURDAY_END_MINUTES = 13 * 60;

const titleCaseWords = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

const normalizeWhitespace = (value, max = 240) =>
  clean(value, max)
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s{2,}/g, " ");

const normalizeLocation = (value) => {
  const raw = normalizeWhitespace(value, 160);
  if (!raw) return "";
  return raw
    .split(",")
    .map((part) => titleCaseWords(part))
    .filter(Boolean)
    .join(", ");
};

const normalizeAccountStatus = (value) => enumOr(value, ACCOUNT_STATUS_VALUES, "active");
const normalizeAvailabilityStatus = (value) => enumOr(value, AVAILABILITY_STATUS_VALUES, "available");

const inferPropertyType = (propertyLike) => {
  const title = `${propertyLike?.title || ""} ${propertyLike?.description || ""}`.toLowerCase();
  if (title.includes("condo")) return "condo";
  if (title.includes("townhouse")) return "townhouse";
  if (title.includes("villa")) return "villa";
  if (title.includes("apartment")) return "apartment";
  if (title.includes("duplex")) return "duplex";
  if (title.includes("studio")) return "studio";
  if (title.includes("office")) return "office";
  if (title.includes("commercial")) return "commercial";
  if (title.includes("lot")) return "lot";
  if (title.includes("land")) return "land";
  return "house";
};

const normalizePropertyType = (value, propertyLike = {}) => {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (raw) {
    const mapped = raw === "empty_lot" ? "lot" : raw === "vacation_house" ? "house" : raw;
    if (mapped) return mapped;
  }
  return inferPropertyType(propertyLike);
};

const normalizeListingType = (value, propertyLike = {}) => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "for rent" || raw === "for_rent") return "rent";
  if (raw === "for sale" || raw === "for_sale") return "sale";
  if (LISTING_TYPE_VALUES.has(raw)) return raw;
  const searchable = `${propertyLike?.title || ""} ${propertyLike?.description || ""}`.toLowerCase();
  if (/\b(rent|rental|lease|monthly)\b/.test(searchable)) return "rent";
  return "sale";
};

const normalizePropertyStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pending") return "reserved";
  if (normalized === "unavailable") return "inactive";
  return enumOr(normalized, PROPERTY_STATUS_VALUES, "available");
};

const normalizeSharedStatus = (value, fallback = "pending") => {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return fallback;
  if (SHARED_STATUS_VALUES.has(normalized)) return normalized;
  if (normalized === "approved") return "confirmed";
  if (normalized === "done" || normalized === "completed") return "completed";
  if (normalized === "planned" || normalized === "scheduled" || normalized === "ongoing" || normalized === "in_progress") return "confirmed";
  if (normalized === "decline") return "declined";
  if (normalized === "canceled") return "cancelled";
  if (normalized === "no_show") return "no_show";
  return fallback;
};

const normalizeAppointmentStatus = (value) => {
  const normalized = normalizeSharedStatus(value, "pending");
  if (normalized === "declined") return "cancelled";
  return APPOINTMENT_STATUS_VALUES.has(normalized) ? normalized : "pending";
};

const normalizeOfficeMeetingStatus = (value) => {
  const normalized = normalizeSharedStatus(value, "pending");
  return OFFICE_MEETING_STATUS_VALUES.has(normalized) ? normalized : "pending";
};

const normalizeTripStatusForStorage = (value) => {
  const normalized = normalizeSharedStatus(value, "confirmed");
  return TOUR_STATUS_VALUES.has(normalized) ? normalized : "confirmed";
};

const normalizeTripStatusForClient = (value) => normalizeTripStatusForStorage(value);

const normalizeStatusForKind = (kind, value) => {
  if (kind === "appointment") return normalizeAppointmentStatus(value);
  if (kind === "office_meeting") return normalizeOfficeMeetingStatus(value);
  if (kind === "tour") return normalizeTripStatusForStorage(value);
  return normalizeSharedStatus(value, "pending");
};

const toScheduleStamp = (dateValue, timeValue = "00:00") => {
  if (!isIsoDate(dateValue) || !isHHMM(timeValue)) return Number.NaN;
  const stamp = new Date(`${dateValue}T${timeValue}:00`).getTime();
  return Number.isNaN(stamp) ? Number.NaN : stamp;
};

const isFutureOrNowSchedule = (dateValue, timeValue) => {
  const stamp = toScheduleStamp(dateValue, timeValue);
  return Number.isFinite(stamp) && stamp >= Date.now();
};

const isPastSchedule = (dateValue, timeValue) => {
  const stamp = toScheduleStamp(dateValue, timeValue);
  return Number.isFinite(stamp) && stamp < Date.now();
};

const parseMinutes = (timeValue) => {
  const raw = String(timeValue || "").trim();
  const match = raw.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return (hours * 60) + minutes;
};

const isWithinOfficeHours = (dateValue, timeValue) => {
  if (!isIsoDate(dateValue) || !isHHMM(timeValue)) return false;
  const schedule = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(schedule.getTime())) return false;
  const day = schedule.getDay();
  if (day === 0) return false;
  const minutes = parseMinutes(timeValue);
  if (minutes === null) return false;
  const maxMinutes = day === 6 ? OFFICE_MEETING_SATURDAY_END_MINUTES : OFFICE_MEETING_WEEKDAY_END_MINUTES;
  return minutes >= OFFICE_MEETING_START_MINUTES && minutes <= maxMinutes;
};

const isTerminalWorkflowStatus = (statusLike) => {
  const status = normalizeSharedStatus(statusLike, "");
  return status === "completed" || status === "cancelled" || status === "declined" || status === "no_show" || status === "expired";
};

const maybeExpireWorkflowRecord = (kind, recordLike) => {
  const record = ensureObject(recordLike);
  const nowIso = new Date().toISOString();
  const dateValue = clean(record.date || record.meetDate || record.tripDate, 20);
  const timeValue = clean(record.time || record.meetTime || record.tripTime, 10);
  const normalizedStatus = normalizeStatusForKind(kind, record.status);
  if (!dateValue || !timeValue) {
    return { ...record, status: normalizedStatus };
  }
  const expirable = normalizedStatus === "pending" || normalizedStatus === "confirmed" || normalizedStatus === "rescheduled";
  if (expirable && isPastSchedule(dateValue, timeValue)) {
    return {
      ...record,
      status: "expired",
      expiredAt: record.expiredAt || nowIso,
      updatedAt: record.updatedAt || nowIso
    };
  }
  return { ...record, status: normalizedStatus };
};

const getTransitionMap = (kind) => {
  if (kind === "appointment") return APPOINTMENT_TRANSITIONS;
  if (kind === "office_meeting") return OFFICE_MEETING_TRANSITIONS;
  return TOUR_TRANSITIONS;
};

const isValidTransition = (kind, currentStatus, nextStatus) => {
  const current = normalizeStatusForKind(kind, currentStatus);
  const next = normalizeStatusForKind(kind, nextStatus);
  if (current === next) return true;
  const map = getTransitionMap(kind);
  return Boolean(map[current]?.has(next));
};

const buildLifecyclePatch = (currentRecord, kind, nextStatus) => {
  const nowIso = new Date().toISOString();
  const current = normalizeStatusForKind(kind, currentRecord?.status);
  const next = normalizeStatusForKind(kind, nextStatus);
  if (current === next) return { updatedAt: nowIso };

  const patch = { updatedAt: nowIso };
  if (next === "completed") patch.completedAt = currentRecord?.completedAt || nowIso;
  if (next === "cancelled" || next === "declined") patch.cancelledAt = currentRecord?.cancelledAt || nowIso;
  if (next === "rescheduled") patch.rescheduledAt = currentRecord?.rescheduledAt || nowIso;
  if (next === "expired") patch.expiredAt = currentRecord?.expiredAt || nowIso;
  if (next === "no_show") patch.noShowAt = currentRecord?.noShowAt || nowIso;
  return patch;
};

const GOOGLE_SYNC_STATUS_VALUES = new Set(["pending", "synced", "error"]);
const normalizeGoogleSyncStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return GOOGLE_SYNC_STATUS_VALUES.has(normalized) ? normalized : "pending";
};
const sanitizeGoogleSyncFields = (recordLike) => {
  const record = ensureObject(recordLike);
  return {
    googleEventId: clean(record.googleEventId, 255),
    googleHtmlLink: clean(record.googleHtmlLink, 1500),
    googleSyncStatus: normalizeGoogleSyncStatus(record.googleSyncStatus),
    googleSyncError: clean(record.googleSyncError, 1000),
    googleSyncedAt: toIso(record.googleSyncedAt)
  };
};

const formatPriceSuffix = (listingType, price) => normalizeListingType(listingType) === "rent" ? `${parseNumber(price)}/month` : parseNumber(price);
const sanitizeTripAttendees = (value, fallbackCustomer = "") => {
  const attendees = [];
  const seen = new Set();
  const add = (entry) => {
    const normalized = clean(entry, 50);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    attendees.push(normalized);
  };

  add(fallbackCustomer);
  if (Array.isArray(value)) value.forEach(add);
  return attendees;
};
const sanitizeTripRecord = (value) => {
  const trip = ensureObject(value);
  const candidatePropertyIds = Array.isArray(trip.propertyIds)
    ? trip.propertyIds
    : Array.isArray(trip.properties)
      ? trip.properties
      : trip.propertyId
        ? [trip.propertyId]
        : [];
  const seenPropertyIds = new Set();
  const propertyIds = [];
  candidatePropertyIds.forEach((propertyId) => {
    const normalized = clean(propertyId, 64);
    if (!normalized || seenPropertyIds.has(normalized)) return;
    seenPropertyIds.add(normalized);
    propertyIds.push(normalized);
  });

  const customer = clean(trip.customer, 50);
  const attendees = sanitizeTripAttendees(trip.attendees || trip.members, customer);
  const normalizedTime = toSqlTime(trip.time);

  return {
    ...trip,
    id: clean(trip.id, 64),
    createdBy: clean(trip.createdBy || trip.agent, 50),
    agent: clean(trip.agent || trip.createdBy, 50),
    customer: customer || attendees[0] || "",
    title: clean(trip.title, 120),
    location: normalizeLocation(trip.location),
    date: toIsoDateOnly(trip.date),
    time: normalizedTime ? normalizedTime.slice(0, 5) : "",
    status: normalizeTripStatusForClient(trip.status),
    notes: clean(trip.notes, 1200),
    outcomeNotes: clean(trip.outcomeNotes, 1500),
    attendees,
    propertyIds,
    createdAt: toIso(trip.createdAt),
    updatedAt: toIso(trip.updatedAt),
    completedAt: toIso(trip.completedAt),
    cancelledAt: toIso(trip.cancelledAt),
    rescheduledAt: toIso(trip.rescheduledAt),
    expiredAt: toIso(trip.expiredAt),
    ...sanitizeGoogleSyncFields(trip)
  };
};
const sanitizeUserRecord = (value) => {
  const user = ensureObject(value);
  const role = toRole(user.role) || "customer";
  return {
    ...user,
    id: clean(user.id, 64),
    username: clean(user.username, 50).replace(/\s+/g, "").toLowerCase(),
    password: clean(user.password, 255),
    role: role === "admin" || role === "agent" ? role : "customer",
    fullName: clean(user.fullName, 90),
    email: clean(user.email, 120).toLowerCase(),
    phone: clean(user.phone, 30),
    photoUrl: clean(user.photoUrl, 1000),
    accountStatus: normalizeAccountStatus(user.accountStatus),
    availabilityStatus: normalizeAvailabilityStatus(user.availabilityStatus),
    lastActiveAt: toIso(user.lastActiveAt),
    deactivatedAt: toIso(user.deactivatedAt),
    createdAt: toIso(user.createdAt),
    updatedAt: toIso(user.updatedAt)
  };
};

const sanitizePropertyRecord = (value) => {
  const property = ensureObject(value);
  const listingType = normalizeListingType(property.listingType, property);
  const propertyType = normalizePropertyType(property.propertyType, property);
  const rawImageUrls = Array.isArray(property.imageUrls)
    ? property.imageUrls
    : typeof property.imageUrls === "string"
      ? (() => {
        const candidate = clean(property.imageUrls, 8000);
        if (!candidate) return [];
        if (!candidate.startsWith("[")) return [candidate];
        try {
          const parsed = JSON.parse(candidate);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })()
      : [];
  const seenImages = new Set();
  const cleanImage = (candidate) => {
    const cleanedImage = clean(candidate, 1000);
    if (!cleanedImage || !isLikelyPropertyImageReference(cleanedImage) || seenImages.has(cleanedImage)) return "";
    seenImages.add(cleanedImage);
    return cleanedImage;
  };

  let primaryImageUrl = cleanImage(property.imageUrl);
  const galleryCandidates = [];
  rawImageUrls.forEach((candidate) => {
    const cleaned = cleanImage(candidate);
    if (cleaned) galleryCandidates.push(cleaned);
  });

  if (!primaryImageUrl && galleryCandidates.length) {
    primaryImageUrl = galleryCandidates.shift() || "";
  }

  const imageUrls = galleryCandidates.filter((candidate) => candidate !== primaryImageUrl).slice(0, 4);
  return {
    ...property,
    id: clean(property.id, 64),
    title: clean(property.title, 120),
    location: normalizeLocation(property.location),
    price: parseNumber(property.price),
    bedrooms: Number.isFinite(Number(property.bedrooms)) ? Math.max(0, Math.trunc(Number(property.bedrooms))) : null,
    bathrooms: Number.isFinite(Number(property.bathrooms)) ? Math.max(0, Math.trunc(Number(property.bathrooms))) : null,
    areaSqft: Number.isFinite(Number(property.areaSqft)) ? Math.max(0, Math.trunc(Number(property.areaSqft))) : null,
    description: clean(property.description, 1200),
    imageUrl: primaryImageUrl,
    imageUrls,
    agent: clean(property.agent, 50),
    listingType,
    propertyType,
    propertyStatus: normalizePropertyStatus(property.propertyStatus || property.status),
    status: normalizePropertyStatus(property.propertyStatus || property.status),
    archivedAt: toIso(property.archivedAt),
    archivedBy: clean(property.archivedBy, 64),
    createdAt: toIso(property.createdAt),
    updatedAt: toIso(property.updatedAt)
  };
};

const persistablePropertyImageUrl = (value) => {
  const candidate = String(value || "").trim();
  if (!candidate) return null;
  if (candidate.startsWith("data:image/")) return null;
  return clean(candidate, 1000) || null;
};

const normalizeAppointmentType = (value) => {
  const raw = clean(value, 40).toLowerCase().replace(/[\s-]+/g, "_");
  if (raw === "virtual_tour" || raw === "consultation") return raw;
  return "property_viewing";
};

const sanitizeAppointmentRecord = (value) => {
  const appointment = maybeExpireWorkflowRecord("appointment", ensureObject(value));
  return {
    ...appointment,
    id: clean(appointment.id, 64),
    propertyId: clean(appointment.propertyId, 64),
    propertyTitle: clean(appointment.propertyTitle, 120),
    location: normalizeLocation(appointment.location),
    propertyImage: clean(appointment.propertyImage, 1000),
    customer: clean(appointment.customer, 50),
    agent: clean(appointment.agent, 50),
    assignedAgent: clean(appointment.assignedAgent || appointment.agent, 50),
    assignedByAdmin: clean(appointment.assignedByAdmin, 50),
    date: toIsoDateOnly(appointment.date),
    time: toSqlTime(appointment.time)?.slice(0, 5) || "",
    appointmentType: normalizeAppointmentType(appointment.appointmentType),
    contactFullName: clean(appointment.contactFullName, 90),
    contactEmail: clean(appointment.contactEmail, 120).toLowerCase(),
    contactPhone: clean(appointment.contactPhone, 30),
    status: normalizeAppointmentStatus(appointment.status),
    notes: clean(appointment.notes, 1500),
    outcomeNotes: clean(appointment.outcomeNotes, 1500),
    cancelReason: clean(appointment.cancelReason, 500),
    assignedAt: toIso(appointment.assignedAt),
    createdAt: toIso(appointment.createdAt),
    updatedAt: toIso(appointment.updatedAt),
    completedAt: toIso(appointment.completedAt),
    cancelledAt: toIso(appointment.cancelledAt),
    rescheduledAt: toIso(appointment.rescheduledAt),
    expiredAt: toIso(appointment.expiredAt),
    noShowAt: toIso(appointment.noShowAt),
    ...sanitizeGoogleSyncFields(appointment)
  };
};

const sanitizeOfficeMeetRecord = (value) => {
  const meet = maybeExpireWorkflowRecord("office_meeting", ensureObject(value));
  return {
    ...meet,
    id: clean(meet.id, 64),
    fullName: clean(meet.fullName, 90),
    email: clean(meet.email, 120).toLowerCase(),
    phone: clean(meet.phone, 30),
    customer: clean(meet.customer || meet.requestedBy, 50),
    requestedBy: clean(meet.requestedBy || meet.customer, 50),
    mode: clean(meet.mode, 20).toLowerCase() === "virtual" ? "virtual" : "office",
    reason: clean(meet.reason, 1200),
    notes: clean(meet.notes, 1500),
    outcomeNotes: clean(meet.outcomeNotes, 1500),
    date: toIsoDateOnly(meet.date),
    time: toSqlTime(meet.time)?.slice(0, 5) || "",
    status: normalizeOfficeMeetingStatus(meet.status),
    assignedAgent: clean(meet.assignedAgent || meet.agent, 50),
    agent: clean(meet.agent || meet.assignedAgent, 50),
    relatedPropertyId: clean(meet.relatedPropertyId || meet.propertyId, 64),
    createdAt: toIso(meet.createdAt),
    updatedAt: toIso(meet.updatedAt),
    completedAt: toIso(meet.completedAt),
    cancelledAt: toIso(meet.cancelledAt),
    rescheduledAt: toIso(meet.rescheduledAt),
    expiredAt: toIso(meet.expiredAt),
    noShowAt: toIso(meet.noShowAt),
    ...sanitizeGoogleSyncFields(meet)
  };
};

const normalizeCalendarEventKind = (value) => {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "trip") return "tour";
  if (normalized === "office_meet" || normalized === "office_meeting") return "office_meeting";
  if (normalized === "appointment" || normalized === "tour") return normalized;
  return "";
};

const buildCalendarEventId = (kind, sourceRecordId) => {
  const normalizedKind = normalizeCalendarEventKind(kind);
  const id = clean(sourceRecordId, 64);
  return normalizedKind && id ? `cal_${normalizedKind}_${id}` : "";
};

const sanitizeCalendarEventRecord = (value) => {
  const event = ensureObject(value);
  const sourceKind = normalizeCalendarEventKind(event.sourceKind || event.kind || event.type);
  const sourceRecordId = clean(event.sourceRecordId || event.sourceId || event.recordId, 64);
  const normalizedTime = toSqlTime(event.time || event.eventTime);
  return {
    ...event,
    id: clean(event.id, 96) || buildCalendarEventId(sourceKind, sourceRecordId),
    sourceKind,
    sourceRecordId,
    title: clean(event.title, 160),
    date: toIsoDateOnly(event.date || event.eventDate),
    time: normalizedTime ? normalizedTime.slice(0, 5) : "",
    status: normalizeStatusForKind(sourceKind, event.status),
    customer: clean(event.customer, 50),
    agent: clean(event.agent, 50),
    propertyId: clean(event.propertyId, 64),
    location: normalizeLocation(event.location),
    notes: clean(event.notes, 1500),
    meta: sanitizeStateMeta(
      typeof event.meta === "string"
        ? (() => {
          try {
            return JSON.parse(event.meta);
          } catch {
            return {};
          }
        })()
        : event.meta
    ),
    createdAt: toIso(event.createdAt),
    updatedAt: toIso(event.updatedAt),
    ...sanitizeGoogleSyncFields(event)
  };
};

const buildCalendarEventsFromState = (dbLike) => {
  const appointments = normalizeRecordCollection(dbLike?.appointments).map((item) => sanitizeAppointmentRecord(item)).map((appointment) => (
    sanitizeCalendarEventRecord({
      sourceKind: "appointment",
      sourceRecordId: appointment.id,
      title: appointment.propertyTitle || "Property Appointment",
      date: appointment.date,
      time: appointment.time,
      status: appointment.status,
      customer: appointment.customer,
      agent: appointment.agent || appointment.assignedAgent,
      propertyId: appointment.propertyId,
      location: appointment.location,
      notes: appointment.notes,
      meta: {
        appointmentId: appointment.id,
        propertyTitle: appointment.propertyTitle,
        outcomeNotes: appointment.outcomeNotes,
        cancelReason: appointment.cancelReason
      },
      googleEventId: appointment.googleEventId,
      googleHtmlLink: appointment.googleHtmlLink,
      googleSyncStatus: appointment.googleSyncStatus,
      googleSyncError: appointment.googleSyncError,
      googleSyncedAt: appointment.googleSyncedAt,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt
    })
  ));
  const officeMeets = normalizeRecordCollection(dbLike?.officeMeets).map((item) => sanitizeOfficeMeetRecord(item)).map((meet) => (
    sanitizeCalendarEventRecord({
      sourceKind: "office_meeting",
      sourceRecordId: meet.id,
      title: meet.mode === "virtual" ? "Virtual Office Meeting" : "Office Meeting",
      date: meet.date,
      time: meet.time,
      status: meet.status,
      customer: meet.customer || meet.requestedBy,
      agent: meet.agent || meet.assignedAgent,
      propertyId: meet.relatedPropertyId,
      location: meet.mode === "virtual" ? "Virtual Meeting" : "",
      notes: meet.notes || meet.reason,
      meta: {
        officeMeetId: meet.id,
        mode: meet.mode,
        reason: meet.reason,
        outcomeNotes: meet.outcomeNotes
      },
      googleEventId: meet.googleEventId,
      googleHtmlLink: meet.googleHtmlLink,
      googleSyncStatus: meet.googleSyncStatus,
      googleSyncError: meet.googleSyncError,
      googleSyncedAt: meet.googleSyncedAt,
      createdAt: meet.createdAt,
      updatedAt: meet.updatedAt
    })
  ));
  const trips = normalizeRecordCollection(dbLike?.trips).map((item) => sanitizeTripRecord(item)).map((trip) => (
    sanitizeCalendarEventRecord({
      sourceKind: "tour",
      sourceRecordId: trip.id,
      title: trip.title || "Property Tour",
      date: trip.date,
      time: trip.time,
      status: trip.status,
      customer: trip.customer,
      agent: trip.agent || trip.createdBy,
      propertyId: Array.isArray(trip.propertyIds) ? clean(trip.propertyIds[0], 64) : "",
      location: trip.location,
      notes: trip.notes,
      meta: {
        tripId: trip.id,
        propertyIds: Array.isArray(trip.propertyIds) ? trip.propertyIds : [],
        attendees: Array.isArray(trip.attendees) ? trip.attendees : [],
        outcomeNotes: trip.outcomeNotes
      },
      googleEventId: trip.googleEventId,
      googleHtmlLink: trip.googleHtmlLink,
      googleSyncStatus: trip.googleSyncStatus,
      googleSyncError: trip.googleSyncError,
      googleSyncedAt: trip.googleSyncedAt,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt
    })
  ));

  return [...appointments, ...officeMeets, ...trips].filter((event) => event.id && event.sourceKind && event.sourceRecordId);
};

const persistCalendarEventsWithConnection = async (conn, dbLike) => {
  const calendarEvents = buildCalendarEventsFromState(dbLike);
  await conn.query("DELETE FROM calendar_events");

  for (const event of calendarEvents) {
    await conn.query(
      `INSERT INTO calendar_events (id, source_kind, source_record_id, title, event_date, event_time, status, customer_username, agent_username, property_id, location, notes, meta_json, google_event_id, google_html_link, google_sync_status, google_sync_error, google_synced_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?)`,
      [
        clean(event.id, 96),
        event.sourceKind,
        clean(event.sourceRecordId, 64),
        clean(event.title, 160) || "Calendar Event",
        toSqlDate(event.date),
        toSqlTime(event.time),
        normalizeStatusForKind(event.sourceKind, event.status),
        clean(event.customer, 50) || null,
        clean(event.agent, 50) || null,
        clean(event.propertyId, 64) || null,
        normalizeLocation(event.location) || null,
        clean(event.notes, 1500) || null,
        JSON.stringify(sanitizeStateMeta(event.meta)),
        clean(event.googleEventId, 255) || null,
        clean(event.googleHtmlLink, 1500) || null,
        normalizeGoogleSyncStatus(event.googleSyncStatus),
        clean(event.googleSyncError, 1000) || null,
        toSqlDateTime(event.googleSyncedAt, false),
        toSqlDateTime(event.createdAt, true),
        toSqlDateTime(event.updatedAt || event.createdAt, false)
      ]
    );
  }

  return calendarEvents;
};

const validatePropertyPayload = ({ title, location, price, listingType, propertyType, propertyStatus, bedrooms, bathrooms, areaSqft }) => {
  if (!title || !location || price <= 0) {
    return "title, location, and a valid positive price are required.";
  }
  if (!LISTING_TYPE_VALUES.has(listingType)) {
    return "Invalid listing type.";
  }
  if (!propertyType) {
    return "Property type is required.";
  }
  if (!PROPERTY_STATUS_VALUES.has(propertyStatus)) {
    return "Invalid property status.";
  }
  const isLowDetail = LOW_DETAIL_PROPERTY_TYPES.has(propertyType);
  if (!isLowDetail && areaSqft <= 0) {
    return "Floor area must be greater than zero for this property type.";
  }
  if (RESIDENTIAL_PROPERTY_TYPES.has(propertyType)) {
    if (bedrooms <= 0) return "Bedrooms must be greater than zero for residential listings.";
    if (bathrooms <= 0) return "Bathrooms must be greater than zero for residential listings.";
  }
  const brMatch = title.match(/(\d+)\s*br/i);
  if (brMatch && Number(brMatch[1]) > 0 && bedrooms < Number(brMatch[1])) {
    return "Bedrooms do not match the listing title.";
  }
  return "";
};
const normalizeStateSegment = (value) => normalizeRecordCollection(value).map((item) => clone(ensureObject(item)));
const assertArraySegment = (container, key) => {
  if (!(key in container)) return null;
  if (!Array.isArray(container[key])) {
    const err = new Error(`Invalid ${key}. Expected an array.`);
    err.statusCode = 400;
    throw err;
  }
  return normalizeStateSegment(container[key]);
};
const dedupeUsersByUsername = (usersLike) => {
  const list = normalizeRecordCollection(usersLike);
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
const allowEphemeralDbFallback = () => {
  const normalized = String(process.env.VERCEL_ALLOW_EPHEMERAL_DB_FALLBACK || "true").trim().toLowerCase();
  return isVercelRuntime && !["0", "false", "no", "off"].includes(normalized);
};
const isStorageFallbackActive = () => allowEphemeralDbFallback() && Boolean(startupRuntimeState.lastError);
const parseFallbackMeta = (value) => {
  if (typeof value === "string") {
    try {
      return sanitizeStateMeta(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return sanitizeStateMeta(value);
};
const normalizeFallbackMessageRecord = (record) => {
  const channel = clean(record?.channel, 20).toLowerCase() || "app";
  return {
    id: clean(record?.id, 64) || makeId("MSG"),
    senderUserId: clean(record?.senderUserId ?? record?.sender_user_id, 64),
    recipientUserId: clean(record?.recipientUserId ?? record?.recipient_user_id, 64),
    direction: clean(record?.direction, 20) || "outbound",
    channel,
    provider: clean(record?.provider, 30) || (channel === "sms" ? "httpsms" : "internal"),
    providerMessageId: clean(record?.providerMessageId ?? record?.provider_message_id, 128),
    providerStatus: clean(record?.providerStatus ?? record?.provider_status, 30) || (channel === "sms" ? "pending" : "sent"),
    senderPhone: normalizeSmsPhone(record?.senderPhone ?? record?.sender_phone),
    recipientPhone: normalizeSmsPhone(record?.recipientPhone ?? record?.recipient_phone),
    content: clean(record?.content, 1500),
    errorMessage: clean(record?.errorMessage ?? record?.error_message, 500),
    meta: parseFallbackMeta(record?.meta),
    readAt: toIso(record?.readAt ?? record?.read_at) || null,
    createdAt: toIso(record?.createdAt ?? record?.created_at) || new Date().toISOString(),
    updatedAt: toIso(record?.updatedAt ?? record?.updated_at) || null
  };
};
const loadFallbackDb = ({ forceReload = false } = {}) => {
  if (!forceReload && cachedDb) {
    return clone(cachedDb);
  }

  let parsed = {};
  if (fs.existsSync(legacyDbPath)) {
    try {
      const raw = fs.readFileSync(legacyDbPath, "utf-8");
      parsed = raw ? JSON.parse(raw) : {};
    } catch (error) {
      console.warn("Failed to read backend/data/db.json for fallback storage:", error);
    }
  }

  const normalized = {
    ...defaultDb,
    users: normalizeRecordCollection(parsed?.users).map((user) => sanitizeUserRecord(user)),
    properties: normalizeRecordCollection(parsed?.properties).map((property) => sanitizePropertyRecord(property)),
    appointments: normalizeRecordCollection(parsed?.appointments).map((appointment) => sanitizeAppointmentRecord(appointment)),
    officeMeets: normalizeRecordCollection(parsed?.officeMeets).map((meet) => sanitizeOfficeMeetRecord(meet)),
    reviews: normalizeRecordCollection(parsed?.reviews),
    notifications: normalizeRecordCollection(parsed?.notifications),
    trips: normalizeRecordCollection(parsed?.trips).map((trip) => sanitizeTripRecord(trip)),
    messages: normalizeRecordCollection(parsed?.messages).map((message) => normalizeFallbackMessageRecord(message))
  };
  normalized.calendarEvents = buildCalendarEventsFromState(normalized);
  cachedDb = ensureDemoUsers(normalized);
  return clone(cachedDb);
};
const saveFallbackDb = async (nextDb) => {
  const normalized = ensureDemoUsers({
    ...defaultDb,
    ...nextDb,
    users: normalizeRecordCollection(nextDb?.users).map((user) => sanitizeUserRecord(user)),
    properties: normalizeRecordCollection(nextDb?.properties).map((property) => sanitizePropertyRecord(property)),
    appointments: normalizeRecordCollection(nextDb?.appointments).map((appointment) => sanitizeAppointmentRecord(appointment)),
    officeMeets: normalizeRecordCollection(nextDb?.officeMeets).map((meet) => sanitizeOfficeMeetRecord(meet)),
    reviews: normalizeRecordCollection(nextDb?.reviews),
    notifications: normalizeRecordCollection(nextDb?.notifications),
    trips: normalizeRecordCollection(nextDb?.trips).map((trip) => sanitizeTripRecord(trip)),
    messages: normalizeRecordCollection(nextDb?.messages).map((message) => normalizeFallbackMessageRecord(message))
  });
  normalized.calendarEvents = buildCalendarEventsFromState(normalized);
  cachedDb = clone(normalized);
  return clone(cachedDb);
};
const loadDb = async ({ forceReload = false } = {}) => {
  if (isStorageFallbackActive()) {
    return loadFallbackDb({ forceReload });
  }
  await ensureDbReady();

  const [usersRows] = await dbPool.query(`
    SELECT id, username, password_hash, full_name, email, phone, role, photo_url, account_status, availability_status, last_active_at, deactivated_at, created_at, updated_at
    FROM users
    ORDER BY created_at DESC, id DESC
  `);
  const idToUsername = new Map(usersRows.map((u) => [String(u.id), String(u.username)]));

  const [propertiesRows] = await dbPool.query(`
    SELECT p.id, p.title, p.location, p.price, p.bedrooms, p.bathrooms, p.area_sqft, p.description, p.image_url, p.image_urls_json, p.status,
           p.listing_type, p.property_type, p.property_status, p.archived_at, p.archived_by_user_id,
           p.created_at, p.updated_at, p.agent_user_id, au.username AS agent_username, ab.username AS archived_by_username
    FROM properties p
    LEFT JOIN users au ON au.id = p.agent_user_id
    LEFT JOIN users ab ON ab.id = p.archived_by_user_id
    ORDER BY p.created_at DESC, p.id DESC
  `);

  const [appointmentsRows] = await dbPool.query(`
    SELECT a.id, a.property_id, a.customer_user_id, a.assigned_agent_user_id, a.assigned_by_admin_user_id,
           a.appointment_date, a.appointment_time, a.appointment_type, a.contact_full_name, a.contact_email, a.contact_phone,
           a.status, a.notes, a.outcome_notes, a.cancel_reason, a.assigned_at,
           a.completed_at, a.cancelled_at, a.rescheduled_at, a.expired_at, a.no_show_at,
           a.google_event_id, a.google_html_link, a.google_sync_status, a.google_sync_error, a.google_synced_at,
           a.created_at, a.updated_at,
           p.title AS property_title, p.location AS property_location, p.image_url AS property_image,
           cu.username AS customer_username, cu.full_name AS customer_full_name, cu.email AS customer_email, cu.phone AS customer_phone,
           au.username AS assigned_agent_username, ad.username AS assigned_by_admin_username
    FROM appointments a
    LEFT JOIN properties p ON p.id = a.property_id
    LEFT JOIN users cu ON cu.id = a.customer_user_id
    LEFT JOIN users au ON au.id = a.assigned_agent_user_id
    LEFT JOIN users ad ON ad.id = a.assigned_by_admin_user_id
    ORDER BY a.created_at DESC, a.id DESC
  `);

  const [officeMeetRows] = await dbPool.query(`
    SELECT m.id, m.customer_user_id, m.assigned_agent_user_id, m.mode, m.reason, m.phone, m.related_property_id, m.notes, m.outcome_notes,
           m.meet_date, m.meet_time, m.status, m.completed_at, m.cancelled_at, m.rescheduled_at, m.expired_at, m.no_show_at,
           m.google_event_id, m.google_html_link, m.google_sync_status, m.google_sync_error, m.google_synced_at,
           m.created_at, m.updated_at,
           cu.username AS customer_username, cu.full_name AS customer_full_name, cu.email AS customer_email,
           au.username AS assigned_agent_username
    FROM office_meets m
    LEFT JOIN users cu ON cu.id = m.customer_user_id
    LEFT JOIN users au ON au.id = m.assigned_agent_user_id
    ORDER BY m.created_at DESC, m.id DESC
  `);

  const [reviewsRows] = await dbPool.query(`
    SELECT r.id, r.appointment_id, r.customer_user_id, r.property_id, r.rating, r.comment, r.created_at,
           cu.username AS customer_username, p.title AS property_title, p.location AS property_location, p.image_url AS property_image,
           au.username AS agent_username
    FROM reviews r
    LEFT JOIN users cu ON cu.id = r.customer_user_id
    LEFT JOIN properties p ON p.id = r.property_id
    LEFT JOIN users au ON au.id = p.agent_user_id
    ORDER BY r.created_at DESC, r.id DESC
  `);

  const [tripsRows] = await dbPool.query(`
    SELECT t.id, t.created_by_agent_user_id, t.customer_user_id, t.title, t.location, t.trip_date, t.trip_time, t.status, t.notes, t.outcome_notes, t.attendees_json,
           t.completed_at, t.cancelled_at, t.rescheduled_at, t.expired_at,
           t.google_event_id, t.google_html_link, t.google_sync_status, t.google_sync_error, t.google_synced_at,
           t.created_at, t.updated_at,
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
      photoUrl: u.photo_url || "",
      accountStatus: normalizeAccountStatus(u.account_status),
      availabilityStatus: normalizeAvailabilityStatus(u.availability_status),
      lastActiveAt: toIso(u.last_active_at),
      deactivatedAt: toIso(u.deactivated_at),
      createdAt: toIso(u.created_at),
      updatedAt: toIso(u.updated_at)
    })).map((user) => sanitizeUserRecord(user)),
    properties: propertiesRows.map((p) => sanitizePropertyRecord({
      id: p.id,
      title: p.title || "",
      location: p.location || "",
      price: parseNumber(p.price),
      bedrooms: p.bedrooms ?? null,
      bathrooms: p.bathrooms ?? null,
      areaSqft: p.area_sqft ?? null,
      description: p.description || "",
      imageUrl: p.image_url || "",
      imageUrls: typeof p.image_urls_json === "string"
        ? (() => {
          try { return JSON.parse(p.image_urls_json); } catch { return []; }
        })()
        : p.image_urls_json,
      status: p.status || p.property_status || "available",
      propertyStatus: p.property_status || p.status || "available",
      listingType: p.listing_type || "",
      propertyType: p.property_type || "",
      agent: p.agent_username || "",
      archivedAt: toIso(p.archived_at),
      archivedBy: p.archived_by_username || "",
      createdAt: toIso(p.created_at),
      updatedAt: toIso(p.updated_at)
    })),
    appointments: appointmentsRows.map((a) => sanitizeAppointmentRecord({
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
      appointmentType: a.appointment_type || "property_viewing",
      contactFullName: a.contact_full_name || a.customer_full_name || "",
      contactEmail: a.contact_email || a.customer_email || "",
      contactPhone: a.contact_phone || a.customer_phone || "",
      status: a.status || "pending",
      notes: a.notes || "",
      outcomeNotes: a.outcome_notes || "",
      cancelReason: a.cancel_reason || "",
      assignedAt: toIso(a.assigned_at),
      completedAt: toIso(a.completed_at),
      cancelledAt: toIso(a.cancelled_at),
      rescheduledAt: toIso(a.rescheduled_at),
      expiredAt: toIso(a.expired_at),
      noShowAt: toIso(a.no_show_at),
      googleEventId: a.google_event_id || "",
      googleHtmlLink: a.google_html_link || "",
      googleSyncStatus: a.google_sync_status || "pending",
      googleSyncError: a.google_sync_error || "",
      googleSyncedAt: toIso(a.google_synced_at),
      createdAt: toIso(a.created_at),
      updatedAt: toIso(a.updated_at)
    })),
    officeMeets: officeMeetRows.map((m) => sanitizeOfficeMeetRecord({
      id: m.id,
      fullName: m.customer_full_name || "",
      email: m.customer_email || "",
      phone: m.phone || "",
      customer: m.customer_username || "",
      requestedBy: m.customer_username || "",
      mode: m.mode || "office",
      reason: m.reason || "",
      notes: m.notes || "",
      outcomeNotes: m.outcome_notes || "",
      relatedPropertyId: m.related_property_id || "",
      date: toIsoDateOnly(m.meet_date),
      time: m.meet_time ? String(m.meet_time).slice(0, 5) : "",
      status: m.status || "pending",
      assignedAgent: m.assigned_agent_username || "",
      agent: m.assigned_agent_username || "",
      completedAt: toIso(m.completed_at),
      cancelledAt: toIso(m.cancelled_at),
      rescheduledAt: toIso(m.rescheduled_at),
      expiredAt: toIso(m.expired_at),
      noShowAt: toIso(m.no_show_at),
      googleEventId: m.google_event_id || "",
      googleHtmlLink: m.google_html_link || "",
      googleSyncStatus: m.google_sync_status || "pending",
      googleSyncError: m.google_sync_error || "",
      googleSyncedAt: toIso(m.google_synced_at),
      createdAt: toIso(m.created_at),
      updatedAt: toIso(m.updated_at)
    })),
    reviews: reviewsRows.map((r) => ({
      id: r.id,
      appointmentId: r.appointment_id,
      customer: r.customer_username || "",
      propertyId: r.property_id,
      propertyTitle: r.property_title || "",
      location: normalizeLocation(r.property_location),
      propertyImage: r.property_image || "",
      agent: r.agent_username || "",
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
    trips: tripsRows.map((t) => sanitizeTripRecord({
      id: t.id,
      createdBy: t.agent_username || "",
      agent: t.agent_username || "",
      customer: t.customer_username || "",
      title: t.title || "",
      location: t.location || "",
      date: toIsoDateOnly(t.trip_date),
      time: t.trip_time ? String(t.trip_time).slice(0, 5) : "",
      status: t.status || "confirmed",
      notes: t.notes || "",
      outcomeNotes: t.outcome_notes || "",
      attendees: typeof t.attendees_json === "string"
        ? (() => {
          try { return JSON.parse(t.attendees_json); } catch { return []; }
        })()
        : t.attendees_json,
      propertyIds: tripPropertyMap.get(String(t.id)) || [],
      completedAt: toIso(t.completed_at),
      cancelledAt: toIso(t.cancelled_at),
      rescheduledAt: toIso(t.rescheduled_at),
      expiredAt: toIso(t.expired_at),
      googleEventId: t.google_event_id || "",
      googleHtmlLink: t.google_html_link || "",
      googleSyncStatus: t.google_sync_status || "pending",
      googleSyncError: t.google_sync_error || "",
      googleSyncedAt: toIso(t.google_synced_at),
      createdAt: toIso(t.created_at),
      updatedAt: toIso(t.updated_at)
    }))
  };
  normalized.calendarEvents = buildCalendarEventsFromState(normalized);
  idToUsername.clear();
  cachedDb = ensureDemoUsers(normalized);
  return clone(cachedDb);
};

const saveDb = async (nextDb) => {
  const normalized = ensureDemoUsers({
    ...defaultDb,
    ...nextDb,
    users: normalizeRecordCollection(nextDb?.users).map((user) => sanitizeUserRecord(user)),
    properties: normalizeRecordCollection(nextDb?.properties).map((property) => sanitizePropertyRecord(property)),
    appointments: normalizeRecordCollection(nextDb?.appointments).map((appointment) => sanitizeAppointmentRecord(appointment)),
    officeMeets: normalizeRecordCollection(nextDb?.officeMeets).map((meet) => sanitizeOfficeMeetRecord(meet)),
    calendarEvents: [],
    reviews: normalizeRecordCollection(nextDb?.reviews),
    notifications: normalizeRecordCollection(nextDb?.notifications),
    trips: normalizeRecordCollection(nextDb?.trips).map((trip) => sanitizeTripRecord(trip)),
    messages: normalizeRecordCollection(nextDb?.messages).map((message) => normalizeFallbackMessageRecord(message))
  });
  normalized.calendarEvents = buildCalendarEventsFromState(normalized);
  if (isStorageFallbackActive()) {
    await saveFallbackDb(normalized);
    return;
  }
  const nextSnapshot = clone(normalized);
  await ensureDbReady();
  const users = dedupeUsersByUsername(nextSnapshot.users).map((user) => sanitizeUserRecord(user));
  nextSnapshot.users = users;
  const properties = normalizeRecordCollection(nextSnapshot.properties).map((property) => sanitizePropertyRecord(property));
  const appointments = normalizeRecordCollection(nextSnapshot.appointments).map((appointment) => sanitizeAppointmentRecord(appointment));
  const officeMeets = normalizeRecordCollection(nextSnapshot.officeMeets).map((meet) => sanitizeOfficeMeetRecord(meet));
  const reviews = normalizeRecordCollection(nextSnapshot.reviews);
  const notifications = normalizeRecordCollection(nextSnapshot.notifications);
  const trips = normalizeRecordCollection(nextSnapshot.trips).map((trip) => sanitizeTripRecord(trip));

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
        `INSERT INTO users (id, username, password_hash, full_name, email, phone, role, photo_url, account_status, availability_status, last_active_at, deactivated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          username,
          password,
          fullName,
          clean(u?.email, 120) || null,
          clean(u?.phone, 30) || null,
          role,
          clean(u?.photoUrl, 1000) || null,
          normalizeAccountStatus(u?.accountStatus),
          normalizeAvailabilityStatus(u?.availabilityStatus),
          toSqlDateTime(u?.lastActiveAt, false),
          toSqlDateTime(u?.deactivatedAt, false),
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
        `INSERT INTO properties (id, agent_user_id, title, location, price, bedrooms, bathrooms, area_sqft, description, image_url, image_urls_json, status, listing_type, property_type, property_status, archived_at, archived_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          agentUserId,
          title,
          normalizeLocation(location),
          parseNumber(p?.price),
          Number.isFinite(Number(p?.bedrooms)) ? Number(p.bedrooms) : null,
          Number.isFinite(Number(p?.bathrooms)) ? Number(p.bathrooms) : null,
          Number.isFinite(Number(p?.areaSqft)) ? Number(p.areaSqft) : null,
          clean(p?.description, 1200) || null,
          persistablePropertyImageUrl(p?.imageUrl),
          Array.isArray(p?.imageUrls) && p.imageUrls.length ? JSON.stringify(p.imageUrls) : null,
          normalizePropertyStatus(p?.propertyStatus || p?.status),
          normalizeListingType(p?.listingType, p),
          normalizePropertyType(p?.propertyType, p),
          normalizePropertyStatus(p?.propertyStatus || p?.status),
          toSqlDateTime(p?.archivedAt, false),
          resolveUserId(p?.archivedBy),
          toSqlDateTime(p?.createdAt, true),
          toSqlDateTime(p?.updatedAt, false)
        ]
      );
      validPropertyIds.add(id);
    }

    const validTripIds = new Set();
    const tripPropertyRows = [];
    for (const t of trips) {
      const trip = sanitizeTripRecord(t);
      const id = String(trip?.id || "").trim();
      if (!id) continue;
      const createdByAgentUserId = resolveUserId(trip?.createdBy || trip?.agent);
      const customerUserId = resolveUserId(trip?.customer || sanitizeTripAttendees(trip?.attendees)[0]);
      await conn.query(
        `INSERT INTO trips (id, created_by_agent_user_id, customer_user_id, title, location, trip_date, trip_time, status, notes, outcome_notes, attendees_json, completed_at, cancelled_at, rescheduled_at, expired_at, google_event_id, google_html_link, google_sync_status, google_sync_error, google_synced_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          createdByAgentUserId,
          customerUserId,
          clean(trip?.title, 120) || null,
          normalizeLocation(trip?.location) || null,
          toSqlDate(trip?.date),
          toSqlTime(trip?.time),
          normalizeTripStatusForStorage(trip?.status),
          clean(trip?.notes, 1200) || null,
          clean(trip?.outcomeNotes, 1500) || null,
          trip?.attendees?.length ? JSON.stringify(sanitizeTripAttendees(trip.attendees, trip.customer)) : null,
          toSqlDateTime(trip?.completedAt, false),
          toSqlDateTime(trip?.cancelledAt, false),
          toSqlDateTime(trip?.rescheduledAt, false),
          toSqlDateTime(trip?.expiredAt, false),
          clean(trip?.googleEventId, 255) || null,
          clean(trip?.googleHtmlLink, 1500) || null,
          normalizeGoogleSyncStatus(trip?.googleSyncStatus),
          clean(trip?.googleSyncError, 1000) || null,
          toSqlDateTime(trip?.googleSyncedAt, false),
          toSqlDateTime(trip?.createdAt, true),
          toSqlDateTime(trip?.updatedAt, false)
        ]
      );
      validTripIds.add(id);
      const propertyIds = Array.isArray(trip?.propertyIds) ? trip.propertyIds : [];
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
        `INSERT INTO appointments (id, property_id, customer_user_id, assigned_agent_user_id, assigned_by_admin_user_id, appointment_date, appointment_time, appointment_type, contact_full_name, contact_email, contact_phone, status, notes, outcome_notes, cancel_reason, assigned_at, completed_at, cancelled_at, rescheduled_at, expired_at, no_show_at, google_event_id, google_html_link, google_sync_status, google_sync_error, google_synced_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          propertyId,
          customerUserId,
          assignedAgentUserId,
          assignedByAdminUserId,
          appointmentDate,
          appointmentTime,
          normalizeAppointmentType(a?.appointmentType),
          clean(a?.contactFullName, 90) || null,
          clean(a?.contactEmail, 120) || null,
          clean(a?.contactPhone, 30) || null,
          normalizeAppointmentStatus(a?.status),
          clean(a?.notes, 1500) || null,
          clean(a?.outcomeNotes, 1500) || null,
          clean(a?.cancelReason, 500) || null,
          toSqlDateTime(a?.assignedAt, false),
          toSqlDateTime(a?.completedAt, false),
          toSqlDateTime(a?.cancelledAt, false),
          toSqlDateTime(a?.rescheduledAt, false),
          toSqlDateTime(a?.expiredAt, false),
          toSqlDateTime(a?.noShowAt, false),
          clean(a?.googleEventId, 255) || null,
          clean(a?.googleHtmlLink, 1500) || null,
          normalizeGoogleSyncStatus(a?.googleSyncStatus),
          clean(a?.googleSyncError, 1000) || null,
          toSqlDateTime(a?.googleSyncedAt, false),
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
        `INSERT INTO office_meets (id, customer_user_id, assigned_agent_user_id, mode, reason, phone, related_property_id, notes, outcome_notes, meet_date, meet_time, status, completed_at, cancelled_at, rescheduled_at, expired_at, no_show_at, google_event_id, google_html_link, google_sync_status, google_sync_error, google_synced_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          customerUserId,
          assignedAgentUserId,
          mode,
          clean(m?.reason, 1200) || "Meeting request",
          clean(m?.phone, 30) || null,
          validPropertyIds.has(String(m?.relatedPropertyId || "")) ? String(m.relatedPropertyId) : null,
          clean(m?.notes, 1500) || null,
          clean(m?.outcomeNotes, 1500) || null,
          meetDate,
          meetTime,
          normalizeOfficeMeetingStatus(m?.status),
          toSqlDateTime(m?.completedAt, false),
          toSqlDateTime(m?.cancelledAt, false),
          toSqlDateTime(m?.rescheduledAt, false),
          toSqlDateTime(m?.expiredAt, false),
          toSqlDateTime(m?.noShowAt, false),
          clean(m?.googleEventId, 255) || null,
          clean(m?.googleHtmlLink, 1500) || null,
          normalizeGoogleSyncStatus(m?.googleSyncStatus),
          clean(m?.googleSyncError, 1000) || null,
          toSqlDateTime(m?.googleSyncedAt, false),
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
          rating === null || rating === undefined ? null : Math.round(rating),
          clean(r?.comment, 1500) || null,
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

    const persistedCalendarEvents = await persistCalendarEventsWithConnection(conn, {
      appointments: appointments.filter((appointment) => validAppointmentIds.has(String(appointment?.id || "").trim())),
      officeMeets: officeMeets.filter((meet) => validOfficeMeetIds.has(String(meet?.id || "").trim())),
      trips: trips.filter((trip) => validTripIds.has(String(trip?.id || "").trim()))
    });
    nextSnapshot.calendarEvents = persistedCalendarEvents;

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
  normalizeRecordCollection(primary).forEach(add);
  normalizeRecordCollection(secondary).forEach(add);
  return out;
};

const hasAnyPersistentData = (dbLike) => {
  const db = ensureObject(dbLike);
  return (
    normalizeRecordCollection(db.users).length > 0 ||
    normalizeRecordCollection(db.properties).length > 0 ||
    normalizeRecordCollection(db.appointments).length > 0 ||
    normalizeRecordCollection(db.officeMeets).length > 0 ||
    normalizeRecordCollection(db.reviews).length > 0 ||
    normalizeRecordCollection(db.notifications).length > 0 ||
    normalizeRecordCollection(db.trips).length > 0
  );
};

const bootstrapFromLegacyJsonIfNeeded = async () => {
  await ensureDbReady();
  if (!fs.existsSync(legacyDbPath)) return;

  try {
    const raw = fs.readFileSync(legacyDbPath, "utf-8");
    const parsed = raw ? JSON.parse(raw) : {};
    const legacyDb = {
      users: normalizeRecordCollection(parsed?.users).map((user) => sanitizeUserRecord(user)),
      properties: normalizeRecordCollection(parsed?.properties).map((property) => sanitizePropertyRecord(property)),
      appointments: normalizeRecordCollection(parsed?.appointments).map((appointment) => sanitizeAppointmentRecord(appointment)),
      officeMeets: normalizeRecordCollection(parsed?.officeMeets).map((meet) => sanitizeOfficeMeetRecord(meet)),
      reviews: normalizeRecordCollection(parsed?.reviews),
      notifications: normalizeRecordCollection(parsed?.notifications),
      trips: normalizeRecordCollection(parsed?.trips).map((trip) => sanitizeTripRecord(trip))
    };
    const hasLegacyData =
      legacyDb.appointments.length > 0 ||
      legacyDb.officeMeets.length > 0 ||
      legacyDb.reviews.length > 0 ||
      legacyDb.notifications.length > 0 ||
      legacyDb.trips.length > 0;
    if (!hasLegacyData) return;
    const current = await loadDb({ forceReload: true });
    if (hasAnyPersistentData(current)) {
      console.log("Skipped legacy JSON reconciliation because the database already contains data.");
      return;
    }
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
      merged.users.length !== normalizeRecordCollection(current.users).length ||
      merged.properties.length !== normalizeRecordCollection(current.properties).length ||
      merged.appointments.length !== normalizeRecordCollection(current.appointments).length ||
      merged.officeMeets.length !== normalizeRecordCollection(current.officeMeets).length ||
      merged.reviews.length !== normalizeRecordCollection(current.reviews).length ||
      merged.notifications.length !== normalizeRecordCollection(current.notifications).length ||
      merged.trips.length !== normalizeRecordCollection(current.trips).length;
    if (!changed) return;

    await saveDb(merged);
    console.log("Reconciled database data from backend/data/db.json.");
  } catch (error) {
    console.error("Failed to reconcile backend/data/db.json:", error);
  }
};

const rebuildCalendarEventsTableFromCurrentData = async () => {
  await ensureDbReady();
  const db = await loadDb({ forceReload: true });
  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();
    await persistCalendarEventsWithConnection(conn, db);
    await conn.commit();
    cachedDb = null;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
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

const findUserRecord = (db, value) => {
  const needle = String(value || "").trim();
  if (!needle) return null;
  return normalizeRecordCollection(db?.users).find((user) => String(user?.id || "") === needle || String(user?.username || "") === needle) || null;
};

const findPropertyRecord = (db, value) => {
  const needle = String(value || "").trim();
  if (!needle) return null;
  return normalizeRecordCollection(db?.properties).find((property) => String(property?.id || "") === needle) || null;
};

const assertRoleUser = (db, value, role, notFoundMessage = "User not found.") => {
  const user = findUserRecord(db, value);
  if (!user || String(user?.role || "").toLowerCase() !== String(role || "").toLowerCase()) {
    const err = new Error(notFoundMessage);
    err.statusCode = 404;
    throw err;
  }
  if (normalizeAccountStatus(user?.accountStatus) !== "active") {
    const err = new Error("User account is inactive.");
    err.statusCode = 400;
    throw err;
  }
  return user;
};

const ensureAccessibleProperty = (property, message = "Property not found.") => {
  if (!property) {
    const err = new Error(message);
    err.statusCode = 404;
    throw err;
  }
  const propertyStatus = normalizePropertyStatus(property?.propertyStatus || property?.status);
  if (propertyStatus === "archived" || propertyStatus === "inactive" || propertyStatus === "sold" || propertyStatus === "rented") {
    const err = new Error("This property is not available for new requests.");
    err.statusCode = 400;
    throw err;
  }
  return property;
};

const createNotificationRecord = (payload) => {
  const to = clean(payload?.to, 60);
  const message = clean(payload?.message, 1500);
  if (!to || !message) return null;
  return {
    id: makeId("NOTIF"),
    to,
    appointmentId: clean(payload?.appointmentId, 80),
    officeMeetId: clean(payload?.officeMeetId || payload?.meetId, 80),
    title: clean(payload?.title, 120) || "Notification",
    message,
    type: clean(payload?.type, 60) || "general",
    meta: sanitizeStateMeta(payload?.meta),
    readAt: null,
    createdAt: new Date().toISOString()
  };
};

const createMessageNotificationRecord = ({ senderUser, recipientUser, messageLike, eventSource = "app" }) => {
  const recipientUsername = clean(recipientUser?.username, 60);
  const messagePreview = clean(messageLike?.content, 500);
  if (!recipientUsername || !messagePreview) return null;

  const contactUsername = clean(senderUser?.username, 50);
  const senderLabel = clean(senderUser?.fullName, 90) || (contactUsername ? `@${contactUsername}` : "Unknown sender");
  return createNotificationRecord({
    to: recipientUsername,
    type: "message",
    title: `New message from ${senderLabel}`,
    message: messagePreview,
    meta: {
      source: "message",
      messageId: clean(messageLike?.id, 80),
      contactUsername,
      contactUserId: clean(senderUser?.id, 64),
      channel: clean(messageLike?.channel, 20) || "app",
      eventSource: clean(eventSource, 40) || "app",
      createdAt: toIso(messageLike?.createdAt || messageLike?.updatedAt) || new Date().toISOString()
    }
  });
};

const prependUniqueMessageNotification = (items, incoming) => {
  const list = normalizeRecordCollection(items);
  const targetUsername = clean(incoming?.to, 60);
  const incomingMessageId = clean(incoming?.meta?.messageId, 80);
  if (!targetUsername || !incomingMessageId) return [incoming, ...list];

  const isDuplicate = list.some((item) => {
    if (!matchesUsername(item?.to, targetUsername)) return false;
    if (clean(item?.type, 60).toLowerCase() !== "message") return false;
    if (clean(item?.meta?.source, 60).toLowerCase() !== "message") return false;
    return clean(item?.meta?.messageId, 80) === incomingMessageId;
  });

  if (isDuplicate) return list;
  return [incoming, ...list];
};

const persistMessageNotification = async ({ senderUser, recipientUser, messageLike, eventSource = "app" }) => {
  const notification = createMessageNotificationRecord({ senderUser, recipientUser, messageLike, eventSource });
  if (!notification) return null;

  try {
    await updateDb((db) => ({
      ...db,
      notifications: prependUniqueMessageNotification(db.notifications, notification)
    }));
    return notification;
  } catch (error) {
    console.error("Unable to persist message notification:", error);
    return null;
  }
};

const isHttpsmsConfigured = () => HTTPSMS_ENABLED && Boolean(HTTPSMS_API_KEY && normalizeSmsPhone(HTTPSMS_FROM));

const parseStoredMessageMeta = (value) => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return ensureObject(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return sanitizeStateMeta(value);
};

const getMessageTransportMeta = () => ({
  appEnabled: true,
  smsMirrorConfigured: isHttpsmsConfigured(),
  senderPhone: normalizeSmsPhone(HTTPSMS_FROM)
});

const getLegacyMessageTransportMeta = () => {
  const transport = getMessageTransportMeta();
  return {
    transport,
    smsEnabled: HTTPSMS_ENABLED,
    smsConfigured: transport.smsMirrorConfigured,
    senderPhone: transport.senderPhone
  };
};

const buildMessageContactSummary = (contactUser, messageLike) => ({
  id: clean(contactUser?.id, 64),
  username: clean(contactUser?.username, 50),
  fullName: clean(contactUser?.fullName, 90),
  role: toRole(contactUser?.role),
  phone: clean(contactUser?.phone, 30),
  smsPhone: normalizeSmsPhone(contactUser?.phone),
  availabilityStatus: normalizeAvailabilityStatus(contactUser?.availabilityStatus),
  accountStatus: normalizeAccountStatus(contactUser?.accountStatus),
  lastMessage: clean(messageLike?.content, 240),
  lastMessageAt: toIso(messageLike?.createdAt || messageLike?.updatedAt)
});

const decorateMessageWithUsers = (messageLike, senderUser, recipientUser) => ({
  ...messageLike,
  senderUsername: clean(senderUser?.username, 50),
  senderFullName: clean(senderUser?.fullName, 90),
  senderRole: toRole(senderUser?.role),
  recipientUsername: clean(recipientUser?.username, 50),
  recipientFullName: clean(recipientUser?.fullName, 90),
  recipientRole: toRole(recipientUser?.role)
});

const writeMessageStreamEvent = (res, eventType, payload) => {
  if (!res || res.writableEnded) return;
  res.write(`event: ${eventType}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  if (typeof res.flush === "function") res.flush();
};

const removeMessageStreamClient = (username, clientId) => {
  const key = clean(username, 50);
  const list = messageStreamClients.get(key);
  if (!list) return;
  const next = list.filter((client) => client.id !== clientId);
  if (next.length > 0) {
    messageStreamClients.set(key, next);
  } else {
    messageStreamClients.delete(key);
  }
};

const registerMessageStreamClient = (username, res) => {
  const key = clean(username, 50);
  if (!key || !res) return () => {};
  const clientId = `stream_${Date.now()}_${nextMessageStreamClientId += 1}`;
  const heartbeat = setInterval(() => {
    try {
      writeMessageStreamEvent(res, "ping", { ts: new Date().toISOString() });
    } catch {
      clearInterval(heartbeat);
      removeMessageStreamClient(key, clientId);
    }
  }, 25000);
  const next = messageStreamClients.get(key) || [];
  next.push({ id: clientId, res, heartbeat });
  messageStreamClients.set(key, next);
  return () => {
    clearInterval(heartbeat);
    removeMessageStreamClient(key, clientId);
  };
};

const publishMessageStreamEvent = (username, eventType, payload) => {
  const key = clean(username, 50);
  if (!key) return;
  const clients = messageStreamClients.get(key) || [];
  if (!clients.length) return;
  const staleIds = [];
  clients.forEach((client) => {
    try {
      writeMessageStreamEvent(client.res, eventType, payload);
    } catch {
      clearInterval(client.heartbeat);
      staleIds.push(client.id);
    }
  });
  if (staleIds.length > 0) {
    staleIds.forEach((clientId) => removeMessageStreamClient(key, clientId));
  }
};

const publishMessageRealtimeUpdate = ({ eventType, senderUser, recipientUser, messageLike }) => {
  const senderUsername = clean(senderUser?.username, 50);
  const recipientUsername = clean(recipientUser?.username, 50);
  if (!messageLike || (!senderUsername && !recipientUsername)) return;
  const enriched = decorateMessageWithUsers(messageLike, senderUser, recipientUser);

  if (senderUsername && recipientUser) {
    publishMessageStreamEvent(senderUsername, eventType, {
      type: eventType,
      contactUsername: recipientUsername,
      message: serializeMessageForClient(enriched, { username: senderUsername }),
      contactSummary: buildMessageContactSummary(recipientUser, messageLike)
    });
  }

  if (recipientUsername && senderUser) {
    publishMessageStreamEvent(recipientUsername, eventType, {
      type: eventType,
      contactUsername: senderUsername,
      message: serializeMessageForClient(enriched, { username: recipientUsername }),
      contactSummary: buildMessageContactSummary(senderUser, messageLike)
    });
  }
};

const buildMessageContactSummaries = async (db, currentUser) => {
  const userId = clean(currentUser?.id, 64);
  const userPhone = normalizeSmsPhone(currentUser?.phone);
  if (!userId && !userPhone) return new Map();

  if (isStorageFallbackActive()) {
    const rows = normalizeRecordCollection(db?.messages)
      .map((message) => normalizeFallbackMessageRecord(message))
      .sort((a, b) => {
        const timeDelta = Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "");
        if (Number.isFinite(timeDelta) && timeDelta !== 0) return timeDelta;
        return String(b.id || "").localeCompare(String(a.id || ""));
      });

    const next = new Map();
    rows.forEach((row) => {
      const senderUserId = clean(row?.senderUserId, 64);
      const recipientUserId = clean(row?.recipientUserId, 64);
      let counterpartUserId = "";

      if (userId && senderUserId === userId) {
        counterpartUserId = recipientUserId;
      } else if (userId && recipientUserId === userId) {
        counterpartUserId = senderUserId;
      } else if (userPhone) {
        const senderPhone = normalizeSmsPhone(row?.senderPhone);
        const recipientPhone = normalizeSmsPhone(row?.recipientPhone);
        const counterpartPhone = senderPhone === userPhone ? recipientPhone : (recipientPhone === userPhone ? senderPhone : "");
        const counterpartUser = counterpartPhone ? findUserByNormalizedPhone(db?.users, counterpartPhone) : null;
        counterpartUserId = clean(counterpartUser?.id, 64);
      }

      if (!counterpartUserId || next.has(counterpartUserId)) return;
      next.set(counterpartUserId, {
        lastMessage: clean(row?.content, 240),
        lastMessageAt: toIso(row?.createdAt)
      });
    });
    return next;
  }

  const params = [userId || null, userId || null];
  let whereClause = `sender_user_id = ? OR recipient_user_id = ?`;
  if (userPhone) {
    whereClause += ` OR sender_phone = ? OR recipient_phone = ?`;
    params.push(userPhone, userPhone);
  }

  const [rows] = await dbPool.query(
    `SELECT id, sender_user_id, recipient_user_id, sender_phone, recipient_phone, content, created_at
     FROM messages
     WHERE ${whereClause}
     ORDER BY created_at DESC, id DESC`,
    params
  );

  const next = new Map();
  rows.forEach((row) => {
    const senderUserId = clean(row?.sender_user_id, 64);
    const recipientUserId = clean(row?.recipient_user_id, 64);
    let counterpartUserId = "";

    if (userId && senderUserId === userId) {
      counterpartUserId = recipientUserId;
    } else if (userId && recipientUserId === userId) {
      counterpartUserId = senderUserId;
    } else if (userPhone) {
      const senderPhone = normalizeSmsPhone(row?.sender_phone);
      const recipientPhone = normalizeSmsPhone(row?.recipient_phone);
      const counterpartPhone = senderPhone === userPhone ? recipientPhone : (recipientPhone === userPhone ? senderPhone : "");
      const counterpartUser = counterpartPhone ? findUserByNormalizedPhone(db?.users, counterpartPhone) : null;
      counterpartUserId = clean(counterpartUser?.id, 64);
    }

    if (!counterpartUserId || next.has(counterpartUserId)) return;
    next.set(counterpartUserId, {
      lastMessage: clean(row?.content, 240),
      lastMessageAt: toIso(row?.created_at)
    });
  });
  return next;
};

const repairLegacyAppMessageParticipants = async () => {
  if (isStorageFallbackActive()) return 0;
  const [brokenRows] = await dbPool.query(
    `SELECT id, sender_phone, recipient_phone
     FROM messages
     WHERE channel = 'app'
       AND (sender_user_id IS NULL OR recipient_user_id IS NULL)
     ORDER BY created_at DESC, id DESC
     LIMIT 500`
  );
  if (!Array.isArray(brokenRows) || !brokenRows.length) return 0;

  const [userRows] = await dbPool.query(`SELECT id, phone FROM users`);
  const phoneToUserId = new Map();
  userRows.forEach((row) => {
    const normalizedPhone = normalizeSmsPhone(row?.phone);
    const userId = clean(row?.id, 64);
    if (normalizedPhone && userId) {
      phoneToUserId.set(normalizedPhone, userId);
    }
  });

  let repairedCount = 0;
  for (const row of brokenRows) {
    const senderUserId = phoneToUserId.get(normalizeSmsPhone(row?.sender_phone)) || "";
    const recipientUserId = phoneToUserId.get(normalizeSmsPhone(row?.recipient_phone)) || "";
    if (!senderUserId || !recipientUserId) continue;
    await dbPool.query(
      `UPDATE messages
       SET sender_user_id = COALESCE(sender_user_id, ?),
           recipient_user_id = COALESCE(recipient_user_id, ?)
       WHERE id = ?`,
      [senderUserId, recipientUserId, clean(row?.id, 64)]
    );
    repairedCount += 1;
  }
  return repairedCount;
};

const normalizeHttpsmsEventType = (value) => {
  const eventType = clean(value, 80).toLowerCase();
  switch (eventType) {
    case "message.received":
      return "message.phone.received";
    case "message.sent":
      return "message.phone.sent";
    case "message.delivered":
      return "message.phone.delivered";
    case "message.send.failed":
      return "message.phone.send.failed";
    case "message.send.expired":
      return "message.phone.send.expired";
    default:
      return eventType;
  }
};

const canMessageUser = (context, targetUser) => {
  if (!hasRequestUserContext(context) || !targetUser) return false;
  const targetRole = toRole(targetUser?.role);
  if (!targetRole || normalizeAccountStatus(targetUser?.accountStatus) !== "active") return false;
  if (matchesUsername(targetUser?.username, context.username)) return false;
  if (isAdminContext(context)) return true;
  if (context.role === "agent") return targetRole === "customer" || targetRole === "admin";
  if (context.role === "customer") return targetRole === "agent" || targetRole === "admin";
  return false;
};

const findUserByNormalizedPhone = (usersLike, phoneValue) => {
  const normalizedPhone = normalizeSmsPhone(phoneValue);
  if (!normalizedPhone) return null;
  return normalizeRecordCollection(usersLike).find((user) => normalizeSmsPhone(user?.phone) === normalizedPhone) || null;
};

const serializeMessageForClient = (messageLike, context) => {
  const channel = clean(messageLike?.channel, 20).toLowerCase() || "sms";
  const direction = clean(messageLike?.direction, 20) || "outbound";
  const senderUsername = clean(messageLike?.senderUsername, 50);
  const recipientUsername = clean(messageLike?.recipientUsername, 50);
  const currentUsername = clean(context?.username, 50);
  const meta = parseStoredMessageMeta(messageLike?.meta);
  const smsMeta = parseStoredMessageMeta(meta.sms);
  const providerMessageId = clean(messageLike?.providerMessageId, 128);
  const smsProviderMessageId = clean(smsMeta.providerMessageId || providerMessageId, 128);
  const primaryStatus = clean(messageLike?.providerStatus, 30).toLowerCase() || (channel === "app" ? "sent" : "pending");
  const primaryErrorMessage = primaryStatus === "failed" ? clean(messageLike?.errorMessage, 500) : "";
  const smsAttempted = channel === "app" && (
    Boolean(smsMeta.attempted) ||
    Boolean(clean(smsMeta.status, 30)) ||
    Boolean(clean(smsMeta.errorMessage, 500)) ||
    Boolean(smsProviderMessageId)
  );
  return {
    id: clean(messageLike?.id, 64),
    direction,
    channel,
    provider: clean(messageLike?.provider, 30) || (channel === "app" ? "internal" : "httpsms"),
    status: primaryStatus,
    providerMessageId,
    sender: {
      username: senderUsername,
      fullName: clean(messageLike?.senderFullName, 90),
      role: toRole(messageLike?.senderRole) || "",
      phone: clean(messageLike?.senderPhone, 32)
    },
    recipient: {
      username: recipientUsername,
      fullName: clean(messageLike?.recipientFullName, 90),
      role: toRole(messageLike?.recipientRole) || "",
      phone: clean(messageLike?.recipientPhone, 32)
    },
    content: clean(messageLike?.content, 1500),
    errorMessage: primaryErrorMessage,
    smsStatus: smsAttempted ? clean(smsMeta.status, 30).toLowerCase() || "pending" : "",
    smsErrorMessage: smsAttempted ? clean(smsMeta.errorMessage, 500) : "",
    smsProviderMessageId: smsAttempted ? smsProviderMessageId : "",
    readAt: toIso(messageLike?.readAt) || null,
    createdAt: toIso(messageLike?.createdAt),
    updatedAt: toIso(messageLike?.updatedAt),
    isOwn: matchesUsername(senderUsername, currentUsername),
    counterpartUsername: matchesUsername(senderUsername, currentUsername) ? recipientUsername : senderUsername
  };
};

const verifyHttpsmsWebhookSignature = (req) => {
  if (!HTTPSMS_WEBHOOK_SIGNING_SECRET) return true;
  const authHeader = String(req.headers.authorization || "").trim();
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const [headerB64, payloadB64, signatureB64] = parts;
    const data = `${headerB64}.${payloadB64}`;
    const expected = createHmac("sha256", HTTPSMS_WEBHOOK_SIGNING_SECRET).update(data).digest();
    const actual = Buffer.from(signatureB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};

const extractHttpsmsMessagePayload = (body) => {
  const root = body && typeof body === "object" ? body : {};
  const nested = root.data && typeof root.data === "object" ? root.data : {};
  const merged = { ...nested, ...root };
  return {
    eventType: normalizeHttpsmsEventType(root.event || root.type || nested.event || nested.type),
    providerMessageId: clean(
      merged.message_id || merged.messageId || merged.id || merged.sms_id || "",
      128
    ),
    from: normalizeSmsPhone(merged.contact || merged.from || merged.sender || merged.msisdn || ""),
    to: normalizeSmsPhone(merged.owner || merged.to || merged.recipient || ""),
    content: clean(merged.content || merged.message || merged.text || merged.body || "", 1500),
    sentAt: toIso(merged.sent_at || merged.sentAt || merged.created_at || merged.createdAt || merged.time),
    requestId: clean(merged.request_id || merged.requestId || "", 128),
    status: clean(merged.status || "", 30).toLowerCase(),
    raw: root
  };
};

const sendHttpsmsMessage = async ({ to, content, requestId }) => {
  if (!isHttpsmsConfigured()) {
    const err = new Error("httpSMS is not configured. Set HTTPSMS_ENABLED=true, HTTPSMS_API_KEY, and HTTPSMS_FROM in backend .env.");
    err.statusCode = 503;
    throw err;
  }

  const normalizedTo = normalizeSmsPhone(to);
  const normalizedFrom = normalizeSmsPhone(HTTPSMS_FROM);
  if (!normalizedTo || !normalizedFrom) {
    const err = new Error("Unable to normalize SMS phone numbers for delivery.");
    err.statusCode = 400;
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTPSMS_TIMEOUT_MS);
  try {
    const response = await fetch(`${HTTPSMS_API_BASE_URL}/v1/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": HTTPSMS_API_KEY,
        "X-Request-Id": requestId || randomUUID()
      },
      body: JSON.stringify({
        content: clean(content, 1500),
        from: normalizedFrom,
        to: normalizedTo
      }),
      signal: controller.signal
    });

    const raw = await response.text();
    let payload = {};
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = { raw };
      }
    }

    if (!response.ok) {
      const err = new Error(clean(payload?.message || payload?.error || `httpSMS request failed (${response.status}).`, 240));
      err.statusCode = response.status >= 500 ? 502 : response.status;
      err.payload = payload;
      throw err;
    }

    return {
      providerMessageId: clean(
        payload?.id || payload?.message_id || payload?.messageId || payload?.data?.id || payload?.data?.message_id || "",
        128
      ),
      providerStatus: clean(payload?.status || payload?.data?.status || "sent", 30).toLowerCase() || "sent",
      payload
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const err = new Error("httpSMS request timed out.");
      err.statusCode = 504;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const insertMessageRecord = async (record) => {
  const channel = clean(record?.channel, 20).toLowerCase() || "app";
  const provider = clean(record?.provider, 30) || (channel === "sms" ? "httpsms" : "internal");
  const providerStatus = clean(record?.providerStatus, 30) || (channel === "sms" ? "pending" : "sent");
  if (isStorageFallbackActive()) {
    cachedDb = loadFallbackDb();
    const nextMessage = normalizeFallbackMessageRecord({
      ...record,
      channel,
      provider,
      providerStatus
    });
    cachedDb.messages = [nextMessage, ...normalizeRecordCollection(cachedDb.messages).map((message) => normalizeFallbackMessageRecord(message))];
    return;
  }
  await dbPool.query(
    `INSERT INTO messages
      (id, sender_user_id, recipient_user_id, direction, channel, provider, provider_message_id, provider_status, sender_phone, recipient_phone, content, error_message, meta, read_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      clean(record?.id, 64),
      clean(record?.senderUserId, 64) || null,
      clean(record?.recipientUserId, 64) || null,
      clean(record?.direction, 20) || "outbound",
      channel,
      provider,
      clean(record?.providerMessageId, 128) || null,
      providerStatus,
      clean(record?.senderPhone, 32),
      clean(record?.recipientPhone, 32),
      clean(record?.content, 1500),
      clean(record?.errorMessage, 500) || null,
      JSON.stringify(sanitizeStateMeta(record?.meta)),
      record?.readAt ? toSqlDateTime(record.readAt) : null,
      toSqlDateTime(record?.createdAt) || toSqlDateTime(new Date().toISOString())
    ]
  );
};

const updateMessageRecordState = async ({ id, provider, providerMessageId, providerStatus, errorMessage, meta }) => {
  if (isStorageFallbackActive()) {
    cachedDb = loadFallbackDb();
    cachedDb.messages = normalizeRecordCollection(cachedDb.messages).map((message) => {
      const normalized = normalizeFallbackMessageRecord(message);
      if (clean(normalized.id, 64) !== clean(id, 64)) return normalized;
      return normalizeFallbackMessageRecord({
        ...normalized,
        provider,
        providerMessageId,
        providerStatus,
        errorMessage,
        meta,
        updatedAt: new Date().toISOString()
      });
    });
    return;
  }
  await dbPool.query(
    `UPDATE messages
     SET provider = ?, provider_message_id = ?, provider_status = ?, error_message = ?, meta = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      clean(provider, 30) || "internal",
      clean(providerMessageId, 128) || null,
      clean(providerStatus, 30) || "sent",
      clean(errorMessage, 500) || null,
      JSON.stringify(sanitizeStateMeta(meta)),
      clean(id, 64)
    ]
  );
};

const USER_CONTEXT_ROLES = new Set(["admin", "agent", "customer"]);
const getRequestUserContext = (req) => {
  const role = toRole(req.headers["x-user-role"]);
  const username = clean(req.headers["x-user-username"], 50);
  if (!USER_CONTEXT_ROLES.has(role) || !username) {
    return { role: "", username: "" };
  }
  return { role, username };
};
const hasRequestUserContext = (context) => Boolean(context?.role && context?.username);
const isAdminContext = (context) => context?.role === "admin";
const matchesUsername = (value, username) => clean(value, 50) === clean(username, 50);
const tripIncludesUsername = (tripLike, username) => sanitizeTripAttendees(tripLike?.attendees, tripLike?.customer).includes(clean(username, 50));
const canAccessAppointment = (appointmentLike, context) => {
  if (isAdminContext(context)) return true;
  if (context?.role === "agent") {
    return matchesUsername(appointmentLike?.assignedAgent, context.username) || matchesUsername(appointmentLike?.agent, context.username);
  }
  if (context?.role === "customer") {
    return matchesUsername(appointmentLike?.customer, context.username);
  }
  return false;
};
const canAccessOfficeMeet = (meetLike, context) => {
  if (isAdminContext(context)) return true;
  if (context?.role === "agent") {
    return matchesUsername(meetLike?.assignedAgent || meetLike?.agent, context.username);
  }
  if (context?.role === "customer") {
    return matchesUsername(meetLike?.customer || meetLike?.requestedBy, context.username);
  }
  return false;
};
const canAccessTrip = (tripLike, context) => {
  if (isAdminContext(context)) return true;
  if (context?.role === "agent") {
    return matchesUsername(tripLike?.agent || tripLike?.createdBy, context.username);
  }
  if (context?.role === "customer") {
    return tripIncludesUsername(tripLike, context.username);
  }
  return false;
};
const canAccessReview = (reviewLike, context) => {
  if (isAdminContext(context)) return true;
  if (context?.role === "agent") {
    return matchesUsername(reviewLike?.agent, context.username);
  }
  if (context?.role === "customer") {
    return matchesUsername(reviewLike?.customer, context.username);
  }
  return false;
};
const canAccessNotification = (notificationLike, context) => hasRequestUserContext(context) && matchesUsername(notificationLike?.to, context.username);
const canManageProperty = (propertyLike, context) => isAdminContext(context) || (context?.role === "agent" && matchesUsername(propertyLike?.agent, context.username));
const serializeUserForClient = (userLike) => ({
  id: clean(userLike?.id, 64),
  username: clean(userLike?.username, 50),
  fullName: clean(userLike?.fullName, 90),
  email: clean(userLike?.email, 120),
  phone: clean(userLike?.phone, 30),
  role: toRole(userLike?.role) || "customer",
  photoUrl: clean(userLike?.photoUrl, 500),
  accountStatus: normalizeAccountStatus(userLike?.accountStatus),
  availabilityStatus: normalizeAvailabilityStatus(userLike?.availabilityStatus),
  lastActiveAt: toIso(userLike?.lastActiveAt),
  deactivatedAt: toIso(userLike?.deactivatedAt),
  createdAt: toIso(userLike?.createdAt),
  updatedAt: toIso(userLike?.updatedAt)
});
const scopeUsersForContext = (usersLike, context) => {
  const users = normalizeRecordCollection(usersLike);
  if (!hasRequestUserContext(context)) return [];
  if (isAdminContext(context)) return users.map((user) => serializeUserForClient(user));
  if (context.role === "agent") {
    return users
      .filter((user) => matchesUsername(user?.username, context.username) || toRole(user?.role) === "customer")
      .map((user) => serializeUserForClient(user));
  }
  return users
    .filter((user) => matchesUsername(user?.username, context.username) || ["admin", "agent"].includes(toRole(user?.role)))
    .map((user) => serializeUserForClient(user));
};
const replaceManagedSegment = (existingList, incomingList, canManageRecord, sanitizeRecord = (item) => item) => {
  const existingRecords = normalizeRecordCollection(existingList);
  const existingManagedIds = new Set(
    existingRecords
      .filter((item) => canManageRecord(item))
      .map((item) => clean(item?.id, 64))
      .filter(Boolean)
  );
  const preserved = existingRecords.filter((item) => !canManageRecord(item));
  const managed = normalizeRecordCollection(incomingList)
    .map((item) => sanitizeRecord(item))
    .filter((item) => {
      const id = clean(item?.id, 64);
      return canManageRecord(item) || (id && existingManagedIds.has(id));
    });
  return [...managed, ...preserved];
};
const mergeNotificationsForContext = (existingList, incomingList, context) => {
  const next = new Map();
  normalizeRecordCollection(existingList).forEach((item) => {
    const id = clean(item?.id, 64);
    if (!id) return;
    next.set(id, { ...item, meta: sanitizeStateMeta(item.meta) });
  });

  normalizeRecordCollection(incomingList).forEach((item) => {
    const id = clean(item?.id, 64);
    const to = clean(item?.to, 50);
    if (!id || !to) return;
    const normalized = {
      ...item,
      id,
      to,
      title: clean(item?.title, 120) || "Notification",
      message: clean(item?.message, 500),
      type: clean(item?.type, 60) || "general",
      appointmentId: clean(item?.appointmentId, 80),
      officeMeetId: clean(item?.officeMeetId || item?.meetId, 80),
      meta: sanitizeStateMeta(item?.meta),
      readAt: toIso(item?.readAt) || null,
      createdAt: toIso(item?.createdAt) || new Date().toISOString()
    };
    if (!normalized.message) return;

    const existing = next.get(id);
    if (!existing) {
      next.set(id, normalized);
      return;
    }
    if (isAdminContext(context) || matchesUsername(existing?.to, context.username)) {
      next.set(id, { ...existing, ...normalized });
    }
  });

  return Array.from(next.values());
};
const findExistingUserRecord = (usersLike, userLike) => {
  const id = clean(userLike?.id, 64);
  const username = clean(userLike?.username, 50);
  return normalizeRecordCollection(usersLike).find((user) => {
    const userId = clean(user?.id, 64);
    const userName = clean(user?.username, 50);
    return (id && userId === id) || (username && userName === username);
  }) || null;
};
const mergeUsersForContext = (existingUsers, incomingUsers, context) => {
  const currentUsers = dedupeUsersByUsername(existingUsers);
  const incoming = dedupeUsersByUsername(incomingUsers);
  if (isAdminContext(context)) {
    return dedupeUsersByUsername(incoming.map((candidate) => {
      const existing = findExistingUserRecord(currentUsers, candidate);
      const role = toRole(candidate?.role) || toRole(existing?.role) || "customer";
      const password = clean(candidate?.password, 255) || clean(existing?.password, 255);
      return {
        ...existing,
        ...candidate,
        id: clean(candidate?.id, 64) || clean(existing?.id, 64),
        username: clean(candidate?.username, 50) || clean(existing?.username, 50),
        password,
        fullName: clean(candidate?.fullName, 90) || clean(existing?.fullName, 90) || clean(candidate?.username, 50),
        email: clean(candidate?.email, 120).toLowerCase() || clean(existing?.email, 120).toLowerCase(),
        phone: clean(candidate?.phone, 30) || clean(existing?.phone, 30),
        role: role === "admin" || role === "agent" ? role : "customer",
        createdAt: toIso(candidate?.createdAt) || toIso(existing?.createdAt) || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }).filter((user) => clean(user?.id, 64) && clean(user?.username, 50) && clean(user?.password, 255)));
  }

  const selfIndex = currentUsers.findIndex((user) => matchesUsername(user?.username, context.username));
  if (selfIndex < 0) return currentUsers;
  const incomingSelf = incoming.find((user) => matchesUsername(user?.username, context.username) || clean(user?.id, 64) === clean(currentUsers[selfIndex]?.id, 64));
  if (!incomingSelf) return currentUsers;

  const updated = currentUsers.slice();
  updated[selfIndex] = {
    ...updated[selfIndex],
    fullName: clean(incomingSelf?.fullName, 90) || clean(updated[selfIndex]?.fullName, 90),
    email: clean(incomingSelf?.email, 120).toLowerCase() || clean(updated[selfIndex]?.email, 120).toLowerCase(),
    phone: clean(incomingSelf?.phone, 30) || clean(updated[selfIndex]?.phone, 30),
    updatedAt: new Date().toISOString()
  };
  return updated;
};
const scopeStateForContext = (db, context) => ({
  allUsers: scopeUsersForContext(db.users, context),
  allProperties: normalizeRecordCollection(
    (!hasRequestUserContext(context) || isAdminContext(context) || context.role === "customer")
      ? (!isAdminContext(context)
          ? db.properties.filter((property) => normalizePropertyStatus(property?.propertyStatus || property?.status) !== "archived")
          : db.properties)
      : db.properties.filter((property) => (
          canManageProperty(property, context) &&
          normalizePropertyStatus(property?.propertyStatus || property?.status) !== "archived"
        ))
  ).map((property) => sanitizePropertyRecord(property)),
  allAppointments: normalizeRecordCollection(db.appointments).filter((appointment) => canAccessAppointment(appointment, context)).map((appointment) => sanitizeAppointmentRecord(appointment)),
  officeMeets: normalizeRecordCollection(db.officeMeets).filter((meet) => canAccessOfficeMeet(meet, context)).map((meet) => sanitizeOfficeMeetRecord(meet)),
  allReviews: normalizeRecordCollection(db.reviews).filter((review) => canAccessReview(review, context)).map((review) => ({ ...review })),
  allNotifications: normalizeRecordCollection(db.notifications).filter((notification) => canAccessNotification(notification, context)).map((notification) => ({
    ...notification,
    meta: sanitizeStateMeta(notification.meta)
  })),
  allTrips: normalizeRecordCollection(db.trips).filter((trip) => canAccessTrip(trip, context)).map((trip) => sanitizeTripRecord(trip))
});

const normalizeGoogleSendUpdates = (value) => {
  const normalized = String(value || "").trim();
  return normalized === "all" || normalized === "externalOnly" || normalized === "none" ? normalized : "none";
};
const GOOGLE_CALENDAR_METADATA_CACHE_MS = 5 * 60 * 1000;

const getMissingGoogleCalendarSettings = () => {
  const missing = [];
  if (!GOOGLE_CALENDAR_CLIENT_ID) missing.push("GOOGLE_CALENDAR_CLIENT_ID");
  if (!GOOGLE_CALENDAR_CLIENT_SECRET) missing.push("GOOGLE_CALENDAR_CLIENT_SECRET");
  if (!GOOGLE_CALENDAR_REFRESH_TOKEN) missing.push("GOOGLE_CALENDAR_REFRESH_TOKEN");
  if (!GOOGLE_CALENDAR_ID) missing.push("GOOGLE_CALENDAR_ID");
  return missing;
};

const isGoogleCalendarConfigured = () => getMissingGoogleCalendarSettings().length === 0;

const getGoogleCalendarSyncConfig = () => {
  const missingFields = getMissingGoogleCalendarSettings();
  return {
    enabled: GOOGLE_CALENDAR_SYNC_ENABLED,
    configured: missingFields.length === 0,
    missingFields,
    calendarId: GOOGLE_CALENDAR_ID,
    timeZone: GOOGLE_CALENDAR_TIME_ZONE,
    sendUpdates: normalizeGoogleSendUpdates(GOOGLE_CALENDAR_SEND_UPDATES)
  };
};

const withRequestTimeout = (timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timer };
};

const safeParseJsonText = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const buildGoogleErrorMessage = (payload, fallback) =>
  clean(payload?.error_description || payload?.error?.message || payload?.message || fallback || "Google Calendar request failed.", 300)
  || "Google Calendar request failed.";

const requestJsonWithTimeout = async (url, options = {}) => {
  if (typeof fetch !== "function") {
    throw new Error("This Node.js runtime does not support fetch, so Google Calendar sync is unavailable.");
  }
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : GOOGLE_CALENDAR_SYNC_TIMEOUT_MS;
  const { controller, timer } = withRequestTimeout(timeoutMs);
  try {
    let response;
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        const err = new Error(`Google Calendar request timed out after ${timeoutMs}ms.`);
        err.code = "google_timeout";
        throw err;
      }
      const err = new Error(`Google Calendar request failed: ${clean(error?.message || "network error", 220)}`);
      err.code = "google_network_error";
      throw err;
    }

    const text = await response.text();
    const payload = safeParseJsonText(text);
    if (!response.ok) {
      const err = new Error(buildGoogleErrorMessage(payload, response.statusText || `Request failed (${response.status})`));
      err.statusCode = response.status;
      err.payload = payload;
      throw err;
    }
    return payload ?? {};
  } finally {
    clearTimeout(timer);
  }
};

const getGoogleCalendarAccessToken = async () => {
  if (!isGoogleCalendarConfigured()) {
    throw new Error("Google Calendar sync is enabled but missing one or more OAuth settings.");
  }
  const now = Date.now();
  if (googleCalendarTokenCache.accessToken && googleCalendarTokenCache.expiresAt > now + 60000) {
    return googleCalendarTokenCache.accessToken;
  }

  const tokenPayload = await requestJsonWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CALENDAR_CLIENT_ID,
      client_secret: GOOGLE_CALENDAR_CLIENT_SECRET,
      refresh_token: GOOGLE_CALENDAR_REFRESH_TOKEN,
      grant_type: "refresh_token"
    }).toString()
  });

  const accessToken = clean(tokenPayload?.access_token, 2000);
  const expiresIn = Number(tokenPayload?.expires_in || 3600);
  if (!accessToken) {
    throw new Error("Google OAuth token refresh succeeded but no access token was returned.");
  }
  googleCalendarTokenCache = {
    accessToken,
    expiresAt: Date.now() + (Math.max(120, expiresIn) * 1000)
  };
  return accessToken;
};

const googleCalendarApiRequest = async (url, options = {}) => {
  const accessToken = await getGoogleCalendarAccessToken();
  return requestJsonWithTimeout(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {})
    }
  });
};

const ensureGoogleCalendarTimeZone = async () => {
  if (!GOOGLE_CALENDAR_TIME_ZONE || !isGoogleCalendarConfigured()) {
    return { ok: false, skipped: true };
  }

  const now = Date.now();
  if (
    googleCalendarMetadataCache.calendarId === GOOGLE_CALENDAR_ID &&
    googleCalendarMetadataCache.requestedTimeZone === GOOGLE_CALENDAR_TIME_ZONE &&
    googleCalendarMetadataCache.remoteTimeZone === GOOGLE_CALENDAR_TIME_ZONE &&
    googleCalendarMetadataCache.checkedAt > (now - GOOGLE_CALENDAR_METADATA_CACHE_MS)
  ) {
    return {
      ok: true,
      updated: false,
      cached: true,
      timeZone: googleCalendarMetadataCache.remoteTimeZone
    };
  }

  const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}`;
  const currentCalendar = await googleCalendarApiRequest(calendarUrl);
  const resolvedCalendarId = clean(currentCalendar?.id, 255) || GOOGLE_CALENDAR_ID;
  let remoteTimeZone = clean(currentCalendar?.timeZone, 80);
  let updated = false;

  if (remoteTimeZone !== GOOGLE_CALENDAR_TIME_ZONE) {
    const updateCalendarUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(resolvedCalendarId)}`;
    const updatedCalendar = await googleCalendarApiRequest(updateCalendarUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeZone: GOOGLE_CALENDAR_TIME_ZONE })
    });
    remoteTimeZone = clean(updatedCalendar?.timeZone, 80) || GOOGLE_CALENDAR_TIME_ZONE;
    updated = true;
  }

  googleCalendarMetadataCache = {
    calendarId: GOOGLE_CALENDAR_ID,
    requestedTimeZone: GOOGLE_CALENDAR_TIME_ZONE,
    remoteTimeZone: remoteTimeZone || GOOGLE_CALENDAR_TIME_ZONE,
    checkedAt: Date.now()
  };

  return {
    ok: true,
    updated,
    cached: false,
    timeZone: googleCalendarMetadataCache.remoteTimeZone
  };
};

const formatGoogleStatusLabel = (statusLike) => {
  const raw = String(statusLike || "").trim().replace(/[_-]+/g, " ");
  if (!raw) return "Pending";
  return raw.replace(/\b\w/g, (match) => match.toUpperCase());
};

const formatDateTimeForGoogle = (dateValue, timeValue) => `${dateValue}T${timeValue}:00`;

const buildGoogleEventEndDateTime = (dateValue, timeValue, durationMinutes) => {
  const startStamp = toScheduleStamp(dateValue, timeValue);
  if (!Number.isFinite(startStamp)) return "";
  const end = new Date(startStamp + (Math.max(15, Number(durationMinutes) || 60) * 60000));
  const nextDate = formatLocalDateOnly(end);
  const hours = String(end.getHours()).padStart(2, "0");
  const minutes = String(end.getMinutes()).padStart(2, "0");
  return nextDate ? `${nextDate}T${hours}:${minutes}:00` : "";
};

const buildGoogleDescription = (lines) => clean((Array.isArray(lines) ? lines : []).filter(Boolean).join("\n"), 6000);

const GOOGLE_CALENDAR_RECORD_MODELS = {
  appointment: {
    collectionKey: "appointments",
    sanitize: sanitizeAppointmentRecord,
    durationMinutes: GOOGLE_CALENDAR_APPOINTMENT_DURATION_MINUTES,
    buildSummary: (record) => clean(`Property Appointment: ${record.propertyTitle || "Scheduled Visit"}`, 180),
    buildLocation: (record) => clean(record.location, 255),
    buildDescription: (record) => buildGoogleDescription([
      "SIA Real Estate Demo Event",
      "Type: Property Appointment",
      `Status: ${formatGoogleStatusLabel(record.status)}`,
      record.propertyTitle ? `Property: ${record.propertyTitle}` : "",
      record.customer ? `Customer: @${record.customer}` : "",
      record.assignedAgent ? `Agent: @${record.assignedAgent}` : record.agent ? `Agent: @${record.agent}` : "",
      record.location ? `Location: ${record.location}` : "",
      record.notes ? `Notes: ${record.notes}` : "",
      record.outcomeNotes ? `Outcome: ${record.outcomeNotes}` : "",
      record.cancelReason ? `Cancel Reason: ${record.cancelReason}` : "",
      `Local Record ID: ${record.id}`
    ])
  },
  office_meeting: {
    collectionKey: "officeMeets",
    sanitize: sanitizeOfficeMeetRecord,
    durationMinutes: GOOGLE_CALENDAR_MEETING_DURATION_MINUTES,
    buildSummary: (record) => clean(`Office Meeting: ${record.fullName || record.customer || "Client Meeting"}`, 180),
    buildLocation: (record) => clean(record.mode === "virtual" ? "Virtual Meeting" : "SIA Office Meeting", 255),
    buildDescription: (record) => buildGoogleDescription([
      "SIA Real Estate Demo Event",
      "Type: Office Meeting",
      `Status: ${formatGoogleStatusLabel(record.status)}`,
      record.fullName ? `Full Name: ${record.fullName}` : "",
      record.customer ? `Customer Username: @${record.customer}` : "",
      record.email ? `Email: ${record.email}` : "",
      record.phone ? `Phone: ${record.phone}` : "",
      record.mode ? `Mode: ${formatGoogleStatusLabel(record.mode)}` : "",
      record.reason ? `Reason: ${record.reason}` : "",
      record.notes ? `Notes: ${record.notes}` : "",
      record.outcomeNotes ? `Outcome: ${record.outcomeNotes}` : "",
      record.assignedAgent ? `Assigned Agent: @${record.assignedAgent}` : record.agent ? `Assigned Agent: @${record.agent}` : "",
      `Local Record ID: ${record.id}`
    ])
  },
  trip: {
    collectionKey: "trips",
    sanitize: sanitizeTripRecord,
    durationMinutes: GOOGLE_CALENDAR_TRIP_DURATION_MINUTES,
    buildSummary: (record) => clean(`Property Tour: ${record.title || record.location || "Scheduled Tour"}`, 180),
    buildLocation: (record) => clean(record.location, 255),
    buildDescription: (record) => buildGoogleDescription([
      "SIA Real Estate Demo Event",
      "Type: Property Tour",
      `Status: ${formatGoogleStatusLabel(record.status)}`,
      record.title ? `Title: ${record.title}` : "",
      record.customer ? `Customer Username: @${record.customer}` : "",
      record.agent ? `Agent: @${record.agent}` : record.createdBy ? `Agent: @${record.createdBy}` : "",
      Array.isArray(record.attendees) && record.attendees.length ? `Attendees: ${record.attendees.join(", ")}` : "",
      record.location ? `Location: ${record.location}` : "",
      record.notes ? `Notes: ${record.notes}` : "",
      record.outcomeNotes ? `Outcome: ${record.outcomeNotes}` : "",
      `Local Record ID: ${record.id}`
    ])
  }
};

const getGoogleCalendarRecordModel = (kind) => GOOGLE_CALENDAR_RECORD_MODELS[kind] || null;

const buildGoogleCalendarEventPayload = (kind, recordLike) => {
  const model = getGoogleCalendarRecordModel(kind);
  if (!model) {
    throw new Error(`Unsupported Google Calendar sync kind: ${kind}`);
  }
  const record = model.sanitize(recordLike);
  if (!isIsoDate(record.date) || !isHHMM(record.time)) {
    throw new Error("Google Calendar event requires a valid date and time.");
  }
  const startDateTime = formatDateTimeForGoogle(record.date, record.time);
  const endDateTime = buildGoogleEventEndDateTime(record.date, record.time, model.durationMinutes) || startDateTime;

  return {
    summary: model.buildSummary(record),
    description: model.buildDescription(record),
    location: model.buildLocation(record) || undefined,
    status: "confirmed",
    start: {
      dateTime: startDateTime,
      timeZone: GOOGLE_CALENDAR_TIME_ZONE
    },
    end: {
      dateTime: endDateTime,
      timeZone: GOOGLE_CALENDAR_TIME_ZONE
    },
    reminders: { useDefault: true },
    extendedProperties: {
      private: {
        sourceApp: "sia_realestate_demo",
        sourceKind: kind,
        sourceRecordId: clean(record.id, 64),
        sourceStatus: clean(record.status, 30)
      }
    }
  };
};

const buildGoogleSyncPatch = (patchLike = {}) => ({
  googleEventId: clean(patchLike.googleEventId, 255),
  googleHtmlLink: clean(patchLike.googleHtmlLink, 1500),
  googleSyncStatus: normalizeGoogleSyncStatus(patchLike.googleSyncStatus),
  googleSyncError: clean(patchLike.googleSyncError, 1000),
  googleSyncedAt: toIso(patchLike.googleSyncedAt)
});

const shouldDeleteGoogleCalendarEvent = (recordLike) => {
  const status = normalizeSharedStatus(recordLike?.status, "");
  return !isIsoDate(recordLike?.date)
    || !isHHMM(recordLike?.time)
    || status === "cancelled"
    || status === "declined"
    || status === "expired"
    || status === "no_show";
};

const buildGoogleCalendarEventUrl = (eventId = "") =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events/${encodeURIComponent(eventId)}`;

const syncGoogleCalendarRecord = async (kind, recordLike) => {
  const model = getGoogleCalendarRecordModel(kind);
  if (!model) return null;
  const record = model.sanitize(recordLike);
  if (!GOOGLE_CALENDAR_SYNC_ENABLED) return null;

  if (!isGoogleCalendarConfigured()) {
    return buildGoogleSyncPatch({
      googleEventId: record.googleEventId,
      googleHtmlLink: record.googleHtmlLink,
      googleSyncStatus: "error",
      googleSyncError: "Google Calendar sync is enabled but missing one or more OAuth settings.",
      googleSyncedAt: record.googleSyncedAt
    });
  }

  const sendUpdates = normalizeGoogleSendUpdates(GOOGLE_CALENDAR_SEND_UPDATES);
  const syncedAt = new Date().toISOString();
  try {
    try {
      await ensureGoogleCalendarTimeZone();
    } catch (error) {
      console.warn("Google Calendar timezone alignment failed:", error?.message || error);
    }

    if (shouldDeleteGoogleCalendarEvent(record)) {
      if (record.googleEventId) {
        try {
          await googleCalendarApiRequest(`${buildGoogleCalendarEventUrl(record.googleEventId)}?sendUpdates=${encodeURIComponent(sendUpdates)}`, {
            method: "DELETE"
          });
        } catch (error) {
          if (Number(error?.statusCode) !== 404) throw error;
        }
      }

      return buildGoogleSyncPatch({
        googleEventId: "",
        googleHtmlLink: "",
        googleSyncStatus: "synced",
        googleSyncError: "",
        googleSyncedAt: syncedAt
      });
    }

    const payload = buildGoogleCalendarEventPayload(kind, record);
    let remoteEvent = null;
    if (record.googleEventId) {
      try {
        remoteEvent = await googleCalendarApiRequest(`${buildGoogleCalendarEventUrl(record.googleEventId)}?sendUpdates=${encodeURIComponent(sendUpdates)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } catch (error) {
        if (Number(error?.statusCode) !== 404) throw error;
      }
    }

    if (!remoteEvent) {
      remoteEvent = await googleCalendarApiRequest(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events?sendUpdates=${encodeURIComponent(sendUpdates)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    return buildGoogleSyncPatch({
      googleEventId: remoteEvent?.id || record.googleEventId,
      googleHtmlLink: remoteEvent?.htmlLink || record.googleHtmlLink,
      googleSyncStatus: "synced",
      googleSyncError: "",
      googleSyncedAt: syncedAt
    });
  } catch (error) {
    return buildGoogleSyncPatch({
      googleEventId: record.googleEventId,
      googleHtmlLink: record.googleHtmlLink,
      googleSyncStatus: "error",
      googleSyncError: error?.message || "Google Calendar sync failed.",
      googleSyncedAt: record.googleSyncedAt
    });
  }
};

const persistGoogleSyncPatch = async (kind, recordId, patchLike) => {
  const model = getGoogleCalendarRecordModel(kind);
  const id = clean(recordId, 64);
  if (!model || !id) return null;
  const syncPatch = buildGoogleSyncPatch(patchLike);

  const nextDb = await updateDb((db) => {
    const collection = normalizeRecordCollection(db[model.collectionKey]).slice();
    const idx = collection.findIndex((item) => clean(item?.id, 64) === id);
    if (idx < 0) return db;
    const current = model.sanitize(collection[idx]);
    collection[idx] = model.sanitize({ ...current, ...syncPatch });
    return { ...db, [model.collectionKey]: collection };
  });

  return normalizeRecordCollection(nextDb[model.collectionKey])
    .map((item) => model.sanitize(item))
    .find((item) => clean(item?.id, 64) === id) || null;
};

const syncWorkflowRecordAndPersist = async (kind, recordLike) => {
  const model = getGoogleCalendarRecordModel(kind);
  if (!model) return null;
  const record = model.sanitize(recordLike);
  const syncPatch = await syncGoogleCalendarRecord(kind, record);
  if (!syncPatch) return record;
  return (await persistGoogleSyncPatch(kind, record.id, syncPatch)) || model.sanitize({ ...record, ...syncPatch });
};

const buildGoogleCollectionSummary = (recordsLike, sanitizeRecord) => {
  const summary = { total: 0, synced: 0, pending: 0, error: 0 };
  normalizeRecordCollection(recordsLike).forEach((item) => {
    const record = sanitizeRecord(item);
    const status = normalizeGoogleSyncStatus(record.googleSyncStatus);
    summary.total += 1;
    summary[status] += 1;
  });
  return summary;
};

const buildGoogleCalendarStatusSummary = (dbLike) => {
  const appointments = buildGoogleCollectionSummary(dbLike?.appointments, sanitizeAppointmentRecord);
  const officeMeets = buildGoogleCollectionSummary(dbLike?.officeMeets, sanitizeOfficeMeetRecord);
  const trips = buildGoogleCollectionSummary(dbLike?.trips, sanitizeTripRecord);
  const lastSyncedAt = [
    ...normalizeRecordCollection(dbLike?.appointments).map((item) => sanitizeAppointmentRecord(item).googleSyncedAt),
    ...normalizeRecordCollection(dbLike?.officeMeets).map((item) => sanitizeOfficeMeetRecord(item).googleSyncedAt),
    ...normalizeRecordCollection(dbLike?.trips).map((item) => sanitizeTripRecord(item).googleSyncedAt)
  ]
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || "";

  return {
    config: getGoogleCalendarSyncConfig(),
    appointments,
    officeMeets,
    trips,
    totals: {
      total: appointments.total + officeMeets.total + trips.total,
      synced: appointments.synced + officeMeets.synced + trips.synced,
      pending: appointments.pending + officeMeets.pending + trips.pending,
      error: appointments.error + officeMeets.error + trips.error
    },
    lastSyncedAt
  };
};

const syncGoogleCalendarBatch = async (dbLike) => {
  const nextDb = {
    ...dbLike,
    appointments: normalizeRecordCollection(dbLike?.appointments).map((item) => sanitizeAppointmentRecord(item)),
    officeMeets: normalizeRecordCollection(dbLike?.officeMeets).map((item) => sanitizeOfficeMeetRecord(item)),
    trips: normalizeRecordCollection(dbLike?.trips).map((item) => sanitizeTripRecord(item))
  };
  let processed = 0;

  try {
    await ensureGoogleCalendarTimeZone();
  } catch (error) {
    console.warn("Google Calendar timezone alignment failed:", error?.message || error);
  }

  for (const [kind, model] of Object.entries(GOOGLE_CALENDAR_RECORD_MODELS)) {
    const collection = normalizeRecordCollection(nextDb[model.collectionKey]).slice();
    for (let index = 0; index < collection.length; index += 1) {
      const record = model.sanitize(collection[index]);
      if (!clean(record?.id, 64)) continue;
      processed += 1;
      const syncPatch = await syncGoogleCalendarRecord(kind, record);
      if (!syncPatch) continue;
      collection[index] = model.sanitize({ ...record, ...syncPatch });
    }
    nextDb[model.collectionKey] = collection;
  }

  return { nextDb, processed };
};

const requireRole = (allowed = []) => (req, res, next) => {
  if (!allowed.length) return next();
  const { role, username } = getRequestUserContext(req);
  if (!role || !username) {
    return res.status(401).json({ ok: false, message: "Unauthorized. Missing user context headers." });
  }
  if (!allowed.includes(role)) {
    return res.status(403).json({ ok: false, message: "Forbidden. Missing required role." });
  }
  return next();
};

const allowedOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

app.use(attachRequestMeta);

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

app.use(compression({
  filter(req, res) {
    if (String(req.headers.accept || "").includes("text/event-stream")) return false;
    return compression.filter(req, res);
  }
}));
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

const routeDeps = {
  asyncHandler,
  dbPool,
  GOOGLE_CALENDAR_SYNC_ENABLED,
  HTTPSMS_FROM,
  clean,
  loadDb,
  updateDb,
  sanitizeUserRecord,
  normalizeAccountStatus,
  toRole,
  getRequestUserContext,
  isAdminContext,
  isValidUsername,
  isStrongPassword,
  isValidEmail,
  isValidPhone,
  makeId,
  scopeStateForContext,
  requireRole,
  listOrPaginated,
  normalizeAvailabilityStatus,
  serializeUserForClient,
  sanitizePropertyRecord,
  normalizeLocation,
  parseNumber,
  normalizeListingType,
  normalizePropertyType,
  normalizePropertyStatus,
  validatePropertyPayload,
  matchesUsername,
  canManageProperty,
  isTerminalWorkflowStatus,
  sanitizeAppointmentRecord,
  sanitizeTripRecord,
  syncWorkflowRecordAndPersist,
  syncGoogleCalendarRecord,
  normalizeRecordCollection,
  canAccessAppointment,
  isIsoDate,
  isHHMM,
  isWithinOfficeHours,
  isFutureOrNowSchedule,
  ensureAccessibleProperty,
  findPropertyRecord,
  assertRoleUser,
  normalizeAppointmentStatus,
  isValidTransition,
  buildLifecyclePatch,
  canAccessTrip,
  normalizeCollection,
  normalizeTripStatusForStorage,
  sanitizeTripAttendees,
  sanitizeOfficeMeetRecord,
  canAccessOfficeMeet,
  normalizeOfficeMeetingStatus,
  canAccessReview,
  hasRequestUserContext,
  registerMessageStreamClient,
  writeMessageStreamEvent,
  getMessageTransportMeta,
  findUserRecord,
  buildMessageContactSummaries,
  canMessageUser,
  normalizeSmsPhone,
  toIso,
  getLegacyMessageTransportMeta,
  findUserByNormalizedPhone,
  serializeMessageForClient,
  randomUUID,
  insertMessageRecord,
  toSqlDateTime,
  parseStoredMessageMeta,
  sendHttpsmsMessage,
  sanitizeStateMeta,
  updateMessageRecordState,
  publishMessageRealtimeUpdate,
  persistMessageNotification,
  verifyHttpsmsWebhookSignature,
  extractHttpsmsMessagePayload,
  isStorageFallbackActive,
  canAccessNotification,
  buildGoogleCalendarStatusSummary,
  isGoogleCalendarConfigured,
  getMissingGoogleCalendarSettings,
  syncGoogleCalendarBatch,
  normalizeTripStatusForClient,
  isPastSchedule
};

registerHealthRoutes(api, buildStartupHealthPayload);
registerAuthRoutes(api, routeDeps);
registerStateRoutes(api, routeDeps);
registerUserRoutes(api, routeDeps);
registerPropertyRoutes(api, routeDeps);
registerWorkflowRoutes(api, routeDeps);
registerMessageRoutes(api, routeDeps);
registerNotificationRoutes(api, routeDeps);
registerCalendarRoutes(api, routeDeps);
registerDashboardRoutes(api, routeDeps);

api.use((req, res) => {
  res.status(404).json({ ok: false, message: "API route not found." });
});

const startupBootstrapSteps = [
  validateStartupConfig,
  ensureDbReady,
  bootstrapFromLegacyJsonIfNeeded,
  repairLegacyAppMessageParticipants,
  rebuildCalendarEventsTableFromCurrentData
];
let startupBootstrapPromise = null;

const ensureStartupBootstrap = async () => {
  if (!startupBootstrapPromise) {
    startupBootstrapPromise = (async () => {
      markStartupAttempt("bootstrapping");
      try {
        for (const step of startupBootstrapSteps) {
          await step();
        }
        markStartupReady();
        return true;
      } catch (error) {
        markStartupFailure(error);
        if (allowEphemeralDbFallback()) {
          console.warn("Startup database bootstrap failed. Serving with ephemeral fallback storage for this Vercel runtime.");
        }
        return false;
      }
    })();
  }
  return startupBootstrapPromise;
};

if (isVercelRuntime) {
  app.use(async (req, res, next) => {
    const bootstrapped = await ensureStartupBootstrap();
    if (!bootstrapped && !isStorageFallbackActive() && req.path !== "/health") {
      return res.status(503).json(buildServiceUnavailablePayload());
    }
    next();
  });
}

app.use("/api", async (req, res, next) => {
  if (req.path === "/health") return next();
  const bootstrapped = await ensureStartupBootstrap();
  if (!bootstrapped && !isStorageFallbackActive()) {
    return res.status(503).json(buildServiceUnavailablePayload());
  }
  next();
});

app.use("/api", api);

const distPath = path.join(__dirname, "..", "..", "frontend", "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.get("/health", (req, res) => {
  res.json(buildStartupHealthPayload({ scope: "app" }));
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
registerGracefulShutdown({
  dbPool,
  getServer: () => server
});

const logStartupFailure = (errorLike) => {
  const error = markStartupFailure(errorLike);
  const phase = clean(error?.startupPhase || "startup", 60) || "startup";
  const message = clean(error?.message || "Unexpected startup failure.", 500) || "Unexpected startup failure.";

  console.error(`Failed to start server during ${phase}: ${message}`);
  if (error?.hint) {
    console.error(`How to fix: ${clean(error.hint, 1000)}`);
  }
  if (error?.details) {
    const details = typeof error.details === "string"
      ? clean(error.details, 300)
      : clean(JSON.stringify(error.details), 300);
    if (details) {
      console.error(`Details: ${details}`);
    }
  }

  if (!error?.isUserFacing) {
    console.error(error);
  }
};

if (isVercelRuntime) {
  void ensureStartupBootstrap().then((bootstrapped) => {
    if (!bootstrapped && startupRuntimeState.lastError) {
      logStartupFailure(startupRuntimeState.lastError);
    }
  });
} else {
  startServer({
    app,
    port: PORT,
    bootstrap: [],
    onListen: (listeningServer) => {
      server = listeningServer;
      console.log(`Server running at http://localhost:${PORT}`);
    }
  })
    .then(() => ensureStartupBootstrap())
    .then((bootstrapped) => {
      if (!bootstrapped && startupRuntimeState.lastError) {
        logStartupFailure(startupRuntimeState.lastError);
      }
    })
    .catch((err) => {
      logStartupFailure(err);
      process.exit(1);
    });
}

export default app;
