import { getJSON, sendForm, del, withBusy } from './api.js';

// A "current picture, remove it, upload a new one" panel. The lunch menu and the
// school year calendar picture are the same panel with different ids and
// endpoints. Returns the function that loads the current picture.
//
//   ids         the panel's element ids (current, image, label, removeBtn, form, labelInput, fileInput, error, submit)
//   endpoint    where the picture is uploaded to (POST) and removed from (DELETE)
//   contentKey  where it lives in the content object, in the server's replies
//   labelField  the name of its text label (also the form field sent)
//   noun        what the picture is called in messages, e.g. "lunch menu image"
//   ids.pdfLink (optional) a link shown instead of the picture when the upload is a PDF
export function imageSlot({ ids, endpoint, contentKey, labelField, emptyLabel, noun }) {
  const el = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, document.getElementById(id)]));

  function render(item) {
    el.current.hidden = !item.imageUrl;
    if (item.imageUrl) {
      const isPdf = /\.pdf$/i.test(item.imageUrl);
      el.image.hidden = isPdf;
      if (!isPdf) el.image.src = item.imageUrl;
      if (el.pdfLink) {
        el.pdfLink.hidden = !isPdf;
        el.pdfLink.href = item.imageUrl;
      }
      el.label.textContent = item[labelField] || emptyLabel;
    }
  }

  el.removeBtn.addEventListener('click', async () => {
    if (!confirm(`Remove the current ${noun}?`)) return;
    try {
      const { ok, data } = await del(endpoint);
      if (!ok) {
        alert(data.error || `Could not remove the ${noun}.`);
        return;
      }
      render(data[contentKey]);
    } catch {
      alert('Could not reach the server. Please try again.');
    }
  });

  // The file input is `required`, so the browser blocks a submit with no picture.
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    el.error.hidden = true;

    withBusy(el.submit, 'Uploading…', async () => {
      try {
        const formData = new FormData();
        formData.append(labelField, el.labelInput.value.trim());
        formData.append('image', el.fileInput.files[0]);

        const { ok, data } = await sendForm(endpoint, 'POST', formData);
        if (!ok) {
          el.error.textContent = data.error || `Could not upload the ${noun}.`;
          el.error.hidden = false;
          return;
        }
        el.form.reset();
        render(data[contentKey]);
      } catch {
        el.error.textContent = 'Could not reach the server. Please try again.';
        el.error.hidden = false;
      }
    });
  });

  return async function load() {
    const data = await getJSON('/api/admin/content');
    if (data) render(data.content[contentKey]);
  };
}