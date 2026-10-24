import { escapeHtml, getJSON, ITEM_ACTIONS_HTML } from './api.js';
import { crudPanel } from './crud.js';
import { enableReorder } from './reorder.js';

const photoInput = document.getElementById('council-photo');
const removePhotoRow = document.getElementById('council-remove-photo-row');
const removePhotoInput = document.getElementById('council-remove-photo');
const nameInput = document.getElementById('council-name');
const roleInput = document.getElementById('council-role');
const groupInput = document.getElementById('council-group');
const levelInput = document.getElementById('council-level');
const gradeInput = document.getElementById('council-grade');

// Four lists: school level (HS/MS) crossed with council (Student/General).
// The key matches the server's bucket key used for reordering.
const BUCKETS = Object.fromEntries(
  ['hs-student-council', 'ms-student-council', 'hs-general-council', 'ms-general-council'].map((bucket) => [
    bucket,
    { listEl: document.getElementById(`council-list-${bucket}`), emptyEl: document.getElementById(`council-empty-hint-${bucket}`) },
  ])
);

const panel = crudPanel({
  form: document.getElementById('council-form'),
  submitBtn: document.getElementById('council-submit'),
  cancelBtn: document.getElementById('council-cancel-edit'),
  errorEl: document.getElementById('council-error'),
  endpoint: '/api/admin/council',
  addLabel: 'Add member',
  saveError: 'Could not save council member.',
  readPayload: () => {
    const formData = new FormData();
    formData.append('name', nameInput.value.trim());
    formData.append('role', roleInput.value.trim());
    formData.append('group', groupInput.value);
    formData.append('level', levelInput.value);
    formData.append('grade', gradeInput.value);
    if (photoInput.files[0]) formData.append('photo', photoInput.files[0]);
    if (removePhotoInput.checked) formData.append('removePhoto', 'true');
    return formData;
  },
  fill: (item) => {
    nameInput.value = item.name;
    roleInput.value = item.role;
    groupInput.value = item.group;
    levelInput.value = item.level;
    gradeInput.value = item.grade;
    photoInput.value = '';
    removePhotoInput.checked = false;
    removePhotoRow.hidden = !item.photoUrl;
  },
  onReset: () => {
    removePhotoRow.hidden = true;
  },
  reload: () => loadCouncil(),
});

export async function loadCouncil() {
  const data = await getJSON('/api/admin/council');
  if (!data) return;

  Object.entries(BUCKETS).forEach(([bucket, { listEl, emptyEl }]) => {
    listEl.querySelectorAll('.simple-item').forEach((el) => el.remove());
    const members = data.council.filter((m) => `${m.level}-${m.group}` === bucket);
    emptyEl.hidden = members.length > 0;

    members.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'simple-item';
      div.dataset.id = item.id;
      div.innerHTML = `
        <div class="simple-item-head">
          <div class="item-identity">
            <span class="drag-handle" aria-hidden="true">&#8942;&#8942;</span>
            ${item.photoUrl ? `<img class="item-logo" src="${escapeHtml(item.photoUrl)}" alt="" />` : ''}
            <span class="simple-item-title">${escapeHtml(item.name)} · ${escapeHtml(item.role)} · ${escapeHtml(item.grade)}</span>
          </div>
          ${ITEM_ACTIONS_HTML}
        </div>
      `;
      enableReorder(div.querySelector('.drag-handle'), listEl, { url: '/api/admin/council/reorder', extraBody: { bucket }, reload: loadCouncil });
      panel.bindRow(div, item, `Remove "${item.name}"?`);
      listEl.appendChild(div);
    });
  });
}
