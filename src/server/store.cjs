const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openStore(filename, localOnly = false) {
  if (process.env.MILO_DB_SOCKET && !localOnly) return require('./database-client.cjs').connectStore(process.env.MILO_DB_SOCKET);
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
    CREATE TABLE IF NOT EXISTS job_toolkits (
      user_id TEXT NOT NULL REFERENCES users(id), job_key TEXT NOT NULL,
      job TEXT NOT NULL, assessment TEXT, tailored_cv TEXT NOT NULL DEFAULT '',
      cover_letter TEXT NOT NULL DEFAULT '', cv_hash TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id,job_key)
    );
    CREATE TABLE IF NOT EXISTS user_ai (
      user_id TEXT PRIMARY KEY REFERENCES users(id), provider TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '', encrypted_key TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS events_application ON stage_events(application_id, user_id);
    PRAGMA user_version=1;
  `);
  const columns=new Set(db.prepare('PRAGMA table_info(applications)').all().map(column=>column.name));
  if(!columns.has('country'))db.exec("ALTER TABLE applications ADD COLUMN country TEXT NOT NULL DEFAULT 'new zealand'");
  if(!columns.has('currency'))db.exec("ALTER TABLE applications ADD COLUMN currency TEXT NOT NULL DEFAULT 'NZD'");
  const documentColumns=new Set(db.prepare('PRAGMA table_info(documents)').all().map(column=>column.name));
  for(const [name,definition] of Object.entries({purpose:"TEXT NOT NULL DEFAULT 'CV'",extracted_text:"TEXT NOT NULL DEFAULT ''",assessment_json:"TEXT NOT NULL DEFAULT ''",extraction_error:"TEXT NOT NULL DEFAULT ''"}))if(!documentColumns.has(name))db.exec(`ALTER TABLE documents ADD COLUMN ${name} ${definition}`);
  db.exec(`CREATE TABLE IF NOT EXISTS email_accounts (user_id TEXT NOT NULL REFERENCES users(id), provider TEXT NOT NULL, encrypted_tokens TEXT NOT NULL, synced_at TEXT NOT NULL, PRIMARY KEY(user_id,provider));
    CREATE TABLE IF NOT EXISTS email_messages (user_id TEXT NOT NULL REFERENCES users(id),provider TEXT NOT NULL,message_id TEXT NOT NULL,subject TEXT NOT NULL,sender TEXT NOT NULL,received_at TEXT NOT NULL,snippet TEXT NOT NULL,application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,imported_at TEXT NOT NULL,PRIMARY KEY(user_id,provider,message_id));
    CREATE TABLE IF NOT EXISTS email_clients (user_id TEXT NOT NULL REFERENCES users(id),provider TEXT NOT NULL,client_id TEXT NOT NULL,encrypted_secret TEXT NOT NULL,PRIMARY KEY(user_id,provider));
    CREATE TABLE IF NOT EXISTS cover_profiles (user_id TEXT PRIMARY KEY REFERENCES users(id),text TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS password_reset_events (id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES users(id),target_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
    PRAGMA user_version=6;`);
  return db;
}
module.exports = { openStore };
