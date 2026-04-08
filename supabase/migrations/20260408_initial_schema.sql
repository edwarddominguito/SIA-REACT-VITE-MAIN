-- Initial Postgres schema for SIA TES Property
-- Target project: jtstkfpzrhjbqqkfmtvw
-- Safe to run multiple times.

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
  status VARCHAR(30) NOT NULL DEFAULT 'available',
  listing_type VARCHAR(20) NOT NULL DEFAULT 'sale',
  property_type VARCHAR(40) NOT NULL DEFAULT 'house',
  property_status VARCHAR(20) NOT NULL DEFAULT 'available',
  archived_at TIMESTAMP NULL,
  archived_by_user_id VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id VARCHAR(64) PRIMARY KEY,
  property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE ON UPDATE CASCADE,
  customer_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  assigned_agent_user_id VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  assigned_by_admin_user_id VARCHAR(64) NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
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

CREATE TABLE IF NOT EXISTS trip_properties (
  trip_id VARCHAR(64) NOT NULL REFERENCES trips(id) ON DELETE CASCADE ON UPDATE CASCADE,
  property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE ON UPDATE CASCADE,
  stop_order INT NOT NULL,
  PRIMARY KEY (trip_id, property_id),
  CONSTRAINT uq_trip_stop_order UNIQUE (trip_id, stop_order)
);

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

CREATE INDEX IF NOT EXISTS idx_properties_agent_user_id ON properties(agent_user_id);
CREATE INDEX IF NOT EXISTS idx_properties_archived_at ON properties(archived_at);

CREATE INDEX IF NOT EXISTS idx_appointments_property_id ON appointments(property_id);
CREATE INDEX IF NOT EXISTS idx_appointments_customer_user_id ON appointments(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_assigned_agent_user_id ON appointments(assigned_agent_user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_schedule ON appointments(appointment_date, appointment_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

CREATE INDEX IF NOT EXISTS idx_office_meets_customer_user_id ON office_meets(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_office_meets_assigned_agent_user_id ON office_meets(assigned_agent_user_id);
CREATE INDEX IF NOT EXISTS idx_office_meets_schedule ON office_meets(meet_date, meet_time);
CREATE INDEX IF NOT EXISTS idx_office_meets_status ON office_meets(status);

CREATE INDEX IF NOT EXISTS idx_reviews_customer_user_id ON reviews(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_property_id ON reviews(property_id);

CREATE INDEX IF NOT EXISTS idx_trips_created_by_agent_user_id ON trips(created_by_agent_user_id);
CREATE INDEX IF NOT EXISTS idx_trips_customer_user_id ON trips(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_trips_schedule ON trips(trip_date, trip_time);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);

CREATE INDEX IF NOT EXISTS idx_calendar_events_source ON calendar_events(source_kind, source_record_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_schedule ON calendar_events(event_date, event_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user_id ON notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_appointment_id ON notifications(appointment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_office_meet_id ON notifications(office_meet_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_messages_sender_user_id ON messages(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_user_id ON messages(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_provider_message_id ON messages(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

