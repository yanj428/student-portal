// A month calendar for the admin's events. Events are bars on their days:
// drag one to move it, pull either end to make it longer or shorter, click it to
// edit it, and click an empty day to add an event on that date.
//
//   onEdit(event)              an event was clicked
//   onAdd(isoDate)             an empty day was clicked
//   onMove(event, start, end)  an event was dropped or stretched (ISO dates, end >= start)

const DAY = 86400000;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Days are counted as whole numbers so a range can be shifted by plain arithmetic.
const toDays = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
};
const toIso = (days) => new Date(days * DAY).toISOString().slice(0, 10);
const shortDate = (days) => {
  const date = new Date(days * DAY);
  return `${date.getUTCDate()} ${SHORT[date.getUTCMonth()]}`;
};
const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function todayDays() {
  return toDays(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }));
}

export function createEventCalendar({ root, onEdit, onAdd, onMove }) {
  let events = [];
  const now = new Date(todayDays() * DAY);
  const view = { year: now.getUTCFullYear(), month: now.getUTCMonth() };

  root.innerHTML = `
    <div class="ec-head">
      <button type="button" class="ec-nav" data-step="-1" aria-label="Previous month">&lsaquo;</button>
      <h3 class="ec-title"></h3>
      <button type="button" class="ec-today">Today</button>
      <button type="button" class="ec-nav" data-step="1" aria-label="Next month">&rsaquo;</button>
    </div>
    <div class="ec-dow"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
    <div class="ec-weeks"></div>
    <p class="ec-help">Drag an event to move it. Pull its dark end to make it longer or shorter. Click it to edit, or click an empty day to add one.</p>`;
  const titleEl = root.querySelector('.ec-title');
  const weeksEl = root.querySelector('.ec-weeks');

  const tip = document.createElement('div');
  tip.className = 'ec-tip';
  tip.hidden = true;
  document.body.appendChild(tip);

  function render() {
    titleEl.textContent = `${MONTH_NAMES[view.month]} ${view.year}`;
    const first = Math.round(Date.UTC(view.year, view.month, 1) / DAY);
    const last = Math.round(Date.UTC(view.year, view.month + 1, 0) / DAY);
    // Whole weeks, Monday first, so events can run across the edge of the month.
    const gridStart = first - ((new Date(first * DAY).getUTCDay() + 6) % 7);
    const gridEnd = last + (6 - ((new Date(last * DAY).getUTCDay() + 6) % 7));
    const today = todayDays();

    let html = '';
    for (let ws = gridStart; ws <= gridEnd; ws += 7) {
      const we = ws + 6;
      const inWeek = events
        .filter((e) => e.s <= we && e.e >= ws)
        .sort((a, b) => a.s - b.s || b.e - a.e);

      // Each event takes the first row of the week that is free where it runs.
      const laneEnds = [];
      const bars = inWeek.map((e) => {
        const from = Math.max(e.s, ws);
        const to = Math.min(e.e, we);
        let lane = laneEnds.findIndex((end) => end < from);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = to;
        return { e, from, to, lane };
      });

      let cells = '';
      for (let d = ws; d <= we; d += 1) {
        const date = new Date(d * DAY);
        const weekend = (date.getUTCDay() + 6) % 7 > 4;
        const outside = date.getUTCMonth() !== view.month;
        cells += `<div class="ec-cell${weekend ? ' we' : ''}${outside ? ' out' : ''}${d === today ? ' today' : ''}" data-day="${d}"><span class="ec-num">${date.getUTCDate()}</span></div>`;
      }

      const barHtml = bars.map(({ e, from, to, lane }) => {
        const startsHere = e.s >= ws;
        const endsHere = e.e <= we;
        return `<div class="ec-bar cat-${esc(e.category)}${e.e < today ? ' past' : ''}${startsHere ? '' : ' cut-l'}${endsHere ? '' : ' cut-r'}" data-id="${esc(e.id)}" data-col="${from - ws + 1} / ${to - ws + 2}" data-row="${lane + 1}" title="${esc(e.title)}">${startsHere ? '<span class="ec-h" data-h="start"></span>' : ''}<span class="ec-t">${esc(e.title)}</span>${endsHere ? '<span class="ec-h r" data-h="end"></span>' : ''}</div>`;
      }).join('');

      html += `<div class="ec-week" data-lanes="${laneEnds.length}"><div class="ec-days">${cells}</div><div class="ec-bars">${barHtml}</div></div>`;
    }
    weeksEl.innerHTML = html;

    // The page does not allow inline style attributes, so positions are set from here.
    weeksEl.querySelectorAll('.ec-week').forEach((week) => week.style.setProperty('--lanes', week.dataset.lanes));
    weeksEl.querySelectorAll('.ec-bar').forEach((bar) => {
      bar.style.gridColumn = bar.dataset.col;
      bar.style.gridRow = bar.dataset.row;
    });
  }

  // The day under a point on the screen, found from the cells' own positions because the bar being dragged covers them.
  function dayAt(x, y) {
    let best = null;
    let bestDistance = Infinity;
    weeksEl.querySelectorAll('.ec-cell').forEach((cell) => {
      const r = cell.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = Number(cell.dataset.day);
      }
    });
    return best;
  }

  let drag = null;

  function showPreview(s, e, x, y) {
    weeksEl.querySelectorAll('.ec-cell').forEach((cell) => {
      const d = Number(cell.dataset.day);
      cell.classList.toggle('drop', d >= s && d <= e);
    });
    tip.textContent = s === e ? shortDate(s) : `${shortDate(s)} to ${shortDate(e)}`;
    tip.style.left = `${x + 14}px`;
    tip.style.top = `${y + 14}px`;
    tip.hidden = false;
  }

  function endDrag() {
    weeksEl.querySelectorAll('.ec-cell.drop').forEach((cell) => cell.classList.remove('drop'));
    weeksEl.querySelectorAll('.ec-bar.dragging').forEach((bar) => bar.classList.remove('dragging'));
    document.body.classList.remove('ec-dragging');
    tip.hidden = true;
    drag = null;
  }

  weeksEl.addEventListener('pointerdown', (ev) => {
    const bar = ev.target.closest('.ec-bar');
    if (!bar || ev.button > 0) return;
    const item = events.find((e) => e.id === bar.dataset.id);
    if (!item) return;
    const handle = ev.target.closest('.ec-h');
    drag = {
      item,
      mode: handle ? handle.dataset.h : 'move',
      grab: dayAt(ev.clientX, ev.clientY),
      x: ev.clientX,
      y: ev.clientY,
      moved: false,
      cur: { s: item.s, e: item.e },
      id: ev.pointerId,
    };
    bar.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });

  weeksEl.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      document.body.classList.add('ec-dragging');
      weeksEl.querySelectorAll(`.ec-bar[data-id="${CSS.escape(drag.item.id)}"]`).forEach((bar) => bar.classList.add('dragging'));
    }
    const day = dayAt(ev.clientX, ev.clientY);
    if (day === null) return;
    const { item } = drag;
    if (drag.mode === 'move') {
      const shift = day - drag.grab;
      drag.cur = { s: item.s + shift, e: item.e + shift };
    } else if (drag.mode === 'start') {
      drag.cur = { s: Math.min(day, item.e), e: item.e };
    } else {
      drag.cur = { s: item.s, e: Math.max(day, item.s) };
    }
    showPreview(drag.cur.s, drag.cur.e, ev.clientX, ev.clientY);
  });

  weeksEl.addEventListener('pointerup', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const { item, mode, moved, cur } = drag;
    endDrag();
    if (!moved) {
      if (mode === 'move') onEdit(item.raw);
      return;
    }
    if (cur.s === item.s && cur.e === item.e) return;
    // Show the new place at once; the page reloads from the server after it saves.
    item.s = cur.s;
    item.e = cur.e;
    render();
    onMove(item.raw, toIso(cur.s), toIso(cur.e));
  });

  weeksEl.addEventListener('pointercancel', endDrag);

  weeksEl.addEventListener('click', (ev) => {
    if (ev.target.closest('.ec-bar')) return;
    const cell = ev.target.closest('.ec-cell');
    if (cell) onAdd(toIso(Number(cell.dataset.day)));
  });

  function step(delta) {
    const date = new Date(Date.UTC(view.year, view.month + delta, 1));
    view.year = date.getUTCFullYear();
    view.month = date.getUTCMonth();
    render();
  }
  root.querySelectorAll('.ec-nav').forEach((btn) => btn.addEventListener('click', () => step(Number(btn.dataset.step))));
  root.querySelector('.ec-today').addEventListener('click', () => {
    const t = new Date(todayDays() * DAY);
    view.year = t.getUTCFullYear();
    view.month = t.getUTCMonth();
    render();
  });

  return {
    setEvents(list) {
      events = list.map((raw) => ({
        raw,
        id: raw.id,
        title: raw.title,
        category: raw.category || 'school',
        s: toDays(raw.startDate),
        e: Math.max(toDays(raw.startDate), toDays(raw.endDate || raw.startDate)),
      }));
      render();
    },
  };
}
