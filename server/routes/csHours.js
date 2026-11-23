const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireActiveStudent, requireAdmin, publicStudent } = require('../middleware/auth');
const { csHoursLimiter } = require('../middleware/rateLimit');
const { fullName } = require('../utils/studentName');
const { validateOptionalUrl, normalizeUrl } = require('../utils/validateUrl');
const { SDG_NAMES, sdgBadges, allSdgs } = require('../utils/sdgs');
const { gradeNumber, logsServiceHours, isCsCoordinator, targetsFrom, totals, schoolToday, schoolYearStart, entryGrade, initialsOf, gradeTotals } = require('../utils/csHours');
const { receiveEvidence, saveEvidence, syncAttachedEvidence, findEvidence, fileFor } = require('../csEvidence');

const router = express.Router();

// A community service report follows the school's Project Report form: what
// the need was, the goal, how it was investigated and planned (for a project
// the student planned themselves), what they did with evidence, a reflection,
// the hours broken down by task, and the advisor who can confirm it.
const LIMITS = { title: 120, organization: 120, need: 2000, goal: 2000, investigationSummary: 2000, investigationEvidence: 2000, planningSummary: 2000, actionSummary: 3000, reflection: 3000, advisorName: 100, advisorContact: 200, task: 120 };
const SDGS_MAX = 3;
const LINKS_MAX = 5;
const EVIDENCE_MAX = 10;
const TASKS_MAX = 30;
const REPORT_HOURS_MAX = 300;
const NOTE_MAX = 500;
const TARGET_MAX = 1000;

function readTargets() {
  return targetsFrom(db.readCsHourTargets());
}

// The clubs a report can be "with": every community service club, plus any
// after-school club an admin has marked as also doing community service.
function communityServiceClubs() {
  return db.readClubs().filter((c) => c.type === 'community-service' || c.serviceHours);
}

const isQuarterHours = (n) => typeof n === 'number' && Number.isFinite(n) && Math.round(n * 4) === n * 4;

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function text(body, key, { required }) {
  const value = body[key] === undefined || body[key] === null ? '' : body[key];
  if (typeof value !== 'string') return { error: 'Please check the form and try again.' };
  const trimmed = value.trim();
  if (required && !trimmed) return { missing: true };
  if (trimmed.length > LIMITS[key]) return { error: `One of your answers is too long (max ${LIMITS[key]} characters).` };
  return { value: trimmed };
}

const QUESTION = {
  title: 'the project title',
  need: 'what the need in the community is',
  goal: 'the goal of the project',
  investigationSummary: 'the investigation summary',
  planningSummary: 'the planning summary',
  actionSummary: 'what you did',
  reflection: 'your reflection',
  advisorName: 'your advisor',
};

// Returns { report } or { error }. `student` is who is saving it: whose evidence
// may be attached, and the highest grade the service can have been done in.
function readReport(body, student) {
  if (!body || typeof body !== 'object') return { error: 'Please fill in the form.' };
  const studentId = student.id;
  const report = {};

  // The grade the student was in when they did the service (Grades 9-12, and
  // never above the grade they are in now).
  const currentGrade = gradeNumber(student.grade);
  if (!Number.isInteger(body.serviceGrade) || body.serviceGrade < 9 || body.serviceGrade > 12) {
    return { error: 'Please choose the grade you were in when you did this service.' };
  }
  if (currentGrade !== null && body.serviceGrade > currentGrade) {
    return { error: `You are in Grade ${currentGrade} now, so the service cannot be from a later grade.` };
  }
  report.serviceGrade = body.serviceGrade;

  const planned = body.planned === true;
  const textFields = [
    ['title', true], ['organization', false], ['need', true], ['goal', true],
    ['investigationSummary', planned], ['investigationEvidence', false], ['planningSummary', planned],
    ['actionSummary', true], ['reflection', true], ['advisorName', true], ['advisorContact', false],
  ];
  for (const [key, required] of textFields) {
    const result = text(body, key, { required });
    if (result.missing) return { error: `Please fill in ${QUESTION[key]}.` };
    if (result.error) return { error: result.error };
    report[key] = result.value;
  }
  report.planned = planned;
  if (!planned) {
    report.investigationSummary = '';
    report.investigationEvidence = '';
    report.planningSummary = '';
  }

  // Who it was with: one of the school's community service clubs, another
  // organization (typed), or neither for the student's own project.
  report.clubId = '';
  if (body.clubId) {
    const club = communityServiceClubs().find((c) => c.id === body.clubId);
    if (!club) return { error: 'Please choose one of the clubs in the list.' };
    report.clubId = club.id;
    report.clubName = club.name;
    report.organization = '';
  }

  if (!validDate(body.startDate)) return { error: 'Please choose the date of the project.' };
  const endDate = body.endDate ? body.endDate : '';
  if (endDate && !validDate(endDate)) return { error: 'Please check the end date.' };
  const today = schoolToday();
  if (body.startDate > today || (endDate && endDate > today)) return { error: 'Project dates cannot be in the future.' };
  if (body.startDate < '2000-01-01') return { error: 'Please check the project date.' };
  if (endDate && endDate < body.startDate) return { error: 'The end date is before the start date.' };
  report.date = body.startDate;
  report.endDate = endDate === body.startDate ? '' : endDate;

  const sdgs = Array.isArray(body.sdgs) ? body.sdgs : [];
  if (sdgs.length === 0) return { error: 'Choose at least one cause (UN goal) your project helped.' };
  if (sdgs.length > SDGS_MAX || !sdgs.every((n) => Number.isInteger(n) && n >= 1 && n <= SDG_NAMES.length)) {
    return { error: `Choose up to ${SDGS_MAX} causes.` };
  }
  report.sdgs = [...new Set(sdgs)];

  const links = Array.isArray(body.links) ? body.links.filter((l) => typeof l === 'string' && l.trim()) : [];
  if (links.length > LINKS_MAX) return { error: `Add up to ${LINKS_MAX} links.` };
  for (const link of links) {
    const error = validateOptionalUrl(link, { fieldName: 'Each evidence link', allowHttp: true });
    if (error) return { error };
  }
  report.links = links.map(normalizeUrl);

  const evidence = Array.isArray(body.evidence) ? body.evidence : [];
  if (evidence.length > EVIDENCE_MAX) return { error: `Attach up to ${EVIDENCE_MAX} files.` };
  report.evidence = [];
  for (const item of evidence) {
    const stored = item && typeof item.id === 'string' ? findEvidence(item.id) : null;
    if (!stored || stored.studentId !== studentId) return { error: 'One of the attached files could not be found. Please attach it again.' };
    const section = item.section === 'planning' && planned ? 'planning' : 'action';
    if (!report.evidence.some((e) => e.id === stored.id)) report.evidence.push({ id: stored.id, section });
  }
  if (!report.links.length && !report.evidence.some((e) => e.section === 'action')) {
    return { error: 'Add evidence of what you did: a photo, a certificate or a link.' };
  }

  const tasks = Array.isArray(body.tasks) ? body.tasks : [];
  if (tasks.length === 0) return { error: 'Break your hours down into at least one task.' };
  if (tasks.length > TASKS_MAX) return { error: `Add up to ${TASKS_MAX} tasks.` };
  report.tasks = [];
  for (const task of tasks) {
    const name = task && typeof task.task === 'string' ? task.task.trim() : '';
    if (!name) return { error: 'Each task needs a short description.' };
    if (name.length > LIMITS.task) return { error: `Task descriptions must be ${LIMITS.task} characters or fewer.` };
    if (!isQuarterHours(task.hours) || task.hours <= 0) {
      return { error: `Check the hours for "${name}": they must be more than 0, in whole, half or quarter hours (for example 1.5).` };
    }
    report.tasks.push({ task: name, hours: task.hours });
  }
  report.hours = Math.round(report.tasks.reduce((n, t) => n + t.hours, 0) * 100) / 100;
  // Only there to catch a typo like 600 instead of 60.
  if (report.hours > REPORT_HOURS_MAX) return { error: `One report can have at most ${REPORT_HOURS_MAX} hours. Please check the numbers, or split a longer project into separate reports.` };

  return { report };
}

// The full report as the student or coordinator sees it. The coordinator's
// note is only shown to the student once there is a decision to explain.
function reportView(entry, { forStudent, evidenceBase = '/api/cs-hours/evidence', currentGrade }) {
  const clubs = new Map(communityServiceClubs().map((c) => [c.id, c]));
  const club = entry.clubId ? clubs.get(entry.clubId) : null;
  const evidence = (entry.evidence || []).flatMap((ref) => {
    const stored = findEvidence(ref.id);
    return stored ? [{ id: stored.id, section: ref.section, name: stored.name, mimetype: stored.mimetype, url: `${evidenceBase}/${stored.id}` }] : [];
  });
  return {
    id: entry.id,
    title: entry.title,
    clubId: entry.clubId || '',
    clubName: club ? club.name : entry.clubName || '',
    organization: entry.organization || '',
    serviceGrade: entry.serviceGrade || null,
    date: entry.date,
    endDate: entry.endDate || '',
    sdgs: (entry.sdgs || []).map((n) => ({ number: n, name: SDG_NAMES[n - 1], url: (sdgBadges([n])[0] || {}).url || '' })),
    need: entry.need,
    goal: entry.goal,
    planned: !!entry.planned,
    investigationSummary: entry.investigationSummary || '',
    investigationEvidence: entry.investigationEvidence || '',
    planningSummary: entry.planningSummary || '',
    actionSummary: entry.actionSummary,
    links: entry.links || [],
    evidence,
    reflection: entry.reflection,
    tasks: entry.tasks || [],
    hours: entry.hours,
    advisorName: entry.advisorName,
    advisorContact: entry.advisorContact || '',
    // Hours the coordinator recorded without a project report have nothing to open.
    hasReport: !!(entry.need || entry.actionSummary || entry.reflection),
    status: entry.status,
    // The grade the service was done in: what the student chose on the form,
    // else what the school's sheet said for an imported row, else worked out
    // from the date.
    grade: entryGrade(entry, currentGrade),
    // Initials of whoever approved it: from the school's sheet for imported
    // rows, else the reviewer's; an admin's approval shows as StuCo.
    approvedBy: entry.status === 'approved' ? entry.approvedBy || (entry.reviewedByRole === 'admin' ? 'StuCo' : initialsOf(entry.reviewedBy)) : '',
    // A decision the student has not seen yet (cleared when they open Community Service).
    isNew: forStudent && entry.status !== 'pending' && entry.studentSeen === false,
    note: forStudent && entry.status === 'pending' ? '' : entry.note || '',
    // Who the student sees the note from: Ms. Gia, or StuCo when an admin decided.
    noteFrom: entry.reviewedByRole === 'admin' ? 'Student Council' : 'Ms. Gia',
    reviewedBy: forStudent ? undefined : entry.reviewedBy || '',
    reviewedAt: forStudent ? undefined : entry.reviewedAt || '',
    createdAt: entry.createdAt,
    ...(forStudent ? {} : { studentId: entry.studentId }),
  };
}

// Only high school students (Grades 9-12) log hours; teachers, staff and
// Grades 6-8 have none to log.
function requireHourLogger(req, res, next) {
  requireActiveStudent(req, res, (err) => {
    if (err) return next(err);
    if (!logsServiceHours(req.student.grade)) return res.status(403).json({ error: 'Service hours are logged by students in Grades 9 to 12.' });
    next();
  });
}

function requireCsCoordinator(req, res, next) {
  requireActiveStudent(req, res, (err) => {
    if (err) return next(err);
    if (!isCsCoordinator(req.student)) return res.status(403).json({ error: 'Only the community service coordinator can do this.' });
    next();
  });
}

// ---- The report form's choices ----

router.get('/api/cs-hours/options', requireActiveStudent, (req, res) => {
  const clubs = communityServiceClubs()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, name: c.name, sdgs: c.sdgs || [], advisor: c.advisor || '', logoUrl: c.logoUrl || '' }));
  res.json({ clubs, sdgs: allSdgs(), today: schoolToday() });
});

// ---- Evidence files ----

router.post('/api/cs-hours/evidence', requireHourLogger, csHoursLimiter, receiveEvidence, (req, res) => {
  const item = saveEvidence(req.student.id, req.file, req.evidenceType);
  res.status(201).json({ evidence: { id: item.id, name: item.name, mimetype: item.mimetype, url: `/api/cs-hours/evidence/${item.id}` } });
});

function sendEvidence(item, res) {
  const isPdf = item.mimetype === 'application/pdf';
  res.set('Content-Type', item.mimetype);
  // A PDF is downloaded rather than opened on our own site, and nothing in
  // either kind of file may run as part of our pages.
  res.set('Content-Disposition', `${isPdf ? 'attachment' : 'inline'}; filename="${item.name.replace(/[^\w.\- ]/g, '_')}"`);
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  res.set('Cache-Control', 'private, max-age=3600');
  res.sendFile(fileFor(item), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'File not found.' });
  });
}

// Only the student who uploaded a file and the coordinator can open it here
// (StuCo admins open it through /api/admin/cs-hours/evidence/:id).
router.get('/api/cs-hours/evidence/:id', requireActiveStudent, (req, res) => {
  const item = findEvidence(req.params.id);
  if (!item || (item.studentId !== req.student.id && !isCsCoordinator(req.student))) {
    return res.status(404).json({ error: 'File not found.' });
  }
  sendEvidence(item, res);
});

// ---- Students: their own reports ----

// ?seen=1 is sent by the Community Service page: once the student has seen a
// decision there, it no longer counts as new. The home page widget reads the
// same data without it, so a reply stays "new" until it has really been read.
router.get('/api/cs-hours', requireHourLogger, (req, res) => {
  const all = db.readCsHours();
  const entries = all.filter((e) => e.studentId === req.student.id);
  // Hours imported from the school's sheet can have no date when the sheet's was unreadable.
  entries.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt));
  const views = entries.map((e) => reportView(e, { forStudent: true, currentGrade: req.student.grade }));
  if (req.query.seen === '1' && entries.some((e) => e.studentSeen === false)) {
    entries.forEach((e) => { e.studentSeen = true; });
    db.writeCsHours(all);
  }
  res.json({
    entries: views,
    totals: totals(entries),
    gradeTotals: gradeTotals(entries, req.student.grade),
    targets: readTargets(),
    today: schoolToday(),
  });
});

router.post('/api/cs-hours', requireHourLogger, csHoursLimiter, (req, res) => {
  const { report, error } = readReport(req.body, req.student);
  if (error) return res.status(400).json({ error });

  const now = new Date().toISOString();
  const entry = { id: crypto.randomUUID(), studentId: req.student.id, ...report, status: 'pending', note: '', createdAt: now, updatedAt: now };
  const entries = db.readCsHours();
  entries.push(entry);
  db.writeCsHours(entries);
  syncAttachedEvidence(req.student.id, entry.evidence.map((e) => e.id), []);
  res.status(201).json({ entry: reportView(entry, { forStudent: true }) });
});

// An approved report is the coordinator's record and stays as approved. A
// pending or not-approved one can be fixed, which sends it back for review.
function findOwnChangeable(req, res, entries) {
  const entry = entries.find((e) => e.id === req.params.id && e.studentId === req.student.id);
  if (!entry) {
    res.status(404).json({ error: 'Report not found.' });
    return null;
  }
  if (entry.status === 'approved') {
    res.status(409).json({ error: 'Approved reports cannot be changed. Ask the community service coordinator if something is wrong.' });
    return null;
  }
  return entry;
}

router.put('/api/cs-hours/:id', requireHourLogger, csHoursLimiter, (req, res) => {
  const entries = db.readCsHours();
  const entry = findOwnChangeable(req, res, entries);
  if (!entry) return;
  const { report, error } = readReport(req.body, req.student);
  if (error) return res.status(400).json({ error });

  const before = (entry.evidence || []).map((e) => e.id);
  Object.assign(entry, report, { status: 'pending', note: '', reviewedBy: '', reviewedAt: '', updatedAt: new Date().toISOString() });
  if (!report.clubId) delete entry.clubName;
  db.writeCsHours(entries);
  syncAttachedEvidence(req.student.id, entry.evidence.map((e) => e.id), before);
  res.json({ entry: reportView(entry, { forStudent: true }) });
});

router.delete('/api/cs-hours/:id', requireHourLogger, (req, res) => {
  const entries = db.readCsHours();
  const entry = findOwnChangeable(req, res, entries);
  if (!entry) return;
  db.writeCsHours(entries.filter((e) => e !== entry));
  syncAttachedEvidence(req.student.id, [], (entry.evidence || []).map((e) => e.id));
  res.json({ ok: true });
});

// ---- Reviewing everyone's reports ----
// Two kinds of reviewer use the same routes under different paths: the
// coordinator (Ms. Gia) on the student site at /api/cs-hours/review, and StuCo
// admins in the admin panel at /api/admin/cs-hours. Both can view and decide;
// only the coordinator sets the hour targets. Admin decisions are also logged
// in the admin audit log.
const REVIEWERS = [
  {
    base: '/api/cs-hours/review',
    auth: requireCsCoordinator,
    evidenceBase: '/api/cs-hours/evidence',
    who: (req) => ({ reviewedBy: fullName(req.student), reviewedByRole: 'coordinator', approvedBy: '' }),
    log: () => {},
  },
  {
    base: '/api/admin/cs-hours',
    auth: requireAdmin,
    evidenceBase: '/api/admin/cs-hours/evidence',
    who: (req) => ({ reviewedBy: req.admin.username, reviewedByRole: 'admin', approvedBy: '' }),
    log: (req, action, details) => db.logAuditEvent(req.session.adminUsername, action, details),
  },
];
const BULK_MAX = 100;

for (const reviewer of REVIEWERS) {
  router.get(reviewer.base, reviewer.auth, (req, res) => {
    const yearStart = schoolYearStart();
    const students = db.readStudents().filter((s) => logsServiceHours(s.grade));
    const byStudent = new Map(students.map((s) => [s.id, []]));
    const entries = db.readCsHours().filter((e) => byStudent.has(e.studentId));
    entries.forEach((e) => byStudent.get(e.studentId).push(e));
    const gradeOf = new Map(students.map((s) => [s.id, s.grade]));

    res.json({
      students: students.map((s) => {
        const pub = publicStudent(s);
        return { id: s.id, fullName: pub.fullName, email: s.email, grade: s.grade, gradeLabel: pub.gradeLabel, gradeNumber: gradeNumber(s.grade), ...totals(byStudent.get(s.id), yearStart) };
      }),
      entries: entries.map((e) => reportView(e, { forStudent: false, evidenceBase: reviewer.evidenceBase, currentGrade: gradeOf.get(e.studentId) })),
      targets: readTargets(),
      yearStart,
    });
  });

  // A decision can also be changed later, for example after hearing back from the advisor.
  for (const [action, status] of [['approve', 'approved'], ['reject', 'rejected']]) {
    router.post(`${reviewer.base}/:id/${action}`, reviewer.auth, (req, res) => {
      const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
      if (note.length > NOTE_MAX) return res.status(400).json({ error: `The note must be ${NOTE_MAX} characters or fewer.` });

      const entries = db.readCsHours();
      const entry = entries.find((e) => e.id === req.params.id);
      if (!entry) return res.status(404).json({ error: 'Report not found.' });

      Object.assign(entry, { status, note, ...reviewer.who(req), reviewedAt: new Date().toISOString(), studentSeen: false });
      db.writeCsHours(entries);
      reviewer.log(req, `cs_hours.${action}`, { report: entry.id, title: entry.title });
      res.json({ ok: true });
    });
  }

  // Approves several reports at once. Body: { items: [{ id, note }] }; each
  // report keeps whatever note was typed on its own card.
  router.post(`${reviewer.base}/approve-many`, reviewer.auth, (req, res) => {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Choose at least one report.' });
    if (items.length > BULK_MAX) return res.status(400).json({ error: `Approve up to ${BULK_MAX} reports at a time.` });

    const entries = db.readCsHours();
    const byId = new Map(entries.map((e) => [e.id, e]));
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || !byId.has(item.id)) return res.status(404).json({ error: 'One of the reports was not found. Reload the page and try again.' });
      if (item.note !== undefined && (typeof item.note !== 'string' || item.note.trim().length > NOTE_MAX)) {
        return res.status(400).json({ error: `Notes must be ${NOTE_MAX} characters or fewer.` });
      }
    }
    const who = reviewer.who(req);
    const reviewedAt = new Date().toISOString();
    items.forEach((item) => {
      Object.assign(byId.get(item.id), { status: 'approved', note: (item.note || '').trim(), ...who, reviewedAt, studentSeen: false });
    });
    db.writeCsHours(entries);
    reviewer.log(req, 'cs_hours.approve_many', { count: items.length });
    res.json({ approved: items.length });
  });

  router.get(`${reviewer.base}/export.csv`, reviewer.auth, sendExport);
}

// StuCo admins open evidence files from the admin panel.
router.get('/api/admin/cs-hours/evidence/:id', requireAdmin, (req, res) => {
  const item = findEvidence(req.params.id);
  if (!item) return res.status(404).json({ error: 'File not found.' });
  sendEvidence(item, res);
});

// Body: { total: 100, yearly: 25 } - the hours needed to graduate and the
// hours recommended each school year.
router.put('/api/cs-hours/review/targets', requireCsCoordinator, (req, res) => {
  const labels = { total: 'Hours to graduate', yearly: 'Recommended hours per year' };
  const rows = [];
  for (const key of Object.keys(labels)) {
    const value = req.body?.[key];
    if (!isQuarterHours(value) || value <= 0 || value > TARGET_MAX) {
      return res.status(400).json({ error: `${labels[key]} must be a number of hours from 1 to ${TARGET_MAX}.` });
    }
    rows.push({ id: key, hours: value });
  }
  db.writeCsHourTargets(rows);
  res.json({ targets: targetsFrom(rows) });
});

// A spreadsheet cell starting with one of these runs as a formula when the
// file is opened in Excel or Sheets, so a student typing "=HYPERLINK(...)"
// as their project title would otherwise end up executed on the teacher's computer.
function csvCell(value) {
  let cell = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

const STATUS_LABEL = { pending: 'Waiting for approval', approved: 'Approved', rejected: 'Not approved' };

// The old coordinator URL for the spreadsheet; the review routes above serve it too.
router.get('/api/cs-hours/export.csv', requireCsCoordinator, sendExport);

function sendExport(req, res) {
  const students = new Map(db.readStudents().map((s) => [s.id, s]));
  const rows = db
    .readCsHours()
    .filter((e) => students.has(e.studentId))
    .map((e) => ({ e: reportView(e, { forStudent: false, currentGrade: students.get(e.studentId).grade }), s: students.get(e.studentId) }))
    .sort((a, b) => fullName(a.s).localeCompare(fullName(b.s)) || (a.e.date || '').localeCompare(b.e.date || ''));

  const header = ['Student', 'Email', 'Grade now', 'Grade when done', 'Project title', 'Club or organization', 'Start date', 'End date', 'Hours', 'UN goals',
    'Need in the community', 'Goal', 'Action summary', 'Reflection', 'Hours by task', 'Advisor', 'Advisor contact',
    'Status', 'Note', 'Reviewed by', 'Admin initials', 'Reviewed on', 'Submitted on'];
  const lines = [header, ...rows.map(({ e, s }) => [
    fullName(s), s.email, s.grade, e.grade ? `Grade ${e.grade}` : '', e.title, e.clubName || e.organization || 'Own project', e.date, e.endDate, e.hours,
    e.sdgs.map((g) => `${g.number}. ${g.name}`).join('; '), e.need, e.goal, e.actionSummary, e.reflection,
    e.tasks.map((t) => `${t.task} (${t.hours})`).join('; '), e.advisorName, e.advisorContact,
    STATUS_LABEL[e.status] || e.status, e.note, e.reviewedBy, e.approvedBy, e.reviewedAt ? e.reviewedAt.slice(0, 10) : '', e.createdAt.slice(0, 10),
  ])].map((cells) => cells.map(csvCell).join(','));

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="service-hours-${schoolToday()}.csv"`);
  // The BOM makes Excel read Thai names and other non-English text correctly.
  res.send(`﻿${lines.join('\r\n')}\r\n`);
}

module.exports = router;
