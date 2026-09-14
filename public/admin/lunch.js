import { sendForm, del } from './api.js';

const lunchCurrent = document.getElementById('lunch-current');
const lunchCurrentImage = document.getElementById('lunch-current-image');
const lunchCurrentLabel = document.getElementById('lunch-current-label');
const lunchRemoveBtn = document.getElementById('lunch-remove-btn');
const lunchUploadForm = document.getElementById('lunch-upload-form');
const lunchWeekLabelInput = document.getElementById('lunch-week-label');
const lunchImageInput = document.getElementById('lunch-image-input');
const lunchUploadError = document.getElementById('lunch-upload-error');
const lunchUploadSubmit = document.getElementById('lunch-upload-submit');

export async function loadLunchCurrent() {
  const res = await fetch('/api/admin/content');
  if (!res.ok) return;
  const { content } = await res.json();
  renderLunchCurrent(content.lunchSchedule || { weekLabel: '', imageUrl: '' });
}

function renderLunchCurrent(schedule) {
  if (schedule.imageUrl) {
    lunchCurrentImage.src = schedule.imageUrl;
    lunchCurrentLabel.textContent = schedule.weekLabel || 'No week label set';
    lunchCurrent.hidden = false;
  } else {
    lunchCurrent.hidden = true;
  }
}

lunchRemoveBtn.addEventListener('click', async () => {
  if (!confirm('Remove the current lunch menu image?')) return;
  const { ok, data } = await del('/api/admin/lunch-image');
  if (ok) renderLunchCurrent(data.lunchSchedule);
});

lunchUploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  lunchUploadError.hidden = true;

  if (!lunchImageInput.files[0]) {
    lunchUploadError.textContent = 'Please choose an image.';
    lunchUploadError.hidden = false;
    return;
  }

  lunchUploadSubmit.disabled = true;
  lunchUploadSubmit.textContent = 'Uploading…';

  try {
    const formData = new FormData();
    formData.append('weekLabel', lunchWeekLabelInput.value.trim());
    formData.append('image', lunchImageInput.files[0]);

    const { ok, data } = await sendForm('/api/admin/lunch-image', 'POST', formData);

    if (!ok) {
      lunchUploadError.textContent = data.error || 'Could not upload image.';
      lunchUploadError.hidden = false;
      return;
    }

    lunchUploadForm.reset();
    renderLunchCurrent(data.lunchSchedule);
  } catch {
    lunchUploadError.textContent = 'Could not reach the server. Please try again.';
    lunchUploadError.hidden = false;
  } finally {
    lunchUploadSubmit.disabled = false;
    lunchUploadSubmit.textContent = 'Upload menu';
  }
});
