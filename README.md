# Campus Radar

All AITU student-club events in one feed. Students sign in with their university email, register in one tap and get Telegram reminders 24 hours and 1 hour before an event. Club organisers publish events, set participant limits with an automatic waitlist and export participant lists.

Team project for the Project Management course, Astana IT University.

## What it does (user stories from the project plan)

| Story | Priority | Where |
|---|---|---|
| US-01 Feed of all upcoming events | Must | `/` |
| US-02 Filter by category and date, search | Must | `/` |
| US-03 Event page with time, place, organiser | Must | `/events/:id` |
| US-04 Organisers create and publish events | Must | `/organizer` |
| US-05 Sign in with the university email only | Must | `/login` |
| US-06 One-tap registration | Must | event page |
| US-07 Participant limit and waitlist (automatic promotion) | Must | event form, event page |
| US-08 Telegram reminders 24 h and 1 h before | Must | `/settings`, bot |
| US-09 Add to Google Calendar / .ics | Should | event page |
| US-10 Export participants to CSV | Should | participants page |
| US-11 Club catalogue (42 active AITU clubs) | Should | `/clubs` |

## Stack

- **Backend:** Node.js 22, Express 5, PostgreSQL (`server/`)
- **Frontend:** React 18 + Vite (`web/`), served by the same Express app
- **Telegram bot:** grammY, webhook in production, long polling locally (`server/telegram.js`)
- **Reminders:** scheduler every minute inside the server, plus `/api/cron/tick` for an external cron (`server/reminders.js`)

```
server/
  index.js          app entry: migrations, bot, API, static site
  schema.sql        tables: clubs, users, events, registrations, reminders_sent …
  migrate.js        creates tables, imports clubs from seed/clubs.json, demo events
  auth.js           sign-in with a one-time code sent to @astanait.edu.kz
  registrations.js  registration, waitlist, promotion (row lock against double booking)
  routes.js         REST API
  telegram.js       bot: account linking, /my, /stop, notifications
  reminders.js      24 h / 1 h reminders without duplicates
web/src/
  pages/            Feed, EventPage, Login, MyEvents, Settings, Clubs, ClubPage,
                    Organizer, EventForm, Participants, Admin
tests/api.test.js   end-to-end API test (14 checks)
```

## Run locally

```bash
npm install
npm run build              # builds the website into web/dist
npm run db:local           # terminal 1: local PostgreSQL, no install needed
cp .env.example .env       # set ADMIN_EMAILS to your email
npm start                  # terminal 2: http://localhost:3000
```

For frontend work with hot reload run `npm run web:dev` (http://localhost:5173, proxies `/api` to port 3000).

Tests (server must be running with `ADMIN_EMAILS=admin@astanait.edu.kz`):

```bash
BASE=http://localhost:3000 node tests/api.test.js
```

## Roles

- **Student** — anyone who signs in with an `@astanait.edu.kz` email.
- **Organiser** — the admin adds their email to a club on `/admin`; they can then publish events for that club.
- **Admin** — emails listed in `ADMIN_EMAILS`.

## Sign-in codes

Codes are emailed through [Resend](https://resend.com) when `RESEND_API_KEY` is set (sending to any address requires a verified domain). Without it, `DEMO_MODE=true` shows the code on screen so the flow can be demonstrated.

See `DEPLOY.md` for putting it online.
