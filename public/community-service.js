// "Nov 8" becomes a month-and-day tile. Dates typed any other way ("Every Friday")
// are shown as written under a calendar icon.
function dateTile(text) {
  const m = /^\s*([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2})\b/.exec(text || '');
  if (m) return `<span class="cs-date-month">${escapeHtml(m[1].toUpperCase())}</span><span class="cs-date-day">${escapeHtml(m[2])}</span>`;
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 9H21M8 2V5M16 2V5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span class="cs-date-text">${escapeHtml(text)}</span>`;
}
// Community service events, with on-site registration. The coordinator and
// the hosting club's leaders can also open the list of who registered.
const eventsList = document.getElementById('cs-events-list');
const eventsEmpty = document.getElementById('cs-events-empty');
let csEvents = [];
let canRegister = false;
const openRegistrations = new Map(); // event id -> registrants, once opened

function spotsText(event) {
  if (event.spots) return `${event.spotsLeft} of ${event.spots} spots left`;
  return event.registeredCount === 1 ? '1 student registered' : `${event.registeredCount} students registered`;
}

function registerHtml(event) {
  if (!canRegister) return '';
  if (event.isRegistered) {
    return `<span class="cs-registered">&#10003; You're registered</span>
      <button type="button" class="cs-event-cancel" data-cancel="${escapeHtml(event.id)}">Cancel registration</button>`;
  }
  if (event.closedReason) return `<span class="cs-event-closed">${escapeHtml(event.closedReason)}</span>`;
  return `<button type="button" class="cs-event-signup" data-register="${escapeHtml(event.id)}">Register</button>`;
}

function registrantsHtml(event) {
  if (!event.canSeeRegistrations) return '';
  const list = openRegistrations.get(event.id);
  const toggle = `<button type="button" class="cs-event-who" data-who="${escapeHtml(event.id)}" aria-expanded="${!!list}">${list ? 'Hide' : 'See'} who registered (${event.registeredCount})</button>`;
  if (!list) return toggle;
  const rows = list.length
    ? `<ol class="cs-registrants">${list.map((r) => `<li><strong>${escapeHtml(r.name)}</strong> <span>${escapeHtml(r.grade)} &middot; ${escapeHtml(r.email)}</span></li>`).join('')}</ol>`
    : '<p class="cs-events-empty-line">Nobody has registered yet.</p>';
  return toggle + rows;
}

function eventCardHtml(event) {
  const details = [event.eventTime, event.location].filter(Boolean).map(escapeHtml).join(' &middot; ');
  return `
      <div class="cs-event-date">${dateTile(event.eventDate)}</div>
      <div class="cs-event-body">
        <div class="cs-event-head">
          ${event.clubLogoUrl ? `<img class="cs-event-logo" src="${escapeHtml(event.clubLogoUrl)}" alt="${escapeHtml(event.club)} logo" />` : ''}
          <div>
            <h3 class="cs-event-title">${escapeHtml(event.title)}</h3>
            <p class="cs-event-club"><span>${escapeHtml(event.club)}</span></p>
          </div>
        </div>
        ${details ? `<p class="cs-event-when">${details}</p>` : ''}
        <p class="cs-event-desc">${escapeHtml(event.description)}</p>
        ${event.images.length ? `<div class="cs-event-images">${event.images.map((img) => `<a href="${escapeHtml(img.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(img.url)}" alt="Picture of ${escapeHtml(event.title)}" /></a>`).join('')}</div>` : ''}
        <p class="cs-event-spots">${escapeHtml(spotsText(event))}</p>
        <div class="cs-event-actions">
          ${registerHtml(event)}
          ${event.signupUrl ? `<a class="cs-event-extra" href="${escapeHtml(event.signupUrl)}" target="_blank" rel="noopener">Club's sign-up form</a>` : ''}
        </div>
        ${registrantsHtml(event)}
        <p class="cs-event-error" hidden></p>
      </div>`;
}

function renderEvents() {
  renderList(eventsList, eventsEmpty, csEvents, 'article', 'cs-event-card', eventCardHtml, (el, event) => {
    el.dataset.eventId = event.id;
  });
}

async function sendRegistration(id, method) {
  const card = eventsList.querySelector(`[data-event-id="${CSS.escape(id)}"]`);
  const errorEl = card && card.querySelector('.cs-event-error');
  try {
    const res = await fetch(`/api/cs-events/${encodeURIComponent(id)}/register`, { method });
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (errorEl) {
        errorEl.textContent = data.error || 'Could not save that. Please try again.';
        errorEl.hidden = false;
      }
      return;
    }
    csEvents = csEvents.map((e) => (e.id === id ? { ...data.event } : e));
    openRegistrations.delete(id);
    renderEvents();
  } catch {
    if (errorEl) {
      errorEl.textContent = 'Could not reach the server. Please try again.';
      errorEl.hidden = false;
    }
  }
}

eventsList.addEventListener('click', async (e) => {
  const registerId = e.target.closest('[data-register]')?.dataset.register;
  const cancelId = e.target.closest('[data-cancel]')?.dataset.cancel;
  const whoId = e.target.closest('[data-who]')?.dataset.who;
  if (registerId) sendRegistration(registerId, 'POST');
  if (cancelId && confirm('Cancel your registration for this event?')) sendRegistration(cancelId, 'DELETE');
  if (whoId) {
    if (openRegistrations.has(whoId)) openRegistrations.delete(whoId);
    else {
      const data = await fetchJson(`/api/cs-events/${encodeURIComponent(whoId)}/registrations`);
      if (data) openRegistrations.set(whoId, data.registrations);
    }
    renderEvents();
  }
});

(async function loadCsEvents() {
  const data = await fetchJson('/api/cs-events');
  if (!data) return;
  csEvents = data.events;
  canRegister = data.canRegister;
  renderEvents();
})();
// The Resources links, edited by admins in the admin panel.
(async function loadCsResources() {
  const listEl = document.getElementById('cs-resources-list');
  const emptyEl = document.getElementById('cs-resources-empty');
  if (!listEl || !emptyEl) return;
  const data = await fetchJson('/api/cs-resources');
  if (!data) return;

  emptyEl.hidden = data.resources.length > 0;
  listEl.innerHTML = data.resources
    .map((r) => `
      <a class="resource-link" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">
        <svg class="resource-doc" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 3H7C5.9 3 5 3.9 5 5V19C5 20.1 5.9 21 7 21H17C18.1 21 19 20.1 19 19V8L14 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3V8H19M9 13H15M9 17H13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <span class="resource-title">${escapeHtml(r.title)}</span>
        <svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H9M17 7V15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>`)
    .join('');
})();
// Log hours / Events / Information. The chosen tab is kept in the address
// (#events) so a refresh or a shared link opens the same one.
(function tabs() {
  const tabs = [...document.querySelectorAll('.cs-tab')];
  const names = tabs.map((t) => t.dataset.tab);
  function show(name) {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    document.querySelectorAll('.cs-panel').forEach((p) => { p.hidden = p.id !== `cs-panel-${name}`; });
  }
  tabs.forEach((t) => t.addEventListener('click', () => {
    show(t.dataset.tab);
    history.replaceState(null, '', `#${t.dataset.tab}`);
  }));
  const wanted = location.hash.slice(1);
  show(names.includes(wanted) ? wanted : names[0]);
})();
