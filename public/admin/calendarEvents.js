import { escapeHtml, sendJSON, del } from './api.js';

const form = document.getElementById('calendar-event-form');
const dayInput = document.getElementById('calendar-event-day');
const monthInput = document.getElementById('calendar-event-month');
const titleInput = document.getElementById('calendar-event-title');
const subtitleInput = document.getElementById('calendar-event-subtitle');
const errorEl = document.getElementById('calendar-event-error');
const submitBtn = document.getElementById('calendar-event-submit');
const cancelBtn = document.getElementById('calendar-event-cancel-edit');
const listEl = document.getElementById('calendar-event-list');
const emptyEl = document.getElementById('calendar-event-empty-hint');

let editingId = null;

function resetForm() {
  editingId = null;
  form.reset();
  submitBtn.textContent = 'Add event';
  cancelBtn.hidden = true;
}

export async function loadCalendarEvents() {
  const res = await fetch('/api/admin/calendar-events');
  if (!res.ok) return;
  const { calendarEvents } = await res.json();
  render(calendarEvents);
}

function render(items) {
  listEl.querySelectorAll('.simple-item').forEach((el) => el.remove());
  emptyEl.hidden = items.length > 0;

  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'simple-item';
    div.innerHTML = `
      <div class="simple-item-head">
        <span class="simple-item-title">${escapeHtml(item.day)} ${escapeHtml(item.month)} — ${escapeHtml(item.title)}</span>
        <div class="simple-item-actions">
          <button class="edit-btn" aria-label="Edit">Edit</button>
          <button class="delete-btn" aria-label="Remove"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>
      <p class="simple-item-body">${escapeHtml(item.subtitle)}</p>
    `;
    div.querySelector('.edit-btn').addEventListener('click', () => {
      editingId = item.id;
      dayInput.value = item.day;
      monthInput.value = item.month;
      titleInput.value = item.title;
      subtitleInput.value = item.subtitle;
      errorEl.hidden = true;
      submitBtn.textContent = 'Save changes';
      cancelBtn.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm(`Remove "${item.title}"?`)) return;
      await del(`/api/admin/calendar-events/${item.id}`);
      if (editingId === item.id) resetForm();
      loadCalendarEvents();
    });
    listEl.appendChild(div);
  });
}

cancelBtn.addEventListener('click', () => resetForm());

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = editingId ? 'Saving…' : 'Adding…';

  try {
    const payload = {
      day: dayInput.value.trim(),
      month: monthInput.value.trim(),
      title: titleInput.value.trim(),
      subtitle: subtitleInput.value.trim(),
    };
    const url = editingId ? `/api/admin/calendar-events/${editingId}` : '/api/admin/calendar-events';
    const { ok, data } = await sendJSON(url, editingId ? 'PUT' : 'POST', payload);

    if (!ok) {
      errorEl.textContent = data.error || 'Could not save event.';
      errorEl.hidden = false;
      return;
    }

    resetForm();
    loadCalendarEvents();
  } catch {
    errorEl.textContent = 'Could not reach the server. Please try again.';
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingId ? 'Save changes' : 'Add event';
  }
});
