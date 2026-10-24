function announcementsEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  // See voice.js's copy of this helper for why quotes need handling
  // separately from the &/</> the textContent/innerHTML round-trip covers.
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function loadAnnouncementsPage() {
  const res = await fetch('/api/content');
  if (!res.ok) return;
  const { content } = await res.json();

  const weekLabelEl = document.getElementById('week-label');
  const linkWrap = document.getElementById('slide-link-wrap');
  const slideLink = document.getElementById('slide-link');
  const slideEmpty = document.getElementById('slide-empty');

  const slide = content.weeklySlide || {};
  if (slide.canvaEmbedUrl) {
    slideLink.href = slide.canvaEmbedUrl;
    linkWrap.hidden = false;
    slideEmpty.hidden = true;
  } else {
    linkWrap.hidden = true;
    slideEmpty.hidden = false;
  }

  if (slide.weekLabel) {
    weekLabelEl.textContent = slide.weekLabel;
    weekLabelEl.hidden = false;
  } else {
    weekLabelEl.hidden = true;
  }
}

async function loadSlideArchive() {
  const res = await fetch('/api/slide-archive');
  if (!res.ok) return;
  const { slides } = await res.json();

  const archiveList = document.getElementById('archive-list');
  const archiveEmpty = document.getElementById('archive-empty');

  archiveList.querySelectorAll('.archive-item').forEach((el) => el.remove());
  archiveEmpty.hidden = slides.length > 0;

  slides.forEach((slide) => {
    const archived = new Date(slide.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const div = document.createElement('div');
    div.className = 'archive-item';
    div.innerHTML = `
      <span class="archive-item-label">${announcementsEscapeHtml(slide.weekLabel)}<span class="archive-item-date">Archived ${archived}</span></span>
      <a class="archive-view-link" href="${announcementsEscapeHtml(slide.canvaEmbedUrl)}" target="_blank" rel="noopener">View slide</a>
    `;
    archiveList.appendChild(div);
  });
}

loadAnnouncementsPage();
loadSlideArchive();
