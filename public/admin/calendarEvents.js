import { escapeHtml, getJSON, sendJSON, withBusy, ITEM_ACTIONS_HTML } from './api.js';
import { crudPanel } from './crud.js';

const dayInput = document.getElementById('calendar-event-day');
const monthInput = document.getElementById('calendar-event-month');
const titleInput = document.getElementById('calendar-event-title');
const subtitleInput = document.getElementById('calendar-event-subtitle');
const listEl = document.getElementById('calendar-event-list');
const emptyEl = document.getElementById('calendar-event-empty-hint');

// Kept in sync by loadCalendarEvents() so a fresh AI extraction can be
// checked against what's already on the calendar without a separate fetch.
let existingEvents = [];

const panel = crudPanel({
  form: document.getElementById('calendar-event-form'),
  submitBtn: document.getElementById('calendar-event-submit'),
  cancelBtn: document.getElementById('calendar-event-cancel-edit'),
  errorEl: document.getElementById('calendar-event-error'),
  endpoint: '/api/admin/calendar-events',
  addLabel: 'Add event',
  saveError: 'Could not save event.',
  readPayload: () => ({
    day: dayInput.value.trim(),
    month: monthInput.value.trim(),
    title: titleInput.value.trim(),
    subtitle: subtitleInput.value.trim(),
  }),
  fill: (item) => {
    dayInput.value = item.day;
    monthInput.value = item.month;
    titleInput.value = item.title;
    subtitleInput.value = item.subtitle;
  },
  reload: () => loadCalendarEvents(),
});

export async function loadCalendarEvents() {
  const data = await getJSON('/api/admin/calendar-events');
  if (!data) return;
  existingEvents = data.calendarEvents;

  listEl.querySelectorAll('.simple-item').forEach((el) => el.remove());
  emptyEl.hidden = existingEvents.length > 0;

  existingEvents.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'simple-item';
    div.innerHTML = `
      <div class="simple-item-head">
        <span class="simple-item-title">${escapeHtml(item.day)} ${escapeHtml(item.month)} · ${escapeHtml(item.title)}</span>
        ${ITEM_ACTIONS_HTML}
      </div>
      <p class="simple-item-body">${escapeHtml(item.subtitle)}</p>
    `;
    panel.bindRow(div, item, `Remove "${item.title}"?`);
    listEl.appendChild(div);
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

// Same day + month + title (case-insensitive) as something already on the
// calendar counts as the same event — most likely the admin re-uploading a
// calendar that overlaps a range already entered. Extracting a real event
// (a rare exact retitle aside) shouldn't require deleting the old one first,
// so these are silently skipped rather than shown as an error.
function isDuplicateOfExisting(candidate) {
  return existingEvents.some(
    (e) =>
      e.day.trim() === candidate.day.trim() &&
      e.month.trim().toLowerCase() === candidate.month.trim().toLowerCase() &&
      e.title.trim().toLowerCase() === candidate.title.trim().toLowerCase()
  );
}

function candidateField(label, className, value) {
  return `
    <div class="form-field">
      <label class="field-label">${label}</label>
      <input class="field-input ${className}" type="text" value="${escapeHtml(value)}" />
    </div>`;
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
        <div class="mod-item-actions">
          <button class="btn primary add-candidate-btn">Add</button>
          <button class="btn ghost dismiss-candidate-btn">Dismiss</button>
        </div>
      </div>
    `;
    const addBtn = div.querySelector('.add-candidate-btn');
    addBtn.addEventListener('click', () => withBusy(addBtn, 'Adding…', () => addCandidate(index)));
    div.querySelector('.dismiss-candidate-btn').addEventListener('click', () => {
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
  return { day: value('.candidate-day'), month: value('.candidate-month'), title: value('.candidate-title'), subtitle: value('.candidate-subtitle') };
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

      const skipped = data.events.filter(isDuplicateOfExisting).length;
      candidates = data.events.filter((c) => !isDuplicateOfExisting(c));
      renderCandidates();

      aiDuplicatesHint.hidden = skipped === 0;
      if (skipped > 0) {
        aiDuplicatesHint.textContent = `Skipped ${skipped} event${skipped === 1 ? '' : 's'} already on the calendar.`;
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
