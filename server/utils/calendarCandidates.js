// Which events the AI reads off a photo are worth offering: ones already on the
// calendar and ones whose date has already passed are left out.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SCHOOL_YEAR_START_MONTH = 7; // the school year starts in August (January is 0)

// Today's date at the school, so an event on today's date is not "past" yet
// even when the server's own clock is already on the next day.
function todayAtSchool(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)])
  );
  return { year: parts.year, month: parts.month - 1, day: parts.day };
}

// An event only has a day and a month, but a photo of the school calendar covers
// August to July, so the month says which year it is in: August to December fall
// in the school year that is running, January to July in the one after it.
// A range like "19-20" counts as over once its last day has gone.
function isPastEvent(event, today) {
  const monthIndex = MONTHS.indexOf(event.month);
  const lastDay = Number(String(event.day).split('-').pop());
  if (monthIndex < 0 || !Number.isInteger(lastDay) || lastDay < 1) return false;
  const schoolYearStart = today.month >= SCHOOL_YEAR_START_MONTH ? today.year : today.year - 1;
  const year = monthIndex >= SCHOOL_YEAR_START_MONTH ? schoolYearStart : schoolYearStart + 1;
  return compareDates([year, monthIndex, lastDay], [today.year, today.month, today.day]) < 0;
}

function compareDates(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// The same day, month and title (ignoring case) as something already there.
function isSameEvent(a, b) {
  return (
    String(a.day).trim() === String(b.day).trim() &&
    String(a.month).trim().toLowerCase() === String(b.month).trim().toLowerCase() &&
    String(a.title).trim().toLowerCase() === String(b.title).trim().toLowerCase()
  );
}

function filterCandidates(candidates, existing, now = new Date()) {
  const today = todayAtSchool(now);
  const events = [];
  let skippedExisting = 0;
  let skippedPast = 0;
  for (const candidate of candidates) {
    if (existing.some((e) => isSameEvent(e, candidate))) skippedExisting += 1;
    else if (isPastEvent(candidate, today)) skippedPast += 1;
    else events.push(candidate);
  }
  return { events, skippedExisting, skippedPast };
}

module.exports = { filterCandidates, isPastEvent, isSameEvent, todayAtSchool };