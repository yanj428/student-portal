import { escapeHtml, sendJSON, del } from './api.js';

const form = document.getElementById('project-form');
const titleInput = document.getElementById('project-title');
const descriptionInput = document.getElementById('project-description');
const leadInput = document.getElementById('project-lead');
const statusInput = document.getElementById('project-status');
const percentInput = document.getElementById('project-percent');
const errorEl = document.getElementById('project-error');
const submitBtn = document.getElementById('project-submit');
const cancelBtn = document.getElementById('project-cancel-edit');
const listEl = document.getElementById('project-list');
const emptyEl = document.getElementById('project-empty-hint');

let editingId = null;

function resetForm() {
  editingId = null;
  form.reset();
  submitBtn.textContent = 'Add project';
  cancelBtn.hidden = true;
}

export async function loadProjects() {
  const res = await fetch('/api/admin/projects');
  if (!res.ok) return;
  const { projects } = await res.json();
  render(projects);
}

function render(items) {
  listEl.querySelectorAll('.simple-item').forEach((el) => el.remove());
  emptyEl.hidden = items.length > 0;

  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'simple-item';
    div.innerHTML = `
      <div class="simple-item-head">
        <span class="simple-item-title">${escapeHtml(item.title)} — ${item.percent}% (${escapeHtml(item.status)})</span>
        <div class="simple-item-actions">
          <button class="edit-btn" aria-label="Edit">Edit</button>
          <button class="delete-btn" aria-label="Remove"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>
      <p class="simple-item-body">${escapeHtml(item.lead)} — ${escapeHtml(item.description)}</p>
    `;
    div.querySelector('.edit-btn').addEventListener('click', () => {
      editingId = item.id;
      titleInput.value = item.title;
      descriptionInput.value = item.description;
      leadInput.value = item.lead;
      statusInput.value = item.status;
      percentInput.value = item.percent;
      errorEl.hidden = true;
      submitBtn.textContent = 'Save changes';
      cancelBtn.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm(`Remove "${item.title}"?`)) return;
      await del(`/api/admin/projects/${item.id}`);
      if (editingId === item.id) resetForm();
      loadProjects();
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
      title: titleInput.value.trim(),
      description: descriptionInput.value.trim(),
      lead: leadInput.value.trim(),
      status: statusInput.value,
      percent: Number(percentInput.value),
    };
    const url = editingId ? `/api/admin/projects/${editingId}` : '/api/admin/projects';
    const { ok, data } = await sendJSON(url, editingId ? 'PUT' : 'POST', payload);

    if (!ok) {
      errorEl.textContent = data.error || 'Could not save project.';
      errorEl.hidden = false;
      return;
    }

    resetForm();
    loadProjects();
  } catch {
    errorEl.textContent = 'Could not reach the server. Please try again.';
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingId ? 'Save changes' : 'Add project';
  }
});
