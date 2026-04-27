CREATE DATABASE IF NOT EXISTS agriscanproject CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE agriscanproject;

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(32) NOT NULL UNIQUE,
  description VARCHAR(255),
  requires_mfa BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;

INSERT INTO roles (name, description, requires_mfa) VALUES
  ('admin', 'System administrator', TRUE),
  ('farmer', 'Farm owner or operator', FALSE),
  ('inspector', 'Agriculture office staff or inspector', TRUE),
  ('buyer', 'Harvest buyer or cooperative purchaser', FALSE)
ON DUPLICATE KEY UPDATE description = VALUES(description), requires_mfa = VALUES(requires_mfa);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(32),
  full_name VARCHAR(160) NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  captcha_required BOOLEAN NOT NULL DEFAULT FALSE,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX ix_users_email (email),
  INDEX ix_users_phone (phone),
  INDEX ix_users_role_id (role_id),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS farms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  barangay VARCHAR(120),
  municipality VARCHAR(120),
  province VARCHAR(120),
  latitude DOUBLE,
  longitude DOUBLE,
  area_hectares DOUBLE,
  boundary_geojson JSON,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_farms_user_id (user_id),
  INDEX ix_farms_status (status),
  CONSTRAINT fk_farms_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS crops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  farm_id INT NOT NULL,
  crop_type VARCHAR(80) NOT NULL,
  variety VARCHAR(120),
  soil_type VARCHAR(80),
  planting_date DATE,
  expected_harvest_date DATE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_crops_farm_id (farm_id),
  INDEX ix_crops_crop_type (crop_type),
  CONSTRAINT fk_crops_farm FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS scans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  farm_id INT NULL,
  crop_id INT NULL,
  image_path VARCHAR(500) NOT NULL,
  disease_name VARCHAR(160) NOT NULL,
  confidence DOUBLE NOT NULL,
  cause TEXT,
  treatment TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'detected',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_scans_user_id (user_id),
  INDEX ix_scans_farm_id (farm_id),
  INDEX ix_scans_crop_id (crop_id),
  CONSTRAINT fk_scans_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_scans_farm FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL,
  CONSTRAINT fk_scans_crop FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS predictions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  farm_id INT NOT NULL,
  crop_id INT NULL,
  prediction_type VARCHAR(80) NOT NULL,
  result JSON NOT NULL,
  confidence DOUBLE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_predictions_farm_id (farm_id),
  INDEX ix_predictions_crop_id (crop_id),
  INDEX ix_predictions_type (prediction_type),
  CONSTRAINT fk_predictions_farm FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE,
  CONSTRAINT fk_predictions_crop FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS marketplace (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  farm_id INT NULL,
  crop_name VARCHAR(120) NOT NULL,
  quantity_kg DOUBLE NOT NULL,
  price_per_kg DOUBLE NOT NULL,
  harvest_date DATE,
  description TEXT,
  contact_phone VARCHAR(32),
  status VARCHAR(24) NOT NULL DEFAULT 'available',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_marketplace_user_id (user_id),
  INDEX ix_marketplace_farm_id (farm_id),
  INDEX ix_marketplace_crop_name (crop_name),
  INDEX ix_marketplace_status (status),
  CONSTRAINT fk_marketplace_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_marketplace_farm FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(60) NOT NULL DEFAULT 'system',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_notifications_user_id (user_id),
  INDEX ix_notifications_is_read (is_read),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT NULL,
  action VARCHAR(120) NOT NULL,
  resource_type VARCHAR(80),
  resource_id VARCHAR(80),
  ip_address VARCHAR(80),
  user_agent VARCHAR(500),
  metadata JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_audit_logs_actor (actor_user_id),
  INDEX ix_audit_logs_action (action),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mfa_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  secret_encrypted VARBINARY(2048),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_mfa_settings_user_id (user_id),
  CONSTRAINT fk_mfa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recovery_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_recovery_codes_user_id (user_id),
  INDEX ix_recovery_codes_hash (code_hash),
  CONSTRAINT fk_recovery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_reset_otps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_password_reset_user_id (user_id),
  INDEX ix_password_reset_expires_at (expires_at),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  device_name VARCHAR(160),
  ip_address VARCHAR(80),
  user_agent VARCHAR(500),
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_refresh_tokens_user_id (user_id),
  INDEX ix_refresh_tokens_expires_at (expires_at),
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS device_login_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  ip_address VARCHAR(80),
  user_agent VARCHAR(500),
  device_name VARCHAR(160),
  location_hint VARCHAR(160),
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_device_login_user_id (user_id),
  CONSTRAINT fk_device_login_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(80),
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_login_attempts_email (email),
  INDEX ix_login_attempts_ip (ip_address)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  endpoint VARCHAR(700) NOT NULL UNIQUE,
  subscription_keys JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_push_subscriptions_user_id (user_id),
  CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
