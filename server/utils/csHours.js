// Shared rules for community service hours: who logs them, who reviews them,
// and the graduation requirement they count toward.

// Teacher and Staff accounts have a role instead of a grade number.
function isStaffRole(grade) {
  return !/\d/.test(String(grade || ''));
}

// Grades are stored as typed ("Grade 10" or just "10").
function gradeNumber(grade) {
  const match = /\d+/.exec(String(grade || ''));
  return match ? Number(match[0]) : null;
}

// Community service is a high school requirement: only Grades 9-12 log hours.
function logsServiceHours(grade) {
  const n = gradeNumber(grade);
  return n !== null && n >= 9 && n <= 12;
}

// The coordinator flag only counts on a teacher or staff account, so an
// account whose grade is later changed to a student grade loses review access
// without anyone having to remember to switch the flag off.
function isCsCoordinator(student) {
  return !!(student && student.csCoordinator && isStaffRole(student.grade));
}

// The school's rule: 100 approved hours over Grades 9-12 to graduate, with 25
// a year recommended. The coordinator can change both on the Service Hours page.
const DEFAULT_TARGETS = { total: 100, yearly: 25 };

function targetsFrom(rows) {
  const targets = { ...DEFAULT_TARGETS };
  rows.forEach((row) => {
    if (row.id in targets && row.hours > 0) targets[row.id] = row.hours;
  });
  return targets;
}

// Today at the school, so a student in Bangkok can log hours from this
// evening even though the server's clock is on UTC.
function schoolToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

// The school year runs from August to June; "this year" counts service dated
// on or after the most recent August 1.
function schoolYearStart(today = schoolToday()) {
  const [year, month] = today.split('-').map(Number);
  return `${month >= 8 ? year : year - 1}-08-01`;
}

// Totals of one student's entries. Hours are kept to quarter hours, so
// rounding to two places only removes floating point noise.
function totals(entries, yearStart = schoolYearStart()) {
  const sum = (list) => Math.round(list.reduce((n, e) => n + e.hours, 0) * 100) / 100;
  const approved = entries.filter((e) => e.status === 'approved');
  return {
    approved: sum(approved),
    approvedThisYear: sum(approved.filter((e) => e.date >= yearStart)),
    pending: sum(entries.filter((e) => e.status === 'pending')),
  };
}

// The counts shown next to menu items: for a student, decisions they have not
// opened Community Service to see yet; for the coordinator, reports waiting.
// Only an explicit studentSeen: false counts, so reports decided before this
// existed never light up.
function navBadges(student, entries) {
  const badges = { replies: 0, waiting: 0 };
  if (logsServiceHours(student.grade)) {
    badges.replies = entries.filter((e) => e.studentId === student.id && e.status !== 'pending' && e.studentSeen === false).length;
  }
  if (isCsCoordinator(student)) badges.waiting = entries.filter((e) => e.status === 'pending').length;
  return badges;
}

module.exports = {
  navBadges,
  isStaffRole,
  gradeNumber,
  logsServiceHours,
  isCsCoordinator,
  DEFAULT_TARGETS,
  targetsFrom,
  schoolToday,
  schoolYearStart,
  totals,
};
