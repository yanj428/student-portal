import { escapeHtml, sendJSON, del } from './api.js';

const csEventForm = document.getElementById('cs-event-form');
const csEventTitleInput = document.getElementById('cs-event-title');
const csEventClubInput = document.getElementById('cs-event-club');
const csEventDateInput = document.getElementById('cs-event-date');
const csEventSignupInput = document.getElementById('cs-event-signup');
const csEventDescriptionInput = document.getElementById('cs-event-description');
const csEventError = document.getElementById('cs-event-error');
const csEventSubmit = document.getElementById('cs-event-submit');
const csEventAdminList = document.getElementById('cs-event-admin-list');
const csEventEmptyHint = document.getElementById('cs-event-empty-hint');

export async function loadCsEvents() {
  const res = await fetch('/api/admin/cs-events');
  if (!res.ok) return;
  const { events } = await res.json();
  renderCsEventsAdmin(events);
}

function renderCsEventsAdmin(events) {
  csEventAdminList.querySelectorAll('.cs-event-item').forEach((el) => el.remove());
  csEventEmptyHint.hidden = events.length > 0;

  events.forEach((event) => {
    const div = document.createElement('div');
    div.className = 'cs-event-item';
    div.innerHTML = `
      <div class="cs-event-item-head">
        <span class="cs-event-item-title">${escapeHtml(event.title)}</span>
        <button class="delete-btn" aria-label="Remove event"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
      <span class="cs-event-item-meta">${escapeHtml(event.club)} &middot; ${escapeHtml(event.eventDate)}</span>
      <p class="cs-event-item-body">${escapeHtml(event.description)}</p>
    `;
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm(`Remove "${event.title}" from the Community Service page?`)) return;
      await del(`/api/admin/cs-events/${event.id}`);
      loadCsEvents();
    });
    csEventAdminList.appendChild(div);
  });
}

csEventForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  csEventError.hidden = true;
  csEventSubmit.disabled = true;
  csEventSubmit.textContent = 'Posting…';

  try {
    const { ok, data } = await sendJSON('/api/admin/cs-events', 'POST', {
      title: csEventTitleInput.value.trim(),
      club: csEventClubInput.value.trim(),
      eventDate: csEventDateInput.value.trim(),
      description: csEventDescriptionInput.value.trim(),
      signupUrl: csEventSignupInput.value.trim(),
    });

    if (!ok) {
      csEventError.textContent = data.error || 'Could not post event.';
      csEventError.hidden = false;
      return;
    }

    csEventForm.reset();
    loadCsEvents();
  } catch {
    csEventError.textContent = 'Could not reach the server. Please try again.';
    csEventError.hidden = false;
  } finally {
    csEventSubmit.disabled = false;
    csEventSubmit.textContent = 'Post opportunity';
  }
});
