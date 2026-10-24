import { sendForm, sendJSON, confirmDelete } from './api.js';

// The add/edit form lifecycle shared by every admin list: edit mode, cancel,
// a submit that disables its button and reports errors, and delete with a
// confirm. Each module keeps only what's specific to it - how a row looks and
// which fields the form has.
//
//   endpoint     base URL, e.g. '/api/admin/quick-links'
//   addLabel     submit button text when adding, e.g. 'Add link'
//   readPayload  returns the object to send (JSON), or a FormData (multipart)
//   fill(item)   copies an item into the form fields for editing
//   onReset      optional extra clean-up when the form is reset
//   onSaved      optional (responseData, wasEditing) hook after a successful save
//   reload       re-fetches and re-renders the list
export function crudPanel({ form, submitBtn, cancelBtn, errorEl, endpoint, addLabel, saveError, readPayload, fill, onReset, onSaved, reload }) {
  let editingId = null;

  function reset() {
    editingId = null;
    form.reset();
    if (onReset) onReset();
    submitBtn.textContent = addLabel;
    cancelBtn.hidden = true;
  }

  function startEdit(item) {
    editingId = item.id;
    fill(item);
    errorEl.hidden = true;
    submitBtn.textContent = 'Save changes';
    cancelBtn.hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function remove(item, message) {
    return confirmDelete(`${endpoint}/${item.id}`, message, () => {
      if (editingId === item.id) reset();
      reload();
    });
  }

  // Wires a rendered row's Edit and Remove buttons.
  function bindRow(div, item, removeMessage) {
    div.querySelector('.edit-btn').addEventListener('click', () => startEdit(item));
    div.querySelector('.delete-btn').addEventListener('click', () => remove(item, removeMessage));
  }

  cancelBtn.addEventListener('click', reset);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const wasEditing = editingId !== null;
    submitBtn.disabled = true;
    submitBtn.textContent = wasEditing ? 'Saving…' : 'Adding…';

    try {
      const payload = readPayload();
      const url = wasEditing ? `${endpoint}/${editingId}` : endpoint;
      const method = wasEditing ? 'PUT' : 'POST';
      const { ok, data } = payload instanceof FormData ? await sendForm(url, method, payload) : await sendJSON(url, method, payload);

      if (!ok) {
        errorEl.textContent = data.error || saveError;
        errorEl.hidden = false;
        submitBtn.textContent = wasEditing ? 'Save changes' : addLabel;
        return;
      }

      if (onSaved) onSaved(data, wasEditing);
      reset();
      reload();
    } catch {
      errorEl.textContent = 'Could not reach the server. Please try again.';
      errorEl.hidden = false;
      submitBtn.textContent = wasEditing ? 'Save changes' : addLabel;
    } finally {
      submitBtn.disabled = false;
    }
  });

  return { reset, startEdit, remove, bindRow };
}
