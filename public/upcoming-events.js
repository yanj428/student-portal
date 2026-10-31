// ---- The upcoming calendar, as a month you can page through -------------------
// Every event comes with its year, and past events stay on the calendar (faded).
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
  todayLine: document.getElementById('cal-today-line'),
  legend: document.getElementById('cal-legend'),
};

// Today at the school (Bangkok), so the calendar rolls over at the right midnight.
function calToday() {
  const [year, month, day] = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).split('-').map(Number);
  return { year, month: month - 1, day };
}

let calCategories = [];
let calEvents = [];
const calView = { year: null, month: null, started: false };
let calSelected = null;

function calPrepare(raw, today) {
  return raw
    .map((e) => {
      // Each event comes with its first and last day as YYYY-MM-DD; an event can span months.
      const [sy, sm, sd] = String(e.startDate).split('-').map(Number);
      const [ey, em, ed] = String(e.endDate || e.startDate).split('-').map(Number);
      if (![sy, sm, sd, ey, em, ed].every(Number.isInteger)) return null;
      const startKey = calDayKey(sy, sm - 1, sd);
      const endKey = Math.max(startKey, calDayKey(ey, em - 1, ed));
      const past = endKey < calDayKey(today.year, today.month, today.day);
      return { title: e.title, subtitle: e.subtitle || '', category: e.category || 'school', sy, sm: sm - 1, sd, ey, em: em - 1, ed, startKey, endKey, past };
    })
    .filter(Boolean)
    .sort((a, b) => a.startKey - b.startKey || a.endKey - b.endKey);
}

const calKey = (year, month) => year * 12 + month;
// A day as one comparable number: 2026-10-30 (month index 9) is 20260930.
const calDayKey = (year, month, day) => year * 10000 + month * 100 + day;
const calInView = () => {
  const first = calDayKey(calView.year, calView.month, 1);
  const last = calDayKey(calView.year, calView.month, 31);
  return calEvents.filter((e) => e.startKey <= last && e.endKey >= first);
};

function calDateTile(e) {
  if (e.startKey === e.endKey) return `<span class="cal-tile"><b>${e.sd}</b><small>${CAL_MONTHS[e.sm]}</small></span>`;
  if (e.sm === e.em && e.sy === e.ey) return `<span class="cal-tile"><b>${e.sd}-${e.ed}</b><small>${CAL_MONTHS[e.sm]}</small></span>`;
  return `<span class="cal-tile"><b>${e.sd}-${e.ed}</b><small>${CAL_MONTHS[e.sm]}-${CAL_MONTHS[e.em]}</small></span>`;
}

function calRenderDetail() {
  const e = calSelected && calInView().includes(calSelected) ? calSelected : null;
  calEls.detail.hidden = !e;
  if (!e) return;
  calEls.detail.className = `cal-detail cat-${e.category}`;
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
    const dayKey = calDayKey(year, month, d);
    const here = monthEvents.filter((e) => dayKey >= e.startKey && dayKey <= e.endKey);
    html += `<div class="cal-cell${weekend ? ' cal-weekend' : ''}${isToday ? ' cal-is-today' : ''}"><span class="cal-day">${d}</span>${isToday ? '<span class="cal-today-label">Today</span>' : ''}${here
      .map((e) => `<button type="button" class="cal-event cat-${e.category}${e.past ? ' is-past' : ''}${e === calSelected ? ' is-selected' : ''}" data-i="${calEvents.indexOf(e)}" title="${escapeHtml(e.title)}">${escapeHtml(e.title)}</button>`)
      .join('')}</div>`;
  }
  const tail = (7 - ((lead + days) % 7)) % 7;
  for (let i = 0; i < tail; i += 1) html += '<div class="cal-cell cal-out"></div>';
  calEls.grid.innerHTML = html;

  // The same events as a list, which is what a phone shows instead of the grid.
  calEls.agenda.innerHTML = monthEvents
    .map((e) => `<button type="button" class="cal-agenda-item cat-${e.category}${e.past ? ' is-past' : ''}${e === calSelected ? ' is-selected' : ''}" data-i="${calEvents.indexOf(e)}">${calDateTile(e)}<span><strong>${escapeHtml(e.title)}</strong>${e.subtitle ? `<small>${escapeHtml(e.subtitle)}</small>` : ''}</span></button>`)
    .join('');
  calEls.empty.hidden = monthEvents.length > 0;
  calEls.todayLine.textContent = `Today is ${new Date(today.year, today.month, today.day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;

  // Paging covers the whole school year, or further if an event lies outside it.
  const schoolYearStart = today.month >= SCHOOL_YEAR_START_MONTH ? today.year : today.year - 1;
  const schoolYearEnd = calKey(schoolYearStart + 1, 6);
  const firstEvent = calEvents.length ? calKey(calEvents[0].sy, calEvents[0].sm) : Infinity;
  const lastEvent = calEvents.reduce((latest, e) => Math.max(latest, calKey(e.ey, e.em)), 0);
  const first = Math.min(calKey(schoolYearStart, SCHOOL_YEAR_START_MONTH), firstEvent);
  const last = Math.max(schoolYearEnd, lastEvent);
  calEls.prev.disabled = calKey(year, month) <= first;
  calEls.next.disabled = calKey(year, month) >= last;
  calEls.todayBtn.hidden = calKey(year, month) === calKey(today.year, today.month);
  calRenderDetail();
}

function calShow(year, month) {
  calView.year = year;
  calView.month = month;
  // Open on the next event still to come in the month (or the first one) so the details card is not empty for no reason.
  const inView = calInView();
  calSelected = inView.find((e) => !e.past) || inView[0] || null;
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
  if (!calCategories.length && data.categories) {
    calCategories = data.categories;
    calEls.legend.innerHTML = calCategories.map((c) => `<span class="cat-${c.id}"><i></i>${escapeHtml(c.label)}</span>`).join('');
  }

  // The first time, open on the current month; after that the page refreshes in
  // place and stays on the month being looked at.
  if (!calView.started) {
    calView.started = true;
    calShow(today.year, today.month);
  } else {
    const keep = calSelected && calEvents.find((e) => e.title === calSelected.title && e.startKey === calSelected.startKey);
    calSelected = keep || calInView().find((e) => !e.past) || calInView()[0] || null;
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