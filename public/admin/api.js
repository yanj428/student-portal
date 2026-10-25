// Shared helpers used by every admin module: HTML-escaping for anything built
// from server data, and small wrappers around fetch so each module doesn't
// re-implement the same "send JSON, parse JSON, tolerate a non-JSON error
// body" dance.

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  // The textContent/innerHTML round-trip only encodes &, <, and > — quotes
  // aren't special in HTML text content, only inside an attribute value,
  // which is exactly where this output often ends up (href="...", a
  // data-email="..." attribute, etc.). Without this, a value containing a
  // literal " could break out of that attribute — confirmed exploitable via
  // the (unauthenticated) login form's email field showing up verbatim in
  // the admin Security tab's locked-accounts list.
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// The Edit + Remove button pair every list row has.
export const ITEM_ACTIONS_HTML = `
  <div class="simple-item-actions">
    <button class="edit-btn" aria-label="Edit">Edit</button>
    <button class="delete-btn" aria-label="Remove">${TRASH_ICON}</button>
  </div>`;

// A 401 from an admin endpoint means the session ended while the panel was
// open (a wrong current password also answers 401, hence the session check).
// Reloading shows the login gate instead of leaving a panel full of stale
// data that silently stops saving.
async function guardExpiredSession(res) {
  if (res.status === 401) {
    try {
      const session = await (await fetch('/api/admin/session')).json();
      if (!session.isAdmin) window.location.reload();
    } catch {
      // Offline: leave the panel as is.
    }
  }
  return res;
}

export async function getJSON(url) {
  const res = await guardExpiredSession(await fetch(url));
  if (!res.ok) return null;
  return res.json();
}

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function request(url, options) {
  const res = await guardExpiredSession(await fetch(url, options));
  return { ok: res.ok, data: await parseJsonSafe(res) };
}

export function sendJSON(url, method, body) {
  return request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export function sendForm(url, method, formData) {
  return request(url, { method, body: formData });
}

export function del(url) {
  return request(url, { method: 'DELETE' });
}

// Confirm, delete, and report a failure instead of silently reloading a list
// that still contains the item. `onDone` runs only after a successful delete.
export async function confirmDelete(url, message, onDone) {
  if (!confirm(message)) return;
  try {
    const { ok, data } = await del(url);
    if (!ok) {
      alert(data.error || 'Could not remove this. Please try again.');
      return;
    }
  } catch {
    alert('Could not reach the server. Please try again.');
    return;
  }
  onDone();
}

// Runs an async action with its button disabled, showing `busyLabel` while it
// runs, and puts the original label back afterwards. Stops double-clicks from
// firing the same request twice.
export async function withBusy(button, busyLabel, action) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  try {
    return await action();
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// Rebuilds a list of rows: clears the old ones, shows the empty hint when there
// is nothing, and calls build(div, item) to fill each new `.simple-item` row.
export function renderRows(listEl, emptyEl, items, build) {
  listEl.querySelectorAll('.simple-item').forEach((el) => el.remove());
  emptyEl.hidden = items.length > 0;
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'simple-item';
    div.dataset.id = item.id;
    build(div, item);
    listEl.appendChild(div);
  });
}