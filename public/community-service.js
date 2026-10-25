// "Nov 8" becomes a month-and-day tile. Dates typed any other way ("Every Friday")
// are shown as written under a calendar icon.
function dateTile(text) {
  const m = /^\s*([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2})\b/.exec(text || '');
  if (m) return `<span class="cs-date-month">${escapeHtml(m[1].toUpperCase())}</span><span class="cs-date-day">${escapeHtml(m[2])}</span>`;
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 9H21M8 2V5M16 2V5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span class="cs-date-text">${escapeHtml(text)}</span>`;
}
(async function loadCsEvents() {
  const data = await fetchJson('/api/cs-events');
  if (!data) return;

  renderList(
    document.getElementById('cs-events-list'),
    document.getElementById('cs-events-empty'),
    data.events,
    'article',
    'cs-event-card',
    (event) => {
      const when = dateTile(event.eventDate);
      return `
      <div class="cs-event-date">${when}</div>
      <div class="cs-event-body">
        <h3 class="cs-event-title">${escapeHtml(event.title)}</h3>
        <p class="cs-event-club">${event.clubLogoUrl ? `<img class="cs-event-club-logo" src="${escapeHtml(event.clubLogoUrl)}" alt="" />` : ''}<span>${escapeHtml(event.club)}</span></p>
        <p class="cs-event-desc">${escapeHtml(event.description)}</p>
        ${event.signupUrl ? `<a class="cs-event-signup" href="${escapeHtml(event.signupUrl)}" target="_blank" rel="noopener">Sign up</a>` : ''}
      </div>`;
    }  );
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