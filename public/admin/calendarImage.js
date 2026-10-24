import { getJSON, sendForm, del, withBusy } from './api.js';

const current = document.getElementById('calendar-image-current');
const preview = document.getElementById('calendar-image-preview');
const currentLabel = document.getElementById('calendar-image-current-label');
const removeBtn = document.getElementById('calendar-image-remove-btn');
const form = document.getElementById('calendar-image-form');
const labelInput = document.getElementById('calendar-image-label-input');
const imageInput = document.getElementById('calendar-image-input');
const errorEl = document.getElementById('calendar-image-error');
const submitBtn = document.getElementById('calendar-image-submit');

export async function loadCalendarImage() {
  const data = await getJSON('/api/admin/content');
  if (data) render(data.content.calendarImage);
}

function render(calendarImage) {
  current.hidden = !calendarImage.imageUrl;
  if (calendarImage.imageUrl) {
    preview.src = calendarImage.imageUrl;
    currentLabel.textContent = calendarImage.label || 'No label set';
  }
}

removeBtn.addEventListener('click', async () => {
  if (!confirm('Remove the school year calendar picture?')) return;
  try {
    const { ok, data } = await del('/api/admin/calendar-image');
    if (!ok) {
      alert(data.error || 'Could not remove the picture.');
      return;
    }
    render(data.calendarImage);
  } catch {
    alert('Could not reach the server. Please try again.');
  }
});

// The file input is `required`, so the browser blocks a submit with no picture.
form.addEventListener('submit', (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  withBusy(submitBtn, 'Uploading…', async () => {
    try {
      const formData = new FormData();
      formData.append('label', labelInput.value.trim());
      formData.append('image', imageInput.files[0]);

      const { ok, data } = await sendForm('/api/admin/calendar-image', 'POST', formData);
      if (!ok) {
        errorEl.textContent = data.error || 'Could not upload the picture.';
        errorEl.hidden = false;
        return;
      }
      form.reset();
      render(data.calendarImage);
    } catch {
      errorEl.textContent = 'Could not reach the server. Please try again.';
      errorEl.hidden = false;
    }
  });
});
