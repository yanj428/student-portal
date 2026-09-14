import { escapeHtml, sendJSON, del } from './api.js';

const form = document.getElementById('council-form');
const initialsInput = document.getElementById('council-initials');
const nameInput = document.getElementById('council-name');
const roleInput = document.getElementById('council-role');
const bioInput = document.getElementById('council-bio');
const errorEl = document.getElementById('council-error');
const submitBtn = document.getElementById('council-submit');
const cancelBtn = document.getElementById('council-cancel-edit');
const listEl = document.getElementById('council-list');
const emptyEl = document.getElementById('council-empty-hint');

let editingId = null;

function resetForm() {
  editingId = null;
  form.reset();
  submitBtn.textContent = 'Add member';
  cancelBtn.hidden = true;
}

export async function loadCouncil() {
  const res = await fetch('/api/admin/council');
  if (!res.ok) return;
  const { council } = await res.json();
  render(council);
}

function render(items) {
  listEl.querySelectorAll('.simple-item').forEach((el) => el.remove());
  emptyEl.hidden = items.length > 0;

  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'simple-item';
    div.innerHTML = `
      <div class="simple-item-head">
        <span class="simple-item-title">${escapeHtml(item.initials)} — ${escapeHtml(item.name)} · ${escapeHtml(item.role)}</span>
        <div class="simple-item-actions">
          <button class="edit-btn" aria-label="Edit">Edit</button>
          <button class="delete-btn" aria-label="Remove"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>
      <p class="simple-item-body">${escapeHtml(item.bio)}</p>
    `;
    div.querySelector('.edit-btn').addEventListener('click', () => {
      editingId = item.id;
      initialsInput.value = item.initials;
      nameInput.value = item.name;
      roleInput.value = item.role;
      bioInput.value = item.bio;
      errorEl.hidden = true;
      submitBtn.textContent = 'Save changes';
      cancelBtn.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm(`Remove "${item.name}"?`)) return;
      await del(`/api/admin/council/${item.id}`);
      if (editingId === item.id) resetForm();
      loadCouncil();
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
      initials: initialsInput.value.trim(),
      name: nameInput.value.trim(),
      role: roleInput.value.trim(),
      bio: bioInput.value.trim(),
    };
    const url = editingId ? `/api/admin/council/${editingId}` : '/api/admin/council';
    const { ok, data } = await sendJSON(url, editingId ? 'PUT' : 'POST', payload);

    if (!ok) {
      errorEl.textContent = data.error || 'Could not save council member.';
      errorEl.hidden = false;
      return;
    }

    resetForm();
    loadCouncil();
  } catch {
    errorEl.textContent = 'Could not reach the server. Please try again.';
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingId ? 'Save changes' : 'Add member';
  }
});
