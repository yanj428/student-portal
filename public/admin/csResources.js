import { escapeHtml, getJSON, ITEM_ACTIONS_HTML, renderRows } from './api.js';
import { crudPanel } from './crud.js';
import { enableReorder } from './reorder.js';

const titleInput = document.getElementById('cs-resource-title');
const urlInput = document.getElementById('cs-resource-url');
const listEl = document.getElementById('cs-resource-list');
const emptyEl = document.getElementById('cs-resource-empty-hint');

const panel = crudPanel({
  form: document.getElementById('cs-resource-form'),
  submitBtn: document.getElementById('cs-resource-submit'),
  cancelBtn: document.getElementById('cs-resource-cancel-edit'),
  errorEl: document.getElementById('cs-resource-error'),
  endpoint: '/api/admin/cs-resources',
  addLabel: 'Add resource',
  saveError: 'Could not save this resource.',
  readPayload: () => ({ title: titleInput.value.trim(), url: urlInput.value.trim() }),
  fill: (item) => {
    titleInput.value = item.title;
    urlInput.value = item.url;
  },
  reload: () => loadCsResources(),
});

export async function loadCsResources() {
  const data = await getJSON('/api/admin/cs-resources');
  if (!data) return;

  renderRows(listEl, emptyEl, data.resources, (div, item) => {
    div.innerHTML = `
      <div class="simple-item-head">
        <div class="item-identity">
          <span class="drag-handle" aria-hidden="true">&#8942;&#8942;</span>
          <span class="simple-item-title">${escapeHtml(item.title)}</span>
        </div>
        ${ITEM_ACTIONS_HTML}
      </div>
      <p class="simple-item-body">${escapeHtml(item.url)}</p>
    `;
    enableReorder(div.querySelector('.drag-handle'), listEl, { url: '/api/admin/cs-resources/reorder', reload: loadCsResources });
    panel.bindRow(div, item, `Remove "${item.title}"?`);
  });
}