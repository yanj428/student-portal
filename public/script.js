// Sidebar navigation — real links (Home, Student Voice) navigate normally;
// placeholder "#" links for pages that don't exist yet just toggle active state.
document.querySelectorAll('.nav-item[data-page]').forEach((item) => {
  if (item.id === 'logout-link') return;
  if (item.getAttribute('href') !== '#') return;
  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
    item.classList.add('active');
  });
});

// Today's date in the welcome banner — re-checked periodically so it rolls
// over to the new day on its own if the portal is left open past midnight.
const dateEl = document.getElementById('today-date');
if (dateEl) {
  const formatToday = () =>
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const updateDate = () => {
    const formatted = formatToday();
    if (dateEl.textContent !== formatted) dateEl.textContent = formatted;
  };

  updateDate();
  setInterval(updateDate, 60 * 1000);
}

// Login and the forced password-change redirect are handled server-side
// before this page is even rendered (see server/middleware/pageAuth.js),
// so there's no client-side auth check or flash-prevention needed here —
// the user info in the topbar is already filled in by the server.

const logoutLink = document.getElementById('logout-link');
if (logoutLink) {
  logoutLink.addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });
}

const changePasswordAvatar = document.getElementById('user-avatar');
if (changePasswordAvatar) {
  changePasswordAvatar.addEventListener('click', () => {
    window.location.href = 'change-password.html';
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Homepage widgets — each section is its own collection now, fetched
// independently so one failing endpoint doesn't blank out the rest.
async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function loadAnnouncements() {
  const el = document.getElementById('announcements-list');
  if (!el) return;
  const data = await fetchJson('/api/announcements');
  if (!data) return;
  el.innerHTML = data.announcements
    .slice(0, 3)
    .map(
      (a) => `
        <div class="notice-item">
          <h3>${escapeHtml(a.title)}</h3>
          <p>${escapeHtml(a.body)}</p>
          <a href="#" class="see-more">See more</a>
        </div>`
    )
    .join('');
}

async function loadCalendarEvents() {
  const el = document.getElementById('calendar-list');
  if (!el) return;
  const data = await fetchJson('/api/calendar-events');
  if (!data) return;
  el.innerHTML = data.calendarEvents
    .slice(0, 3)
    .map(
      (e) => `
        <div class="calendar-item">
          <div class="date-chip"><span class="date-day">${escapeHtml(e.day)}</span><span class="date-month">${escapeHtml(e.month)}</span></div>
          <div class="calendar-info">
            <h3>${escapeHtml(e.title)}</h3>
            <p>${escapeHtml(e.subtitle)}</p>
          </div>
        </div>`
    )
    .join('');
}

async function loadLunchMenu() {
  const el = document.getElementById('lunch-list');
  if (!el) return;
  const data = await fetchJson('/api/content');
  if (!data) return;
  el.innerHTML = data.content.lunchMenu
    .map(
      (l) => `
        <div class="lunch-day">
          <span class="lunch-weekday">${escapeHtml(l.weekday)}</span>
          <span class="lunch-item">${escapeHtml(l.item)}</span>
        </div>`
    )
    .join('');
}

async function loadCouncil() {
  const el = document.getElementById('council-list');
  if (!el) return;
  const data = await fetchJson('/api/council');
  if (!data) return;
  const colors = ['a1', 'a2', 'a3'];
  el.innerHTML = data.council
    .map((m, i) => `<div class="avatar-circle ${colors[i % colors.length]}">${escapeHtml(m.initials)}</div>`)
    .join('');
}

async function loadAfterSchoolClubChips() {
  const el = document.getElementById('clubs-list');
  if (!el) return;
  const data = await fetchJson('/api/clubs?type=after-school');
  if (!data) return;
  el.innerHTML = data.clubs.map((c) => `<span class="club-chip">${escapeHtml(c.name)}</span>`).join('');
}

async function loadProjects() {
  const el = document.getElementById('projects-list');
  if (!el) return;
  const data = await fetchJson('/api/projects');
  if (!data) return;
  el.innerHTML = data.projects
    .map(
      (p) => `
        <div class="project-item">
          <div class="project-row">
            <span>${escapeHtml(p.title)}</span>
            <span class="project-pct">${p.percent}%</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width: ${p.percent}%"></div></div>
        </div>`
    )
    .join('');
}

async function loadQuickLinks() {
  const el = document.getElementById('quicklinks-list');
  if (!el) return;
  const data = await fetchJson('/api/quick-links');
  if (!data) return;
  el.innerHTML = data.quickLinks
    .map((q) => `<a href="${escapeHtml(q.url)}" class="quicklink">${escapeHtml(q.label)}</a>`)
    .join('');
}

loadAnnouncements();
loadCalendarEvents();
loadLunchMenu();
loadCouncil();
loadAfterSchoolClubChips();
loadProjects();
loadQuickLinks();
