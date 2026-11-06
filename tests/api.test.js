// End-to-end API test. Run against a running server:  BASE=http://localhost:3000 node tests/api.test.js
// The server must run with DEMO_MODE=true and ADMIN_EMAILS containing admin@astanait.edu.kz.
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://localhost:3000';
const stamp = Date.now().toString(36);

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body) {
    const r = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = r.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const type = r.headers.get('content-type') || '';
    return { status: r.status, data: type.includes('json') ? await r.json() : await r.text() };
  }
  async login(email, name) {
    const a = await this.req('POST', '/api/auth/request-code', { email });
    assert.equal(a.status, 200, JSON.stringify(a.data));
    assert.ok(a.data.demoCode, 'demo code expected');
    const b = await this.req('POST', '/api/auth/verify', { email, code: a.data.demoCode, name });
    assert.equal(b.status, 200, JSON.stringify(b.data));
    return b.data.user;
  }
}

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const admin = new Client(), org = new Client(), s1 = new Client(), s2 = new Client(), s3 = new Client();
let clubId, eventId;

await test('rejects non-AITU email', async () => {
  const r = await new Client().req('POST', '/api/auth/request-code', { email: 'someone@gmail.com' });
  assert.equal(r.status, 400);
});

await test('wrong code is rejected', async () => {
  const c = new Client();
  await c.req('POST', '/api/auth/request-code', { email: `wrong${stamp}@astanait.edu.kz` });
  const r = await c.req('POST', '/api/auth/verify', { email: `wrong${stamp}@astanait.edu.kz`, code: '000000' });
  assert.equal(r.status, 400);
});

await test('admin signs in and assigns an organiser', async () => {
  const u = await admin.login('admin@astanait.edu.kz', 'Admin');
  assert.equal(u.role, 'admin');
  const clubs = await admin.req('GET', '/api/clubs');
  clubId = clubs.data.clubs.find(c => c.slug === 'chess-club').id;
  const r = await admin.req('POST', '/api/admin/organizers', { email: `org${stamp}@astanait.edu.kz`, clubId });
  assert.equal(r.status, 200);
});

await test('student cannot create events', async () => {
  await s1.login(`s1${stamp}@astanait.edu.kz`, 'Student One');
  const r = await s1.req('POST', '/api/organizer/events', {
    clubId, title: 'Hack night', category: 'Games', location: 'Room 101', startsAt: new Date(Date.now() + 864e5).toISOString(), capacity: 2,
  });
  assert.equal(r.status, 403);
});

await test('organiser creates an event with a limit of 2', async () => {
  const u = await org.login(`org${stamp}@astanait.edu.kz`, 'Organiser');
  assert.equal(u.role, 'organizer');
  const r = await org.req('POST', '/api/organizer/events', {
    clubId, title: `Blitz night ${stamp}`, description: 'Test', category: 'Games', location: 'Library',
    startsAt: new Date(Date.now() + 2 * 864e5).toISOString(), capacity: 2,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  eventId = r.data.id;
});

await test('event appears in the feed and in the Games filter', async () => {
  const all = await s1.req('GET', '/api/events');
  assert.ok(all.data.events.some(e => e.id === eventId));
  const games = await s1.req('GET', '/api/events?category=Games');
  assert.ok(games.data.events.every(e => e.category === 'Games'));
  const search = await s1.req('GET', `/api/events?q=${stamp}`);
  assert.equal(search.data.events.length, 1);
});

await test('two students take the seats, the third goes to the waitlist', async () => {
  await s2.login(`s2${stamp}@astanait.edu.kz`, 'Student Two');
  await s3.login(`s3${stamp}@astanait.edu.kz`, 'Student Three');
  const [a, b] = await Promise.all([s1.req('POST', `/api/events/${eventId}/register`), s2.req('POST', `/api/events/${eventId}/register`)]);
  assert.equal(a.data.status, 'going');
  assert.equal(b.data.status, 'going');
  const c = await s3.req('POST', `/api/events/${eventId}/register`);
  assert.deepEqual(c.data, { status: 'waitlist', position: 1 });
  const ev = await s3.req('GET', `/api/events/${eventId}`);
  assert.equal(ev.data.event.spotsLeft, 0);
  assert.equal(ev.data.event.waitlistPosition, 1);
});

await test('registering twice does not duplicate', async () => {
  const r = await s1.req('POST', `/api/events/${eventId}/register`);
  assert.equal(r.data.status, 'going');
  const p = await org.req('GET', `/api/organizer/events/${eventId}/participants`);
  assert.equal(p.data.participants.length, 3);
});

await test('cancelling promotes the first person on the waitlist', async () => {
  await s1.req('DELETE', `/api/events/${eventId}/register`);
  const ev = await s3.req('GET', `/api/events/${eventId}`);
  assert.equal(ev.data.event.myStatus, 'going');
});

await test('limit cannot go below the number registered; raising it is allowed', async () => {
  const base = { clubId, title: `Blitz night ${stamp}`, description: 'Test', category: 'Games', location: 'Library',
    startsAt: new Date(Date.now() + 2 * 864e5).toISOString() };
  const low = await org.req('PUT', `/api/organizer/events/${eventId}`, { ...base, capacity: 1 });
  assert.equal(low.status, 400);
  const ok = await org.req('PUT', `/api/organizer/events/${eventId}`, { ...base, capacity: 5 });
  assert.equal(ok.status, 200);
});

await test('my events lists the registration', async () => {
  const r = await s3.req('GET', '/api/me/events');
  assert.ok(r.data.upcoming.some(e => e.id === eventId));
});

await test('participants CSV export works for the organiser only', async () => {
  const csv = await org.req('GET', `/api/organizer/events/${eventId}/participants.csv`);
  assert.equal(csv.status, 200);
  assert.match(csv.data, /Student Two/);
  const denied = await s2.req('GET', `/api/organizer/events/${eventId}/participants.csv`);
  assert.equal(denied.status, 403);
});

await test('calendar file is generated', async () => {
  const r = await s2.req('GET', `/api/events/${eventId}/ics`);
  assert.match(r.data, /BEGIN:VEVENT/);
});

await test('cancelled event disappears from the feed', async () => {
  const r = await org.req('POST', `/api/organizer/events/${eventId}/cancel`);
  assert.equal(r.status, 200);
  const feed = await s2.req('GET', '/api/events');
  assert.ok(!feed.data.events.some(e => e.id === eventId));
});

console.log(`\nAll ${passed} tests passed.`);
