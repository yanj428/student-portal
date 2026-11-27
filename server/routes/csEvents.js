const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent, publicStudent } = require('../middleware/auth');
const { csHoursLimiter } = require('../middleware/rateLimit');
const { validateOptionalUrl, normalizeUrl } = require('../utils/validateUrl');
const { findClub } = require('../utils/matchClub');
const { fullName } = require('../utils/studentName');
const { isStaffRole, isCsCoordinator, schoolToday } = require('../utils/csHours');
const { ledClubs } = require('../utils/clubLeaders');
const { STUCO_HOST, hostOf } = require('../utils/serviceEvents');
const { EVENT_IMAGE_SUBDIR, eventImageUpload, removeUpload, discardUpload } = require('../uploads');

const router = express.Router();

// Community service events ("Open opportunities"). Admins post them in the
// admin panel with a free-text date; club leaders post their own club's events
// from the My Club Events page with a real date, time, place and number of
// spots. Students register for them on the site.

const registrationsFor = (eventId, all = db.readCsEventRegistrations()) => all.filter((r) => r.eventId === eventId);

// Whether this viewer may see who registered: the coordinator, and the leaders
// of the hosting club. (Admins see it in the admin panel.)
function canSeeRegistrations(student, event) {
  if (!student) return false;
  return isCsCoordinator(student) || ledClubs(student.id).some((c) => c.id === event.clubId);
}

// The hosting club's current name and logo, looked up each time so a renamed
// club or a new logo shows on its posts. Posts saved before this matching
// existed are matched by the name they were typed with. `viewer` is the
// student looking, for their own registration.
function publicCsEvent(event, clubs, { registrations = db.readCsEventRegistrations(), viewer = null } = {}) {
  const host = hostOf(event, clubs);
  const { isStuco, club } = host;
  const regs = registrationsFor(event.id, registrations);
  const today = schoolToday();
  const isPast = !!event.eventDay && event.eventDay < today;
  const spots = event.spots || null;
  const isFull = !!spots && regs.length >= spots;
  const registrationOpen = event.registrationOpen !== false;
  return {
    id: event.id,
    title: event.title,
    club: host.name,
    clubId: club ? club.id : null,
    clubLogoUrl: host.logoUrl,
    host: isStuco ? 'stuco' : 'club',
    eventDate: event.eventDate,
    eventDay: event.eventDay || '',
    eventTime: event.eventTime || '',
    location: event.location || '',
    description: event.description,
    signupUrl: event.signupUrl || '',
    images: event.images || [],
    spots,
    registeredCount: regs.length,
    spotsLeft: spots ? Math.max(0, spots - regs.length) : null,
    // Why registering is not possible right now, if it is not.
    closedReason: !registrationOpen ? 'Registration is closed.' : isPast ? 'This event has passed.' : isFull ? 'This event is full.' : '',
    registrationOpen,
    isPast,
    isRegistered: !!viewer && regs.some((r) => r.studentId === viewer.id),
    canSeeRegistrations: canSeeRegistrations(viewer, { ...event, clubId: club ? club.id : null }),
    postedBy: event.postedBy || 'admin',
    createdAt: event.createdAt,
  };
}

function registrantList(eventId) {
  const students = new Map(db.readStudents().map((s) => [s.id, s]));
  return registrationsFor(eventId)
    .filter((r) => students.has(r.studentId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((r) => {
      const s = students.get(r.studentId);
      return { name: fullName(s), email: s.email, grade: publicStudent(s).gradeLabel, registeredAt: r.createdAt };
    });
}

// ---- Event details, the same for StuCo's events and club leaders' ----

const TEXT_MAX = { title: 200, description: 2000, eventTime: 60, location: 120 };
const SPOTS_MAX = 1000;

// Returns { fields } or { error }. Every event has a real date, so it can show
// on the calendar and close itself once it has passed.
function readEventDetails(body) {
  const b = body || {};
  if (typeof b.title !== 'string' || !b.title.trim()) return { error: 'Event title is required.' };
  if (typeof b.description !== 'string' || !b.description.trim()) return { error: 'Please describe the event.' };
  for (const field of ['title', 'description', 'eventTime', 'location']) {
    const value = b[field] === undefined ? '' : b[field];
    if (typeof value !== 'string') return { error: 'Please check the form and try again.' };
    if (value.trim().length > TEXT_MAX[field]) return { error: `${field} must be ${TEXT_MAX[field]} characters or fewer.` };
  }
  const day = b.eventDay;
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))
    || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) {
    return { error: 'Please choose the date of the event.' };
  }
  let spots = null;
  if (b.spots !== null && b.spots !== undefined && b.spots !== '') {
    if (!Number.isInteger(b.spots) || b.spots < 1 || b.spots > SPOTS_MAX) return { error: `Spots must be a whole number from 1 to ${SPOTS_MAX}, or blank for no limit.` };
    spots = b.spots;
  }
  const linkError = validateOptionalUrl(b.signupUrl, { fieldName: 'Extra sign-up link' });
  if (linkError) return { error: linkError };

  const dateText = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  return {
    fields: {
      title: b.title.trim(),
      description: b.description.trim(),
      eventDay: day,
      eventDate: dateText,
      eventTime: (b.eventTime || '').trim(),
      location: (b.location || '').trim(),
      spots,
      registrationOpen: b.registrationOpen !== false,
      signupUrl: normalizeUrl(b.signupUrl),
    },
  };
}

// ---- Admins (StuCo): post StuCo's own events ----

const listForAdmin = (req, res) => {
  const clubs = db.readClubs();
  const registrations = db.readCsEventRegistrations();
  const events = db
    .readCsEvents()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((e) => publicCsEvent(e, clubs, { registrations }));
  res.json({ events });
};

// Students see upcoming events only: one with a real date that has passed
// drops off the list (events posted with a free-text date always show).
router.get('/api/cs-events', requireActiveStudent, (req, res) => {
  const clubs = db.readClubs();
  const registrations = db.readCsEventRegistrations();
  const events = db
    .readCsEvents()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((e) => publicCsEvent(e, clubs, { registrations, viewer: req.student }))
    .filter((e) => !e.isPast);
  res.json({ events, canRegister: !isStaffRole(req.student.grade) });
});
router.get('/api/admin/cs-events', requireAdmin, listForAdmin);

router.post('/api/admin/cs-events', requireAdmin, (req, res) => {
  const { fields, error } = readEventDetails(req.body);
  if (error) return res.status(400).json({ error });
  if (fields.eventDay < schoolToday()) return res.status(400).json({ error: 'The event date has already passed.' });

  const clubs = db.readClubs();
  const events = db.readCsEvents();
  const event = {
    id: crypto.randomUUID(),
    ...fields,
    host: 'stuco',
    club: STUCO_HOST.name,
    clubId: null,
    postedBy: 'admin',
    createdAt: new Date().toISOString(),
  };
  events.push(event);
  db.writeCsEvents(events);

  res.status(201).json({ event: publicCsEvent(event, clubs) });
});

router.get('/api/admin/cs-events/:id/registrations', requireAdmin, (req, res) => {
  if (!db.readCsEvents().some((e) => e.id === req.params.id)) return res.status(404).json({ error: 'Event not found.' });
  res.json({ registrations: registrantList(req.params.id) });
});

router.put('/api/admin/cs-events/:id', requireAdmin, (req, res) => {
  const { fields, error } = readEventDetails(req.body);
  if (error) return res.status(400).json({ error });

  const events = db.readCsEvents();
  const event = events.find((e) => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  // A club leader's event belongs to their club; they change it from My Club
  // Events (admins can still remove it).
  if (event.postedBy === 'leader') return res.status(409).json({ error: "This is a club leader's event; they change it from My Club Events." });

  const clubs = db.readClubs();
  // Saving from the admin panel makes it StuCo's own event, including one an
  // admin first posted under a club's name before club leaders could post.
  Object.assign(event, fields, { host: 'stuco', club: STUCO_HOST.name, clubId: null });
  db.writeCsEvents(events);

  res.json({ event: publicCsEvent(event, clubs) });
});

// Removing an event also removes everyone's registration for it, and its pictures.
function removeEvent(id) {
  const events = db.readCsEvents();
  const removed = events.find((e) => e.id === id);
  if (!removed) return false;
  db.writeCsEvents(events.filter((e) => e !== removed));
  (removed.images || []).forEach((img) => removeUpload(img.url, EVENT_IMAGE_SUBDIR));
  db.writeCsEventRegistrations(db.readCsEventRegistrations().filter((r) => r.eventId !== id));
  return true;
}

router.delete('/api/admin/cs-events/:id', requireAdmin, (req, res) => {
  if (!removeEvent(req.params.id)) return res.status(404).json({ error: 'Event not found.' });
  res.json({ ok: true });
});

// ---- Students: register for an event ----

function findEvent(req, res) {
  const event = db.readCsEvents().find((e) => e.id === req.params.id);
  if (!event) res.status(404).json({ error: 'Event not found.' });
  return event || null;
}

router.post('/api/cs-events/:id/register', requireActiveStudent, csHoursLimiter, (req, res) => {
  if (isStaffRole(req.student.grade)) return res.status(403).json({ error: 'Only student accounts register for events.' });
  const event = findEvent(req, res);
  if (!event) return;
  const view = publicCsEvent(event, db.readClubs(), { viewer: req.student });
  if (view.isRegistered) return res.json({ event: view });
  if (view.closedReason) return res.status(409).json({ error: view.closedReason });

  const registrations = db.readCsEventRegistrations();
  registrations.push({ id: crypto.randomUUID(), eventId: event.id, studentId: req.student.id, createdAt: new Date().toISOString() });
  db.writeCsEventRegistrations(registrations);
  res.status(201).json({ event: publicCsEvent(event, db.readClubs(), { viewer: req.student }) });
});

router.delete('/api/cs-events/:id/register', requireActiveStudent, (req, res) => {
  const event = findEvent(req, res);
  if (!event) return;
  if (event.eventDay && event.eventDay < schoolToday()) return res.status(409).json({ error: 'This event has passed.' });
  const registrations = db.readCsEventRegistrations();
  db.writeCsEventRegistrations(registrations.filter((r) => !(r.eventId === event.id && r.studentId === req.student.id)));
  res.json({ event: publicCsEvent(event, db.readClubs(), { viewer: req.student }) });
});

// Who registered: for the coordinator and the hosting club's leaders.
router.get('/api/cs-events/:id/registrations', requireActiveStudent, (req, res) => {
  const event = db.readCsEvents().find((e) => e.id === req.params.id);
  const club = event && findClub(db.readClubs(), event.club, event.clubId);
  if (!event || !canSeeRegistrations(req.student, { ...event, clubId: club ? club.id : null })) {
    return res.status(404).json({ error: 'Event not found.' });
  }
  res.json({ registrations: registrantList(event.id) });
});

// ---- Club leaders: post and manage their own club's events ----

function requireClubLeader(req, res, next) {
  requireActiveStudent(req, res, (err) => {
    if (err) return next(err);
    req.ledClubs = ledClubs(req.student.id);
    if (req.ledClubs.length === 0) return res.status(403).json({ error: 'Only club leaders can do this.' });
    next();
  });
}

// A leader's event: one of the clubs they lead, plus the usual details.
function readLeaderEvent(body, ledClubList) {
  const club = ledClubList.find((c) => c.id === (body || {}).clubId);
  if (!club) return { error: 'Choose one of the clubs you lead.' };
  const { fields, error } = readEventDetails(body);
  if (error) return { error };
  return { fields: { club: club.name, clubId: club.id, ...fields } };
}

router.get('/api/club-events', requireClubLeader, (req, res) => {
  const ids = new Set(req.ledClubs.map((c) => c.id));
  const clubs = db.readClubs();
  const registrations = db.readCsEventRegistrations();
  const events = db
    .readCsEvents()
    .map((e) => publicCsEvent(e, clubs, { registrations, viewer: req.student }))
    .filter((e) => ids.has(e.clubId))
    .sort((a, b) => (b.eventDay || b.createdAt).localeCompare(a.eventDay || a.createdAt))
    .map((e) => ({ ...e, registrations: registrantList(e.id) }));
  res.json({
    clubs: req.ledClubs.map((c) => ({ id: c.id, name: c.name, logoUrl: c.logoUrl || '' })),
    events,
    today: schoolToday(),
  });
});

router.post('/api/club-events', requireClubLeader, csHoursLimiter, (req, res) => {
  const { fields, error } = readLeaderEvent(req.body, req.ledClubs);
  if (error) return res.status(400).json({ error });
  if (fields.eventDay < schoolToday()) return res.status(400).json({ error: 'The event date has already passed.' });
  const event = { id: crypto.randomUUID(), ...fields, postedBy: 'leader', postedById: req.student.id, createdAt: new Date().toISOString() };
  const events = db.readCsEvents();
  events.push(event);
  db.writeCsEvents(events);
  res.status(201).json({ event: publicCsEvent(event, db.readClubs(), { viewer: req.student }) });
});

// A leader can change or remove any event of a club they lead, including ones
// an admin posted for it.
function findLedEvent(req, res, events) {
  const event = events.find((e) => e.id === req.params.id);
  const club = event && findClub(db.readClubs(), event.club, event.clubId);
  if (!event || !club || !req.ledClubs.some((c) => c.id === club.id)) {
    res.status(404).json({ error: 'Event not found.' });
    return null;
  }
  return event;
}

router.put('/api/club-events/:id', requireClubLeader, csHoursLimiter, (req, res) => {
  const events = db.readCsEvents();
  const event = findLedEvent(req, res, events);
  if (!event) return;
  const { fields, error } = readLeaderEvent(req.body, req.ledClubs);
  if (error) return res.status(400).json({ error });
  Object.assign(event, fields);
  db.writeCsEvents(events);
  res.json({ event: publicCsEvent(event, db.readClubs(), { viewer: req.student }) });
});

// Up to four photos or posters per event, added one at a time, by the
// event's club leaders or by admins. `find` returns the event (or answers 404).
const EVENT_IMAGES_MAX = 4;

function addEventImage(req, res, find) {
  eventImageUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Pictures must be 8 MB or smaller.' : err.message || 'Could not upload the picture.' });
    if (!req.file) return res.status(400).json({ error: 'Choose a picture to upload.' });
    const events = db.readCsEvents();
    const event = find(req, res, events);
    if (!event) return discardUpload(req);
    const images = event.images || [];
    if (images.length >= EVENT_IMAGES_MAX) {
      discardUpload(req);
      return res.status(400).json({ error: `An event can have up to ${EVENT_IMAGES_MAX} pictures.` });
    }
    event.images = [...images, { url: `/uploads/${EVENT_IMAGE_SUBDIR}/${req.file.filename}` }];
    db.writeCsEvents(events);
    res.status(201).json({ event: publicCsEvent(event, db.readClubs(), { viewer: req.student }) });
  });
}

function removeEventImage(req, res, find) {
  const events = db.readCsEvents();
  const event = find(req, res, events);
  if (!event) return;
  const url = typeof req.body?.url === 'string' ? req.body.url : '';
  const images = event.images || [];
  if (!images.some((img) => img.url === url)) return res.status(404).json({ error: 'Picture not found.' });
  event.images = images.filter((img) => img.url !== url);
  db.writeCsEvents(events);
  removeUpload(url, EVENT_IMAGE_SUBDIR);
  res.json({ event: publicCsEvent(event, db.readClubs(), { viewer: req.student }) });
}

function findAnyEvent(req, res, events) {
  const event = events.find((e) => e.id === req.params.id);
  if (!event) res.status(404).json({ error: 'Event not found.' });
  return event || null;
}

router.post('/api/club-events/:id/images', requireClubLeader, csHoursLimiter, (req, res) => addEventImage(req, res, findLedEvent));
router.delete('/api/club-events/:id/images', requireClubLeader, (req, res) => removeEventImage(req, res, findLedEvent));
router.post('/api/admin/cs-events/:id/images', requireAdmin, (req, res) => addEventImage(req, res, findAnyEvent));
router.delete('/api/admin/cs-events/:id/images', requireAdmin, (req, res) => removeEventImage(req, res, findAnyEvent));

router.delete('/api/club-events/:id', requireClubLeader, (req, res) => {
  const event = findLedEvent(req, res, db.readCsEvents());
  if (!event) return;
  removeEvent(event.id);
  res.json({ ok: true });
});

// ---- Admins: who leads which club ----

router.get('/api/admin/club-leaders', requireAdmin, (req, res) => {
  const students = new Map(db.readStudents().map((s) => [s.id, s]));
  const clubs = new Map(db.readClubs().map((c) => [c.id, c]));
  const leaders = db
    .readClubLeaders()
    .filter((l) => students.has(l.studentId) && clubs.has(l.clubId))
    .map((l) => ({ studentId: l.studentId, clubId: l.clubId, name: fullName(students.get(l.studentId)), email: students.get(l.studentId).email, club: clubs.get(l.clubId).name }))
    .sort((a, b) => a.club.localeCompare(b.club) || a.name.localeCompare(b.name));
  res.json({ leaders });
});

router.post('/api/admin/club-leaders', requireAdmin, (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const student = email ? db.findByEmail(email) : null;
  if (!student) return res.status(404).json({ error: 'No account has that email. Create the account first.' });
  const club = db.readClubs().find((c) => c.id === req.body?.clubId);
  if (!club) return res.status(400).json({ error: 'Choose a club.' });
  const leaders = db.readClubLeaders();
  if (!leaders.some((l) => l.studentId === student.id && l.clubId === club.id)) {
    leaders.push({ id: `${student.id}:${club.id}`, studentId: student.id, clubId: club.id, createdAt: new Date().toISOString() });
    db.writeClubLeaders(leaders);
    db.logAuditEvent(req.session.adminUsername, 'club_leader.add', { email: student.email, club: club.name });
  }
  res.status(201).json({ ok: true });
});

router.delete('/api/admin/club-leaders/:studentId/:clubId', requireAdmin, (req, res) => {
  const leaders = db.readClubLeaders();
  const kept = leaders.filter((l) => !(l.studentId === req.params.studentId && l.clubId === req.params.clubId));
  if (kept.length === leaders.length) return res.status(404).json({ error: 'Not found.' });
  db.writeClubLeaders(kept);
  const student = db.findById(req.params.studentId);
  db.logAuditEvent(req.session.adminUsername, 'club_leader.remove', { email: student && student.email, clubId: req.params.clubId });
  res.json({ ok: true });
});

module.exports = router;
