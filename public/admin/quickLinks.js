import { escapeHtml, getJSON, TRASH_ICON, renderRows } from './api.js';
import { crudPanel } from './crud.js';
import { attachPhotoCropper } from './photoCrop.js';
import { enableReorder } from './reorder.js';

const labelInput = document.getElementById('quicklink-label');
const urlInput = document.getElementById('quicklink-url');
const logoInput = document.getElementById('quicklink-logo');
const removeLogoRow = document.getElementById('quicklink-remove-logo-row');
const removeLogoInput = document.getElementById('quicklink-remove-logo');
const previewEl = document.getElementById('quicklink-preview');
const listEl = document.getElementById('quicklink-list');
const emptyEl = document.getElementById('quicklink-empty-hint');

attachPhotoCropper(logoInput);

// "https://sites.google.com/kpis.ac.th/x" -> "sites.google.com"
function siteOf(url) {
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// The same tile the list shows, so what the form previews is what students get.
function tileHtml({ label, url, logoUrl }) {
  const site = siteOf(url);
  const name = label || site || 'Link name';
  return `
    <div class="ql-logo">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="" />` : escapeHtml(name.trim().charAt(0).toUpperCase() || '?')}</div>
    <b class="ql-name">${escapeHtml(name)}</b>
    <small class="ql-site">${escapeHtml(site || 'address')}</small>`;
}

// What the logo box in the preview shows: a picture chosen now, else the one already saved.
let savedLogoUrl = '';
let chosenLogoUrl = '';
function updatePreview() {
  const logoUrl = removeLogoInput.checked ? '' : chosenLogoUrl || savedLogoUrl;
  previewEl.innerHTML = tileHtml({ label: labelInput.value.trim(), url: urlInput.value.trim(), logoUrl });
  labelInput.placeholder = siteOf(urlInput.value.trim()) || 'e.g. Student Email';
}
[labelInput, urlInput, removeLogoInput].forEach((el) => el.addEventListener('input', updatePreview));
logoInput.addEventListener('change', () => {
  if (chosenLogoUrl) URL.revokeObjectURL(chosenLogoUrl);
  chosenLogoUrl = logoInput.files[0] ? URL.createObjectURL(logoInput.files[0]) : '';
  updatePreview();
});
updatePreview();

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
    savedLogoUrl = item.logoUrl || '';
    chosenLogoUrl = '';
    updatePreview();
  },
  onReset: () => {
    removeLogoRow.hidden = true;
    savedLogoUrl = '';
    chosenLogoUrl = '';
    updatePreview();
  },
  reload: () => loadQuickLinks(),
});

export async function loadQuickLinks() {
  const data = await getJSON('/api/admin/quick-links');
  if (!data) return;

  renderRows(listEl, emptyEl, data.quickLinks, (div, item) => {
    div.classList.add('ql-tile');
    div.innerHTML = `
      <span class="drag-handle ql-grip" aria-label="Drag to change the order" title="Drag to change the order">&#8942;&#8942;</span>
      <div class="ql-actions">
        <a class="ql-open" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open the link" title="Open the link">&#8599;</a>
        <button class="edit-btn" aria-label="Edit">Edit</button>
        <button class="delete-btn" aria-label="Remove">${TRASH_ICON}</button>
      </div>
      ${tileHtml(item)}
    `;
    enableReorder(div.querySelector('.drag-handle'), listEl, { url: '/api/admin/quick-links/reorder', reload: loadQuickLinks, grid: true });
    panel.bindRow(div, item, `Remove "${item.label}"?`);
  });
}
