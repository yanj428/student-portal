import { escapeHtml, getJSON, sendJSON, withBusy, ITEM_ACTIONS_HTML, renderRows } from './api.js';
import { crudPanel } from './crud.js';
import { createEventCalendar } from './eventCalendar.js';
import { openDrawerFor, showToast } from './drawer.js';

const singleInput = document.getElementById('calendar-event-single');
const startInput = document.getElementById('calendar-event-start');
const endInput = document.getElementById('calendar-event-end');
const endField = document.getElementById('calendar-event-end-field');
const startLabel = document.getElementById('calendar-event-start-label');
const titleInput = document.getElementById('calendar-event-title');
const subtitleInput = document.getElementById('calendar-event-subtitle');
const categoryInput = document.getElementById('calendar-event-category');
const listEl = document.getElementById('calendar-event-list');
const emptyEl = document.getElementById('calendar-event-empty-hint');

// Kept in sync by loadCalendarEvents() so a fresh AI extraction can be
// checked against what's already on the calendar without a separate fetch.
let existingEvents = [];
let categories = [];

const categoryOptions = (selected) => categories.map((c) => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${escapeHtml(c.label)}</option>`).join('');
// One date for a single-day event; a start and an end date otherwise.
function syncDateFields() {
  endField.hidden = singleInput.checked;
  endInput.required = !singleInput.checked;
  startLabel.textContent = singleInput.checked ? 'Date' : 'Start date';
}
singleInput.addEventListener('change', syncDateFields);

// The category picker shows as a row of chips; the select underneath keeps the value.
const chipRow = document.createElement('div');
chipRow.className = 'chip-row';
categoryInput.after(chipRow);
categoryInput.hidden = true;
function syncChips() {
  chipRow.querySelectorAll('button').forEach((chip) => chip.classList.toggle('on', chip.dataset.value === categoryInput.value));
}
function buildChips() {
  chipRow.innerHTML = [{ id: '', label: 'Pick for me' }, ...categories].map((c) => `<button type="button" class="chip" data-value="${c.id}">${escapeHtml(c.label)}</button>`).join('');
  chipRow.querySelectorAll('button').forEach((chip) => chip.addEventListener('click', () => {
    categoryInput.value = chip.dataset.value;
    syncChips();
  }));
  syncChips();
}
const categoryLabel = (id) => (categories.find((c) => c.id === id) || {}).label || id;

const panel = crudPanel({
  form: document.getElementById('calendar-event-form'),
  submitBtn: document.getElementById('calendar-event-submit'),
  cancelBtn: document.getElementById('calendar-event-cancel-edit'),
  errorEl: document.getElementById('calendar-event-error'),
  endpoint: '/api/admin/calendar-events',
  addLabel: 'Add event',
  saveError: 'Could not save event.',
  readPayload: () => ({
    startDate: startInput.value,
    endDate: singleInput.checked ? '' : endInput.value,
    title: titleInput.value.trim(),
    subtitle: subtitleInput.value.trim(),
    category: categoryInput.value,
  }),
  fill: (item) => {
    startInput.value = item.startDate;
    endInput.value = item.endDate;
    singleInput.checked = item.startDate === item.endDate;
    syncDateFields();
    titleInput.value = item.title;
    subtitleInput.value = item.subtitle;
    categoryInput.value = item.category;
    syncChips();
  },
  onReset: () => {
    syncDateFields();
    syncChips();
  },
  reload: () => loadCalendarEvents(),
});

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 19 Oct 2026, 19-20 Oct 2026 (day already holds the range), or 30 Oct - 2 Nov 2026.
function dateText(item) {
  const [endYear, endMonth, endDay] = item.endDate.split('-').map(Number);
  if (endYear === item.year && MONTH_ABBR[endMonth - 1] === item.month) return `${item.day} ${item.month} ${item.year}`;
  return `${item.day} ${item.month} - ${endDay} ${MONTH_ABBR[endMonth - 1]} ${endYear}`;
}

// ---- The calendar view: drag an event to move it, pull its end to stretch it ----

const calendarEl = document.getElementById('calendar-event-cal');
const eventCal = createEventCalendar({
  root: calendarEl,
  onEdit: (item) => panel.startEdit(item),
  onAdd: (isoDate) => {
    singleInput.checked = true;
    syncDateFields();
    startInput.value = isoDate;
    endInput.value = '';
    openDrawerFor('calendar-event-form');
  },
  onMove: async (item, startDate, endDate) => {
    try {
      const { ok, data } = await sendJSON(`/api/admin/calendar-events/${item.id}`, 'PUT', {
        startDate,
        endDate: endDate === startDate ? '' : endDate,
        title: item.title,
        subtitle: item.subtitle,
        category: item.category,
      });
      if (ok) showToast(startDate === endDate ? `Moved to ${startDate}` : `Now ${startDate} to ${endDate}`);
      else alert(data.error || 'Could not move the event.');
    } catch {
      alert('Could not reach the server. Please try again.');
    }
    loadCalendarEvents();
  },
});

// Calendar and list are two views of the same events.
document.querySelectorAll('#event-view-switch button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const calendar = btn.dataset.view === 'calendar';
    document.querySelectorAll('#event-view-switch button').forEach((b) => b.classList.toggle('on', b === btn));
    calendarEl.hidden = !calendar;
    listEl.hidden = calendar;
  });
});

export async function loadCalendarEvents() {
  const data = await getJSON('/api/admin/calendar-events');
  if (!data) return;
  existingEvents = data.calendarEvents;
  eventCal.setEvents(existingEvents);
  if (!categories.length) {
    categories = data.categories;
    categoryInput.innerHTML = '<option value="">Pick for me</option>' + categoryOptions('');
    buildChips();
  }

  renderRows(listEl, emptyEl, existingEvents, (div, item) => {
    div.innerHTML = `
      <div class="simple-item-head">
        <span class="simple-item-title">${escapeHtml(dateText(item))} · ${escapeHtml(item.title)}</span>
        ${ITEM_ACTIONS_HTML}
      </div>
      <p class="simple-item-body">${escapeHtml(categoryLabel(item.category))}${item.subtitle ? ` · ${escapeHtml(item.subtitle)}` : ''}</p>
    `;
    panel.bindRow(div, item, `Remove "${item.title}"?`);
  });
}

// ---- Extract events from a photo with AI ----

const aiImageInput = document.getElementById('calendar-ai-image-input');
const aiExtractBtn = document.getElementById('calendar-ai-extract-btn');
const aiError = document.getElementById('calendar-ai-error');
const aiResults = document.getElementById('calendar-ai-results');
const aiResultsList = document.getElementById('calendar-ai-results-list');
const aiAddAllBtn = document.getElementById('calendar-ai-add-all');
const aiDuplicatesHint = document.getElementById('calendar-ai-duplicates-hint');

let candidates = [];

function candidateField(label, className, value) {
  return `
    <div class="form-field">
      <label class="field-label">${label}</label>
      <input class="field-input ${className}" type="text" value="${escapeHtml(value)}" />
    </div>`;
}

// The rows are rebuilt from `candidates` on every render, so edits typed into
// the inputs have to be copied back first or they would be thrown away. Must
// run while the rows on screen still line up with `candidates`.
function syncCandidatesFromInputs() {
  aiResultsList.querySelectorAll('.mod-item').forEach((div, i) => {
    if (candidates[i]) Object.assign(candidates[i], readCandidateInputs(div));
  });
}

function renderCandidates() {
  aiResultsList.querySelectorAll('.mod-item').forEach((el) => el.remove());
  aiResults.hidden = candidates.length === 0;

  candidates.forEach((candidate, index) => {
    const div = document.createElement('div');
    div.className = 'mod-item open';
    div.innerHTML = `
      <div class="mod-item-details">
        <div class="form-row">
          ${candidateField('Day', 'candidate-day', candidate.day)}
          ${candidateField('Month', 'candidate-month', candidate.month)}
        </div>
        ${candidateField('Title', 'candidate-title', candidate.title)}
        ${candidateField('Subtitle', 'candidate-subtitle', candidate.subtitle)}
        <div class="form-field">
          <label class="field-label">Category</label>
          <select class="field-input candidate-category">${categoryOptions(candidate.category)}</select>
        </div>
        <div class="mod-item-actions">
          <button class="btn primary add-candidate-btn">Add</button>
          <button class="btn ghost dismiss-candidate-btn">Dismiss</button>
        </div>
      </div>
    `;
    const addBtn = div.querySelector('.add-candidate-btn');
    addBtn.addEventListener('click', () => withBusy(addBtn, 'Adding…', () => addCandidate(index)));
    div.querySelector('.dismiss-candidate-btn').addEventListener('click', () => {
      syncCandidatesFromInputs();
      candidates.splice(index, 1);
      renderCandidates();
    });
    aiResultsList.appendChild(div);
  });
}

// Reads the current (possibly hand-edited) values straight out of that
// candidate's own inputs rather than the original AI-extracted `candidates`
// entry, so an admin's edits are what actually gets saved.
function readCandidateInputs(div) {
  const value = (selector) => div.querySelector(selector).value.trim();
  return { day: value('.candidate-day'), month: value('.candidate-month'), title: value('.candidate-title'), subtitle: value('.candidate-subtitle'), category: value('.candidate-category') };
}

// Returns whether it actually added the candidate — callers (especially
// the "Add all" loop below) must not treat a rejected candidate as done,
// but also must not just retry it forever.
async function addCandidate(index) {
  const payload = readCandidateInputs(aiResultsList.children[index]);
  try {
    const { ok, data } = await sendJSON('/api/admin/calendar-events', 'POST', payload);
    if (ok) {
      aiError.hidden = true;
      syncCandidatesFromInputs();
      candidates.splice(index, 1);
      renderCandidates();
      loadCalendarEvents();
      return true;
    }
    aiError.textContent = data.error || `Could not add "${payload.title}".`;
  } catch {
    aiError.textContent = 'Could not reach the server. Please try again.';
  }
  aiError.hidden = false;
  return false;
}

aiExtractBtn.addEventListener('click', async () => {
  aiError.hidden = true;
  aiDuplicatesHint.hidden = true;

  const file = aiImageInput.files[0];
  if (!file) {
    aiError.textContent = 'Choose a calendar photo first.';
    aiError.hidden = false;
    return;
  }

  await withBusy(aiExtractBtn, 'Reading photo…', async () => {
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/admin/calendar-events/extract', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        aiError.textContent = data.error || 'Could not read this photo.';
        aiError.hidden = false;
        return;
      }

      // The server already left out events that are on the calendar and ones that have passed.
      candidates = data.events;
      renderCandidates();

      const { skippedExisting = 0, skippedPast = 0 } = data;
      const parts = [];
      if (skippedExisting > 0) parts.push(`already on the calendar (${skippedExisting})`);
      if (skippedPast > 0) parts.push(`already passed (${skippedPast})`);
      aiDuplicatesHint.hidden = parts.length === 0;
      if (parts.length > 0) {
        aiDuplicatesHint.textContent = `Left out events ${parts.join(' and ')}.` + (candidates.length === 0 ? ' Nothing new was found in this photo.' : '');
      }
    } catch {
      aiError.textContent = 'Could not reach the server. Please try again.';
      aiError.hidden = false;
    }
  });
});

aiAddAllBtn.addEventListener('click', () =>
  withBusy(aiAddAllBtn, 'Adding…', async () => {
    // A rejected candidate stays in the list (so the admin can fix or
    // dismiss it) instead of being retried forever against the same
    // error - stop the batch here rather than hammering the server.
    while (candidates.length > 0) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await addCandidate(0))) break;
    }
  })
);
