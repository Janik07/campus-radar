// Creates tables and fills an empty database with the AITU clubs and demo events.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, one, pool } from './db.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

export async function migrate({ seedDemo = true } = {}) {
  await q(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));

  const { n } = await one('SELECT count(*)::int AS n FROM clubs');
  if (n === 0) {
    const clubs = JSON.parse(fs.readFileSync(path.join(dir, 'seed', 'clubs.json'), 'utf8'));
    for (const c of clubs) {
      await q(
        `INSERT INTO clubs (slug,name,category,status,president,president_tg,telegram_url,description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (slug) DO NOTHING`,
        [c.slug, c.name, c.category, c.status, c.president, c.president_tg, c.telegram_url, c.description || '']
      );
    }
    console.log(`[migrate] imported ${clubs.length} clubs`);
  }

  if (seedDemo) {
    const { e } = await one('SELECT count(*)::int AS e FROM events');
    if (e === 0) await seedDemoEvents();
  }
}

// Demo events relative to "now", so the feed always has upcoming items.
async function seedDemoEvents() {
  const day = 24 * 3600 * 1000;
  const at = (days, hour, min = 0) => {
    const d = new Date(Date.now() + days * day);
    // hours are in Astana time (UTC+5)
    d.setUTCHours(hour - 5, min, 0, 0);
    return d.toISOString();
  };
  const demo = [
    ['gdsc', 'Intro to Flutter: build your first app', 'Hands-on workshop. Bring a laptop with Flutter installed — we will build a small to-do app together and publish it to a phone.', 'C1.3.240', 1, 18, 0, 40],
    ['chess-club', 'Weekly rapid tournament', '7 rounds of 10+5 rapid. Open to all levels, boards and clocks provided. Top 3 get club merch.', 'Library, 2nd floor', 2, 16, 0, 32],
    ['aitu-running', 'Morning run along the Esil embankment', 'Easy 5 km pace, meeting at the main entrance. Warm-up included.', 'Main entrance', 3, 7, 30, null],
    ['dc-princip', 'British Parliamentary debate night', 'Motion announced 15 minutes before the start. Judges from the league will give feedback.', 'C1.2.140', 3, 19, 0, 24],
    ['game-dev-club', 'Game jam kickoff: 48 hours, one theme', 'Teams of up to 4. Unity, Godot or anything you like. Theme revealed at the kickoff.', 'Coworking zone', 5, 18, 0, 60],
    ['aitu-volunteers', 'Charity fair volunteer briefing', 'Roles, shifts and safety rules for next week’s charity fair.', 'Assembly hall', 4, 13, 0, 30],
    ['board-games', 'Board games evening', 'Catan, Codenames, Dixit and more. Come alone or with friends.', 'Student lounge', 6, 18, 30, 20],
    ['music-club', 'Open mic', 'Sing, play or just listen. Sign up for a slot at the start.', 'Assembly hall', 7, 19, 0, null],
    ['tedx', 'TEDx speaker coaching session', 'How to structure an 8-minute talk. Open to anyone thinking of applying as a speaker.', 'C1.1.110', 8, 17, 0, 25],
    ['basketball-club', '3x3 basketball pickup games', 'Mixed teams, games to 11. Sports uniform required.', 'Sports hall', 2, 20, 0, 18],
    ['core', 'CTF practice: web exploitation basics', 'Beginner-friendly capture-the-flag practice. Bring a laptop.', 'C1.3.250', 9, 18, 0, 3],
    ['coffee-philo', 'Coffee & philosophy: is free will an illusion?', 'Short intro, then open discussion over coffee.', 'Cafeteria', 10, 17, 30, 15],
  ];
  for (const [slug, title, description, location, d, h, m, cap] of demo) {
    const club = await one('SELECT id, category FROM clubs WHERE slug=$1', [slug]);
    if (!club) continue;
    const starts = at(d, h, m);
    const ends = new Date(new Date(starts).getTime() + 2 * 3600 * 1000).toISOString();
    await q(
      `INSERT INTO events (club_id,title,description,category,location,starts_at,ends_at,capacity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [club.id, title, description, club.category, location, starts, ends, cap]
    );
  }
  console.log(`[migrate] created ${demo.length} demo events`);
}

// Allow `node server/migrate.js`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate().then(() => pool.end()).catch(e => { console.error(e); process.exit(1); });
}
