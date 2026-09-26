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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function publicEvent(e) {
  return { id: e.id, day: e.day, month: e.month, title: e.title, subtitle: e.subtitle, createdAt: e.createdAt };
}

// A ranged day like "19-20" sorts (or, below, expires) by its last number -
// Number() alone would produce NaN for anything but a plain single-day
// string.
function lastDayNumber(day) {
  const parts = String(day).split('-');
  return Number(parts[parts.length - 1]) || 1;
}

function sortByDate(items) {
  return items.slice().sort((a, b) => {
    const monthDiff = MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month);
    if (monthDiff !== 0) return monthDiff;
    return lastDayNumber(a.day) - lastDayNumber(b.day);
  });
}

// Events store day/month only, no year - so the year has to be inferred
// from when the event was created. A small backdate (a day-12 event added
// on the 14th, recording something just past) should still resolve to
// *this* year - only a gap wider than GRACE_DAYS means the admin can only
// have meant the next occurrence of it (entering "Jan" in November clearly
// means the upcoming January, not the one 10 months gone). Returns null for
// a month that doesn't parse, so a malformed event is never mistaken for an
// expired one and silently deleted.
const GRACE_DAYS = 35;

function resolveEventEndDate(event) {
  const monthIndex = MONTHS.indexOf(event.month);
  if (monthIndex === -1) return null;

  const created = new Date(event.createdAt);
  const day = lastDayNumber(event.day);
  const graceCutoff = new Date(created.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000);

  let end = new Date(created.getFullYear(), monthIndex, day, 23, 59, 59, 999);
  if (end < graceCutoff) end = new Date(created.getFullYear() + 1, monthIndex, day, 23, 59, 59, 999);
  return end;
}

// Permanently drops any event whose date has passed, then returns what's
// left - called before every read (and before adding a new one) so the
// list is always current without a separate scheduled job.
function pruneExpiredEvents() {
  const items = db.readCalendarEvents();
  const now = Date.now();
  const remaining = items.filter((e) => {
    const end = resolveEventEndDate(e);
    return !end || end.getTime() >= now;
  });
  if (remaining.length !== items.length) db.writeCalendarEvents(remaining);
  return remaining;
}

router.get('/api/calendar-events', requireActiveStudent, (req, res) => {
  res.json({ calendarEvents: sortByDate(pruneExpiredEvents()).map(publicEvent) });
});

router.get('/api/admin/calendar-events', requireAdmin, (req, res) => {
  res.json({ calendarEvents: sortByDate(pruneExpiredEvents()).map(publicEvent) });
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

  const items = pruneExpiredEvents();
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

  const items = pruneExpiredEvents();
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
  const items = pruneExpiredEvents();
  const next = items.filter((e) => e.id !== req.params.id);
  if (next.length === items.length) return res.status(404).json({ error: 'Calendar event not found.' });
  db.writeCalendarEvents(next);
  res.json({ ok: true });
});

module.exports = router;
