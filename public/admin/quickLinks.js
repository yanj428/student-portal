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

function getDragAfterElement(container, y) {
  const items = [...container.querySelectorAll('.simple-item:not(.dragging)')];
  return items.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

// Pointer-based (not native HTML5 drag-and-drop) reordering - see the same
// pattern in admin/council.js for why: native DnD treats things dragged out
// of a row as draggable by default, and dropping one anywhere unhandled
// falls back to the browser navigating the tab to that content. Pointer
// events never start a native drag session, so that can't happen here.
function startReorder(handle) {
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const div = handle.closest('.simple-item');
    div.classList.add('dragging');

    const onMove = (moveEvent) => {
      const afterElement = getDragAfterElement(listEl, moveEvent.clientY);
      if (afterElement == null) listEl.appendChild(div);
      else listEl.insertBefore(div, afterElement);
    };

    const onUp = async () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      div.classList.remove('dragging');
      const orderedIds = [...listEl.querySelectorAll('.simple-item')].map((el) => el.dataset.id);
      await sendJSON('/api/admin/quick-links/reorder', 'PUT', { orderedIds });
      loadQuickLinks();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });
}

function render(items) {
  listEl.querySelectorAll('.simple-item').forEach((el) => el.remove());
  emptyEl.hidden = items.length > 0;

  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'simple-item';
    div.dataset.id = item.id;
    div.innerHTML = `
      <div class="simple-item-head">
        <div class="cs-club-item-identity">
          <span class="drag-handle" aria-hidden="true">&#8942;&#8942;</span>
          <span class="simple-item-title">${escapeHtml(item.label)}</span>
        </div>
        <div class="simple-item-actions">
          <button class="edit-btn" aria-label="Edit">Edit</button>
          <button class="delete-btn" aria-label="Remove"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>
      <p class="simple-item-body">${escapeHtml(item.url)}</p>
    `;
    startReorder(div.querySelector('.drag-handle'));
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
