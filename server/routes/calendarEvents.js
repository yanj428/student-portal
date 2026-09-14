const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');

const router = express.Router();

function publicEvent(e) {
  return { id: e.id, day: e.day, month: e.month, title: e.title, subtitle: e.subtitle, createdAt: e.createdAt };
}

function sortByDate(items) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return items.slice().sort((a, b) => {
    const monthDiff = months.indexOf(a.month) - months.indexOf(b.month);
    if (monthDiff !== 0) return monthDiff;
    return Number(a.day) - Number(b.day);
  });
}

router.get('/api/calendar-events', requireActiveStudent, (req, res) => {
  res.json({ calendarEvents: sortByDate(db.readCalendarEvents()).map(publicEvent) });
});

router.get('/api/admin/calendar-events', requireAdmin, (req, res) => {
  res.json({ calendarEvents: sortByDate(db.readCalendarEvents()).map(publicEvent) });
});

function validateFields(body) {
  const { day, month, title, subtitle } = body || {};
  if (typeof day !== 'string' || !day.trim()) return 'Day is required.';
  if (typeof month !== 'string' || !month.trim()) return 'Month is required.';
  if (typeof title !== 'string' || !title.trim()) return 'Title is required.';
  if (typeof subtitle !== 'string' || !subtitle.trim()) return 'Subtitle is required.';
  return null;
}

router.post('/api/admin/calendar-events', requireAdmin, (req, res) => {
  const error = validateFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = db.readCalendarEvents();
  const item = {
    id: crypto.randomUUID(),
    day: req.body.day.trim(),
    month: req.body.month.trim(),
    title: req.body.title.trim(),
    subtitle: req.body.subtitle.trim(),
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  db.writeCalendarEvents(items);

  res.status(201).json({ calendarEvent: publicEvent(item) });
});

router.put('/api/admin/calendar-events/:id', requireAdmin, (req, res) => {
  const error = validateFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = db.readCalendarEvents();
  const item = items.find((e) => e.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Calendar event not found.' });

  item.day = req.body.day.trim();
  item.month = req.body.month.trim();
  item.title = req.body.title.trim();
  item.subtitle = req.body.subtitle.trim();
  db.writeCalendarEvents(items);

  res.json({ calendarEvent: publicEvent(item) });
});

router.delete('/api/admin/calendar-events/:id', requireAdmin, (req, res) => {
  const items = db.readCalendarEvents();
  const next = items.filter((e) => e.id !== req.params.id);
  if (next.length === items.length) return res.status(404).json({ error: 'Calendar event not found.' });
  db.writeCalendarEvents(next);
  res.json({ ok: true });
});

module.exports = router;
