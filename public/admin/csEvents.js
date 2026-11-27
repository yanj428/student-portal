import { escapeHtml, getJSON, sendJSON, ITEM_ACTIONS_HTML, renderRows } from './api.js';
import { crudPanel } from './crud.js';

// Community service events. Events posted here are StuCo's own (shown as hosted
// by the Student Council); club leaders' events show in the same list, where
// admins can see who registered and remove them, but edit them only from My
// Club Events on the student site.

const titleInput = document.getElementById('cs-event-title');
const dayInput = document.getElementById('cs-event-day');
const timeInput = document.getElementById('cs-event-time');
const locationInput = document.getElementById('cs-event-location');
const spotsInput = document.getElementById('cs-event-spots');
const openInput = document.getElementById('cs-event-open');
const signupInput = document.getElementById('cs-event-signup');
const descriptionInput = document.getElementById('cs-event-description');
const imagesEl = document.getElementById('cs-event-images');
const imageInput = document.getElementById('cs-event-image-input');
const addImagesBtn = document.getElementById('cs-event-add-images');
const errorEl = document.getElementById('cs-event-error');
const listEl = document.getElementById('cs-event-admin-list');
const emptyEl = document.getElementById('cs-event-empty-hint');

// ---- Pictures --------------------------------------------------------------
// Pictures already on the event being edited, and new ones chosen but not sent
// yet (they upload once the event itself is saved).
const IMAGES_MAX = 4;
let editingEvent = null;
let savedImages = [];
let pending = [];

function renderImages() {
  imagesEl.innerHTML = [
    ...savedImages.map((img) => `<div class="thumb"><img src="${escapeHtml(img.url)}" alt="" /><button type="button" data-remove-image="${escapeHtml(img.url)}" aria-label="Remove picture">&times;</button></div>`),
    ...pending.map((p, i) => `<div class="thumb"><img src="${p.preview}" alt="" /><button type="button" data-remove-pending="${i}" aria-label="Remove ${escapeHtml(p.file.name)}">&times;</button></div>`),
  ].join('');
  addImagesBtn.hidden = savedImages.length + pending.length >= IMAGES_MAX;
}

function clearPending() {
  pending = [];
}

imageInput.addEventListener('change', async () => {
  const files = [...imageInput.files];
  imageInput.value = '';
  for (const file of files) {
    if (savedImages.length + pending.length < IMAGES_MAX) pending.push({ file, preview: await window.previewOf(file) });
  }
  renderImages();
});

imagesEl.addEventListener('click', async (e) => {
  const pendingIndex = e.target.closest('[data-remove-pending]')?.dataset.removePending;
  const savedUrl = e.target.closest('[data-remove-image]')?.dataset.removeImage;
  if (pendingIndex !== undefined) {
    pending.splice(Number(pendingIndex), 1);
    renderImages();
  }
  if (savedUrl && editingEvent && confirm('Remove this picture from the event?')) {
    const { ok, data } = await sendJSON(`/api/admin/cs-events/${encodeURIComponent(editingEvent.id)}/images`, 'DELETE', { url: savedUrl });
    if (!ok) return alert(data.error || 'Could not remove the picture.');
    savedImages = data.event.images;
    renderImages();
    loadCsEvents();
  }
});

// Sends the chosen pictures one at a time, shrunk first (shrinkPhoto comes from
// hours-shared.js, which the admin page also loads).
async function uploadImages(eventId, files) {
  for (const p of files) {
    const body = new FormData();
    body.append('image', await window.shrinkPhoto(p.file));
    const res = await fetch(`/api/admin/cs-events/${encodeURIComponent(eventId)}/images`, { method: 'POST', body });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(`${p.file.name}: ${data.error || 'could not upload.'}`);
    }
  }
}

// ---- The form -------------------------------------------------------------
const panel = crudPanel({
  form: document.getElementById('cs-event-form'),
  submitBtn: document.getElementById('cs-event-submit'),
  cancelBtn: document.getElementById('cs-event-cancel-edit'),
  errorEl,
  endpoint: '/api/admin/cs-events',
  addLabel: 'Post event',
  saveError: 'Could not post event.',
  readPayload: () => ({
    title: titleInput.value.trim(),
    eventDay: dayInput.value,
    eventTime: timeInput.value.trim(),
    location: locationInput.value.trim(),
    spots: spotsInput.value.trim() === '' ? null : Number(spotsInput.value),
    description: descriptionInput.value.trim(),
    signupUrl: signupInput.value.trim(),
    registrationOpen: openInput.checked,
  }),
  fill: (event) => {
    editingEvent = event;
    titleInput.value = event.title;
    // An older event with only a typed date needs a real one picked when edited.
    dayInput.value = event.eventDay;
    timeInput.value = event.eventTime;
    locationInput.value = event.location;
    spotsInput.value = event.spots || '';
    openInput.checked = event.registrationOpen;
    descriptionInput.value = event.description;
    signupInput.value = event.signupUrl || '';
    savedImages = event.images;
    clearPending();
    renderImages();
  },
  onSaved: (data) => {
    // The form resets straight after this, so the chosen pictures are taken now.
    const files = pending;
    pending = [];
    if (!files.length) return;
    uploadImages(data.event.id, files)
      .catch((err) => alert(`The event was saved, but a picture was not: ${err.message}`))
      .finally(() => loadCsEvents());
  },
  onReset: () => {
    openInput.checked = true;
    editingEvent = null;
    savedImages = [];
    clearPending();
    renderImages();
  },
  reload: () => loadCsEvents(),
});

export async function loadCsEvents() {
  const data = await getJSON('/api/admin/cs-events');
  if (!data) return;

  renderRows(listEl, emptyEl, data.events, (div, event) => {
    const byLeader = event.postedBy === 'leader';
    div.innerHTML = `
      <div class="simple-item-head">
        <span class="simple-item-title">${escapeHtml(event.title)}</span>
        ${ITEM_ACTIONS_HTML}
      </div>
      <div class="item-meta">
        <span>${event.clubLogoUrl ? `<img class="club-chip-logo" src="${escapeHtml(event.clubLogoUrl)}" alt="" />` : ''}${escapeHtml(event.club)} &middot; ${escapeHtml([event.eventDate, event.eventTime, event.location].filter(Boolean).join(' · '))}</span>
        ${event.signupUrl ? `<a href="${escapeHtml(event.signupUrl)}" target="_blank" rel="noopener">Sign-up link</a>` : ''}
      </div>
      <p class="simple-item-body">${escapeHtml(event.description)}</p>
      ${event.images.length ? `<div class="cs-event-thumbs">${event.images.map((img) => `<a href="${escapeHtml(img.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(img.url)}" alt="" /></a>`).join('')}</div>` : ''}
      <div class="item-meta">
        <span>${event.spots ? `${event.registeredCount} of ${event.spots} spots taken` : `${event.registeredCount} registered`}${byLeader ? ' &middot; posted by a club leader (they edit it from My Club Events)' : ''}</span>
        ${event.registeredCount ? `<button type="button" class="btn ghost cs-event-regs-btn">See who registered</button>` : ''}
      </div>
      <ol class="cs-event-regs" hidden></ol>
    `;
    const regsBtn = div.querySelector('.cs-event-regs-btn');
    if (regsBtn) {
      regsBtn.addEventListener('click', async () => {
        const list = div.querySelector('.cs-event-regs');
        if (!list.hidden) {
          list.hidden = true;
          regsBtn.textContent = 'See who registered';
          return;
        }
        const regs = await getJSON(`/api/admin/cs-events/${encodeURIComponent(event.id)}/registrations`);
        if (!regs) return;
        list.innerHTML = regs.registrations.map((r) => `<li><strong>${escapeHtml(r.name)}</strong> ${escapeHtml(r.grade)} &middot; ${escapeHtml(r.email)}</li>`).join('');
        list.hidden = false;
        regsBtn.textContent = 'Hide list';
      });
    }
    panel.bindRow(div, event, `Remove "${event.title}" from the Community Service page?${event.registeredCount ? ` ${event.registeredCount} registered students will lose their spot.` : ''}`);
    // A club leader's event has a real date, time and spots that this form does not have.
    if (byLeader) div.querySelector('.edit-btn').hidden = true;
  });
}
