// Keeps server/seed/content.json (and its referenced images) in sync with
// whatever content actually exists locally, so `git commit` always has an
// up-to-date snapshot to pick up without anyone having to remember to run
// `npm run seed:export` by hand.
//
// Deliberately does nothing unless DATA_DIR is unset (i.e. this is a normal
// local dev run against the project's own default ./data folder) - both the
// test suite and any real deployment set DATA_DIR explicitly (see db.js),
// and neither should ever have its writes silently overwrite the seed file
// this repo ships. require('./db') is done lazily, inside the scheduled
// callback rather than at module load time, because db.js requires this
// module - by the time the callback actually runs, db.js's own exports are
// already fully set up, so this only avoids a require-cycle deadlock rather
// than mattering functionally.
const fs = require('fs');
const path = require('path');

const ENABLED = !process.env.DATA_DIR;

const SEED_DIR = path.join(__dirname, 'seed');
const SEED_FILE = path.join(SEED_DIR, 'content.json');
const SEED_ASSETS_DIR = path.join(SEED_DIR, 'assets');

const UPLOAD_URL_FIELDS = [
  ['clubs', 'logoUrl'],
  ['council', 'photoUrl'],
];

function writeSeedSnapshotNow() {
  const db = require('./db');
  const { UPLOADS_DIR } = require('./uploads');

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

  fs.mkdirSync(SEED_ASSETS_DIR, { recursive: true });
  fs.rmSync(SEED_ASSETS_DIR, { recursive: true, force: true });
  fs.mkdirSync(SEED_ASSETS_DIR, { recursive: true });

  const copyIfReferenced = (url) => {
    if (!url || !url.startsWith('/uploads/')) return;
    const relative = url.slice('/uploads/'.length);
    const source = path.join(UPLOADS_DIR, relative);
    if (!fs.existsSync(source)) return;
    const destination = path.join(SEED_ASSETS_DIR, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  };

  for (const [collection, field] of UPLOAD_URL_FIELDS) {
    for (const item of seed[collection]) copyIfReferenced(item[field]);
  }
  copyIfReferenced(content.lunchSchedule.imageUrl);

  fs.writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
}

let writeScheduled = false;

// Debounced so a burst of writes (e.g. re-ordering a whole list) results in
// one seed-file write on the next tick, not one per item.
function scheduleSeedSnapshot() {
  if (!ENABLED || writeScheduled) return;
  writeScheduled = true;
  setImmediate(() => {
    writeScheduled = false;
    try {
      writeSeedSnapshotNow();
    } catch (err) {
      console.error('[seedWriter] Failed to update server/seed/content.json:', err.message);
    }
  });
}

module.exports = { scheduleSeedSnapshot, writeSeedSnapshotNow, ENABLED };
