const ARROW = '<svg class="link-page-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17L17 7M17 7H9M17 7V15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// "https://drive.google.com/drive/u/0" -> "drive.google.com"
function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function badgeHtml(link) {
  if (link.logoUrl) return `<span class="link-page-badge has-logo"><img src="${escapeHtml(link.logoUrl)}" alt="" /></span>`;
  const letter = (link.label.trim()[0] || '?').toUpperCase();
  return `<span class="link-page-badge">${escapeHtml(letter)}</span>`;
}

(async function loadQuickLinksPage() {
  const data = await fetchJson('/api/quick-links');
  if (!data) return;

  const gridEl = document.getElementById('links-page-grid');
  const emptyEl = document.getElementById('links-page-empty');
  const noMatchEl = document.getElementById('links-no-match');
  const countEl = document.getElementById('links-count');
  const searchEl = document.getElementById('links-search');

  renderList(
    gridEl,
    emptyEl,
    data.quickLinks,
    'a',
    'link-page-card',
    (link) => `
      <span class="link-page-top">${badgeHtml(link)}${ARROW}</span>
      <span class="link-page-text">
        <span class="link-page-name">${escapeHtml(link.label)}</span>
        <span class="link-page-site">${escapeHtml(siteName(link.url))}</span>
      </span>`,
    (a, link) => {
      a.href = link.url || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      a.dataset.search = `${link.label} ${siteName(link.url)}`.toLowerCase();
    }
  );

  const cards = [...gridEl.querySelectorAll('.link-page-card')];
  const total = cards.length;
  searchEl.hidden = total === 0;
  searchEl.parentElement.hidden = total === 0;

  function applySearch() {
    const term = searchEl.value.trim().toLowerCase();
    let shown = 0;
    cards.forEach((card) => {
      const match = !term || card.dataset.search.includes(term);
      card.hidden = !match;
      if (match) shown += 1;
    });
    noMatchEl.hidden = shown > 0 || total === 0;
    countEl.textContent = term ? `${shown} of ${total}` : `${total} ${total === 1 ? 'link' : 'links'}`;
  }
  searchEl.addEventListener('input', applySearch);
  applySearch();
})();