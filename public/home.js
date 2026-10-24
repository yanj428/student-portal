// Homepage widgets: each section is its own collection, fetched
// independently so one failing endpoint doesn't blank out the rest.

const EMPTY_HTML = '<p class="home-empty">Nothing posted yet.</p>';

async function fillWidget(id, url, key, limit, toHtml) {
  const el = document.getElementById(id);
  const data = await fetchJson(url);
  if (!data) return;
  const items = limit ? data[key].slice(0, limit) : data[key];
  el.innerHTML = items.length ? items.map(toHtml).join('') : EMPTY_HTML;
}

fillWidget('calendar-list', '/api/calendar-events', 'calendarEvents', 3, (e) => `
  <div class="calendar-item">
    <div class="date-chip"><span class="date-day">${escapeHtml(e.day)}</span><span class="date-month">${escapeHtml(e.month)}</span></div>
    <div class="calendar-info">
      <h3>${escapeHtml(e.title)}</h3>
      <p>${escapeHtml(e.subtitle)}</p>
    </div>
  </div>`);

fillWidget('cs-events-list', '/api/cs-events', 'events', 3, (e) => `
  <div class="notice-item">
    <h3>${escapeHtml(e.title)}</h3>
    <p>${escapeHtml(e.description)}</p>
    <a href="/community-service" class="see-more">See more</a>
  </div>`);

fillWidget('clubs-list', '/api/clubs?type=after-school', 'clubs', 0, (c) => `<span class="club-chip">${escapeHtml(c.name)}</span>`);

fillWidget('quicklinks-list', '/api/quick-links', 'quickLinks', 0, (q) => `<a href="${escapeHtml(q.url)}" class="quicklink">${escapeHtml(q.label)}</a>`);
