(async function loadCsEvents() {
  const data = await fetchJson('/api/cs-events');
  if (!data) return;

  renderList(
    document.getElementById('cs-events-list'),
    document.getElementById('cs-events-empty'),
    data.events,
    'article',
    'cs-event-card',
    (event) => `
      <div class="cs-event-head">
        <h3 class="cs-event-title">${escapeHtml(event.title)}</h3>
        <span class="cs-event-date">${escapeHtml(event.eventDate)}</span>
      </div>
      <p class="cs-event-club">Hosted by ${escapeHtml(event.club)}</p>
      <p class="cs-event-desc">${escapeHtml(event.description)}</p>
      ${event.signupUrl ? `<a class="cs-event-signup" href="${escapeHtml(event.signupUrl)}" target="_blank" rel="noopener">Sign up</a>` : ''}`
  );
})();
