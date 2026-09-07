const gate = document.getElementById('gate');
const gateForm = document.getElementById('gate-form');
const adminPasswordInput = document.getElementById('admin-password');
const gateError = document.getElementById('gate-error');
const adminPage = document.getElementById('admin-page');
const adminLogout = document.getElementById('admin-logout');

const createForm = document.getElementById('create-form');
const createError = document.getElementById('create-error');
const createSuccess = document.getElementById('create-success');
const createSubmit = document.getElementById('create-submit');
const generatePasswordBtn = document.getElementById('generate-password');
const tempPasswordInput = document.getElementById('temp-password');

const studentRows = document.getElementById('student-rows');
const emptyRow = document.getElementById('empty-row');
const studentCount = document.getElementById('student-count');

function showAdminPanel() {
  gate.hidden = true;
  adminPage.hidden = false;
  loadStudents();
  loadContent();
  loadVoicePending();
  loadSlideArchive();
}

function showGate() {
  gate.hidden = false;
  adminPage.hidden = true;
}

async function checkSession() {
  const res = await fetch('/api/admin/session');
  const data = await res.json();
  if (data.isAdmin) showAdminPanel();
  else showGate();
}

gateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  gateError.hidden = true;

  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: adminPasswordInput.value }),
  });

  if (!res.ok) {
    gateError.hidden = false;
    return;
  }
  adminPasswordInput.value = '';
  showAdminPanel();
});

adminLogout.addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  showGate();
});

generatePasswordBtn.addEventListener('click', () => {
  const specials = '!@#$%^&*';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (chars, n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

  const raw = pick(upper, 1) + pick(lower, 4) + pick(digits, 4) + pick(specials, 1);
  tempPasswordInput.value = raw.split('').sort(() => Math.random() - 0.5).join('');
  tempPasswordInput.type = 'text';
});

async function loadStudents() {
  const res = await fetch('/api/admin/students');
  if (!res.ok) return;
  const { students } = await res.json();
  renderStudents(students);
}

function renderStudents(students) {
  studentCount.textContent = students.length;
  studentRows.innerHTML = '';

  if (students.length === 0) {
    studentRows.appendChild(emptyRow);
    return;
  }

  students
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((student) => {
      const tr = document.createElement('tr');
      const created = new Date(student.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      tr.innerHTML = `
        <td>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</td>
        <td>${escapeHtml(student.email)}</td>
        <td><span class="grade-pill">${escapeHtml(student.grade)}</span></td>
        <td>${created}</td>
        <td><button class="delete-btn" data-id="${student.id}" aria-label="Remove account"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button></td>
      `;
      studentRows.appendChild(tr);
    });

  document.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteStudent(btn.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function deleteStudent(id) {
  if (!confirm('Remove this student account? This cannot be undone.')) return;
  const res = await fetch(`/api/admin/students/${id}`, { method: 'DELETE' });
  if (res.ok) loadStudents();
}

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  createError.hidden = true;
  createSuccess.hidden = true;
  createSubmit.disabled = true;
  createSubmit.textContent = 'Creating…';

  const payload = {
    firstName: document.getElementById('first-name').value.trim(),
    lastName: document.getElementById('last-name').value.trim(),
    email: document.getElementById('student-email').value.trim(),
    grade: document.getElementById('grade').value,
    password: tempPasswordInput.value,
  };

  try {
    const res = await fetch('/api/admin/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      createError.textContent = data.error || 'Could not create account.';
      createError.hidden = false;
      return;
    }

    createSuccess.textContent = `Account created for ${data.student.firstName} ${data.student.lastName}. Share the temporary password with them directly.`;
    createSuccess.hidden = false;
    createForm.reset();
    loadStudents();
  } catch {
    createError.textContent = 'Could not reach the server. Please try again.';
    createError.hidden = false;
  } finally {
    createSubmit.disabled = false;
    createSubmit.textContent = 'Create account';
  }
});

// ---- Homepage content editor ----
const contentForm = document.getElementById('content-form');
const contentError = document.getElementById('content-error');
const contentSuccess = document.getElementById('content-success');
const contentSave = document.getElementById('content-save');

const announcementsFields = document.getElementById('announcements-fields');
const calendarFields = document.getElementById('calendar-fields');
const lunchFields = document.getElementById('lunch-fields');
const councilFields = document.getElementById('council-fields');
const clubsFields = document.getElementById('clubs-fields');
const projectsFields = document.getElementById('projects-fields');
const quicklinksFields = document.getElementById('quicklinks-fields');

function fieldAttrs(section, index, field) {
  return `data-section="${section}" data-index="${index}" data-field="${field}"`;
}

async function loadContent() {
  const res = await fetch('/api/admin/content');
  if (!res.ok) return;
  const { content } = await res.json();
  renderContentForm(content);
}

function renderContentForm(content) {
  const slide = content.weeklySlide || { weekLabel: '', canvaEmbedUrl: '' };
  document.getElementById('slide-week-label').value = slide.weekLabel;
  document.getElementById('slide-embed-url').value = slide.canvaEmbedUrl;

  announcementsFields.innerHTML = content.announcements
    .map(
      (a, i) => `
        <div class="content-row stacked">
          <label class="row-label">Announcement ${i + 1}</label>
          <input class="field-input" ${fieldAttrs('announcements', i, 'title')} value="${escapeHtml(a.title)}" placeholder="Title" />
          <textarea class="field-input" ${fieldAttrs('announcements', i, 'body')} placeholder="Body">${escapeHtml(a.body)}</textarea>
        </div>`
    )
    .join('');

  calendarFields.innerHTML = content.calendarEvents
    .map(
      (e, i) => `
        <div class="content-row calendar-row">
          <input class="field-input" ${fieldAttrs('calendarEvents', i, 'day')} value="${escapeHtml(e.day)}" placeholder="Day" />
          <input class="field-input" ${fieldAttrs('calendarEvents', i, 'month')} value="${escapeHtml(e.month)}" placeholder="Month" />
          <input class="field-input" ${fieldAttrs('calendarEvents', i, 'title')} value="${escapeHtml(e.title)}" placeholder="Event title" />
          <input class="field-input" ${fieldAttrs('calendarEvents', i, 'subtitle')} value="${escapeHtml(e.subtitle)}" placeholder="Subtitle" />
        </div>`
    )
    .join('');

  lunchFields.innerHTML = content.lunchMenu
    .map(
      (l, i) => `
        <div class="content-row">
          <span class="row-label">${escapeHtml(l.weekday)}</span>
          <input class="field-input" ${fieldAttrs('lunchMenu', i, 'item')} value="${escapeHtml(l.item)}" placeholder="Menu item" />
          <input type="hidden" ${fieldAttrs('lunchMenu', i, 'weekday')} value="${escapeHtml(l.weekday)}" />
        </div>`
    )
    .join('');

  councilFields.innerHTML = content.council
    .map(
      (m, i) => `
        <div class="content-row">
          <label class="row-label">Member ${i + 1}</label>
          <input class="field-input" ${fieldAttrs('council', i, 'initials')} value="${escapeHtml(m.initials)}" placeholder="Initials (e.g. EM)" maxlength="3" />
        </div>`
    )
    .join('');

  clubsFields.innerHTML = content.clubs
    .map(
      (c, i) => `
        <div class="content-row">
          <label class="row-label">Club ${i + 1}</label>
          <input class="field-input" data-section="clubs" data-index="${i}" value="${escapeHtml(c)}" placeholder="Club name" />
        </div>`
    )
    .join('');

  projectsFields.innerHTML = content.projects
    .map(
      (p, i) => `
        <div class="content-row project-row">
          <input class="field-input" ${fieldAttrs('projects', i, 'title')} value="${escapeHtml(p.title)}" placeholder="Project title" />
          <input class="field-input" type="number" min="0" max="100" ${fieldAttrs('projects', i, 'percent')} value="${p.percent}" placeholder="%" />
        </div>`
    )
    .join('');

  quicklinksFields.innerHTML = content.quickLinks
    .map(
      (q, i) => `
        <div class="content-row two-col">
          <label class="row-label">Link ${i + 1}</label>
          <input class="field-input" ${fieldAttrs('quickLinks', i, 'label')} value="${escapeHtml(q.label)}" placeholder="Label" />
          <input class="field-input" ${fieldAttrs('quickLinks', i, 'url')} value="${escapeHtml(q.url)}" placeholder="URL" />
        </div>`
    )
    .join('');
}

function collectContentFromForm() {
  const content = {
    weeklySlide: { weekLabel: '', canvaEmbedUrl: '' },
    announcements: [],
    calendarEvents: [],
    lunchMenu: [],
    clubs: [],
    projects: [],
    quickLinks: [],
    council: [],
  };

  contentForm.querySelectorAll('[data-section]').forEach((el) => {
    const section = el.dataset.section;
    const field = el.dataset.field;
    const value = el.type === 'number' ? Number(el.value) : el.value;

    if (section === 'weeklySlide') {
      content.weeklySlide[field] = value;
      return;
    }

    const index = Number(el.dataset.index);
    if (!content[section][index]) content[section][index] = section === 'clubs' ? '' : {};

    if (section === 'clubs') {
      content[section][index] = value;
    } else {
      content[section][index][field] = value;
    }
  });

  return content;
}

contentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  contentError.hidden = true;
  contentSuccess.hidden = true;
  contentSave.disabled = true;
  contentSave.textContent = 'Saving…';

  try {
    const res = await fetch('/api/admin/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: collectContentFromForm() }),
    });
    const data = await res.json();

    if (!res.ok) {
      contentError.textContent = data.error || 'Could not save content.';
      contentError.hidden = false;
      return;
    }

    contentSuccess.textContent = 'Homepage content updated.';
    contentSuccess.hidden = false;
    renderContentForm(data.content);
  } catch {
    contentError.textContent = 'Could not reach the server. Please try again.';
    contentError.hidden = false;
  } finally {
    contentSave.disabled = false;
    contentSave.textContent = 'Save content';
  }
});

// ---- Student Voice moderation ----
const voicePendingList = document.getElementById('voice-pending-list');
const voicePendingEmpty = document.getElementById('voice-pending-empty');
const voicePendingCount = document.getElementById('voice-pending-count');

async function loadVoicePending() {
  const res = await fetch('/api/admin/voice/pending');
  if (!res.ok) return;
  const { items } = await res.json();
  renderVoicePending(items);
}

function renderVoicePending(items) {
  voicePendingCount.textContent = items.length;
  voicePendingList.querySelectorAll('.mod-item').forEach((el) => el.remove());
  voicePendingEmpty.hidden = items.length > 0;

  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'mod-item';
    const created = new Date(item.createdAt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    div.innerHTML = `
      <div class="mod-item-head">
        <div>
          <span class="mod-item-author">${escapeHtml(item.authorName)}</span>
          <span class="mod-item-meta"> &middot; ${escapeHtml(item.authorGrade)} &middot; ${created}</span>
        </div>
        <span class="mod-type-badge">${item.type === 'post' ? escapeHtml(item.category) : 'Reply'}</span>
      </div>
      ${item.type === 'post' ? `<div class="mod-item-title">${escapeHtml(item.title)}</div>` : ''}
      ${item.type === 'reply' ? `<div class="mod-item-context">Replying to: "${escapeHtml(item.postPreview)}${item.postPreview.length >= 80 ? '…' : ''}"</div>` : ''}
      <p class="mod-item-body">${escapeHtml(item.body)}</p>
      <div class="mod-item-actions">
        <button class="btn primary approve-btn">Approve</button>
        <button class="btn reject reject-btn">Reject</button>
      </div>
    `;

    const approveUrl =
      item.type === 'post'
        ? `/api/admin/voice/posts/${item.id}/approve`
        : `/api/admin/voice/posts/${item.postId}/replies/${item.id}/approve`;
    const rejectUrl =
      item.type === 'post'
        ? `/api/admin/voice/posts/${item.id}/reject`
        : `/api/admin/voice/posts/${item.postId}/replies/${item.id}/reject`;

    div.querySelector('.approve-btn').addEventListener('click', async () => {
      await fetch(approveUrl, { method: 'POST' });
      loadVoicePending();
    });
    div.querySelector('.reject-btn').addEventListener('click', async () => {
      if (!confirm('Reject and permanently remove this?')) return;
      await fetch(rejectUrl, { method: 'POST' });
      loadVoicePending();
    });

    voicePendingList.appendChild(div);
  });
}

// ---- Slide archive ----
const archiveForm = document.getElementById('archive-form');
const archiveWeekLabelInput = document.getElementById('archive-week-label');
const archiveEmbedUrlInput = document.getElementById('archive-embed-url');
const archiveError = document.getElementById('archive-error');
const archiveSubmit = document.getElementById('archive-submit');
const archiveRows = document.getElementById('archive-rows');
const archiveEmptyRow = document.getElementById('archive-empty-row');

async function loadSlideArchive() {
  const res = await fetch('/api/admin/slide-archive');
  if (!res.ok) return;
  const { slides } = await res.json();
  renderSlideArchive(slides);
}

function renderSlideArchive(slides) {
  archiveRows.querySelectorAll('tr:not(#archive-empty-row)').forEach((el) => el.remove());

  if (slides.length === 0) {
    archiveRows.appendChild(archiveEmptyRow);
    return;
  }
  archiveEmptyRow.remove();

  slides.forEach((slide) => {
    const tr = document.createElement('tr');
    const archived = new Date(slide.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    tr.innerHTML = `
      <td>${escapeHtml(slide.weekLabel)}</td>
      <td><a href="${escapeHtml(slide.canvaEmbedUrl)}" target="_blank" rel="noopener">View</a></td>
      <td>${archived}</td>
      <td><button class="delete-btn" data-id="${slide.id}" aria-label="Remove from archive"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button></td>
    `;
    tr.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Remove this slide from the archive?')) return;
      await fetch(`/api/admin/slide-archive/${slide.id}`, { method: 'DELETE' });
      loadSlideArchive();
    });
    archiveRows.appendChild(tr);
  });
}

archiveForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  archiveError.hidden = true;
  archiveSubmit.disabled = true;
  archiveSubmit.textContent = 'Adding…';

  try {
    const res = await fetch('/api/admin/slide-archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weekLabel: archiveWeekLabelInput.value.trim(),
        canvaEmbedUrl: archiveEmbedUrlInput.value.trim(),
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      archiveError.textContent = data.error || 'Could not add to archive.';
      archiveError.hidden = false;
      return;
    }

    archiveForm.reset();
    loadSlideArchive();
  } catch {
    archiveError.textContent = 'Could not reach the server. Please try again.';
    archiveError.hidden = false;
  } finally {
    archiveSubmit.disabled = false;
    archiveSubmit.textContent = 'Add to archive';
  }
});

checkSession();
