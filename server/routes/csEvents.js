const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { validateOptionalUrl, normalizeUrl } = require('../utils/validateUrl');
const { deleteRoute } = require('../utils/routeHelpers');
const { findClub } = require('../utils/matchClub');

const router = express.Router();

// The hosting club's current name and logo, looked up each time so a renamed
// club or a new logo shows on its posts. Posts saved before this matching
// existed are matched by the name they were typed with.
function publicCsEvent(event, clubs) {
  const club = findClub(clubs, event.club, event.clubId);
  return {
    id: event.id,
    title: event.title,
    club: club ? club.name : event.club,
    clubId: club ? club.id : null,
    clubLogoUrl: club ? club.logoUrl || '' : '',
    eventDate: event.eventDate,
    description: event.description,
    signupUrl: event.signupUrl || '',
    createdAt: event.createdAt,
  };
}

const TEXT_MAX = { title: 200, club: 100, eventDate: 100, description: 2000 };

function validateCsEventFields(body) {
  const { title, club, eventDate, description, signupUrl } = body || {};
  if (typeof title !== 'string' || !title.trim()) return 'Event title is required.';
  if (typeof club !== 'string' || !club.trim()) return 'Hosting club is required.';
  if (typeof eventDate !== 'string' || !eventDate.trim()) return 'Date is required.';
  if (typeof description !== 'string' || !description.trim()) return 'Description is required.';
  for (const [field, value] of Object.entries({ title, club, eventDate, description })) {
    if (value.trim().length > TEXT_MAX[field]) return `${field} must be ${TEXT_MAX[field]} characters or fewer.`;
  }
  if (signupUrl !== undefined && signupUrl !== '' && typeof signupUrl !== 'string') return 'Signup link must be text.';
  return validateOptionalUrl(signupUrl, { fieldName: 'Signup link' });
}

const listCsEvents = (req, res) => {
  const clubs = db.readClubs();
  const events = db
    .readCsEvents()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((e) => publicCsEvent(e, clubs));
  res.json({ events });
};

router.get('/api/cs-events', requireActiveStudent, listCsEvents);
router.get('/api/admin/cs-events', requireAdmin, listCsEvents);

// What the admin form shows while typing: which club the text means, if any.
// Registered before the :id routes so 'club-match' can't be read as an id.
router.get('/api/admin/cs-events/club-match', requireAdmin, (req, res) => {
  const club = findClub(db.readClubs(), String(req.query.name || ''));
  res.json({ club: club ? { id: club.id, name: club.name, logoUrl: club.logoUrl || '' } : null });
});

router.post('/api/admin/cs-events', requireAdmin, (req, res) => {
  const error = validateCsEventFields(req.body);
  if (error) return res.status(400).json({ error });

  const { title, club, eventDate, description, signupUrl } = req.body;
  const clubs = db.readClubs();
  const matched = findClub(clubs, club);
  const events = db.readCsEvents();
  const event = {
    id: crypto.randomUUID(),
    title: title.trim(),
    club: matched ? matched.name : club.trim(),
    clubId: matched ? matched.id : null,
    eventDate: eventDate.trim(),
    description: description.trim(),
    signupUrl: normalizeUrl(signupUrl),
    createdAt: new Date().toISOString(),
  };
  events.push(event);
  db.writeCsEvents(events);

  res.status(201).json({ event: publicCsEvent(event, clubs) });
});

router.put('/api/admin/cs-events/:id', requireAdmin, (req, res) => {
  const error = validateCsEventFields(req.body);
  if (error) return res.status(400).json({ error });

  const events = db.readCsEvents();
  const event = events.find((e) => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const { title, club, eventDate, description, signupUrl } = req.body;
  const clubs = db.readClubs();
  const matched = findClub(clubs, club, club.trim() === event.club ? event.clubId : undefined);
  Object.assign(event, {
    title: title.trim(),
    club: matched ? matched.name : club.trim(),
    clubId: matched ? matched.id : null,
    eventDate: eventDate.trim(),
    description: description.trim(),
    signupUrl: normalizeUrl(signupUrl),
  });
  db.writeCsEvents(events);

  res.json({ event: publicCsEvent(event, clubs) });
});

router.delete('/api/admin/cs-events/:id', requireAdmin, deleteRoute({ read: db.readCsEvents, write: db.writeCsEvents, notFound: 'Event not found.' }));

module.exports = router;
