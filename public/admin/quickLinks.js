import { escapeHtml, sendJSON, del } from './api.js';

const form = document.getElementById('quicklink-form');
const labelInput = document.getElementById('quicklink-label');
const urlInput = document.getElementById('quicklink-url');
const errorEl = document.getElementById('quicklink-error');
const submitBtn = document.getElementById('quicklink-submit');
const cancelBtn = document.getElementById('quicklink-cancel-edit');
const listEl = document.getElementById('quicklink-list');
const emptyEl = document.getElementById('quicklink-empty-hint');

let editingId = null;

function resetForm() {
  editingId = null;
  form.reset();
  submitBtn.textContent = 'Add link';
  cancelBtn.hidden = true;
}

export async function loadQuickLinks() {
  const res = await fetch('/api/admin/quick-links');
  if (!res.ok) return;
  const { quickLinks } = await res.json();
  render(quickLinks);
}

function render(items) {
  listEl.querySelectorAll('.simple-item').forEach((el) => el.remove());
  emptyEl.hidden = items.length > 0;

  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'simple-item';
    div.innerHTML = `
      <div class="simple-item-head">
        <span class="simple-item-title">${escapeHtml(item.label)}</span>
        <div class="simple-item-actions">
          <button class="edit-btn" aria-label="Edit">Edit</button>
          <button class="delete-btn" aria-label="Remove"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>
      <p class="simple-item-body">${escapeHtml(item.url)}</p>
    `;
    div.querySelector('.edit-btn').addEventListener('click', () => {
      editingId = item.id;
      labelInput.value = item.label;
      urlInput.value = item.url;
      errorEl.hidden = true;
      submitBtn.textContent = 'Save changes';
      cancelBtn.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm(`Remove "${item.label}"?`)) return;
      await del(`/api/admin/quick-links/${item.id}`);
      if (editingId === item.id) resetForm();
      loadQuickLinks();
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
    const payload = { label: labelInput.value.trim(), url: urlInput.value.trim() };
    const url = editingId ? `/api/admin/quick-links/${editingId}` : '/api/admin/quick-links';
    const { ok, data } = await sendJSON(url, editingId ? 'PUT' : 'POST', payload);

    if (!ok) {
      errorEl.textContent = data.error || 'Could not save quick link.';
      errorEl.hidden = false;
      return;
    }

    resetForm();
    loadQuickLinks();
  } catch {
    errorEl.textContent = 'Could not reach the server. Please try again.';
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingId ? 'Save changes' : 'Add link';
  }
});
