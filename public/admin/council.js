import { escapeHtml, sendForm, sendJSON, del } from './api.js';

const form = document.getElementById('council-form');
const photoInput = document.getElementById('council-photo');
const nameInput = document.getElementById('council-name');
const roleInput = document.getElementById('council-role');
const groupInput = document.getElementById('council-group');
const levelInput = document.getElementById('council-level');
const gradeInput = document.getElementById('council-grade');
const errorEl = document.getElementById('council-error');
const submitBtn = document.getElementById('council-submit');
const cancelBtn = document.getElementById('council-cancel-edit');

function bucketOf(item) {
  return `${item.level === 'ms' ? 'ms' : 'hs'}-${item.group === 'general-council' ? 'general-council' : 'student-council'}`;
}

const BUCKETS = ['hs-student-council', 'ms-student-council', 'hs-general-council', 'ms-general-council'].reduce(
  (acc, bucket) => {
    acc[bucket] = { listEl: document.getElementById(`council-list-${bucket}`), emptyEl: document.getElementById(`council-empty-hint-${bucket}`) };
    return acc;
  },
  {}
);

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

// Reordering is driven entirely by pointer events (mousedown/move/up) rather
// than the native HTML5 drag-and-drop API. Native DnD treats things like
// <img> as draggable out of the box, and dropping one anywhere the app
// doesn't explicitly handle falls back to the browser's default action —
// navigating the whole tab to that file. Pointer events never start a native
// drag session at all, so that failure mode can't happen here regardless of
// what a card contains.
function startReorder(handle, bucket, listEl) {
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const div = handle.closest('.simple-item');
    div.classList.add('dragging');

    // Listening on `document` (rather than the handle itself) means tracking
    // survives the handle's own element being reordered in the DOM mid-drag,
    // and doesn't depend on pointer capture succeeding.
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
      await sendJSON('/api/admin/council/reorder', 'PUT', { bucket, orderedIds });
      loadCouncil();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });
}

function render(items) {
  Object.values(BUCKETS).forEach(({ listEl }) => {
    listEl.querySelectorAll('.simple-item').forEach((el) => el.remove());
  });

  const byBucket = { 'hs-student-council': [], 'ms-student-council': [], 'hs-general-council': [], 'ms-general-council': [] };
  items.forEach((item) => {
    byBucket[bucketOf(item)].push(item);
  });

  Object.entries(byBucket).forEach(([bucket, bucketItems]) => {
    const { listEl, emptyEl } = BUCKETS[bucket];
    emptyEl.hidden = bucketItems.length > 0;

    bucketItems.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'simple-item';
      div.dataset.id = item.id;
      div.innerHTML = `
        <div class="simple-item-head">
          <div class="cs-club-item-identity">
            <span class="drag-handle" aria-hidden="true">&#8942;&#8942;</span>
            ${item.photoUrl ? `<img class="cs-club-item-logo" src="${escapeHtml(item.photoUrl)}" alt="" />` : ''}
            <span class="simple-item-title">${escapeHtml(item.name)} · ${escapeHtml(item.role)} · ${escapeHtml(item.grade)}</span>
          </div>
          <div class="simple-item-actions">
            <button class="edit-btn" aria-label="Edit">Edit</button>
            <button class="delete-btn" aria-label="Remove"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </div>
        </div>
      `;
      startReorder(div.querySelector('.drag-handle'), bucket, listEl);
      div.querySelector('.edit-btn').addEventListener('click', () => {
        editingId = item.id;
        nameInput.value = item.name;
        roleInput.value = item.role;
        groupInput.value = item.group === 'general-council' ? 'general-council' : 'student-council';
        levelInput.value = item.level === 'ms' ? 'ms' : 'hs';
        gradeInput.value = item.grade || '';
        photoInput.value = '';
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
  });
}

cancelBtn.addEventListener('click', () => resetForm());

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = editingId ? 'Saving…' : 'Adding…';

  try {
    const formData = new FormData();
    formData.append('name', nameInput.value.trim());
    formData.append('role', roleInput.value.trim());
    formData.append('group', groupInput.value);
    formData.append('level', levelInput.value);
    formData.append('grade', gradeInput.value);
    if (photoInput.files[0]) formData.append('photo', photoInput.files[0]);

    const url = editingId ? `/api/admin/council/${editingId}` : '/api/admin/council';
    const { ok, data } = await sendForm(url, editingId ? 'PUT' : 'POST', formData);

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
