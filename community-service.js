function csEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadCsClubs() {
  const res = await fetch('/api/cs-clubs');
  if (!res.ok) return;
  const { clubs } = await res.json();

  const listEl = document.getElementById('cs-clubs-list');
  const emptyEl = document.getElementById('cs-clubs-empty');

  listEl.querySelectorAll('.cs-club-card').forEach((el) => el.remove());
  emptyEl.hidden = clubs.length > 0;

  clubs.forEach((club) => {
    const article = document.createElement('article');
    article.className = 'cs-club-card';
    article.innerHTML = `
      <h3>${csEscapeHtml(club.name)}</h3>
      <p>${csEscapeHtml(club.description)}</p>
    `;
    listEl.appendChild(article);
  });
}

async function loadCsEvents() {
  const res = await fetch('/api/cs-events');
  if (!res.ok) return;
  const { events } = await res.json();

  const listEl = document.getElementById('cs-events-list');
  const emptyEl = document.getElementById('cs-events-empty');

  listEl.querySelectorAll('.cs-event-card').forEach((el) => el.remove());
  emptyEl.hidden = events.length > 0;

  events.forEach((event) => {
    const article = document.createElement('article');
    article.className = 'cs-event-card';
    article.innerHTML = `
      <div class="cs-event-head">
        <h3 class="cs-event-title">${csEscapeHtml(event.title)}</h3>
        <span class="cs-event-date">${csEscapeHtml(event.eventDate)}</span>
      </div>
      <p class="cs-event-club">Hosted by ${csEscapeHtml(event.club)}</p>
      <p class="cs-event-desc">${csEscapeHtml(event.description)}</p>
      ${event.signupUrl ? `<a class="cs-event-signup" href="${csEscapeHtml(event.signupUrl)}" target="_blank" rel="noopener">Sign up</a>` : ''}
    `;
    listEl.appendChild(article);
  });
}

loadCsClubs();
loadCsEvents();
