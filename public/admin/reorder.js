import { sendJSON } from './api.js';

function dragAfterElement(container, y, itemSelector) {
  const items = [...container.querySelectorAll(`${itemSelector}:not(.dragging)`)];
  return items.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

// Reordering is driven entirely by pointer events (mousedown/move/up) rather
// than the native HTML5 drag-and-drop API. Native DnD treats things like
// <img> as draggable out of the box, and dropping one anywhere the app
// doesn't explicitly handle falls back to the browser's default action -
// navigating the whole tab to that file. Pointer events never start a native
// drag session at all, so that failure mode can't happen here regardless of
// what a row contains.
//
// Rows are `.simple-item` elements (or whatever `itemSelector` names, e.g. a
// table row) with a `data-id`. On drop, the new order is PUT to `url` (merged
// with `extraBody`); the list is only re-fetched if the order actually changed
// or the server refused it, so a plain click on the handle sends nothing.
export function enableReorder(handle, listEl, { url, extraBody, reload, itemSelector = '.simple-item' }) {
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const div = handle.closest(itemSelector);
    const idsNow = () => [...listEl.querySelectorAll(itemSelector)].map((el) => el.dataset.id);
    const originalIds = idsNow();
    div.classList.add('dragging');

    // Listening on `document` (rather than the handle itself) means tracking
    // survives the handle's own element being reordered in the DOM mid-drag,
    // and doesn't depend on pointer capture succeeding.
    const onMove = (moveEvent) => {
      const afterElement = dragAfterElement(listEl, moveEvent.clientY, itemSelector);
      if (afterElement == null) listEl.appendChild(div);
      else listEl.insertBefore(div, afterElement);
    };

    const onUp = async () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      div.classList.remove('dragging');

      const orderedIds = idsNow();
      if (orderedIds.join() === originalIds.join()) return;

      try {
        const { ok, data } = await sendJSON(url, 'PUT', { ...extraBody, orderedIds });
        if (!ok) alert(data.error || 'Could not save the new order.');
      } catch {
        alert('Could not reach the server. Please try again.');
      }
      reload();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });
}
