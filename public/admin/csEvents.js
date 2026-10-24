import { escapeHtml, getJSON, ITEM_ACTIONS_HTML } from './api.js';
import { crudPanel } from './crud.js';

const titleInput = document.getElementById('cs-event-title');
const clubInput = document.getElementById('cs-event-club');
const dateInput = document.getElementById('cs-event-date');
const signupInput = document.getElementById('cs-event-signup');
const descriptionInput = document.getElementById('cs-event-description');
const listEl = document.getElementById('cs-event-admin-list');
const emptyEl = document.getElementById('cs-event-empty-hint');

const panel = crudPanel({
  form: document.getElementById('cs-event-form'),
  submitBtn: document.getElementById('cs-event-submit'),
  cancelBtn: document.getElementById('cs-event-cancel-edit'),
  errorEl: document.getElementById('cs-event-error'),
  endpoint: '/api/admin/cs-events',
  addLabel: 'Post opportunity',
  saveError: 'Could not post event.',
  readPayload: () => ({
    title: titleInput.value.trim(),
    club: clubInput.value.trim(),
    eventDate: dateInput.value.trim(),
    description: descriptionInput.value.trim(),
    signupUrl: signupInput.value.trim(),
  }),
  fill: (event) => {
    titleInput.value = event.title;
    clubInput.value = event.club;
    dateInput.value = event.eventDate;
    descriptionInput.value = event.description;
    signupInput.value = event.signupUrl || '';
  },
  reload: () => loadCsEvents(),
});

export async function loadCsEvents() {
  const data = await getJSON('/api/admin/cs-events');
  if (!data) return;

  listEl.querySelectorAll('.simple-item').forEach((el) => el.remove());
  emptyEl.hidden = data.events.length > 0;

  data.events.forEach((event) => {
    const div = document.createElement('div');
    div.className = 'simple-item';
    div.innerHTML = `
      <div class="simple-item-head">
        <span class="simple-item-title">${escapeHtml(event.title)}</span>
        ${ITEM_ACTIONS_HTML}
      </div>
      <div class="item-meta">
        <span>${escapeHtml(event.club)} &middot; ${escapeHtml(event.eventDate)}</span>
        ${event.signupUrl ? `<a href="${escapeHtml(event.signupUrl)}" target="_blank" rel="noopener">Sign-up link</a>` : ''}
      </div>
      <p class="simple-item-body">${escapeHtml(event.description)}</p>
    `;
    panel.bindRow(div, event, `Remove "${event.title}" from the Community Service page?`);
    listEl.appendChild(div);
  });
}
