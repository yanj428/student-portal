function mcEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadCouncilPage() {
  const res = await fetch('/api/council');
  if (!res.ok) return;
  const { council } = await res.json();

  const gridEl = document.getElementById('council-page-grid');
  const emptyEl = document.getElementById('council-page-empty');

  gridEl.querySelectorAll('.council-page-card').forEach((el) => el.remove());
  emptyEl.hidden = council.length > 0;

  council.forEach((member) => {
    const article = document.createElement('article');
    article.className = 'council-page-card';
    article.innerHTML = `
      <div class="council-page-avatar">${mcEscapeHtml(member.initials || '')}</div>
      <h3>${mcEscapeHtml(member.name || member.initials || '')}</h3>
      ${member.role ? `<p class="council-page-role">${mcEscapeHtml(member.role)}</p>` : ''}
      ${member.bio ? `<p class="council-page-bio">${mcEscapeHtml(member.bio)}</p>` : ''}
    `;
    gridEl.appendChild(article);
  });
}

loadCouncilPage();
