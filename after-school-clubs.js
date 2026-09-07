function ascEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadClubsPage() {
  const res = await fetch('/api/content');
  if (!res.ok) return;
  const { content } = await res.json();
  const clubs = content.clubs || [];

  const listEl = document.getElementById('clubs-page-list');
  const emptyEl = document.getElementById('clubs-page-empty');

  listEl.querySelectorAll('.club-page-card').forEach((el) => el.remove());
  emptyEl.hidden = clubs.length > 0;

  clubs.forEach((club) => {
    const article = document.createElement('article');
    article.className = 'club-page-card';
    article.innerHTML = `
      <h3>${ascEscapeHtml(club.name)}</h3>
      ${club.description ? `<p class="club-page-desc">${ascEscapeHtml(club.description)}</p>` : ''}
      <div class="club-page-meta">
        ${club.schedule ? `<span><strong>When:</strong>${ascEscapeHtml(club.schedule)}</span>` : ''}
        ${club.advisor ? `<span><strong>Advisor:</strong>${ascEscapeHtml(club.advisor)}</span>` : ''}
      </div>
      ${club.signupUrl ? `<a class="club-page-signup" href="${ascEscapeHtml(club.signupUrl)}" target="_blank" rel="noopener">Sign up</a>` : ''}
    `;
    listEl.appendChild(article);
  });
}

loadClubsPage();
