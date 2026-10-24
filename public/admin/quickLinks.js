import { escapeHtml, getJSON, ITEM_ACTIONS_HTML } from './api.js';
import { crudPanel } from './crud.js';
import { enableReorder } from './reorder.js';

const labelInput = document.getElementById('quicklink-label');
const urlInput = document.getElementById('quicklink-url');
const listEl = document.getElementById('quicklink-list');
const emptyEl = document.getElementById('quicklink-empty-hint');

const panel = crudPanel({
  form: document.getElementById('quicklink-form'),
  submitBtn: document.getElementById('quicklink-submit'),
  cancelBtn: document.getElementById('quicklink-cancel-edit'),
  errorEl: document.getElementById('quicklink-error'),
  endpoint: '/api/admin/quick-links',
  addLabel: 'Add link',
  saveError: 'Could not save quick link.',
  readPayload: () => ({ label: labelInput.value.trim(), url: urlInput.value.trim() }),
  fill: (item) => {
    labelInput.value = item.label;
    urlInput.value = item.url;
  },
  reload: () => loadQuickLinks(),
});

export async function loadQuickLinks() {
  const data = await getJSON('/api/admin/quick-links');
  if (!data) return;

  listEl.querySelectorAll('.simple-item').forEach((el) => el.remove());
  emptyEl.hidden = data.quickLinks.length > 0;

  data.quickLinks.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'simple-item';
    div.dataset.id = item.id;
    div.innerHTML = `
      <div class="simple-item-head">
        <div class="item-identity">
          <span class="drag-handle" aria-hidden="true">&#8942;&#8942;</span>
          <span class="simple-item-title">${escapeHtml(item.label)}</span>
        </div>
        ${ITEM_ACTIONS_HTML}
      </div>
      <p class="simple-item-body">${escapeHtml(item.url)}</p>
    `;
    enableReorder(div.querySelector('.drag-handle'), listEl, { url: '/api/admin/quick-links/reorder', reload: loadQuickLinks });
    panel.bindRow(div, item, `Remove "${item.label}"?`);
    listEl.appendChild(div);
  });
}
