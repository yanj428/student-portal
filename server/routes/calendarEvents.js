const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { memoryImageUpload } = require('../uploads');
const { extractCalendarEvents, isAiConfigured, NOT_CONFIGURED_MESSAGE } = require('../utils/calendarEventsAi');
const { deleteRoute } = require('../utils/routeHelpers');
const { filterCandidates, todayAtSchool } = require('../utils/calendarCandidates');
const { CATEGORIES, isCategory, guessCategory, normalizeCategory } = require('../utils/calendarCategories');
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
  const { start, end } = eventSpan(e);
  return { id: e.id, day: e.day, month: e.month, year: eventYear(e), startDate: toIso(start), endDate: toIso(end), category: normalizeCategory(e.category) || guessCategory(e.title), title: e.title, subtitle: e.subtitle };
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

const pad = (n) => String(n).padStart(2, '0');
const toIso = ([y, m, d]) => `${y}-${pad(m + 1)}-${pad(d)}`;

// "2026-10-30" as [year, month index, day], or null when it is not a real date.
function parseIso(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof text === 'string' ? text.trim() : '');
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const check = new Date(Date.UTC(y, m, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m || check.getUTCDate() !== d) return null;
  return [y, m, d];
}

// First and last day of an event. A range inside one month is kept as "19-20" in
// `day`; a range that crosses months keeps its last day in `endDate`.
function eventSpan(e) {
  const year = eventYear(e);
  const month = MONTHS.indexOf(e.month);
  const first = Number(String(e.day).split('-')[0]) || 1;
  const start = [year, month, first];
  const end = (e.endDate && parseIso(e.endDate)) || [year, month, Math.max(first, lastDayNumber(e.day))];
  return { start, end };
}

const compareKeys = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function sortByDate(items) {
  return items.slice().sort((a, b) => {
    const [x, y] = [eventSpan(a), eventSpan(b)];
    return compareKeys(x.start, y.start) || compareKeys(x.end, y.end);
  });
}

// Past events are kept so the calendar shows the whole year; the home page asks
// for upcoming ones only.
function isUpcoming(e, today) {
  return compareKeys(eventSpan(e).end, [today.year, today.month, today.day]) >= 0;
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
function readDate(body) {
  const { day, month, year, startDate, endDate } = body || {};

  // The admin form sends a start date and an optional end date.
  if (startDate !== undefined) {
    const start = parseIso(startDate);
    if (!start || start[0] < 2000 || start[0] > 2100) return { error: 'Pick a valid start date.' };
    let end = start;
    if (endDate !== undefined && endDate !== null && endDate !== '') {
      end = parseIso(endDate);
      if (!end || end[0] < 2000 || end[0] > 2100) return { error: 'Pick a valid end date.' };
      if (compareKeys(end, start) < 0) return { error: 'The end date cannot be before the start date.' };
    }
    const sameMonth = end[0] === start[0] && end[1] === start[1];
    const dayText = sameMonth && end[2] > start[2] ? `${start[2]}-${end[2]}` : String(start[2]);
    return { date: { day: dayText, month: MONTHS[start[1]], year: start[0], endDate: sameMonth ? undefined : toIso(end) } };
  }

  // The AI import (and older callers) send a day, a month and sometimes a year.
  if (typeof day !== 'string' || !/^\d{1,2}(-\d{1,2})?$/.test(day.trim())) return { error: 'Day must be a number like 12, or a range like 19-20.' };
  const monthName = typeof month === 'string' && MONTHS.find((m) => m.toLowerCase() === month.trim().slice(0, 3).toLowerCase());
  if (!monthName) return { error: 'Month must be a month name like Sep or September.' };
  if (year !== undefined && year !== null && year !== '' && !(Number.isInteger(Number(year)) && Number(year) >= 2000 && Number(year) <= 2100)) return { error: 'Year must be a 4-digit year like 2026.' };
  const date = { day: day.trim(), month: monthName, endDate: undefined };
  if (year !== undefined && year !== null && year !== '') date.year = Number(year);
  return { date };
}

function readFields(body) {
  const { title, subtitle, category } = body || {};
  const { date, error: dateError } = readDate(body);
  if (dateError) return { error: dateError };
  if (typeof title !== 'string' || !title.trim()) return { error: 'Title is required.' };
  if (typeof subtitle !== 'string') return { error: 'Subtitle must be text (it can be blank).' };
  if (title.trim().length > TITLE_MAX) return { error: `Title must be ${TITLE_MAX} characters or fewer.` };
  if (subtitle.trim().length > SUBTITLE_MAX) return { error: `Subtitle must be ${SUBTITLE_MAX} characters or fewer.` };
  if (category !== undefined && category !== '' && !isCategory(category)) return { error: 'Pick one of the listed categories.' };
  return { fields: { ...date, title: title.trim(), subtitle: subtitle.trim(), category: category || guessCategory(title) } };
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
