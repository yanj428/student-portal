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

loadCsClubs();
