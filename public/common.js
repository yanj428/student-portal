// Shared by every student page: logout, the avatar link, the welcome date,
// and the helpers the page scripts use to fetch and render their data.

// The sidebar and the phone's More sheet each have a log out link.
document.querySelectorAll('.js-logout').forEach((link) => {
  link.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await fetch('/api/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  });
});

// Phone navigation: the More button opens a sheet with the pages that are not on the bottom bar.
const moreBtn = document.getElementById('more-btn');
const moreSheet = document.getElementById('more-sheet');
const moreBackdrop = document.getElementById('more-backdrop');
if (moreBtn && moreSheet && moreBackdrop) {
  const setMore = (open) => {
    moreSheet.hidden = !open;
    moreBackdrop.hidden = !open;
    moreBtn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('more-open', open);
  };
  moreBtn.addEventListener('click', () => setMore(moreSheet.hidden));
  moreBackdrop.addEventListener('click', () => setMore(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !moreSheet.hidden) {
      setMore(false);
      moreBtn.focus();
    }
  });
}

const changePasswordAvatar = document.getElementById('user-avatar');
if (changePasswordAvatar) {
  changePasswordAvatar.addEventListener('click', () => {
    window.location.href = '/change-password';
  });
}

// Today's date in the home page's welcome banner, re-checked periodically so it rolls
// over to the new day on its own if the portal is left open past midnight.
function updateTodayDate() {
  const dateEl = document.getElementById('today-date');
  if (!dateEl) return;
  const formatted = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  if (dateEl.textContent !== formatted) dateEl.textContent = formatted;
}
updateTodayDate();
setInterval(updateTodayDate, 60 * 1000);

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

// A name for use inside HTML, with a place to break the line between the words
// of a run-together name like "BetterWorldThailand", so a narrow card wraps it
// as "BetterWorld / Thailand" instead of overflowing or cutting a word in half.
function nameWithBreaks(name) {
  return escapeHtml(name).replace(/([a-z])([A-Z])/g, '$1&#8203;$2');
}