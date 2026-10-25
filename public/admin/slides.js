import { escapeHtml, getJSON, sendJSON, confirmDelete, withBusy, TRASH_ICON } from './api.js';

// ---- This week's slide ----
const currentSlideForm = document.getElementById('current-slide-form');
const weekLabelInput = document.getElementById('current-slide-week-label');
const embedUrlInput = document.getElementById('current-slide-embed-url');
const currentSlideError = document.getElementById('current-slide-error');
const currentSlideSuccess = document.getElementById('current-slide-success');
const currentSlideSave = document.getElementById('current-slide-save');
const currentSlideClear = document.getElementById('current-slide-clear');
const currentSlideToArchive = document.getElementById('current-slide-to-archive');

// The slide as last loaded or saved, which is what "Archive this slide"
// archives, rather than whatever is currently typed (and maybe never saved).
let savedSlide = { weekLabel: '', canvaEmbedUrl: '' };

function showSlideMessage(el, text) {
  currentSlideError.hidden = true;
  currentSlideSuccess.hidden = true;
  if (text) {
    el.textContent = text;
    el.hidden = false;
  }
}

function setSlideInputs(slide) {
  savedSlide = slide;
  weekLabelInput.value = slide.weekLabel;
  embedUrlInput.value = slide.canvaEmbedUrl;
}

export async function loadCurrentSlide() {
  const data = await getJSON('/api/admin/content');
  if (data) setSlideInputs({ weekLabel: '', canvaEmbedUrl: '', ...data.content.weeklySlide });
}

// Returns whether the slide was saved; failures are shown inline.
async function saveCurrentSlide(weekLabel, canvaEmbedUrl) {
  showSlideMessage();
  try {
    const current = await getJSON('/api/admin/content');
    if (!current) throw new Error();
    const content = { ...current.content, weeklySlide: { weekLabel, canvaEmbedUrl } };

    const { ok, data } = await sendJSON('/api/admin/content', 'PUT', { content });
    if (!ok) {
      showSlideMessage(currentSlideError, data.error || 'Could not save the slide.');
      return false;
    }
    savedSlide = { weekLabel, canvaEmbedUrl };
    showSlideMessage(currentSlideSuccess, "This week's slide updated.");
    return true;
  } catch {
    showSlideMessage(currentSlideError, 'Could not reach the server. Please try again.');
    return false;
  }
}

currentSlideForm.addEventListener('submit', (e) => {
  e.preventDefault();
  withBusy(currentSlideSave, 'Saving…', () => saveCurrentSlide(weekLabelInput.value.trim(), embedUrlInput.value.trim()));
});

currentSlideClear.addEventListener('click', () => {
  if (!confirm('Delete the current slide? It will stop showing on the Announcements page.')) return;
  withBusy(currentSlideClear, 'Clearing…', async () => {
    if (await saveCurrentSlide('', '')) setSlideInputs({ weekLabel: '', canvaEmbedUrl: '' });
  });
});

currentSlideToArchive.addEventListener('click', () => {
  showSlideMessage();
  const { weekLabel, canvaEmbedUrl } = savedSlide;
  if (!weekLabel || !canvaEmbedUrl) {
    showSlideMessage(currentSlideError, 'Save a week label and Canva link before archiving.');
    return;
  }
  if (!confirm(`Move "${weekLabel}" to the archive and clear the current slide?`)) return;

  withBusy(currentSlideToArchive, 'Archiving…', async () => {
    try {
      const { ok, data } = await sendJSON('/api/admin/slide-archive', 'POST', { weekLabel, canvaEmbedUrl });
      if (!ok) {
        showSlideMessage(currentSlideError, data.error || 'Could not archive this slide.');
        return;
      }
      if (await saveCurrentSlide('', '')) {
        setSlideInputs({ weekLabel: '', canvaEmbedUrl: '' });
        showSlideMessage(currentSlideSuccess, 'Slide moved to the archive.');
      }
      loadSlideArchive();
    } catch {
      showSlideMessage(currentSlideError, 'Could not reach the server. Please try again.');
    }
  });
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
  const data = await getJSON('/api/admin/slide-archive');
  if (!data) return;
  const { slides } = data;

  document.getElementById('stat-archive').textContent = slides.length;
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
      <td><button class="delete-btn" aria-label="Remove from archive">${TRASH_ICON}</button></td>
    `;
    tr.querySelector('.delete-btn').addEventListener('click', () =>
      confirmDelete(`/api/admin/slide-archive/${slide.id}`, 'Remove this slide from the archive?', loadSlideArchive)
    );
    archiveRows.appendChild(tr);
  });
}

archiveForm.addEventListener('submit', (e) => {
  e.preventDefault();
  archiveError.hidden = true;

  withBusy(archiveSubmit, 'Adding…', async () => {
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
    }
  });
});
