import { escapeHtml, getJSON, ITEM_ACTIONS_HTML, renderRows } from './api.js';
import { crudPanel } from './crud.js';

const titleInput = document.getElementById('cs-event-title');
const clubInput = document.getElementById('cs-event-club');
const clubOptions = document.getElementById('cs-club-options');
const clubDetected = document.getElementById('cs-event-club-detected');
const dateInput = document.getElementById('cs-event-date');
const signupInput = document.getElementById('cs-event-signup');
const descriptionInput = document.getElementById('cs-event-description');
const listEl = document.getElementById('cs-event-admin-list');
const emptyEl = document.getElementById('cs-event-empty-hint');

// ---- Detecting the hosting club ------------------------------------------
// The server decides which club a typed name means (the same rule it uses when
// the post is saved), so what is shown here is what students will see.
let detectTimer = null;
let detectRun = 0;

async function detectClub() {
  const name = clubInput.value.trim();
  const run = ++detectRun;
  if (name.length < 3) {
    clubDetected.hidden = true;
    return;
  }
  const data = await getJSON(`/api/admin/cs-events/club-match?name=${encodeURIComponent(name)}`);
  if (run !== detectRun || !data) return; // a newer keystroke is already being checked
  clubDetected.hidden = false;
  if (data.club) {
    clubDetected.className = 'club-detected found';
    clubDetected.innerHTML = `${data.club.logoUrl ? `<img src="${escapeHtml(data.club.logoUrl)}" alt="" />` : ''}<span>Club detected: ${escapeHtml(data.club.name)}${data.club.logoUrl ? '' : ' (this club has no logo yet)'}</span>`;
  } else {
    clubDetected.className = 'club-detected';
    clubDetected.textContent = 'No club matches this name, so the post will show no logo.';
  }
}

clubInput.addEventListener('input', () => {
  clearTimeout(detectTimer);
  detectTimer = setTimeout(detectClub, 250);
});
// Picking a suggestion from the list should show the result straight away.
clubInput.addEventListener('change', detectClub);

async function loadClubSuggestions() {
  const data = await getJSON('/api/admin/clubs');
  if (!data) return;
  clubOptions.innerHTML = data.clubs.map((c) => `<option value="${escapeHtml(c.name)}"></option>`).join('');
}

// ---- The form -------------------------------------------------------------
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
    detectClub();
  },
  onReset: () => {
    detectRun += 1;
    clubDetected.hidden = true;
  },
  reload: () => loadCsEvents(),
});

export async function loadCsEvents() {
  loadClubSuggestions();
  const data = await getJSON('/api/admin/cs-events');
  if (!data) return;

  renderRows(listEl, emptyEl, data.events, (div, event) => {
    div.innerHTML = `
      <div class="simple-item-head">
        <span class="simple-item-title">${escapeHtml(event.title)}</span>
        ${ITEM_ACTIONS_HTML}
      </div>
      <div class="item-meta">
        <span>${event.clubLogoUrl ? `<img class="club-chip-logo" src="${escapeHtml(event.clubLogoUrl)}" alt="" />` : ''}${escapeHtml(event.club)} &middot; ${escapeHtml(event.eventDate)}</span>
        ${event.signupUrl ? `<a href="${escapeHtml(event.signupUrl)}" target="_blank" rel="noopener">Sign-up link</a>` : ''}
      </div>
      <p class="simple-item-body">${escapeHtml(event.description)}</p>
    `;
    panel.bindRow(div, event, `Remove "${event.title}" from the Community Service page?`);
  });
}
