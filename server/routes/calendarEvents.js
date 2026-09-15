const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { memoryImageUpload } = require('../uploads');
const { extractCalendarEvents, isAiConfigured } = require('../utils/calendarEventsAi');
const { calendarAiLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Reads a calendar/events photo with AI and hands back candidate events for
// the admin to review - this never writes anything itself, the admin adds
// each reviewed candidate via the normal POST /api/admin/calendar-events
// route below, one at a time (or all at once from the UI).
router.post('/api/admin/calendar-events/extract', requireAdmin, calendarAiLimiter, (req, res) => {
  if (!isAiConfigured()) {
    return res.status(501).json({ error: 'AI event extraction is not set up yet. Add GEMINI_API_KEY to the server .env file.' });
  }

  memoryImageUpload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Could not read image.' });
    if (!req.file) return res.status(400).json({ error: 'No image was uploaded.' });

    try {
      const events = await extractCalendarEvents(req.file.buffer, req.file.mimetype);
      res.json({ events });
    } catch (extractErr) {
      res.status(502).json({ error: extractErr.message });
    }
  });
});

function publicEvent(e) {
  return { id: e.id, day: e.day, month: e.month, title: e.title, subtitle: e.subtitle, createdAt: e.createdAt };
}

// A ranged day like "19-20" sorts by its first number - Number() alone
// would produce NaN for anything but a plain single-day string.
function firstDayNumber(day) {
  const match = String(day).match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function sortByDate(items) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return items.slice().sort((a, b) => {
    const monthDiff = months.indexOf(a.month) - months.indexOf(b.month);
    if (monthDiff !== 0) return monthDiff;
    return firstDayNumber(a.day) - firstDayNumber(b.day);
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
  if (typeof subtitle !== 'string') return 'Subtitle must be text (it can be blank).';
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
