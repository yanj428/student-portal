// My Club Events: a club leader posts, edits and removes their club's community
// service events, and sees who registered for each.

const ce = {
  form: document.getElementById('ce-form'),
  formTitle: document.getElementById('ce-form-title'),
  club: document.getElementById('ce-club'),
  title: document.getElementById('ce-title'),
  day: document.getElementById('ce-day'),
  time: document.getElementById('ce-time'),
  location: document.getElementById('ce-location'),
  spots: document.getElementById('ce-spots'),
  description: document.getElementById('ce-description'),
  signup: document.getElementById('ce-signup'),
  open: document.getElementById('ce-open'),
  error: document.getElementById('ce-error'),
  cancel: document.getElementById('ce-cancel'),
  submit: document.getElementById('ce-submit'),
  images: document.getElementById('ce-images'),
  imageInput: document.getElementById('ce-image-input'),
  addImages: document.getElementById('ce-add-images'),
  upcoming: document.getElementById('ce-upcoming'),
  upcomingEmpty: document.getElementById('ce-upcoming-empty'),
  past: document.getElementById('ce-past'),
  pastEmpty: document.getElementById('ce-past-empty'),
};

let ceEvents = [];
let ceToday = '';
let ceEditingId = null;
const CE_IMAGES_MAX = 4;
// Pictures already on the event being edited, and new ones chosen but not
// uploaded yet (they are sent once the event itself is saved).
let ceSavedImages = [];
let cePending = [];

function renderImages() {
  ce.images.innerHTML = [
    ...ceSavedImages.map((img) => `<div class="sr-file"><img src="${escapeHtml(img.url)}" alt="" /><button type="button" class="sr-remove" data-remove-image="${escapeHtml(img.url)}" aria-label="Remove picture">&times;</button></div>`),
    ...cePending.map((p, i) => `<div class="sr-file"><img src="${p.preview}" alt="" /><span class="sr-file-name">${escapeHtml(p.file.name)}</span><button type="button" class="sr-remove" data-remove-pending="${i}" aria-label="Remove ${escapeHtml(p.file.name)}">&times;</button></div>`),
  ].join('');
  ce.addImages.hidden = ceSavedImages.length + cePending.length >= CE_IMAGES_MAX;
}

ce.imageInput.addEventListener('change', async () => {
  const files = [...ce.imageInput.files];
  ce.imageInput.value = '';
  for (const file of files) {
    if (ceSavedImages.length + cePending.length < CE_IMAGES_MAX) cePending.push({ file, preview: await previewOf(file) });
  }
  renderImages();
});

ce.images.addEventListener('click', async (e) => {
  const pending = e.target.closest('[data-remove-pending]')?.dataset.removePending;
  const saved = e.target.closest('[data-remove-image]')?.dataset.removeImage;
  if (pending !== undefined) {
    cePending.splice(Number(pending), 1);
    renderImages();
  }
  if (saved && confirm('Remove this picture from the event?')) {
    const { ok, data } = await sendHoursJson(`/api/club-events/${encodeURIComponent(ceEditingId)}/images`, 'DELETE', { url: saved });
    if (!ok) return alert(data.error || 'Could not remove the picture.');
    ceSavedImages = data.event.images;
    renderImages();
    loadClubEvents();
  }
});

// Sends the chosen pictures one at a time, shrunk first like report photos.
async function uploadPending(eventId) {
  for (const p of cePending) {
    const body = new FormData();
    body.append('image', await shrinkPhoto(p.file));
    const res = await fetch(`/api/club-events/${encodeURIComponent(eventId)}/images`, { method: 'POST', body });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(`${p.file.name}: ${data.error || 'could not upload.'}`);
    }
  }
}
// Events whose registration list is open.
const ceOpen = new Set();

function showCeError(message) {
  ce.error.textContent = message;
  ce.error.hidden = !message;
}

function resetForm() {
  ceEditingId = null;
  ce.form.reset();
  ce.open.checked = true;
  if (ceToday) ce.day.min = ceToday;
  ce.formTitle.innerHTML = '<span>+</span>Post an event';
  ce.submit.textContent = 'Post event';
  ce.cancel.hidden = true;
  cePending = [];
  ceSavedImages = [];
  renderImages();
  showCeError('');
}
ce.cancel.addEventListener('click', resetForm);

function editEvent(event) {
  ceEditingId = event.id;
  ce.club.value = event.clubId;
  ce.title.value = event.title;
  ce.day.min = '';
  ce.day.value = event.eventDay;
  ce.time.value = event.eventTime;
  ce.location.value = event.location;
  ce.spots.value = event.spots || '';
  ce.description.value = event.description;
  ce.signup.value = event.signupUrl;
  ce.open.checked = event.registrationOpen;
  ceSavedImages = event.images;
  cePending = [];
  renderImages();
  ce.formTitle.innerHTML = '<span>&#9998;</span>Edit event';
  ce.submit.textContent = 'Save changes';
  ce.cancel.hidden = false;
  showCeError('');
  ce.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function registrationsHtml(event) {
  if (!ceOpen.has(event.id)) return '';
  if (!event.registrations.length) return '<p class="sh-empty-line">Nobody has registered yet.</p>';
  return `
    <ol class="ce-registrants">${event.registrations
      .map((r) => `<li><strong>${escapeHtml(r.name)}</strong> <span>${escapeHtml(r.grade)} &middot; ${escapeHtml(r.email)}</span></li>`)
      .join('')}</ol>
    <button type="button" class="hrs-link" data-copy="${escapeHtml(event.id)}">Copy all emails</button>`;
}

function eventHtml(event) {
  const when = [event.eventDate, event.eventTime, event.location].filter(Boolean).map(escapeHtml).join(' &middot; ');
  const spots = event.spots ? `${event.registeredCount} of ${event.spots} spots taken` : `${event.registeredCount} registered`;
  const state = event.closedReason ? `<span class="hrs-status status-rejected">${escapeHtml(event.closedReason.replace(/\.$/, ''))}</span>` : '<span class="hrs-status status-approved">Open</span>';
  const open = ceOpen.has(event.id);
  return `
    <article class="ce-event">
      <div class="ce-event-top">
        ${event.clubLogoUrl ? `<img class="ce-event-logo" src="${escapeHtml(event.clubLogoUrl)}" alt="${escapeHtml(event.club)} logo" />` : ''}
        <div class="ce-event-main">
          <p class="ce-event-title">${escapeHtml(event.title)}</p>
          <p class="sh-review-sub">${escapeHtml(event.club)}${when ? ` &middot; ${when}` : ''}</p>
          <p class="sh-review-sub">${escapeHtml(spots)}${event.postedBy === 'admin' ? ' &middot; posted by StuCo' : ''}</p>
        </div>
        ${state}
      </div>
      <div class="ce-event-actions">
        <button type="button" class="hrs-link" data-regs="${escapeHtml(event.id)}" aria-expanded="${open}">${open ? 'Hide' : 'See'} registrations (${event.registeredCount})</button>
        ${event.eventDay ? `<button type="button" class="hrs-link" data-edit="${escapeHtml(event.id)}">Edit</button>` : '<span class="sh-review-sub">Posted by StuCo with a typed date; ask StuCo to change it.</span>'}
        <button type="button" class="hrs-link danger" data-remove="${escapeHtml(event.id)}">Remove</button>
      </div>
      ${event.images.length ? `<div class="ce-event-images">${event.images.map((img) => `<a href="${escapeHtml(img.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(img.url)}" alt="" /></a>`).join('')}</div>` : ''}
      ${registrationsHtml(event)}
    </article>`;
}

function renderCeEvents() {
  const isPast = (e) => e.isPast;
  const upcoming = ceEvents.filter((e) => !isPast(e)).sort((a, b) => (a.eventDay || '9999').localeCompare(b.eventDay || '9999'));
  const past = ceEvents.filter(isPast);
  ce.upcoming.innerHTML = upcoming.map(eventHtml).join('');
  ce.past.innerHTML = past.map(eventHtml).join('');
  ce.upcomingEmpty.hidden = upcoming.length > 0;
  ce.pastEmpty.hidden = past.length > 0;
}

document.querySelector('.main').addEventListener('click', async (e) => {
  const regsId = e.target.closest('[data-regs]')?.dataset.regs;
  const editId = e.target.closest('[data-edit]')?.dataset.edit;
  const removeId = e.target.closest('[data-remove]')?.dataset.remove;
  const copyId = e.target.closest('[data-copy]')?.dataset.copy;
  if (regsId) {
    if (ceOpen.has(regsId)) ceOpen.delete(regsId);
    else ceOpen.add(regsId);
    renderCeEvents();
  }
  if (editId) editEvent(ceEvents.find((x) => x.id === editId));
  if (copyId) {
    const emails = ceEvents.find((x) => x.id === copyId).registrations.map((r) => r.email).join(', ');
    try {
      await navigator.clipboard.writeText(emails);
      e.target.textContent = 'Copied!';
    } catch {
      prompt('Copy these emails:', emails);
    }
  }
  if (removeId) {
    const event = ceEvents.find((x) => x.id === removeId);
    const warning = event.registeredCount ? ` ${event.registeredCount} registered ${event.registeredCount === 1 ? 'student' : 'students'} will lose their spot.` : '';
    if (!confirm(`Remove "${event.title}"?${warning}`)) return;
    const { ok, data } = await sendHoursJson(`/api/club-events/${encodeURIComponent(removeId)}`, 'DELETE');
    if (!ok) return alert(data.error || 'Could not remove the event.');
    if (ceEditingId === removeId) resetForm();
    loadClubEvents();
  }
});

ce.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showCeError('');
  const spots = ce.spots.value.trim();
  const body = {
    clubId: ce.club.value,
    title: ce.title.value,
    eventDay: ce.day.value,
    eventTime: ce.time.value,
    location: ce.location.value,
    spots: spots === '' ? null : Number(spots),
    description: ce.description.value,
    signupUrl: ce.signup.value.trim(),
    registrationOpen: ce.open.checked,
  };
  if (!body.title.trim() || !body.eventDay || !body.description.trim()) {
    return showCeError('Please fill in the title, the date and the description.');
  }
  ce.submit.disabled = true;
  try {
    const url = ceEditingId ? `/api/club-events/${encodeURIComponent(ceEditingId)}` : '/api/club-events';
    const { ok, data } = await sendHoursJson(url, ceEditingId ? 'PUT' : 'POST', body);
    if (!ok) return showCeError(data.error || 'Could not save the event.');
    try {
      await uploadPending(data.event.id);
    } catch (err) {
      // The event itself is saved; keep the form open on it so the picture can be tried again.
      loadClubEvents();
      cePending = [];
      ceEditingId = data.event.id;
      return showCeError(`The event was saved, but a picture was not: ${err.message}`);
    }
    resetForm();
    loadClubEvents();
  } catch {
    showCeError('Could not reach the server. Please try again.');
  } finally {
    ce.submit.disabled = false;
  }
});

async function loadClubEvents() {
  const data = await fetchJson('/api/club-events');
  if (!data) return;
  ceEvents = data.events;
  ceToday = data.today;
  if (!ceEditingId) ce.day.min = ceToday;
  renderCeEvents();
}

loadClubEvents();
