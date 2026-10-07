const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openStore(filename) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename, { timeout: 5000 });
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','member')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE, token_hash TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL,
      accepted_at INTEGER, revoked_at INTEGER, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL, company TEXT NOT NULL, location TEXT NOT NULL DEFAULT '',
      workplace TEXT NOT NULL, employment_type TEXT NOT NULL, source TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '', salary INTEGER, stage TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT '', follow_up TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stage_events (
      id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id), previous_stage TEXT, stage TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cv_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id), text TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      kind TEXT NOT NULL, bytes BLOB NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS letters (
      application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL,
      recipient TEXT NOT NULL, tone TEXT NOT NULL, evidence TEXT NOT NULL, motivation TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS applications_owner ON applications(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS events_application ON stage_events(application_id, user_id);
    PRAGMA user_version=1;
  `);
  return db;
}
module.exports = { openStore };
