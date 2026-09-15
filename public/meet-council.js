function mcEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  // See voice.js's copy of this helper for why quotes need handling
  // separately from the &/</> the textContent/innerHTML round-trip covers.
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const MC_PERSON_ICON = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="1.7"/><path d="M4.5 19C4.5 15.4 7.4 12.5 11 12.5H13C16.6 12.5 19.5 15.4 19.5 19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

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
      <div class="council-page-avatar${member.photoUrl ? ' has-photo' : ''}">${
        member.photoUrl ? `<img src="${mcEscapeHtml(member.photoUrl)}" alt="${mcEscapeHtml(member.name || '')}" />` : MC_PERSON_ICON
      }</div>
      <h3>${mcEscapeHtml(member.name || '')}</h3>
      ${member.role ? `<p class="council-page-role">${mcEscapeHtml(member.role)}</p>` : ''}
      ${member.bio ? `<p class="council-page-bio">${mcEscapeHtml(member.bio)}</p>` : ''}
    `;
    gridEl.appendChild(article);
  });
}

loadCouncilPage();
