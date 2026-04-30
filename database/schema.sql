PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(32) NOT NULL UNIQUE,
  description VARCHAR(255),
  requires_mfa BOOLEAN NOT NULL DEFAULT 0
);

INSERT INTO roles (name, description, requires_mfa) VALUES
  ('admin', 'System administrator', 1),
  ('farmer', 'Farm owner or operator', 0),
  ('inspector', 'Agriculture office staff or inspector', 1),
  ('buyer', 'Harvest buyer or cooperative purchaser', 0)
ON CONFLICT(name) DO UPDATE SET
  description = excluded.description,
  requires_mfa = excluded.requires_mfa;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(32),
  full_name VARCHAR(160) NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  role_id INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  is_verified BOOLEAN NOT NULL DEFAULT 0,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until DATETIME,
  last_login_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);
CREATE INDEX IF NOT EXISTS ix_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS ix_users_role_id ON users(role_id);

CREATE TABLE IF NOT EXISTS farms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name VARCHAR(160) NOT NULL,
  barangay VARCHAR(120),
  municipality VARCHAR(120),
  province VARCHAR(120),
  latitude FLOAT,
  longitude FLOAT,
  area_hectares FLOAT,
  boundary_geojson JSON,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_farms_user_id ON farms(user_id);
CREATE INDEX IF NOT EXISTS ix_farms_status ON farms(status);

CREATE TABLE IF NOT EXISTS crops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id INTEGER NOT NULL,
  crop_type VARCHAR(80) NOT NULL,
  variety VARCHAR(120),
  soil_type VARCHAR(80),
  planting_date DATE,
  expected_harvest_date DATE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_crops_farm_id ON crops(farm_id);
CREATE INDEX IF NOT EXISTS ix_crops_crop_type ON crops(crop_type);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  farm_id INTEGER,
  crop_id INTEGER,
  image_path VARCHAR(500) NOT NULL,
  disease_name VARCHAR(160) NOT NULL,
  confidence FLOAT NOT NULL,
  cause TEXT,
  treatment TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'detected',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL,
  FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_scans_user_id ON scans(user_id);
CREATE INDEX IF NOT EXISTS ix_scans_farm_id ON scans(farm_id);
CREATE INDEX IF NOT EXISTS ix_scans_crop_id ON scans(crop_id);

CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id INTEGER NOT NULL,
  crop_id INTEGER,
  prediction_type VARCHAR(80) NOT NULL,
  result JSON NOT NULL,
  confidence FLOAT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE,
  FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_predictions_farm_id ON predictions(farm_id);
CREATE INDEX IF NOT EXISTS ix_predictions_crop_id ON predictions(crop_id);
CREATE INDEX IF NOT EXISTS ix_predictions_type ON predictions(prediction_type);

CREATE TABLE IF NOT EXISTS marketplace (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  farm_id INTEGER,
  crop_name VARCHAR(120) NOT NULL,
  quantity_kg FLOAT NOT NULL,
  price_per_kg FLOAT NOT NULL,
  harvest_date DATE,
  description TEXT,
  contact_phone VARCHAR(32),
  status VARCHAR(24) NOT NULL DEFAULT 'available',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_marketplace_user_id ON marketplace(user_id);
CREATE INDEX IF NOT EXISTS ix_marketplace_farm_id ON marketplace(farm_id);
CREATE INDEX IF NOT EXISTS ix_marketplace_crop_name ON marketplace(crop_name);
CREATE INDEX IF NOT EXISTS ix_marketplace_status ON marketplace(status);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(60) NOT NULL DEFAULT 'system',
  is_read BOOLEAN NOT NULL DEFAULT 0,
  payload JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS ix_notifications_is_read ON notifications(is_read);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  action VARCHAR(120) NOT NULL,
  resource_type VARCHAR(80),
  resource_id VARCHAR(80),
  ip_address VARCHAR(80),
  user_agent VARCHAR(500),
  metadata JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs(action);

CREATE TABLE IF NOT EXISTS mfa_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  secret_encrypted BLOB,
  enabled BOOLEAN NOT NULL DEFAULT 0,
  verified_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_mfa_settings_user_id ON mfa_settings(user_id);

CREATE TABLE IF NOT EXISTS recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  used_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_recovery_codes_user_id ON recovery_codes(user_id);
CREATE INDEX IF NOT EXISTS ix_recovery_codes_hash ON recovery_codes(code_hash);

CREATE TABLE IF NOT EXISTS password_reset_otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_password_reset_user_id ON password_reset_otps(user_id);
CREATE INDEX IF NOT EXISTS ix_password_reset_expires_at ON password_reset_otps(expires_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  device_name VARCHAR(160),
  ip_address VARCHAR(80),
  user_agent VARCHAR(500),
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS ix_refresh_tokens_expires_at ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS device_login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  ip_address VARCHAR(80),
  user_agent VARCHAR(500),
  device_name VARCHAR(160),
  location_hint VARCHAR(160),
  success BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_device_login_user_id ON device_login_history(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(80),
  success BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS ix_login_attempts_ip ON login_attempts(ip_address);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint VARCHAR(700) NOT NULL UNIQUE,
  subscription_keys JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_push_subscriptions_user_id ON push_subscriptions(user_id);
