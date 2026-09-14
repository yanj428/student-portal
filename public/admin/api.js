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

export async function getJSON(url) {
  const res = await fetch(url);
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

export async function sendJSON(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: await parseJsonSafe(res) };
}

export async function sendForm(url, method, formData) {
  const res = await fetch(url, { method, body: formData });
  return { ok: res.ok, data: await parseJsonSafe(res) };
}

export async function del(url) {
  const res = await fetch(url, { method: 'DELETE' });
  return { ok: res.ok, data: await parseJsonSafe(res) };
}
