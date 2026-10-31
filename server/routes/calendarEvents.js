const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { memoryImageUpload } = require('../uploads');
const { extractCalendarEvents, isAiConfigured, NOT_CONFIGURED_MESSAGE } = require('../utils/calendarEventsAi');
const { deleteRoute } = require('../utils/routeHelpers');
const { filterCandidates, todayAtSchool } = require('../utils/calendarCandidates');
const { CATEGORIES, isCategory, guessCategory } = require('../utils/calendarCategories');
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
      const found = await extractCalendarEvents(req.file.buffer, req.file.mimetype);
      // Events already on the calendar and events that have already passed are left out.
      const result = filterCandidates(found, db.readCalendarEvents());
      result.events = result.events.map((e) => ({ ...e, category: guessCategory(e.title) }));
      res.json({ ...result, categories: CATEGORIES });
    } catch (extractErr) {
      res.status(502).json({ error: extractErr.message });
    }
  });
});

const SCHOOL_YEAR_START_MONTH = 7;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function publicEvent(e) {
  return { id: e.id, day: e.day, month: e.month, year: eventYear(e), category: e.category || guessCategory(e.title), title: e.title, subtitle: e.subtitle };
}

// A ranged day like "19-20" sorts (and counts as over) by its last number.
function lastDayNumber(day) {
  const parts = String(day).split('-');
  return Number(parts[parts.length - 1]) || 1;
}

// The school year starts in August: August to December fall in the school year
// that is running, January to July in the one after it.
function schoolYearYear(monthIndex, today) {
  const start = today.month >= SCHOOL_YEAR_START_MONTH ? today.year : today.year - 1;
  return monthIndex >= SCHOOL_YEAR_START_MONTH ? start : start + 1;
}

// Events saved before years were stored get theirs from when they were created.
function eventYear(e) {
  if (Number.isInteger(e.year)) return e.year;
  return schoolYearYear(MONTHS.indexOf(e.month), todayAtSchool(new Date(e.createdAt)));
}

const dateKey = (e) => [eventYear(e), MONTHS.indexOf(e.month), lastDayNumber(e.day)];
const compareKeys = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function sortByDate(items) {
  return items.slice().sort((a, b) => compareKeys(dateKey(a), dateKey(b)));
}

// Past events are kept so the calendar shows the whole year; the home page asks
// for upcoming ones only.
function isUpcoming(e, today) {
  return compareKeys(dateKey(e), [today.year, today.month, today.day]) >= 0;
}

const listEvents = (req, res) => {
  let items = sortByDate(db.readCalendarEvents());
  if (req.query.upcoming) {
    const today = todayAtSchool();
    items = items.filter((e) => isUpcoming(e, today));
  }
  res.json({ calendarEvents: items.map(publicEvent), categories: CATEGORIES });
};

router.get('/api/calendar-events', requireActiveStudent, listEvents);
router.get('/api/admin/calendar-events', requireAdmin, listEvents);
const TITLE_MAX = 200;
const SUBTITLE_MAX = 300;

// Month and day are free text in the admin form, so they're normalized here:
// an unrecognised month would never expire and would sort wrongly, and a
// non-numeric day would silently be treated as day 1.
function readFields(body) {
  const { day, month, title, subtitle, year, category } = body || {};
  if (typeof day !== 'string' || !/^\d{1,2}(-\d{1,2})?$/.test(day.trim())) return { error: 'Day must be a number like 12, or a range like 19-20.' };
  const monthName = typeof month === 'string' && MONTHS.find((m) => m.toLowerCase() === month.trim().slice(0, 3).toLowerCase());
  if (!monthName) return { error: 'Month must be a month name like Sep or September.' };
  if (typeof title !== 'string' || !title.trim()) return { error: 'Title is required.' };
  if (typeof subtitle !== 'string') return { error: 'Subtitle must be text (it can be blank).' };
  if (title.trim().length > TITLE_MAX) return { error: `Title must be ${TITLE_MAX} characters or fewer.` };
  if (subtitle.trim().length > SUBTITLE_MAX) return { error: `Subtitle must be ${SUBTITLE_MAX} characters or fewer.` };
  if (year !== undefined && year !== null && year !== '' && !(Number.isInteger(Number(year)) && Number(year) >= 2000 && Number(year) <= 2100)) return { error: 'Year must be a 4-digit year like 2026.' };
  if (category !== undefined && category !== '' && !isCategory(category)) return { error: 'Pick one of the listed categories.' };
  const fields = { day: day.trim(), month: monthName, title: title.trim(), subtitle: subtitle.trim(), category: category || guessCategory(title) };
  if (year !== undefined && year !== null && year !== '') fields.year = Number(year);
  return { fields };
}

router.post('/api/admin/calendar-events', requireAdmin, (req, res) => {
  const { fields, error } = readFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = db.readCalendarEvents();
  const year = fields.year || schoolYearYear(MONTHS.indexOf(fields.month), todayAtSchool());
  const item = { id: crypto.randomUUID(), ...fields, year, createdAt: new Date().toISOString() };
  items.push(item);
  db.writeCalendarEvents(items);

  res.status(201).json({ calendarEvent: publicEvent(item) });
});

router.put('/api/admin/calendar-events/:id', requireAdmin, (req, res) => {
  const { fields, error } = readFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = db.readCalendarEvents();
  const item = items.find((e) => e.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Calendar event not found.' });

  // Without a year in the form, a changed date is read against today.
  const dateChanged = fields.day !== item.day || fields.month !== item.month;
  if (!fields.year) fields.year = dateChanged ? schoolYearYear(MONTHS.indexOf(fields.month), todayAtSchool()) : eventYear(item);
  Object.assign(item, fields);
  db.writeCalendarEvents(items);

  res.json({ calendarEvent: publicEvent(item) });
});
router.delete('/api/admin/calendar-events/:id', requireAdmin, deleteRoute({ read: db.readCalendarEvents, write: db.writeCalendarEvents, notFound: 'Calendar event not found.' }));

module.exports = router;
