const test = require('node:test');
const assert = require('node:assert/strict');

const { filterCandidates, isPastEvent, todayAtSchool } = require('../server/utils/calendarCandidates');

// Oct 31 2026, midday at the school (Bangkok is 7 hours ahead of UTC).
const NOW = new Date('2026-10-31T05:00:00Z');
const today = todayAtSchool(NOW);
const event = (day, month, title = 'Event') => ({ day, month, title, subtitle: '' });

test("today's date at the school follows Bangkok, not the server's own clock", () => {
  assert.deepEqual(todayAtSchool(new Date('2026-10-31T18:30:00Z')), { year: 2026, month: 10, day: 1 }, '18:30 UTC is already Nov 1 in Bangkok');
  assert.deepEqual(today, { year: 2026, month: 9, day: 31 });
});

test('an event earlier in the running school year is past; later ones, and the next calendar year, are not', () => {
  assert.equal(isPastEvent(event('12', 'Sep'), today), true, 'Sep 12 is past');
  assert.equal(isPastEvent(event('30', 'Oct'), today), true, 'yesterday is past');
  assert.equal(isPastEvent(event('31', 'Oct'), today), false, 'today is not past');
  assert.equal(isPastEvent(event('1', 'Nov'), today), false);
  assert.equal(isPastEvent(event('15', 'Jan'), today), false, 'January is next calendar year, still to come');
  assert.equal(isPastEvent(event('20', 'Jul'), today), false, 'the end of the school year is still to come');
  assert.equal(isPastEvent(event('12', 'Aug'), today), true, 'August of this school year has passed');
});

test('early in the calendar year the school year started the year before', () => {
  const feb = todayAtSchool(new Date('2027-02-10T05:00:00Z'));
  assert.equal(isPastEvent(event('12', 'Nov'), feb), true, 'last November is past');
  assert.equal(isPastEvent(event('5', 'Feb'), feb), true);
  assert.equal(isPastEvent(event('20', 'Mar'), feb), false);
});

test('a range counts as past only once its last day has gone', () => {
  assert.equal(isPastEvent(event('29-31', 'Oct'), today), false, 'ends today');
  assert.equal(isPastEvent(event('28-30', 'Oct'), today), true);
});

test('an event with an unreadable day or month is kept, for the admin to look at', () => {
  assert.equal(isPastEvent(event('', 'Sep'), today), false);
  assert.equal(isPastEvent(event('12', ''), today), false);
});

test('events already on the calendar and ones already past are left out, and counted', () => {
  const existing = [event('5', 'Nov', 'Sports Day')];
  const found = [event('5', 'Nov', 'sports day'), event('12', 'Sep', 'Midterms'), event('20', 'Nov', 'Science Fair'), event('9', 'Jan', 'Open House')];
  const result = filterCandidates(found, existing, NOW);
  assert.deepEqual(result.events.map((e) => e.title), ['Science Fair', 'Open House']);
  assert.equal(result.skippedExisting, 1);
  assert.equal(result.skippedPast, 1);
});

test('nothing is lost when nothing needs leaving out', () => {
  const found = [event('20', 'Nov'), event('3', 'Dec', 'Party')];
  assert.deepEqual(filterCandidates(found, [], NOW), { events: found, skippedExisting: 0, skippedPast: 0 });
});