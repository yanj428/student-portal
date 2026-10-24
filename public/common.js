// Shared by every student page: logout, the avatar link, the welcome date,
// and the helpers the page scripts use to fetch and render their data.

const logoutLink = document.getElementById('logout-link');
if (logoutLink) {
  logoutLink.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await fetch('/api/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  });
}

const changePasswordAvatar = document.getElementById('user-avatar');
if (changePasswordAvatar) {
  changePasswordAvatar.addEventListener('click', () => {
    window.location.href = '/change-password';
  });
}

// Today's date in the welcome banner, re-checked periodically so it rolls
// over to the new day on its own if the portal is left open past midnight.
const dateEl = document.getElementById('today-date');
if (dateEl) {
  const updateDate = () => {
    const formatted = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    if (dateEl.textContent !== formatted) dateEl.textContent = formatted;
  };
  updateDate();
  setInterval(updateDate, 60 * 1000);
}

// The textContent/innerHTML round-trip only encodes &, <, and > - quotes
// aren't special in HTML text content, only inside an attribute value, which
// is exactly where this output often ends up (href="...", etc.). Without
// this, a value containing a literal " could break out of that attribute.
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Login and the forced password-change redirect are handled server-side
// before a page is rendered (see server/middleware/pageAuth.js), so a 401 or
// 403 here means the session expired or the account changed while the page
// was open - send the student where they can fix it instead of leaving a page
// that silently looks empty.
async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (res.status === 401) {
      window.location.href = '/login';
      return null;
    }
    if (res.status === 403) {
      window.location.href = '/change-password';
      return null;
    }
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Fills listEl with one `tag.className` element per item (innerHTML from
// toHtml) and shows emptyEl only when there are none. `decorate` can set
// attributes on the element, e.g. an <a>'s href.
function renderList(listEl, emptyEl, items, tag, className, toHtml, decorate) {
  listEl.querySelectorAll(`.${className}`).forEach((el) => el.remove());
  emptyEl.hidden = items.length > 0;
  items.forEach((item) => {
    const el = document.createElement(tag);
    el.className = className;
    el.innerHTML = toHtml(item);
    if (decorate) decorate(el, item);
    listEl.appendChild(el);
  });
}

