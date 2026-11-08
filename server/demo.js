// Demo content: ~40 events with real photos, past events with registrations and check-ins
// (so the attendance dashboard has data), and demo students.
// Runs once per DEMO_VERSION; organiser-created events are never touched.
import crypto from 'node:crypto';
import { tx, one } from './db.js';

export const DEMO_VERSION = '3';

const U = id => `https://images.unsplash.com/photo-${id}?w=1200&q=70&auto=format&fit=crop`;
export const PHOTO = {
  code: U('1517694712202-14dd9538aa97'), code2: U('1555066931-4365d14bab8c'), chess: U('1529699211952-734e80c4d42b'),
  chess2: U('1580541832626-2a7131ee809f'), run: U('1452626038306-9aae5e071dd3'), run2: U('1476480862126-209bfaa8edc8'),
  speaker: U('1475721027785-f74eccf877e2'), conf: U('1540575467063-178a50c2df87'), gaming: U('1542751371-adc38448a05e'),
  volunteer: U('1559027615-cd4628902d4a'), board: U('1610890716171-6b1bb98ffd09'), cards: U('1632501641765-e568d28b0015'),
  mic: U('1511671782779-c97d3d27a1d4'), concert: U('1493225457124-a3eb161ffa5f'), tedx: U('1505373877841-8d25f7d46678'),
  basket: U('1546519638-68e109498ffc'), basket2: U('1519861531473-9200262188bf'), cyber: U('1550751827-4bd374c3f58b'),
  coffee: U('1495474472287-4d71bcdd2085'), latte: U('1509042239860-f550ce710b93'), library: U('1481627834876-b7833e8f5570'),
  dance: U('1504609813442-a8924e83f76e'), paint: U('1513364776144-60967b0f800f'), volley: U('1612872087720-bb876e2e67d1'),
  cooking: U('1556910103-1c02745aae4d'), cinema: U('1489599849927-2ee91cede3ba'), tabletennis: U('1534158914592-062992fbe900'),
  cycling: U('1517649763962-0c623066013b'), circuit: U('1518770660439-4636190af475'), space: U('1446776811953-b23d57bd21aa'),
  team: U('1522071820081-009f0129c71c'), camera: U('1516035069371-29a1b244cc32'), gym: U('1517836357463-d25dfeac3438'),
  learn: U('1546410531-bb4caa6b424d'), students: U('1523240795612-9a054b0db644'), hack: U('1504384308090-c894fdcc538d'),
  party: U('1492684223066-81342ee5ff30'), orchestra: U('1465847899084-d164df4dedc6'), guitar: U('1510915361894-db8b60106cb1'),
  cosplay: U('1578632767115-351597cf2477'), dumbbells: U('1534438327276-14e5300c3a48'), debate: U('1529070538774-1843cb3265df'),
  calis: U('1599058917765-a780eda07a3e'), robot: U('1485827404703-89b55fcc595e'), study: U('1522202176988-66273c2fd55f'),
  charity: U('1532629345422-7515f3d16bb6'), photo: U('1452587925148-ce544e77e70d'), vocal: U('1516280440614-37939bbacd81'),
  startup: U('1559136555-9303baea8ebd'), food: U('1504674900247-0877df9cc836'), phone: U('1512941937669-90a1b58e7e9c'),
  ai: U('1677442136019-21780ecad995'), lecture: U('1524178232363-1fb2b075b655'),
};

// Cover used when an organiser does not add a poster.
export const CATEGORY_PHOTO = {
  Tech: PHOTO.code, Sport: PHOTO.basket2, Games: PHOTO.board, Arts: PHOTO.paint, Music: PHOTO.concert, Culture: PHOTO.students,
  Intellectual: PHOTO.library, Social: PHOTO.volunteer, Media: PHOTO.camera, Career: PHOTO.startup,
};

// [club slug, title, description, location, day offset, hour, minute, duration h, capacity, photo, fill 0..1.2]
const UPCOMING = [
  ['gdsc', 'Intro to Flutter: build your first app', 'Hands-on workshop. Bring a laptop with Flutter installed — together we build a small to-do app and run it on your phone. No mobile experience needed.', 'C1.3.240', 1, 18, 0, 2, 40, 'phone', 0.85],
  ['the-vocal-club', 'Vocal warm-up masterclass', 'Breathing, warm-ups and a first song in harmony. Great for beginners who always wanted to try singing.', 'Assembly hall', 1, 17, 0, 1.5, 15, 'vocal', 0.6],
  ['calisthenics-club', 'Calisthenics: your first pull-up', 'A 4-week program starts tonight. Coaches assess your level and give you a plan. Sportswear required.', 'Sports hall', 1, 19, 0, 1.5, 20, 'calis', 0.7],
  ['chess-club', 'Weekly rapid tournament', '7 rounds of 10+5 rapid. Open to all levels, boards and clocks provided. Top 3 get club merch.', 'Library, 2nd floor', 2, 16, 0, 3, 32, 'chess', 0.9],
  ['basketball-club', '3x3 basketball pickup games', 'Mixed teams, games to 11. Come alone — we make teams on the spot.', 'Sports hall', 2, 20, 0, 2, 18, 'basket', 1.15],
  ['aitu-mafia', 'Mafia game night', 'Two tables, experienced hosts, new players welcome. Learn the rules in 5 minutes.', 'Student lounge', 2, 19, 30, 3, 20, 'cards', 0.75],
  ['aitu-running', 'Morning run along the Esil embankment', 'Easy 5 km pace, then coffee together. Meeting at the main entrance.', 'Main entrance', 3, 7, 30, 1.5, null, 'run', 0.4],
  ['dc-princip', 'British Parliamentary debate night', 'Motion announced 15 minutes before the start. League judges give every speaker feedback.', 'C1.2.140', 3, 19, 0, 2.5, 24, 'debate', 0.8],
  ['aitu-table-tennis', 'Table tennis ladder', 'Climb the club ladder: challenge anyone two places above you. Rackets available.', 'Sports hall, 2nd floor', 3, 18, 0, 2, 16, 'tabletennis', 0.55],
  ['aitu-volunteers', 'Charity fair: volunteer briefing', 'Roles, shifts and safety rules for next week’s charity fair. Volunteer hours are counted.', 'Assembly hall', 4, 13, 0, 1, 30, 'volunteer', 0.65],
  ['aitu-orchestra', 'Orchestra open rehearsal', 'Listen to the rehearsal of the winter concert programme and meet the musicians. Instrumentalists can audition.', 'Assembly hall', 4, 18, 0, 2, null, 'orchestra', 0.3],
  ['volleyball-club', 'Volleyball friendly match', 'AITU vs. guest team from ENU. Players and fans welcome.', 'Sports hall', 4, 20, 0, 2, 24, 'volley', 0.7],
  ['game-dev-club', 'Game jam kickoff: 48 hours, one theme', 'Teams of up to 4. Unity, Godot or anything you like. The theme is revealed at the kickoff.', 'Coworking zone', 5, 18, 0, 3, 60, 'hack', 0.75],
  ['art-club', 'Watercolour evening', 'Paints, paper and tea are on us. We paint the Astana skyline together.', 'Art studio, C1.1.05', 5, 17, 0, 2, 16, 'paint', 1.0],
  ['aitu-gaming', 'CS2 & Valorant LAN night', '5v5 mini-tournament with prizes. Bring your headset.', 'Computer lab C1.3.310', 5, 19, 0, 4, 40, 'gaming', 0.85],
  ['buddy', 'International students welcome picnic', 'Meet your buddy, try Kazakh snacks and make friends from 10+ countries.', 'Campus courtyard', 5, 14, 0, 3, null, 'students', 0.45],
  ['board-games', 'Board games evening', 'Catan, Codenames, Dixit and more. Come alone or with friends.', 'Student lounge', 6, 18, 30, 3, 20, 'board', 0.6],
  ['dance-club', 'K-pop & hip-hop dance workshop', 'Learn a short choreography in 90 minutes. No experience needed.', 'Dance studio', 6, 19, 0, 1.5, 35, 'dance', 0.9],
  ['cycling-club', 'Weekend ride to the Botanical Garden', '25 km easy ride with stops. Helmet required, bikes can be rented nearby.', 'Main entrance', 6, 10, 0, 3, null, 'cycling', 0.35],
  ['music-club', 'Open mic night', 'Sing, play or just listen. Sign up for a slot at the start.', 'Assembly hall', 7, 19, 0, 2.5, null, 'mic', 0.5],
  ['k-i-n-o-club', 'Movie night: Interstellar + discussion', 'Big screen, popcorn and a 20-minute discussion about the science of the film.', 'Assembly hall', 7, 20, 0, 3.5, 50, 'cinema', 0.8],
  ['jurek-charity', 'Charity bake sale', 'All proceeds go to a children’s rehabilitation centre. Bakers and buyers welcome!', 'Main hall', 7, 12, 0, 4, null, 'charity', 0.2],
  ['tedx', 'TEDx speaker coaching session', 'How to structure an 8-minute talk. Open to anyone thinking of applying as a speaker.', 'C1.1.110', 8, 17, 0, 2, 25, 'tedx', 0.7],
  ['aitu-electronics', 'Arduino for beginners', 'Blink an LED, read a sensor, build a mini weather station. Kits provided.', 'Lab C1.3.120', 8, 15, 0, 3, 20, 'circuit', 0.95],
  ['serin-book-literature-club', 'Book club: Abai’s “Book of Words”', 'We discuss Words 1–10. Read them before the meeting or come to listen.', 'Library reading room', 8, 18, 0, 1.5, 20, 'library', 0.5],
  ['core', 'CTF practice: web exploitation basics', 'Beginner-friendly capture-the-flag practice. Bring a laptop.', 'C1.3.250', 9, 18, 0, 3, 30, 'cyber', 0.7],
  ['hustle', 'Startup pitch practice', 'Pitch your idea in 3 minutes and get feedback from founders and mentors.', 'Coworking zone', 9, 18, 30, 2, 30, 'startup', 0.6],
  ['tyf-media', 'Photo walk around campus', 'Learn composition and light while shooting the campus at golden hour. Phone cameras welcome.', 'Main entrance', 9, 15, 0, 2, 15, 'photo', 0.8],
  ['coffee-philo', 'Coffee & philosophy: is free will an illusion?', 'Short intro, then open discussion over coffee.', 'Cafeteria', 10, 17, 30, 1.5, 15, 'coffee', 1.0],
  ['anime-club', 'Anime screening & cosplay meetup', 'Two episodes on the big screen and a cosplay photo zone.', 'C1.1.110', 10, 18, 0, 3, 30, 'cosplay', 0.65],
  ['siam', 'CV and LinkedIn clinic', 'Bring your CV — recruiters and seniors review it one-on-one in 10 minutes.', 'Career centre', 10, 16, 0, 2, 25, 'study', 0.85],
  ['seds', 'Stargazing night & space talk', 'A short talk on Kazakhstan’s space programme, then telescopes on the roof (weather permitting).', 'Rooftop, Block C1', 11, 19, 30, 2, 40, 'space', 0.6],
  ['intellectum', 'Brain-ring quiz night', 'Teams of 6, eight rounds, prizes for the top 3. Register as a team or join one on the spot.', 'Assembly hall', 11, 18, 0, 2.5, 36, 'lecture', 0.75],
  ['aitu-kca', 'Cooking battle: plov edition', 'Three teams, one kazan each, a jury of chefs. Everyone tastes the results.', 'Cafeteria kitchen', 12, 16, 0, 3, 12, 'cooking', 1.2],
  ['aitu-arm-wrestling', 'Arm-wrestling open cup', 'Weight categories for men and women. Weigh-in at 16:30.', 'Sports hall', 12, 17, 0, 3, 32, 'dumbbells', 0.55],
  ['gdsc', 'AI study jam: build a chatbot', 'From prompt to working Telegram chatbot in one evening.', 'C1.3.240', 13, 17, 0, 3, 40, 'ai', 0.9],
  ['core', 'Cloud basics: deploy your first app', 'Create a free cloud account and deploy a web app step by step.', 'C1.3.250', 13, 18, 0, 2, 40, 'code2', 0.5],
  ['denkdeutsch', 'Deutsch speaking café', 'Practise German over coffee at any level, from A1 to C1. Board games in German for the brave.', 'Cafeteria', 4, 17, 30, 1.5, 20, 'latte', 0.55],
  ['psyclub', 'Exam season without stress', 'A practical workshop on sleep, focus and handling exam anxiety, run by the university psychologist.', 'C1.1.110', 9, 17, 0, 1.5, 40, 'learn', 0.6],
  ['aitu-live', 'Student bands live', 'Three AITU bands, one stage. Free entry with registration.', 'Assembly hall', 14, 19, 0, 3, 120, 'concert', 0.7],
  ['dc-princip', 'Model UN: crisis committee simulation', 'A one-day crisis committee. Delegates receive their countries 3 days before.', 'C1.2.140', 14, 10, 0, 7, 40, 'speaker', 0.7],
];

const PAST = [
  ['gdsc', 'Git & GitHub crash course', 'Branches, pull requests and resolving conflicts.', 'C1.3.240', -3, 18, 0, 2, 40, 'code', 0.9, 0.82],
  ['aitu-kca', 'Baursak workshop', 'Classic baursaks with the club chefs.', 'Cafeteria kitchen', -2, 16, 0, 2, 12, 'food', 1.0, 0.92],
  ['k-i-n-o-club', 'Movie night: The Social Network', 'Screening and discussion.', 'Assembly hall', -4, 20, 0, 3, 50, 'cinema', 0.7, 0.71],
  ['chess-club', 'Blitz arena', '3+2 arena, 90 minutes.', 'Library, 2nd floor', -5, 17, 0, 2, 32, 'chess2', 0.95, 0.88],
  ['music-club', 'Acoustic evening', 'Guitars, candles and good songs.', 'Student lounge', -6, 19, 0, 2, null, 'guitar', 0.6, 0.64],
  ['volleyball-club', 'Freshmen volleyball cup', 'Mixed teams of first-year students.', 'Sports hall', -6, 18, 0, 3, 36, 'volley', 0.85, 0.79],
  ['aitu-running', 'Night run 5K', 'Headlamps and reflective vests provided.', 'Main entrance', -7, 21, 0, 1.5, null, 'run2', 0.5, 0.74],
  ['basketball-club', 'Freshmen basketball cup', 'Six teams, knockout format.', 'Sports hall', -8, 18, 0, 3, 48, 'basket2', 0.9, 0.86],
  ['board-games', 'Codenames tournament', 'Teams of two, Swiss system.', 'Student lounge', -9, 18, 30, 3, 24, 'cards', 0.8, 0.69],
  ['dc-princip', 'Debate league: round 1', 'First round of the semester league.', 'C1.2.140', -10, 19, 0, 2.5, 24, 'debate', 1.0, 0.9],
  ['core', 'Linux command line basics', 'Navigate, search and script in the terminal.', 'C1.3.250', -11, 18, 0, 2, 30, 'cyber', 0.75, 0.62],
  ['game-dev-club', 'Unity workshop: 2D platformer', 'Movement, jumping and a first level.', 'C1.3.310', -12, 18, 0, 3, 30, 'gaming', 0.9, 0.8],
  ['dance-club', 'Salsa intro', 'Basic steps and turns in pairs.', 'Dance studio', -13, 19, 0, 1.5, 30, 'dance', 0.75, 0.58],
  ['aitu-volunteers', 'Tree planting day', '200 seedlings planted near the campus.', 'Campus courtyard', -14, 11, 0, 4, 40, 'volunteer', 0.85, 0.83],
  ['intellectum', 'Quiz night: autumn edition', 'Eight rounds, twelve teams.', 'Assembly hall', -15, 18, 0, 2.5, 48, 'lecture', 0.9, 0.77],
  ['tedx', 'Open lecture: ideas worth spreading', 'Three short talks by AITU alumni.', 'C1.1.110', -16, 17, 0, 2, 60, 'tedx', 0.7, 0.55],
  ['hustle', 'Founder talk: from idea to first users', 'Q&A with a local startup founder.', 'Coworking zone', -18, 18, 0, 2, 40, 'team', 0.8, 0.6],
  ['seds', 'Rocketry 101', 'How model rockets fly, and how to build one.', 'C1.1.110', -19, 18, 0, 2, 30, 'robot', 0.65, 0.7],
  ['art-club', 'Sketching in the park', 'Urban sketching for beginners.', 'Central Park', -20, 15, 0, 2, 20, 'paint', 0.7, 0.66],
];

const FIRST = ['Aruzhan', 'Dias', 'Aigerim', 'Nursultan', 'Dana', 'Alikhan', 'Madina', 'Yerassyl', 'Kamila', 'Temirlan', 'Aisha', 'Arman',
  'Zhansaya', 'Daniyar', 'Togzhan', 'Bekzat', 'Amina', 'Sanzhar', 'Inkar', 'Miras', 'Diana', 'Askar', 'Saule', 'Nurbol', 'Assel',
  'Adil', 'Moldir', 'Erlan', 'Akbota', 'Alibek', 'Zarina', 'Ruslan', 'Aiganym', 'Timur', 'Laura', 'Olzhas', 'Dilnaz', 'Azamat', 'Sofia', 'Ilyas'];
const LAST = 'ABDEGIKMNORSTUZ';

// Deterministic random numbers so every deploy produces the same demo data.
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

export async function seedDemo() {
  const meta = await one(`SELECT value FROM app_meta WHERE key='demo_version'`);
  if (meta?.value === DEMO_VERSION) return;
  const rand = rng(42);
  await tx(async c => {
    // Remove previous demo data (events created without an organiser) and demo users.
    await c.q(`DELETE FROM events WHERE is_demo OR created_by IS NULL`);
    await c.q(`DELETE FROM users WHERE is_demo`);

    const userIds = [];
    for (let i = 0; i < 90; i++) {
      const first = FIRST[i % FIRST.length];
      const last = LAST[Math.floor(i / FIRST.length * 5 + i) % LAST.length];
      const u = await c.one(
        `INSERT INTO users (email, name, is_demo) VALUES ($1,$2,true)
         ON CONFLICT (email) DO UPDATE SET is_demo=true RETURNING id`,
        [`demo.${first.toLowerCase()}.${last.toLowerCase()}${i}@astanait.edu.kz`, `${first} ${last}.`]);
      userIds.push(u.id);
    }

    const at = (days, hour, min) => {
      const d = new Date(Date.now() + days * 864e5);
      d.setUTCHours(hour - 5, min, 0, 0); // Astana is UTC+5
      return d;
    };
    const pick = n => [...userIds].sort(() => rand() - 0.5).slice(0, n);

    const insert = async (row, past) => {
      const [slug, title, description, location, day, h, m, dur, cap, photo, fill, attendRate] = row;
      const club = await c.one('SELECT id, category FROM clubs WHERE slug=$1', [slug]);
      if (!club) { console.warn('[demo] unknown club', slug); return; }
      const starts = at(day, h, m);
      const ends = new Date(starts.getTime() + dur * 3600e3);
      const ev = await c.one(
        `INSERT INTO events (club_id,title,description,category,location,starts_at,ends_at,capacity,image_url,is_demo,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true, $10) RETURNING id`,
        [club.id, title, description, club.category, location, starts, ends, cap, PHOTO[photo] || '', new Date(starts.getTime() - 10 * 864e5)]);
      const base = cap ?? Math.round(20 + rand() * 40);
      const total = Math.min(userIds.length, Math.round(base * fill));
      const people = pick(total);
      for (let i = 0; i < people.length; i++) {
        const going = cap == null || i < cap;
        const regAt = new Date(starts.getTime() - (9 - i * 0.1) * 864e5);
        const checked = past && going && rand() < attendRate ? new Date(starts.getTime() + rand() * 20 * 60e3) : null;
        await c.q(
          `INSERT INTO registrations (event_id,user_id,status,created_at,updated_at,checkin_code,checkin_token,checked_in_at)
           VALUES ($1,$2,$3,$4,$4,$5,$6,$7)`,
          [ev.id, people[i], going ? 'going' : 'waitlist', regAt, String(100000 + Math.floor(rand() * 900000)),
            crypto.randomBytes(12).toString('base64url'), checked]);
      }
    };
    for (const row of UPCOMING) await insert(row, false);
    for (const row of PAST) await insert(row, true);
    await c.q(`INSERT INTO app_meta (key,value) VALUES ('demo_version',$1)
               ON CONFLICT (key) DO UPDATE SET value=$1`, [DEMO_VERSION]);
  });
  console.log(`[demo] seeded ${UPCOMING.length} upcoming and ${PAST.length} past events (v${DEMO_VERSION})`);
}
