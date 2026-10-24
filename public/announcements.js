(async function loadWeeklySlide() {
  const data = await fetchJson('/api/content');
  if (!data) return;

  const slide = data.content.weeklySlide || {};
  if (slide.canvaEmbedUrl) document.getElementById('slide-embed').src = slide.canvaEmbedUrl;
  document.getElementById('slide-embed-wrap').hidden = !slide.canvaEmbedUrl;
  document.getElementById('slide-empty').hidden = !!slide.canvaEmbedUrl;

  const weekLabelEl = document.getElementById('week-label');
  weekLabelEl.textContent = slide.weekLabel || '';
  weekLabelEl.hidden = !slide.weekLabel;
})();

(async function loadSlideArchive() {
  const data = await fetchJson('/api/slide-archive');
  if (!data) return;

  renderList(
    document.getElementById('archive-list'),
    document.getElementById('archive-empty'),
    data.slides,
    'div',
    'archive-item',
    (slide) => {
      const archived = new Date(slide.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `
        <span class="archive-item-label">${escapeHtml(slide.weekLabel)}<span class="archive-item-date">Archived ${archived}</span></span>
        <a class="archive-view-link" href="${escapeHtml(slide.canvaEmbedUrl)}" target="_blank" rel="noopener">View slide</a>`;
    }
  );
})();
