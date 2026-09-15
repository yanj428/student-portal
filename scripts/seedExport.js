// Manually regenerates server/seed/content.json - normally unnecessary,
// since server/seedWriter.js already keeps it in sync automatically after
// every admin-panel content change in a normal local dev run (DATA_DIR
// unset). Useful mainly right after pulling changes that were made with
// auto-sync off, or to confirm the seed matches the current database.
const db = require('../server/db');
const { writeSeedSnapshotNow } = require('../server/seedWriter');

writeSeedSnapshotNow();
console.log('Updated server/seed/content.json and server/seed/assets/.');
db.close();
