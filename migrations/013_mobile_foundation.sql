-- Migration 013: mobile app foundation
-- Push devices, building notices, and draft document signature requests.

CREATE TABLE IF NOT EXISTS push_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'EXPO',
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  device_name TEXT,
  app_version TEXT,
  locale TEXT,
  timezone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS push_devices_provider_token_key
  ON push_devices(provider, token);
CREATE INDEX IF NOT EXISTS push_devices_user_id_is_active_idx
  ON push_devices(user_id, is_active);
CREATE INDEX IF NOT EXISTS push_devices_organization_id_is_active_idx
  ON push_devices(organization_id, is_active);

CREATE TABLE IF NOT EXISTS mobile_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  access_token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT,
  device_name TEXT,
  platform TEXT,
  app_version TEXT,
  user_agent TEXT,
  ip TEXT,
  expires_at TIMESTAMP(3) NOT NULL,
  refresh_expires_at TIMESTAMP(3) NOT NULL,
  revoked_at TIMESTAMP(3),
  last_used_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS mobile_sessions_user_id_revoked_at_idx
  ON mobile_sessions(user_id, revoked_at);
CREATE INDEX IF NOT EXISTS mobile_sessions_organization_id_revoked_at_idx
  ON mobile_sessions(organization_id, revoked_at);
CREATE INDEX IF NOT EXISTS mobile_sessions_refresh_expires_at_idx
  ON mobile_sessions(refresh_expires_at);

CREATE TABLE IF NOT EXISTS building_notices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  building_id TEXT NOT NULL,
  created_by_id TEXT,
  type TEXT NOT NULL DEFAULT 'INFO',
  severity TEXT NOT NULL DEFAULT 'INFO',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  starts_at TIMESTAMP(3),
  ends_at TIMESTAMP(3),
  sent_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS building_notices_organization_id_building_id_created_at_idx
  ON building_notices(organization_id, building_id, created_at);
CREATE INDEX IF NOT EXISTS building_notices_building_id_starts_at_ends_at_idx
  ON building_notices(building_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS document_signature_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  requested_by_id TEXT,
  recipient_user_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_id TEXT,
  document_ref TEXT,
  title TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  channel TEXT NOT NULL DEFAULT 'MOBILE',
  allowed_methods JSONB,
  preferred_method TEXT,
  sign_token TEXT UNIQUE,
  expires_at TIMESTAMP(3),
  viewed_at TIMESTAMP(3),
  signed_at TIMESTAMP(3),
  rejected_at TIMESTAMP(3),
  rejection_reason TEXT,
  signature_id TEXT,
  sms_phone_masked TEXT,
  otp_hash TEXT,
  otp_expires_at TIMESTAMP(3),
  otp_verified_at TIMESTAMP(3),
  metadata JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS document_signature_requests_organization_id_status_created_at_idx
  ON document_signature_requests(organization_id, status, created_at);
CREATE INDEX IF NOT EXISTS document_signature_requests_recipient_user_id_status_created_at_idx
  ON document_signature_requests(recipient_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS document_signature_requests_requested_by_id_created_at_idx
  ON document_signature_requests(requested_by_id, created_at);
CREATE INDEX IF NOT EXISTS document_signature_requests_document_type_document_id_idx
  ON document_signature_requests(document_type, document_id);
