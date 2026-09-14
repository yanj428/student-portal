import { escapeHtml, sendJSON, del } from './api.js';

const form = document.getElementById('announcement-form');
const titleInput = document.getElementById('announcement-title');
const bodyInput = document.getElementById('announcement-body');
const errorEl = document.getElementById('announcement-error');
const submitBtn = document.getElementById('announcement-submit');
const cancelBtn = document.getElementById('announcement-cancel-edit');
const listEl = document.getElementById('announcement-list');
const emptyEl = document.getElementById('announcement-empty-hint');

let editingId = null;

function resetForm() {
  editingId = null;
  form.reset();
  submitBtn.textContent = 'Add announcement';
  cancelBtn.hidden = true;
}

export async function loadAnnouncements() {
  const res = await fetch('/api/admin/announcements');
  if (!res.ok) return;
  const { announcements } = await res.json();
  render(announcements);
}

function render(items) {
  listEl.querySelectorAll('.simple-item').forEach((el) => el.remove());
  emptyEl.hidden = items.length > 0;

  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'simple-item';
    div.innerHTML = `
      <div class="simple-item-head">
        <span class="simple-item-title">${escapeHtml(item.title)}</span>
        <div class="simple-item-actions">
          <button class="edit-btn" aria-label="Edit">Edit</button>
          <button class="delete-btn" aria-label="Remove"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>
      <p class="simple-item-body">${escapeHtml(item.body)}</p>
    `;
    div.querySelector('.edit-btn').addEventListener('click', () => {
      editingId = item.id;
      titleInput.value = item.title;
      bodyInput.value = item.body;
      errorEl.hidden = true;
      submitBtn.textContent = 'Save changes';
      cancelBtn.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm(`Remove "${item.title}"?`)) return;
      await del(`/api/admin/announcements/${item.id}`);
      if (editingId === item.id) resetForm();
      loadAnnouncements();
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
    const payload = { title: titleInput.value.trim(), body: bodyInput.value.trim() };
    const url = editingId ? `/api/admin/announcements/${editingId}` : '/api/admin/announcements';
    const { ok, data } = await sendJSON(url, editingId ? 'PUT' : 'POST', payload);

    if (!ok) {
      errorEl.textContent = data.error || 'Could not save announcement.';
      errorEl.hidden = false;
      return;
    }

    resetForm();
    loadAnnouncements();
  } catch {
    errorEl.textContent = 'Could not reach the server. Please try again.';
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingId ? 'Save changes' : 'Add announcement';
  }
});
