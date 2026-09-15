// Exports the current site content (clubs, council, announcements, calendar
// events, projects, quick links, CS events, slide archive, and the
// lunch/weekly-slide text) into server/seed/, plus a copy of any uploaded
// images those items reference — so a fresh clone can load the same content
// with `npm run seed` without ever committing accounts, sessions, or
// security logs (see scripts/seedImport.js and .gitignore).
//
// Run manually with `npm run seed:export` any time the real content changes
// and you want the checked-in seed to match it.
const fs = require('fs');
const path = require('path');

const db = require('../server/db');
const { UPLOADS_DIR } = require('../server/uploads');

const SEED_DIR = path.join(__dirname, '..', 'server', 'seed');
const SEED_ASSETS_DIR = path.join(SEED_DIR, 'assets');

const content = db.readContent();

const seed = {
  content: {
    lunchMenu: content.lunchMenu,
    weeklySlide: content.weeklySlide,
    lunchSchedule: content.lunchSchedule,
  },
  clubs: db.readClubs(),
  council: db.readCouncil(),
  announcements: db.readAnnouncements(),
  calendarEvents: db.readCalendarEvents(),
  projects: db.readProjects(),
  quickLinks: db.readQuickLinks(),
  csEvents: db.readCsEvents(),
  slideArchive: db.readSlideArchive(),
};

// Every field across these collections that holds an "/uploads/..." URL —
// copying the actual files those point to is what makes photos/logos show
// up for someone else too, not just the JSON referencing them.
const UPLOAD_URL_FIELDS = [
  ['clubs', 'logoUrl'],
  ['council', 'photoUrl'],
];

fs.mkdirSync(SEED_ASSETS_DIR, { recursive: true });
// Start clean so a since-removed asset doesn't linger in the seed forever.
fs.rmSync(SEED_ASSETS_DIR, { recursive: true, force: true });
fs.mkdirSync(SEED_ASSETS_DIR, { recursive: true });

let copiedCount = 0;
for (const [collection, field] of UPLOAD_URL_FIELDS) {
  for (const item of seed[collection]) {
    const url = item[field];
    if (!url || !url.startsWith('/uploads/')) continue;
    const relative = url.slice('/uploads/'.length);
    const source = path.join(UPLOADS_DIR, relative);
    if (!fs.existsSync(source)) continue;
    const destination = path.join(SEED_ASSETS_DIR, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    copiedCount += 1;
  }
}
if (content.lunchSchedule.imageUrl && content.lunchSchedule.imageUrl.startsWith('/uploads/')) {
  const relative = content.lunchSchedule.imageUrl.slice('/uploads/'.length);
  const source = path.join(UPLOADS_DIR, relative);
  if (fs.existsSync(source)) {
    const destination = path.join(SEED_ASSETS_DIR, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    copiedCount += 1;
  }
}

fs.writeFileSync(path.join(SEED_DIR, 'content.json'), JSON.stringify(seed, null, 2));

console.log(`Wrote ${path.join(SEED_DIR, 'content.json')}`);
console.log(`Copied ${copiedCount} referenced upload(s) into ${SEED_ASSETS_DIR}`);
db.close();
