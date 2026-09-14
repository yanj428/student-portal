function qlEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadQuickLinksPage() {
  const res = await fetch('/api/quick-links');
  if (!res.ok) return;
  const { quickLinks: links } = await res.json();

  const gridEl = document.getElementById('links-page-grid');
  const emptyEl = document.getElementById('links-page-empty');

  gridEl.querySelectorAll('.link-page-card').forEach((el) => el.remove());
  emptyEl.hidden = links.length > 0;

  links.forEach((link) => {
    const a = document.createElement('a');
    a.className = 'link-page-card';
    a.href = link.url || '#';
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = `
      <span class="link-page-icon">
        <svg viewBox="0 0 24 24" fill="none"><path d="M9.5 14.5L14.5 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M11 7.5L12.2 6.3C13.5 5 15.6 5 16.9 6.3C18.2 7.6 18.2 9.7 16.9 11L15.7 12.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M13 16.5L11.8 17.7C10.5 19 8.4 19 7.1 17.7C5.8 16.4 5.8 14.3 7.1 13L8.3 11.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </span>
      <span>${qlEscapeHtml(link.label)}</span>
    `;
    gridEl.appendChild(a);
  });
}

loadQuickLinksPage();
