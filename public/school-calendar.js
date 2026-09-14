function scEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  // See voice.js's copy of this helper for why quotes need handling
  // separately from the &/</> the textContent/innerHTML round-trip covers.
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function loadSchoolCalendar() {
  const res = await fetch('/api/calendar-events');
  if (!res.ok) return;
  const { calendarEvents: events } = await res.json();

  const listEl = document.getElementById('calendar-page-list');
  const emptyEl = document.getElementById('calendar-page-empty');

  listEl.querySelectorAll('.calendar-page-item').forEach((el) => el.remove());
  emptyEl.hidden = events.length > 0;

  events.forEach((event) => {
    const article = document.createElement('article');
    article.className = 'calendar-page-item';
    article.innerHTML = `
      <div class="calendar-page-date">
        <span class="day">${scEscapeHtml(event.day)}</span>
        <span class="month">${scEscapeHtml(event.month)}</span>
      </div>
      <div class="calendar-page-info">
        <h3>${scEscapeHtml(event.title)}</h3>
        <p>${scEscapeHtml(event.subtitle)}</p>
      </div>
    `;
    listEl.appendChild(article);
  });
}

loadSchoolCalendar();
