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
