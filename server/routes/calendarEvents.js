const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { memoryImageUpload } = require('../uploads');
const { extractCalendarEvents, isAiConfigured, NOT_CONFIGURED_MESSAGE } = require('../utils/calendarEventsAi');
const { calendarAiLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Reads a calendar/events photo with AI and hands back candidate events for
// the admin to review - this never writes anything itself, the admin adds
// each reviewed candidate via the normal POST /api/admin/calendar-events
// route below, one at a time (or all at once from the UI).
router.post('/api/admin/calendar-events/extract', requireAdmin, calendarAiLimiter, (req, res) => {
  if (!isAiConfigured()) {
    return res.status(501).json({ error: NOT_CONFIGURED_MESSAGE });
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

// Sorts by the resolved end date (not just month and day) so next year's January sorts after this year's December. An unparseable month goes last.
function sortByDate(items) {
  const endOf = (e) => {
    const end = resolveEventEndDate(e);
    return end ? end.getTime() : Infinity;
  };
  return items.slice().sort((a, b) => endOf(a) - endOf(b));
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

const listEvents = (req, res) => res.json({ calendarEvents: sortByDate(pruneExpiredEvents()).map(publicEvent) });

router.get('/api/calendar-events', requireActiveStudent, listEvents);
router.get('/api/admin/calendar-events', requireAdmin, listEvents);

const TITLE_MAX = 200;
const SUBTITLE_MAX = 300;

// Month and day are free text in the admin form, so they're normalized here:
// an unrecognised month would never expire and would sort wrongly, and a
// non-numeric day would silently be treated as day 1.
function readFields(body) {
  const { day, month, title, subtitle } = body || {};
  if (typeof day !== 'string' || !/^\d{1,2}(-\d{1,2})?$/.test(day.trim())) return { error: 'Day must be a number like 12, or a range like 19-20.' };
  const monthName = typeof month === 'string' && MONTHS.find((m) => m.toLowerCase() === month.trim().slice(0, 3).toLowerCase());
  if (!monthName) return { error: 'Month must be a month name like Sep or September.' };
  if (typeof title !== 'string' || !title.trim()) return { error: 'Title is required.' };
  if (typeof subtitle !== 'string') return { error: 'Subtitle must be text (it can be blank).' };
  if (title.trim().length > TITLE_MAX) return { error: `Title must be ${TITLE_MAX} characters or fewer.` };
  if (subtitle.trim().length > SUBTITLE_MAX) return { error: `Subtitle must be ${SUBTITLE_MAX} characters or fewer.` };
  return { fields: { day: day.trim(), month: monthName, title: title.trim(), subtitle: subtitle.trim() } };
}

router.post('/api/admin/calendar-events', requireAdmin, (req, res) => {
  const { fields, error } = readFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = pruneExpiredEvents();
  const item = { id: crypto.randomUUID(), ...fields, createdAt: new Date().toISOString() };
  items.push(item);
  db.writeCalendarEvents(items);

  res.status(201).json({ calendarEvent: publicEvent(item) });
});

router.put('/api/admin/calendar-events/:id', requireAdmin, (req, res) => {
  const { fields, error } = readFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = pruneExpiredEvents();
  const item = items.find((e) => e.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Calendar event not found.' });

  // The year is inferred from createdAt, so a date the admin just typed in must
  // be read relative to today. Otherwise moving an event into next year (say
  // "Dec 15" to "Jan 12") would resolve against the old creation date, look
  // like it was already past, and be deleted on the next read.
  const dateChanged = fields.day !== item.day || fields.month !== item.month;
  Object.assign(item, fields);
  if (dateChanged) item.createdAt = new Date().toISOString();
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
