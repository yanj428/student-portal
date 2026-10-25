// Loads server/seed/content.json (and its referenced images) into the local
// database and uploads/ folder — this is what makes real content (clubs,
// council, calendar, etc.) show up for anyone who clones the repo and runs
// it locally, without any of that living in git as raw account/session data.
//
// Run manually with `npm run seed`. Refuses to overwrite existing content —
// safe to run again by accident, but won't clobber real data you've since
// added through the admin panel. Never touches student/admin accounts,
// sessions, or security logs; those are per-deployment on purpose.
const fs = require('fs');
const path = require('path');

const db = require('../server/db');
const { UPLOADS_DIR } = require('../server/uploads');

const SEED_DIR = path.join(__dirname, '..', 'server', 'seed');
const SEED_FILE = path.join(SEED_DIR, 'content.json');
const SEED_ASSETS_DIR = path.join(SEED_DIR, 'assets');

if (!fs.existsSync(SEED_FILE)) {
  console.error(`No seed found at ${SEED_FILE} - nothing to load.`);
  process.exit(1);
}

const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

const collections = [
  ['clubs', db.readClubs, db.writeClubs],
  ['council', db.readCouncil, db.writeCouncil],
  ['calendarEvents', db.readCalendarEvents, db.writeCalendarEvents],
  ['quickLinks', db.readQuickLinks, db.writeQuickLinks],
  ['csResources', db.readCsResources, db.writeCsResources],
  ['csEvents', db.readCsEvents, db.writeCsEvents],
  ['slideArchive', db.readSlideArchive, db.writeSlideArchive],
];

// A collection that already has anything in it is left alone - this script
// is meant to populate a fresh database, not overwrite content an admin has
// since added or edited for real.
const alreadyPopulated = collections.filter(([, read]) => read().length > 0).map(([name]) => name);
if (alreadyPopulated.length > 0) {
  console.log(`Skipping collections that already have data: ${alreadyPopulated.join(', ')}`);
}

for (const [name, read, write] of collections) {
  if (read().length > 0) continue;
  write(seed[name] || []);
  console.log(`Loaded ${(seed[name] || []).length} ${name} item(s).`);
}

const content = db.readContent();
const contentIsDefault = !content.weeklySlide.canvaEmbedUrl && !content.lunchSchedule.imageUrl && !content.calendarImage.imageUrl;
if (contentIsDefault && seed.content) {
  db.writeContent({ ...content, ...seed.content });
  console.log('Loaded weekly slide / lunch schedule / calendar image.');
} else if (!contentIsDefault) {
  console.log('Skipping weekly slide / lunch schedule - content already set.');
}

if (fs.existsSync(SEED_ASSETS_DIR)) {
  let copied = 0;
  const copyRecursive = (src, dest) => {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        copyRecursive(srcPath, destPath);
      } else if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
        copied += 1;
      }
    }
  };
  copyRecursive(SEED_ASSETS_DIR, UPLOADS_DIR);
  console.log(`Copied ${copied} seed image(s) into ${UPLOADS_DIR}.`);
}

console.log('Seed load complete.');
// Closed on the next tick: the writes above each schedule a seed-file refresh
// for the next tick, and closing now would make that refresh hit a closed db.
setImmediate(() => db.close());
