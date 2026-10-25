import { escapeHtml, getJSON, ITEM_ACTIONS_HTML, renderRows } from './api.js';
import { crudPanel } from './crud.js';
import { attachPhotoCropper } from './photoCrop.js';
import { enableReorder } from './reorder.js';

const labelInput = document.getElementById('quicklink-label');
const urlInput = document.getElementById('quicklink-url');
const logoInput = document.getElementById('quicklink-logo');
const removeLogoRow = document.getElementById('quicklink-remove-logo-row');
const removeLogoInput = document.getElementById('quicklink-remove-logo');
const listEl = document.getElementById('quicklink-list');
const emptyEl = document.getElementById('quicklink-empty-hint');

attachPhotoCropper(logoInput);

const panel = crudPanel({
  form: document.getElementById('quicklink-form'),
  submitBtn: document.getElementById('quicklink-submit'),
  cancelBtn: document.getElementById('quicklink-cancel-edit'),
  errorEl: document.getElementById('quicklink-error'),
  endpoint: '/api/admin/quick-links',
  addLabel: 'Add link',
  saveError: 'Could not save quick link.',
  readPayload: () => {
    const formData = new FormData();
    formData.append('label', labelInput.value.trim());
    formData.append('url', urlInput.value.trim());
    if (logoInput.files[0]) formData.append('logo', logoInput.files[0]);
    if (removeLogoInput.checked) formData.append('removeLogo', 'true');
    return formData;
  },
  fill: (item) => {
    labelInput.value = item.label;
    urlInput.value = item.url;
    logoInput.value = '';
    removeLogoInput.checked = false;
    removeLogoRow.hidden = !item.logoUrl;
  },
  onReset: () => {
    removeLogoRow.hidden = true;
  },
  reload: () => loadQuickLinks(),
});

export async function loadQuickLinks() {
  const data = await getJSON('/api/admin/quick-links');
  if (!data) return;

  renderRows(listEl, emptyEl, data.quickLinks, (div, item) => {
    div.innerHTML = `
      <div class="simple-item-head">
        <div class="item-identity">
          <span class="drag-handle" aria-hidden="true">&#8942;&#8942;</span>
          ${item.logoUrl ? `<img class="item-logo" src="${escapeHtml(item.logoUrl)}" alt="" />` : ''}
          <span class="simple-item-title">${escapeHtml(item.label)}</span>
        </div>
        ${ITEM_ACTIONS_HTML}
      </div>
      <p class="simple-item-body">${escapeHtml(item.url)}</p>
    `;
    enableReorder(div.querySelector('.drag-handle'), listEl, { url: '/api/admin/quick-links/reorder', reload: loadQuickLinks });
    panel.bindRow(div, item, `Remove "${item.label}"?`);
  });
}
