-- Campus Radar database schema (PostgreSQL)

CREATE TABLE IF NOT EXISTS clubs (
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','probation','frozen')),
  description   TEXT NOT NULL DEFAULT '',
  president     TEXT NOT NULL DEFAULT '',
  president_tg  TEXT NOT NULL DEFAULT '',
  telegram_url  TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL DEFAULT '',
  role              TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','organizer','admin')),
  telegram_chat_id  BIGINT,
  telegram_username TEXT,
  tg_link_token     TEXT UNIQUE,
  notify_24h        BOOLEAN NOT NULL DEFAULT true,
  notify_1h         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one-time sign-in codes sent to the AITU email
CREATE TABLE IF NOT EXISTS login_codes (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  used        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_codes_email_idx ON login_codes(email);

-- which users may publish events for which club
CREATE TABLE IF NOT EXISTS club_organizers (
  club_id  INT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS events (
  id           SERIAL PRIMARY KEY,
  club_id      INT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL,
  location     TEXT NOT NULL DEFAULT '',
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ,
  capacity     INT CHECK (capacity IS NULL OR capacity > 0),
  status       TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','cancelled')),
  created_by   INT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_starts_idx ON events(starts_at);

CREATE TABLE IF NOT EXISTS registrations (
  id          SERIAL PRIMARY KEY,
  event_id    INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('going','waitlist','cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS registrations_event_idx ON registrations(event_id, status, updated_at);

-- prevents sending the same reminder twice
CREATE TABLE IF NOT EXISTS reminders_sent (
  event_id  INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL CHECK (kind IN ('24h','1h')),
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id, kind)
);
