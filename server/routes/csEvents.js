const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireStudent } = require('../middleware/auth');

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

function validateCsEventFields(body) {
  const { title, club, eventDate, description, signupUrl } = body || {};
  if (typeof title !== 'string' || !title.trim()) return 'Event title is required.';
  if (typeof club !== 'string' || !club.trim()) return 'Hosting club is required.';
  if (typeof eventDate !== 'string' || !eventDate.trim()) return 'Date is required.';
  if (typeof description !== 'string' || !description.trim()) return 'Description is required.';
  if (signupUrl !== undefined && signupUrl !== '' && typeof signupUrl !== 'string') return 'Signup link must be text.';
  return null;
}

router.get('/api/cs-events', requireStudent, (req, res) => {
  const events = db
    .readCsEvents()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicCsEvent);
  res.json({ events });
});

router.get('/api/admin/cs-events', requireAdmin, (req, res) => {
  const events = db
    .readCsEvents()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicCsEvent);
  res.json({ events });
});

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
    signupUrl: (signupUrl || '').trim(),
    createdAt: new Date().toISOString(),
  };
  events.push(event);
  db.writeCsEvents(events);

  res.status(201).json({ event: publicCsEvent(event) });
});

router.delete('/api/admin/cs-events/:id', requireAdmin, (req, res) => {
  const events = db.readCsEvents();
  const next = events.filter((e) => e.id !== req.params.id);
  if (next.length === events.length) return res.status(404).json({ error: 'Event not found.' });
  db.writeCsEvents(next);
  res.json({ ok: true });
});

module.exports = router;
