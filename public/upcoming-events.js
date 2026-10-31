// ---- The upcoming calendar, as a month you can page through -------------------
// Events only have a day and a month, so the year comes from the school year: it
// starts in August, so August to December belong to the school year that is
// running and January to July to the one after it (the server drops events that
// have already passed).
const CAL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CAL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SCHOOL_YEAR_START_MONTH = 7;

const calEls = {
  root: document.getElementById('cal'),
  title: document.getElementById('cal-title'),
  grid: document.getElementById('cal-grid'),
  detail: document.getElementById('cal-detail'),
  agenda: document.getElementById('cal-agenda'),
  empty: document.getElementById('cal-empty'),
  prev: document.getElementById('cal-prev'),
  next: document.getElementById('cal-next'),
  todayBtn: document.getElementById('cal-today'),
  none: document.getElementById('upcoming-empty'),
};

// Today at the school (Bangkok), so the calendar rolls over at the right midnight.
function calToday() {
  const [year, month, day] = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).split('-').map(Number);
  return { year, month: month - 1, day };
}

let calEvents = [];
const calView = { year: null, month: null, started: false };
let calSelected = null;

function calPrepare(raw, today) {
  const schoolYearStart = today.month >= SCHOOL_YEAR_START_MONTH ? today.year : today.year - 1;
  return raw
    .map((e) => {
      const month = CAL_MONTHS.indexOf(e.month);
      const [first, last] = String(e.day).split('-').map(Number);
      if (month < 0 || !Number.isInteger(first) || first < 1) return null;
      const end = Number.isInteger(last) && last >= first ? last : first;
      return { title: e.title, subtitle: e.subtitle || '', month, start: first, end, year: month >= SCHOOL_YEAR_START_MONTH ? schoolYearStart : schoolYearStart + 1 };
    })
    .filter(Boolean)
    .sort((a, b) => a.year - b.year || a.month - b.month || a.start - b.start);
}

const calKey = (year, month) => year * 12 + month;
const calInView = () => calEvents.filter((e) => calKey(e.year, e.month) === calKey(calView.year, calView.month));

function calDateTile(e) {
  return `<span class="cal-tile"><b>${e.start === e.end ? e.start : `${e.start}-${e.end}`}</b><small>${CAL_MONTHS[e.month]}</small></span>`;
}

function calRenderDetail() {
  const e = calSelected && calInView().includes(calSelected) ? calSelected : null;
  calEls.detail.hidden = !e;
  if (!e) return;
  calEls.detail.innerHTML = `${calDateTile(e)}<div><h4>${escapeHtml(e.title)}</h4>${e.subtitle ? `<p>${escapeHtml(e.subtitle)}</p>` : ''}</div>`;
}

function calRender() {
  const today = calToday();
  const { year, month } = calView;
  calEls.title.textContent = `${CAL_MONTH_NAMES[month]} ${year}`;

  // Mondays first. Blank cells fill the first and last week.
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const monthEvents = calInView();
  let html = '';
  for (let i = 0; i < lead; i += 1) html += '<div class="cal-cell cal-out"></div>';
  for (let d = 1; d <= days; d += 1) {
    const weekend = (lead + d - 1) % 7 > 4;
    const isToday = year === today.year && month === today.month && d === today.day;
    const here = monthEvents.filter((e) => d >= e.start && d <= e.end);
    html += `<div class="cal-cell${weekend ? ' cal-weekend' : ''}${isToday ? ' cal-is-today' : ''}"><span class="cal-day">${d}</span>${here
      .map((e) => `<button type="button" class="cal-event${e === calSelected ? ' is-selected' : ''}" data-i="${calEvents.indexOf(e)}" title="${escapeHtml(e.title)}">${escapeHtml(e.title)}</button>`)
      .join('')}</div>`;
  }
  const tail = (7 - ((lead + days) % 7)) % 7;
  for (let i = 0; i < tail; i += 1) html += '<div class="cal-cell cal-out"></div>';
  calEls.grid.innerHTML = html;

  // The same events as a list, which is what a phone shows instead of the grid.
  calEls.agenda.innerHTML = monthEvents
    .map((e) => `<button type="button" class="cal-agenda-item${e === calSelected ? ' is-selected' : ''}" data-i="${calEvents.indexOf(e)}">${calDateTile(e)}<span><strong>${escapeHtml(e.title)}</strong>${e.subtitle ? `<small>${escapeHtml(e.subtitle)}</small>` : ''}</span></button>`)
    .join('');
  calEls.empty.hidden = monthEvents.length > 0;

  // Paging is limited to this month through the end of the school year, or the
  // last event if that is later.
  const schoolYearEnd = calKey(today.month >= SCHOOL_YEAR_START_MONTH ? today.year + 1 : today.year, 6);
  const last = calEvents.length ? Math.max(schoolYearEnd, calKey(calEvents[calEvents.length - 1].year, calEvents[calEvents.length - 1].month)) : schoolYearEnd;
  calEls.prev.disabled = calKey(year, month) <= calKey(today.year, today.month);
  calEls.next.disabled = calKey(year, month) >= last;
  calEls.todayBtn.hidden = calKey(year, month) === calKey(today.year, today.month);
  calRenderDetail();
}

function calShow(year, month) {
  calView.year = year;
  calView.month = month;
  // Pick the month's first event so the details card is never empty for no reason.
  calSelected = calInView()[0] || null;
  calRender();
}

function calStep(delta) {
  const date = new Date(calView.year, calView.month + delta, 1);
  calShow(date.getFullYear(), date.getMonth());
}

function calSelect(event) {
  const button = event.target.closest('[data-i]');
  if (!button) return;
  calSelected = calEvents[Number(button.dataset.i)];
  calRender();
}

calEls.prev.addEventListener('click', () => calStep(-1));
calEls.next.addEventListener('click', () => calStep(1));
calEls.todayBtn.addEventListener('click', () => {
  const today = calToday();
  calShow(today.year, today.month);
});
calEls.grid.addEventListener('click', calSelect);
calEls.agenda.addEventListener('click', calSelect);

async function loadUpcomingCalendar() {
  const data = await fetchJson('/api/calendar-events');
  if (!data) return;
  const today = calToday();
  calEvents = calPrepare(data.calendarEvents, today);
  calEls.none.hidden = calEvents.length > 0;
  calEls.root.hidden = calEvents.length === 0;
  if (calEvents.length === 0) return;

  // The first time, open on the month of the next event; after that the page
  // refreshes in place and stays on the month being looked at.
  if (!calView.started) {
    calView.started = true;
    const first = calEvents[0];
    const start = calKey(first.year, first.month) > calKey(today.year, today.month) ? first : today;
    calShow(start.year, start.month);
  } else {
    const keep = calSelected && calEvents.find((e) => e.title === calSelected.title && e.month === calSelected.month && e.start === calSelected.start);
    calSelected = keep || calInView()[0] || null;
    calRender();
  }
}

loadUpcomingCalendar();

// The page re-checks when it is switched back to and every minute while it is
// in view, so a tab left open does not keep showing an old calendar.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadUpcomingCalendar();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) loadUpcomingCalendar();
});
setInterval(() => {
  if (!document.hidden) loadUpcomingCalendar();
}, 60 * 1000);