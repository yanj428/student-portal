import { getJSON, sendForm, del, withBusy } from './api.js';

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
  const data = await getJSON('/api/admin/content');
  if (data) renderLunchCurrent(data.content.lunchSchedule);
}

function renderLunchCurrent(schedule) {
  lunchCurrent.hidden = !schedule.imageUrl;
  if (schedule.imageUrl) {
    lunchCurrentImage.src = schedule.imageUrl;
    lunchCurrentLabel.textContent = schedule.weekLabel || 'No week label set';
  }
}

lunchRemoveBtn.addEventListener('click', async () => {
  if (!confirm('Remove the current lunch menu image?')) return;
  try {
    const { ok, data } = await del('/api/admin/lunch-image');
    if (!ok) {
      alert(data.error || 'Could not remove the image.');
      return;
    }
    renderLunchCurrent(data.lunchSchedule);
  } catch {
    alert('Could not reach the server. Please try again.');
  }
});

// The file input is `required`, so the browser blocks a submit with no image.
lunchUploadForm.addEventListener('submit', (e) => {
  e.preventDefault();
  lunchUploadError.hidden = true;

  withBusy(lunchUploadSubmit, 'Uploading…', async () => {
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
    }
  });
});
