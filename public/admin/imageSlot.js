import { getJSON, sendForm, sendJSON, del, withBusy } from './api.js';
import { pdfToImage } from './pdfToImage.js';

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

  let render = function render(item) {
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
  };

  // Optional: change just the label of what is already published.
  if (el.editBtn) {
    let currentLabel = '';
    const showEditor = (on) => {
      el.labelForm.hidden = !on;
      el.editBtn.hidden = on;
      el.label.hidden = on;
      el.labelError.hidden = true;
      if (on) {
        el.editInput.value = currentLabel;
        el.editInput.focus();
      }
    };
    const baseRender = render;
    render = (item) => {
      currentLabel = item[labelField] || '';
      showEditor(false);
      baseRender(item);
    };
    el.editBtn.addEventListener('click', () => showEditor(true));
    el.labelCancel.addEventListener('click', () => showEditor(false));
    el.labelForm.addEventListener('submit', (e) => {
      e.preventDefault();
      withBusy(el.labelSave, 'Savingâ€¦', async () => {
        try {
          const { ok, data } = await sendJSON(endpoint, 'PUT', { [labelField]: el.editInput.value.trim() });
          if (!ok) {
            el.labelError.textContent = data.error || `Could not save the label.`;
            el.labelError.hidden = false;
            return;
          }
          render(data[contentKey]);
        } catch {
          el.labelError.textContent = 'Could not reach the server. Please try again.';
          el.labelError.hidden = false;
        }
      });
    });
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

    withBusy(el.submit, 'Uploadingâ€¦', async () => {
      try {
        const formData = new FormData();
        formData.append(labelField, el.labelInput.value.trim());
        let file = el.fileInput.files[0];
        // A PDF is turned into a picture first, so every device can show it.
        if (el.pdfLink && file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
          try {
            file = await pdfToImage(file);
          } catch {
            el.error.textContent = 'Could not read that PDF. Try a different file, or upload a picture of the menu.';
            el.error.hidden = false;
            return;
          }
        }
        formData.append('image', file);

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