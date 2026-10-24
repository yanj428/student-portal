const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { validateOptionalUrl, normalizeUrl } = require('../utils/validateUrl');

const router = express.Router();

function publicCsEvent(event) {
  return {
    id: event.id,
    title: event.title,
    club: event.club,
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
  const events = db
    .readCsEvents()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicCsEvent);
  res.json({ events });
};

router.get('/api/cs-events', requireActiveStudent, listCsEvents);
router.get('/api/admin/cs-events', requireAdmin, listCsEvents);

router.post('/api/admin/cs-events', requireAdmin, (req, res) => {
  const error = validateCsEventFields(req.body);
  if (error) return res.status(400).json({ error });

  const { title, club, eventDate, description, signupUrl } = req.body;
  const events = db.readCsEvents();
  const event = {
    id: crypto.randomUUID(),
    title: title.trim(),
    club: club.trim(),
    eventDate: eventDate.trim(),
    description: description.trim(),
    signupUrl: normalizeUrl(signupUrl),
    createdAt: new Date().toISOString(),
  };
  events.push(event);
  db.writeCsEvents(events);

  res.status(201).json({ event: publicCsEvent(event) });
});

router.put('/api/admin/cs-events/:id', requireAdmin, (req, res) => {
  const error = validateCsEventFields(req.body);
  if (error) return res.status(400).json({ error });

  const events = db.readCsEvents();
  const event = events.find((e) => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const { title, club, eventDate, description, signupUrl } = req.body;
  Object.assign(event, {
    title: title.trim(),
    club: club.trim(),
    eventDate: eventDate.trim(),
    description: description.trim(),
    signupUrl: normalizeUrl(signupUrl),
  });
  db.writeCsEvents(events);

  res.json({ event: publicCsEvent(event) });
});

router.delete('/api/admin/cs-events/:id', requireAdmin, (req, res) => {
  const events = db.readCsEvents();
  const next = events.filter((e) => e.id !== req.params.id);
  if (next.length === events.length) return res.status(404).json({ error: 'Event not found.' });
  db.writeCsEvents(next);
  res.json({ ok: true });
});

module.exports = router;
