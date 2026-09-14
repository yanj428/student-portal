import { escapeHtml, sendJSON } from './api.js';

// ---- This week's slide ----
const currentSlideForm = document.getElementById('current-slide-form');
const currentSlideWeekLabelInput = document.getElementById('current-slide-week-label');
const currentSlideEmbedUrlInput = document.getElementById('current-slide-embed-url');
const currentSlideError = document.getElementById('current-slide-error');
const currentSlideSuccess = document.getElementById('current-slide-success');
const currentSlideSave = document.getElementById('current-slide-save');
const currentSlideClear = document.getElementById('current-slide-clear');
const currentSlideToArchive = document.getElementById('current-slide-to-archive');

export async function loadCurrentSlide() {
  const res = await fetch('/api/admin/content');
  if (!res.ok) return;
  const { content } = await res.json();
  const slide = content.weeklySlide || { weekLabel: '', canvaEmbedUrl: '' };
  currentSlideWeekLabelInput.value = slide.weekLabel || '';
  currentSlideEmbedUrlInput.value = slide.canvaEmbedUrl || '';
}

async function saveCurrentSlide(weekLabel, canvaEmbedUrl) {
  currentSlideError.hidden = true;
  currentSlideSuccess.hidden = true;

  const res = await fetch('/api/admin/content');
  if (!res.ok) {
    currentSlideError.textContent = 'Could not reach the server. Please try again.';
    currentSlideError.hidden = false;
    return false;
  }
  const { content } = await res.json();
  content.weeklySlide = { weekLabel, canvaEmbedUrl };

  const { ok, data } = await sendJSON('/api/admin/content', 'PUT', { content });

  if (!ok) {
    currentSlideError.textContent = data.error || 'Could not save the slide.';
    currentSlideError.hidden = false;
    return false;
  }

  currentSlideSuccess.textContent = "This week's slide updated.";
  currentSlideSuccess.hidden = false;
  return true;
}

currentSlideForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  currentSlideSave.disabled = true;
  currentSlideSave.textContent = 'Saving…';
  await saveCurrentSlide(currentSlideWeekLabelInput.value.trim(), currentSlideEmbedUrlInput.value.trim());
  currentSlideSave.disabled = false;
  currentSlideSave.textContent = 'Save';
});

currentSlideClear.addEventListener('click', async () => {
  if (!confirm('Delete the current slide? It will stop showing on the Announcements page.')) return;
  currentSlideClear.disabled = true;
  const ok = await saveCurrentSlide('', '');
  currentSlideClear.disabled = false;
  if (ok) {
    currentSlideWeekLabelInput.value = '';
    currentSlideEmbedUrlInput.value = '';
  }
});

currentSlideToArchive.addEventListener('click', async () => {
  currentSlideError.hidden = true;
  currentSlideSuccess.hidden = true;

  const weekLabel = currentSlideWeekLabelInput.value.trim();
  const canvaEmbedUrl = currentSlideEmbedUrlInput.value.trim();

  if (!weekLabel || !canvaEmbedUrl) {
    currentSlideError.textContent = 'Set a week label and Canva embed URL before archiving.';
    currentSlideError.hidden = false;
    return;
  }
  if (!confirm(`Move "${weekLabel}" to the archive and clear the current slide?`)) return;

  currentSlideToArchive.disabled = true;
  try {
    const { ok, data } = await sendJSON('/api/admin/slide-archive', 'POST', { weekLabel, canvaEmbedUrl });

    if (!ok) {
      currentSlideError.textContent = data.error || 'Could not archive this slide.';
      currentSlideError.hidden = false;
      return;
    }

    const cleared = await saveCurrentSlide('', '');
    if (cleared) {
      currentSlideWeekLabelInput.value = '';
      currentSlideEmbedUrlInput.value = '';
      currentSlideSuccess.textContent = 'Slide moved to the archive.';
      currentSlideSuccess.hidden = false;
    }
    loadSlideArchive();
  } finally {
    currentSlideToArchive.disabled = false;
  }
});

// ---- Slide archive ----
const archiveForm = document.getElementById('archive-form');
const archiveWeekLabelInput = document.getElementById('archive-week-label');
const archiveEmbedUrlInput = document.getElementById('archive-embed-url');
const archiveError = document.getElementById('archive-error');
const archiveSubmit = document.getElementById('archive-submit');
const archiveRows = document.getElementById('archive-rows');
const archiveEmptyRow = document.getElementById('archive-empty-row');

export async function loadSlideArchive() {
  const res = await fetch('/api/admin/slide-archive');
  if (!res.ok) return;
  const { slides } = await res.json();
  renderSlideArchive(slides);
}

function renderSlideArchive(slides) {
  const statArchive = document.getElementById('stat-archive');
  if (statArchive) statArchive.textContent = slides.length;
  archiveRows.querySelectorAll('tr:not(#archive-empty-row)').forEach((el) => el.remove());

  if (slides.length === 0) {
    archiveRows.appendChild(archiveEmptyRow);
    return;
  }
  archiveEmptyRow.remove();

  slides.forEach((slide) => {
    const tr = document.createElement('tr');
    const archived = new Date(slide.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    tr.innerHTML = `
      <td>${escapeHtml(slide.weekLabel)}</td>
      <td><a href="${escapeHtml(slide.canvaEmbedUrl)}" target="_blank" rel="noopener">View</a></td>
      <td>${archived}</td>
      <td><button class="delete-btn" data-id="${slide.id}" aria-label="Remove from archive"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button></td>
    `;
    tr.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Remove this slide from the archive?')) return;
      await fetch(`/api/admin/slide-archive/${slide.id}`, { method: 'DELETE' });
      loadSlideArchive();
    });
    archiveRows.appendChild(tr);
  });
}

archiveForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  archiveError.hidden = true;
  archiveSubmit.disabled = true;
  archiveSubmit.textContent = 'Adding…';

  try {
    const { ok, data } = await sendJSON('/api/admin/slide-archive', 'POST', {
      weekLabel: archiveWeekLabelInput.value.trim(),
      canvaEmbedUrl: archiveEmbedUrlInput.value.trim(),
    });

    if (!ok) {
      archiveError.textContent = data.error || 'Could not add to archive.';
      archiveError.hidden = false;
      return;
    }

    archiveForm.reset();
    loadSlideArchive();
  } catch {
    archiveError.textContent = 'Could not reach the server. Please try again.';
    archiveError.hidden = false;
  } finally {
    archiveSubmit.disabled = false;
    archiveSubmit.textContent = 'Add to archive';
  }
});
