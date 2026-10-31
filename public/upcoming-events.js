// ---- The upcoming calendar, as a month you can page through -------------------
// Every event comes with its year, and past events stay on the calendar (faded).
// Tapping a day opens a small card beside it with that day's events.
const CAL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CAL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SCHOOL_YEAR_START_MONTH = 7;

const calEls = {
  root: document.getElementById('cal'),
  title: document.getElementById('cal-title'),
  grid: document.getElementById('cal-grid'),
  pop: document.getElementById('cal-pop'),
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
let calSelectedDay = null; // the day number whose card is open, in the month being viewed

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

// "15 Oct", "19-20 Oct", or "30 Oct - 3 Nov"
function calDateText(e) {
  if (e.startKey === e.endKey) return `${e.sd} ${CAL_MONTHS[e.sm]}`;
  if (e.sm === e.em && e.sy === e.ey) return `${e.sd}-${e.ed} ${CAL_MONTHS[e.sm]}`;
  return `${e.sd} ${CAL_MONTHS[e.sm]} - ${e.ed} ${CAL_MONTHS[e.em]}`;
}

function calCloseDay() {
  if (calSelectedDay === null) return;
  calSelectedDay = null;
  calRender();
}

// The small card next to the tapped day: that day's events, or a note when there are none.
function calRenderPop() {
  const cell = calSelectedDay && calEls.grid.querySelector(`.cal-cell[data-day="${calSelectedDay}"]`);
  calEls.pop.hidden = !cell;
  if (!cell) return;

  const { year, month } = calView;
  const key = calDayKey(year, month, calSelectedDay);
  const here = calInView().filter((e) => key >= e.startKey && key <= e.endKey);
  const heading = new Date(year, month, calSelectedDay).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  calEls.pop.innerHTML = `
    <div class="cal-pop-head"><strong>${heading}</strong><button type="button" class="cal-pop-close" aria-label="Close">&times;</button></div>
    ${here.length
      ? here.map((e) => `
        <div class="cal-pop-item cat-${e.category}${e.past ? ' is-past' : ''}">
          <strong>${escapeHtml(e.title)}</strong>
          ${e.subtitle ? `<span>${escapeHtml(e.subtitle)}</span>` : ''}
          ${e.startKey === e.endKey ? '' : `<small>${calDateText(e)}</small>`}
        </div>`).join('')
      : '<p class="cal-pop-none">Nothing on this day.</p>'}`;

  // Sit just under the day, centred on it, and never past the edges of the calendar.
  const box = calEls.root.getBoundingClientRect();
  const at = cell.getBoundingClientRect();
  const width = Math.min(260, box.width - 16);
  const centre = at.left - box.left + at.width / 2;
  const left = Math.max(8, Math.min(centre - width / 2, box.width - width - 8));
  calEls.pop.style.width = `${width}px`;
  calEls.pop.style.left = `${left}px`;
  calEls.pop.style.top = `${at.bottom - box.top + 8}px`;
  calEls.pop.style.setProperty('--arrow-x', `${centre - left}px`);
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
    html += `<div class="cal-cell${d === calSelectedDay ? ' is-day-selected' : ''}${weekend ? ' cal-weekend' : ''}${isToday ? ' cal-is-today' : ''}" data-day="${d}"><span class="cal-day">${d}</span>${isToday ? '<span class="cal-today-label">Today</span>' : ''}${here
      .map((e) => `<span class="cal-event cat-${e.category}${e.past ? ' is-past' : ''}" title="${escapeHtml(e.title)}">${escapeHtml(e.title)}</span>`)
      .join('')}</div>`;
  }
  const tail = (7 - ((lead + days) % 7)) % 7;
  for (let i = 0; i < tail; i += 1) html += '<div class="cal-cell cal-out"></div>';
  calEls.grid.innerHTML = html;

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
  calRenderPop();
}

function calShow(year, month) {
  calView.year = year;
  calView.month = month;
  calSelectedDay = null;
  calRender();
}

function calStep(delta) {
  const date = new Date(calView.year, calView.month + delta, 1);
  calShow(date.getFullYear(), date.getMonth());
}

// Anywhere on a day's square counts, not just the event bar. Tapping the open day again closes it.
function calSelect(event) {
  const cell = event.target.closest('.cal-cell[data-day]');
  if (!cell) return;
  const day = Number(cell.dataset.day);
  calSelectedDay = day === calSelectedDay ? null : day;
  calRender();
  if (calSelectedDay !== null) calEls.pop.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

calEls.prev.addEventListener('click', () => calStep(-1));
calEls.next.addEventListener('click', () => calStep(1));
calEls.todayBtn.addEventListener('click', () => {
  const today = calToday();
  calShow(today.year, today.month);
});
calEls.grid.addEventListener('click', calSelect);
calEls.pop.addEventListener('click', (event) => {
  if (event.target.closest('.cal-pop-close')) calCloseDay();
});
// A tap anywhere else, or Escape, closes the card.
document.addEventListener('click', (event) => {
  // The grid redraws itself when a day is tapped, so look at the path the click took, not where its target is now.
  if (!event.composedPath().some((el) => el === calEls.grid || el === calEls.pop)) calCloseDay();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') calCloseDay();
});
window.addEventListener('resize', calRenderPop);

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
  // place and stays on the month (and day) being looked at.
  if (!calView.started) {
    calView.started = true;
    calShow(today.year, today.month);
  } else {
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
