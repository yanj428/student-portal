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

// Require login: pull the signed-in student from the session, or bounce to login.html
async function loadCurrentStudent() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) {
      window.location.href = 'login.html';
      return;
    }
    const { student } = await res.json();

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText('user-name', `${student.firstName} ${student.lastName}`);
    setText('user-grade', student.grade);
    setText('user-avatar', (student.firstName[0] || '') + (student.lastName[0] || ''));
    setText('welcome-heading', `Welcome back, ${student.firstName}!`);
  } catch {
    window.location.href = 'login.html';
  }
}
loadCurrentStudent();

const logoutLink = document.getElementById('logout-link');
if (logoutLink) {
  logoutLink.addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Homepage text content — editable by admins, rendered into the fixed layout below
async function loadContent() {
  try {
    const res = await fetch('/api/content');
    if (!res.ok) return;
    const { content } = await res.json();

    const announcementsList = document.getElementById('announcements-list');
    if (announcementsList) {
      announcementsList.innerHTML = content.announcements
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

    const calendarList = document.getElementById('calendar-list');
    if (calendarList) {
      calendarList.innerHTML = content.calendarEvents
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

    const lunchList = document.getElementById('lunch-list');
    if (lunchList) {
      lunchList.innerHTML = content.lunchMenu
        .map(
          (l) => `
            <div class="lunch-day">
              <span class="lunch-weekday">${escapeHtml(l.weekday)}</span>
              <span class="lunch-item">${escapeHtml(l.item)}</span>
            </div>`
        )
        .join('');
    }

    const councilList = document.getElementById('council-list');
    if (councilList) {
      const colors = ['a1', 'a2', 'a3'];
      councilList.innerHTML = content.council
        .map((m, i) => `<div class="avatar-circle ${colors[i % colors.length]}">${escapeHtml(m.initials)}</div>`)
        .join('');
    }

    const clubsList = document.getElementById('clubs-list');
    if (clubsList) {
      clubsList.innerHTML = content.clubs.map((c) => `<span class="club-chip">${escapeHtml(c)}</span>`).join('');
    }

    const projectsList = document.getElementById('projects-list');
    if (projectsList) {
      projectsList.innerHTML = content.projects
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

    const quicklinksList = document.getElementById('quicklinks-list');
    if (quicklinksList) {
      quicklinksList.innerHTML = content.quickLinks
        .map((q) => `<a href="${escapeHtml(q.url)}" class="quicklink">${escapeHtml(q.label)}</a>`)
        .join('');
    }
  } catch {
    // Leave sections empty rather than breaking the page if content can't load.
  }
}
loadContent();
