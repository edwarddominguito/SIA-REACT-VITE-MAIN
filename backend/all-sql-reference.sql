-- SIA Real Estate System SQL Reference
-- This file consolidates the SQL used by the backend.
-- Notes:
-- 1. The schema below is the same structure defined in mysql-init.sql.
-- 2. server.js also runs CREATE TABLE IF NOT EXISTS statements at startup.
-- 3. Runtime INSERT statements are parameterized and use ? placeholders.

-- =========================================================
-- 1. DATABASE + SCHEMA INITIALIZATION
-- =========================================================

CREATE DATABASE IF NOT EXISTS sia_realestate
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE sia_realestate;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(90) NOT NULL,
  email VARCHAR(120),
  phone VARCHAR(30),
  photo_url TEXT NULL,
  role ENUM('admin','agent','customer') NOT NULL DEFAULT 'customer',
  account_status VARCHAR(20) NOT NULL DEFAULT 'active',
  availability_status VARCHAR(20) NOT NULL DEFAULT 'offline',
  last_active_at DATETIME NULL,
  deactivated_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  listing_type VARCHAR(20) NOT NULL DEFAULT 'sale',
  property_type VARCHAR(40) NOT NULL DEFAULT 'house',
  property_status VARCHAR(30) NOT NULL DEFAULT 'available',
  status VARCHAR(30) NOT NULL DEFAULT 'available',
  archived_at DATETIME NULL,
  archived_by_user_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_properties_agent
    FOREIGN KEY (agent_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_properties_archived_by
    FOREIGN KEY (archived_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_properties_agent_user_id ON properties (agent_user_id);
CREATE INDEX idx_properties_archived_at ON properties (archived_at);

CREATE TABLE IF NOT EXISTS appointments (
  id VARCHAR(64) PRIMARY KEY,
  property_id VARCHAR(64) NOT NULL,
  customer_user_id VARCHAR(64) NOT NULL,
  assigned_agent_user_id VARCHAR(64) NULL,
  assigned_by_admin_user_id VARCHAR(64) NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  notes TEXT NULL,
  assigned_at DATETIME NULL,
  outcome_notes TEXT NULL,
  cancel_reason VARCHAR(500) NULL,
  completed_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  rescheduled_at DATETIME NULL,
  expired_at DATETIME NULL,
  no_show_at DATETIME NULL,
  google_event_id VARCHAR(255) NULL,
  google_html_link TEXT NULL,
  google_sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  google_sync_error TEXT NULL,
  google_synced_at DATETIME NULL,
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
CREATE INDEX idx_appointments_property_id ON appointments (property_id);
CREATE INDEX idx_appointments_customer_user_id ON appointments (customer_user_id);
CREATE INDEX idx_appointments_assigned_agent_user_id ON appointments (assigned_agent_user_id);
CREATE INDEX idx_appointments_schedule ON appointments (appointment_date, appointment_time);
CREATE INDEX idx_appointments_status ON appointments (status);

CREATE TABLE IF NOT EXISTS office_meets (
  id VARCHAR(64) PRIMARY KEY,
  customer_user_id VARCHAR(64) NOT NULL,
  assigned_agent_user_id VARCHAR(64) NULL,
  related_property_id VARCHAR(64) NULL,
  full_name VARCHAR(90) NULL,
  email VARCHAR(120) NULL,
  phone VARCHAR(30) NULL,
  mode ENUM('office','virtual') NOT NULL DEFAULT 'office',
  reason TEXT NOT NULL,
  notes TEXT NULL,
  outcome_notes TEXT NULL,
  meet_date DATE NOT NULL,
  meet_time TIME NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  completed_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  rescheduled_at DATETIME NULL,
  expired_at DATETIME NULL,
  no_show_at DATETIME NULL,
  google_event_id VARCHAR(255) NULL,
  google_html_link TEXT NULL,
  google_sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  google_sync_error TEXT NULL,
  google_synced_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_office_meets_customer
    FOREIGN KEY (customer_user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_office_meets_agent
    FOREIGN KEY (assigned_agent_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_office_meets_related_property
    FOREIGN KEY (related_property_id) REFERENCES properties(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_office_meets_customer_user_id ON office_meets (customer_user_id);
CREATE INDEX idx_office_meets_assigned_agent_user_id ON office_meets (assigned_agent_user_id);
CREATE INDEX idx_office_meets_schedule ON office_meets (meet_date, meet_time);
CREATE INDEX idx_office_meets_status ON office_meets (status);

CREATE TABLE IF NOT EXISTS reviews (
  id VARCHAR(64) PRIMARY KEY,
  appointment_id VARCHAR(64) NOT NULL,
  customer_user_id VARCHAR(64) NOT NULL,
  property_id VARCHAR(64) NOT NULL,
  rating TINYINT NULL,
  comment TEXT NULL,
  addressed_at DATETIME NULL,
  addressed_by VARCHAR(60) NULL,
  pinned_by_agent TINYINT(1) NOT NULL DEFAULT 0,
  pinned_by_admin TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
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
CREATE INDEX idx_reviews_customer_user_id ON reviews (customer_user_id);
CREATE INDEX idx_reviews_property_id ON reviews (property_id);

CREATE TABLE IF NOT EXISTS trips (
  id VARCHAR(64) PRIMARY KEY,
  created_by_agent_user_id VARCHAR(64) NULL,
  customer_user_id VARCHAR(64) NULL,
  title VARCHAR(120) NULL,
  location VARCHAR(140) NULL,
  trip_date DATE NULL,
  trip_time TIME NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'confirmed',
  notes TEXT NULL,
  outcome_notes TEXT NULL,
  attendees_json JSON NULL,
  completed_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  rescheduled_at DATETIME NULL,
  expired_at DATETIME NULL,
  google_event_id VARCHAR(255) NULL,
  google_html_link TEXT NULL,
  google_sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  google_sync_error TEXT NULL,
  google_synced_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_trips_created_by
    FOREIGN KEY (created_by_agent_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_trips_customer
    FOREIGN KEY (customer_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_trips_created_by_agent_user_id ON trips (created_by_agent_user_id);
CREATE INDEX idx_trips_customer_user_id ON trips (customer_user_id);
CREATE INDEX idx_trips_schedule ON trips (trip_date, trip_time);
CREATE INDEX idx_trips_status ON trips (status);

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
CREATE INDEX idx_calendar_events_source ON calendar_events (source_kind, source_record_id);
CREATE INDEX idx_calendar_events_schedule ON calendar_events (event_date, event_time);
CREATE INDEX idx_calendar_events_status ON calendar_events (status);

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
CREATE INDEX idx_notifications_recipient_user_id ON notifications (recipient_user_id);
CREATE INDEX idx_notifications_appointment_id ON notifications (appointment_id);
CREATE INDEX idx_notifications_office_meet_id ON notifications (office_meet_id);
CREATE INDEX idx_notifications_created_at ON notifications (created_at);

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
);

CREATE INDEX idx_messages_sender_user_id ON messages (sender_user_id);
CREATE INDEX idx_messages_recipient_user_id ON messages (recipient_user_id);
CREATE INDEX idx_messages_provider_message_id ON messages (provider_message_id);
CREATE INDEX idx_messages_created_at ON messages (created_at);

-- =========================================================
-- 2. RUNTIME READ QUERIES
-- =========================================================  

SELECT id, username, password_hash, full_name, email, phone, photo_url, role, account_status, availability_status, last_active_at, deactivated_at, created_at, updated_at
FROM users
ORDER BY created_at DESC, id DESC;

SELECT p.id, p.title, p.location, p.price, p.bedrooms, p.bathrooms, p.area_sqft, p.description, p.image_url,
       p.listing_type, p.property_type, p.property_status, p.status, p.archived_at, p.archived_by_user_id,
       p.created_at, p.updated_at, p.agent_user_id, au.username AS agent_username
FROM properties p
LEFT JOIN users au ON au.id = p.agent_user_id
ORDER BY p.created_at DESC, p.id DESC;

SELECT a.id, a.property_id, a.customer_user_id, a.assigned_agent_user_id, a.assigned_by_admin_user_id,
       a.appointment_date, a.appointment_time, a.status, a.notes, a.assigned_at, a.outcome_notes, a.cancel_reason,
       a.completed_at, a.cancelled_at, a.rescheduled_at, a.expired_at, a.no_show_at,
       a.google_event_id, a.google_html_link, a.google_sync_status, a.google_sync_error, a.google_synced_at,
       a.created_at, a.updated_at,
       p.title AS property_title, p.location AS property_location, p.image_url AS property_image,
       cu.username AS customer_username, au.username AS assigned_agent_username, ad.username AS assigned_by_admin_username
FROM appointments a
LEFT JOIN properties p ON p.id = a.property_id
LEFT JOIN users cu ON cu.id = a.customer_user_id
LEFT JOIN users au ON au.id = a.assigned_agent_user_id
LEFT JOIN users ad ON ad.id = a.assigned_by_admin_user_id                                                                                         
ORDER BY a.created_at DESC, a.id DESC;

SELECT m.id, m.customer_user_id, m.assigned_agent_user_id, m.related_property_id, m.full_name, m.email, m.phone,
       m.mode, m.reason, m.notes, m.outcome_notes, m.meet_date, m.meet_time, m.status,
       m.completed_at, m.cancelled_at, m.rescheduled_at, m.expired_at, m.no_show_at,
       m.google_event_id, m.google_html_link, m.google_sync_status, m.google_sync_error, m.google_synced_at,
       m.created_at, m.updated_at,
       cu.username AS customer_username, cu.full_name AS customer_full_name, cu.email AS customer_email,
       au.username AS assigned_agent_username
FROM office_meets m
LEFT JOIN users cu ON cu.id = m.customer_user_id
LEFT JOIN users au ON au.id = m.assigned_agent_user_id
ORDER BY m.created_at DESC, m.id DESC;

SELECT r.id, r.appointment_id, r.customer_user_id, r.property_id, r.rating, r.comment,
       r.addressed_at, r.addressed_by, r.pinned_by_agent, r.pinned_by_admin, r.created_at, r.updated_at,
       cu.username AS customer_username
FROM reviews r
LEFT JOIN users cu ON cu.id = r.customer_user_id
ORDER BY r.created_at DESC, r.id DESC;

SELECT t.id, t.created_by_agent_user_id, t.customer_user_id, t.title, t.location, t.trip_date, t.trip_time,
       t.status, t.notes, t.outcome_notes, t.attendees_json, t.completed_at, t.cancelled_at, t.rescheduled_at, t.expired_at,
       t.google_event_id, t.google_html_link, t.google_sync_status, t.google_sync_error, t.google_synced_at,
       t.created_at, t.updated_at,
       ag.username AS agent_username, cu.username AS customer_username
FROM trips t
LEFT JOIN users ag ON ag.id = t.created_by_agent_user_id
LEFT JOIN users cu ON cu.id = t.customer_user_id
ORDER BY t.created_at DESC, t.id DESC;

SELECT trip_id, property_id, stop_order
FROM trip_properties
ORDER BY trip_id ASC, stop_order ASC;

SELECT n.id, n.recipient_user_id, n.appointment_id, n.office_meet_id, n.type, n.title, n.message, n.meta, n.read_at, n.created_at,
       ru.username AS recipient_username
FROM notifications n
LEFT JOIN users ru ON ru.id = n.recipient_user_id
ORDER BY n.created_at DESC, n.id DESC;

-- =========================================================
-- 3. RUNTIME RESET / SAVE QUERIES
-- =========================================================

DELETE FROM notifications;
DELETE FROM reviews;
DELETE FROM trip_properties;
DELETE FROM appointments;
DELETE FROM office_meets;
DELETE FROM trips;
DELETE FROM properties;
DELETE FROM users;

INSERT INTO users (id, username, password_hash, full_name, email, phone, photo_url, role, account_status, availability_status, last_active_at, deactivated_at, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

INSERT INTO properties (id, agent_user_id, title, location, price, bedrooms, bathrooms, area_sqft, description, image_url, listing_type, property_type, property_status, status, archived_at, archived_by_user_id, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

INSERT INTO trips (id, created_by_agent_user_id, customer_user_id, title, location, trip_date, trip_time, status, notes, outcome_notes, attendees_json, completed_at, cancelled_at, rescheduled_at, expired_at, google_event_id, google_html_link, google_sync_status, google_sync_error, google_synced_at, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

INSERT INTO appointments (id, property_id, customer_user_id, assigned_agent_user_id, assigned_by_admin_user_id, appointment_date, appointment_time, status, notes, assigned_at, outcome_notes, cancel_reason, completed_at, cancelled_at, rescheduled_at, expired_at, no_show_at, google_event_id, google_html_link, google_sync_status, google_sync_error, google_synced_at, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

INSERT INTO office_meets (id, customer_user_id, assigned_agent_user_id, related_property_id, full_name, email, phone, mode, reason, notes, outcome_notes, meet_date, meet_time, status, completed_at, cancelled_at, rescheduled_at, expired_at, no_show_at, google_event_id, google_html_link, google_sync_status, google_sync_error, google_synced_at, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

INSERT INTO reviews (id, appointment_id, customer_user_id, property_id, rating, comment, addressed_at, addressed_by, pinned_by_agent, pinned_by_admin, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

INSERT INTO trip_properties (trip_id, property_id, stop_order)
VALUES (?, ?, ?);

INSERT INTO notifications (id, recipient_user_id, appointment_id, office_meet_id, type, title, message, meta, read_at, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?);
