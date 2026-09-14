function clubsEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  // See voice.js's copy of this helper for why quotes need handling
  // separately from the &/</> the textContent/innerHTML round-trip covers.
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function loadCsClubsSection() {
  const res = await fetch('/api/clubs?type=community-service');
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
      <div class="cs-club-head">
        ${club.logoUrl ? `<img class="cs-club-logo" src="${clubsEscapeHtml(club.logoUrl)}" alt="${clubsEscapeHtml(club.name)} logo" />` : ''}
        <h3>${clubsEscapeHtml(club.name)}</h3>
      </div>
      <p>${clubsEscapeHtml(club.description)}</p>
      ${club.instagramUrl || club.applicationFormUrl ? `
        <div class="cs-club-links">
          ${club.instagramUrl ? `
            <a class="cs-club-link" href="${clubsEscapeHtml(club.instagramUrl)}" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.7"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor"/></svg>
              <span>Instagram</span>
            </a>` : ''}
          ${club.applicationFormUrl ? `
            <a class="cs-club-link" href="${clubsEscapeHtml(club.applicationFormUrl)}" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H9M17 7V15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span>Apply</span>
            </a>` : ''}
        </div>` : ''}
    `;
    listEl.appendChild(article);
  });
}

async function loadAfterSchoolClubsSection() {
  const res = await fetch('/api/clubs?type=after-school');
  if (!res.ok) return;
  const { clubs } = await res.json();

  const listEl = document.getElementById('clubs-page-list');
  const emptyEl = document.getElementById('clubs-page-empty');

  listEl.querySelectorAll('.club-page-card').forEach((el) => el.remove());
  emptyEl.hidden = clubs.length > 0;

  clubs.forEach((club) => {
    const article = document.createElement('article');
    article.className = 'club-page-card';
    article.innerHTML = `
      <h3>${clubsEscapeHtml(club.name)}</h3>
      ${club.description ? `<p class="club-page-desc">${clubsEscapeHtml(club.description)}</p>` : ''}
      <div class="club-page-meta">
        ${club.schedule ? `<span><strong>When:</strong>${clubsEscapeHtml(club.schedule)}</span>` : ''}
        ${club.advisor ? `<span><strong>Advisor:</strong>${clubsEscapeHtml(club.advisor)}</span>` : ''}
      </div>
      ${club.signupUrl ? `<a class="club-page-signup" href="${clubsEscapeHtml(club.signupUrl)}" target="_blank" rel="noopener">Sign up</a>` : ''}
    `;
    listEl.appendChild(article);
  });
}

loadCsClubsSection();
loadAfterSchoolClubsSection();
