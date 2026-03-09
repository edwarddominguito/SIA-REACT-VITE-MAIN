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
  role ENUM('admin','agent','customer') NOT NULL DEFAULT 'customer',
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
  status VARCHAR(30) NOT NULL DEFAULT 'available',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_properties_agent
    FOREIGN KEY (agent_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
