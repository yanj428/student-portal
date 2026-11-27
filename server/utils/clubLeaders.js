const db = require('../db');

// The clubs an account leads (an admin makes a student or teacher the leader
// of a club, and they can then post that club's community service events).
// A club that has since been deleted no longer counts.
function ledClubs(studentId) {
  const clubs = new Map(db.readClubs().map((c) => [c.id, c]));
  return db
    .readClubLeaders()
    .filter((l) => l.studentId === studentId && clubs.has(l.clubId))
    .map((l) => clubs.get(l.clubId));
}

module.exports = { ledClubs };
