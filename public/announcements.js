async function loadWeeklySlide() {
  const data = await fetchJson('/api/content');
  if (!data) return;

  const slide = data.content.weeklySlide || {};
  if (slide.canvaEmbedUrl) document.getElementById('slide-link').href = slide.canvaEmbedUrl;
  document.getElementById('slide-link-wrap').hidden = !slide.canvaEmbedUrl;
  document.getElementById('slide-empty').hidden = !!slide.canvaEmbedUrl;

  const weekLabelEl = document.getElementById('week-label');
  weekLabelEl.textContent = slide.weekLabel || '';
  weekLabelEl.hidden = !slide.weekLabel;
}

async function loadSlideArchive() {
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
}

function loadAnnouncementsPage() {
  loadWeeklySlide();
  loadSlideArchive();
}

loadAnnouncementsPage();

// A tab left open while the admin changes the slide would otherwise keep
// showing the old one until a manual reload, so the page re-checks when it is
// switched back to or restored from the back button, and every minute while
// it is in view.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadAnnouncementsPage();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) loadAnnouncementsPage();
});
setInterval(() => {
  if (!document.hidden) loadAnnouncementsPage();
}, 60 * 1000);
