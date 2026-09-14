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

const studentRows = document.getElementById('student-rows');
const emptyRow = document.getElementById('empty-row');
const studentCount = document.getElementById('student-count');

function showAdminPanel() {
  gate.hidden = true;
  adminPage.hidden = false;
  loadStudents();
  loadVoicePending();
  loadCurrentSlide();
  loadSlideArchive();
  loadCsClubs();
  loadCsEvents();
  loadLunchCurrent();
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

async function loadStudents() {
  const res = await fetch('/api/admin/students');
  if (!res.ok) return;
  const { students } = await res.json();
  renderStudents(students);
}

function renderStudents(students) {
  studentCount.textContent = students.length;
  const statStudents = document.getElementById('stat-students');
  if (statStudents) statStudents.textContent = students.length;
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
        <td>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}${student.locked ? ' <span class="lock-badge">Locked</span>' : ''}</td>
        <td>${escapeHtml(student.email)}</td>
        <td><span class="grade-pill">${escapeHtml(student.grade)}</span></td>
        <td>${created}</td>
        <td><button class="reset-btn" data-id="${student.id}" data-name="${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}" aria-label="Reset password">Reset password</button></td>
        <td><button class="delete-btn" data-id="${student.id}" aria-label="Remove account"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button></td>
      `;
      studentRows.appendChild(tr);
    });

  document.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteStudent(btn.dataset.id));
  });
  document.querySelectorAll('.reset-btn').forEach((btn) => {
    btn.addEventListener('click', () => resetStudentPassword(btn.dataset.id, btn.dataset.name));
  });
}

async function resetStudentPassword(id, name) {
  if (!confirm(`Reset ${name}'s password to the default password? This will also unlock the account if it's locked.`)) return;
  const res = await fetch(`/api/admin/students/${id}/reset-password`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Could not reset password.');
    return;
  }
  alert(`${name}'s password has been reset to: ${data.password}`);
  loadStudents();
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

    createSuccess.textContent = `Account created for ${data.student.firstName} ${data.student.lastName}. Default password: ${data.password}`;
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
  const statVoice = document.getElementById('stat-voice');
  if (statVoice) statVoice.textContent = items.length;
  const navVoiceBadge = document.getElementById('nav-voice-badge');
  if (navVoiceBadge) {
    navVoiceBadge.textContent = items.length;
    navVoiceBadge.hidden = items.length === 0;
  }
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

// ---- This week's slide ----
const currentSlideForm = document.getElementById('current-slide-form');
const currentSlideWeekLabelInput = document.getElementById('current-slide-week-label');
const currentSlideEmbedUrlInput = document.getElementById('current-slide-embed-url');
const currentSlideError = document.getElementById('current-slide-error');
const currentSlideSuccess = document.getElementById('current-slide-success');
const currentSlideSave = document.getElementById('current-slide-save');
const currentSlideClear = document.getElementById('current-slide-clear');
const currentSlideToArchive = document.getElementById('current-slide-to-archive');

async function loadCurrentSlide() {
  const res = await fetch('/api/admin/content');
  if (!res.ok) return;
  const { content } = await res.json();
  const slide = content.weeklySlide || { weekLabel: '', canvaEmbedUrl: '' };
  currentSlideWeekLabelInput.value = slide.weekLabel || '';
  currentSlideEmbedUrlInput.value = slide.canvaEmbedUrl || '';
}

async function saveCurrentSlide(weekLabel, canvaEmbedUrl) {
  currentSlideError.hidden = true;
  currentSlideSuccess.hidden = true;

  const res = await fetch('/api/admin/content');
  if (!res.ok) {
    currentSlideError.textContent = 'Could not reach the server. Please try again.';
    currentSlideError.hidden = false;
    return false;
  }
  const { content } = await res.json();
  content.weeklySlide = { weekLabel, canvaEmbedUrl };

  const putRes = await fetch('/api/admin/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  const data = await putRes.json();

  if (!putRes.ok) {
    currentSlideError.textContent = data.error || 'Could not save the slide.';
    currentSlideError.hidden = false;
    return false;
  }

  currentSlideSuccess.textContent = 'This week\'s slide updated.';
  currentSlideSuccess.hidden = false;
  return true;
}

currentSlideForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  currentSlideSave.disabled = true;
  currentSlideSave.textContent = 'Saving…';
  await saveCurrentSlide(currentSlideWeekLabelInput.value.trim(), currentSlideEmbedUrlInput.value.trim());
  currentSlideSave.disabled = false;
  currentSlideSave.textContent = 'Save';
});

currentSlideClear.addEventListener('click', async () => {
  if (!confirm('Delete the current slide? It will stop showing on the Announcements page.')) return;
  currentSlideClear.disabled = true;
  const ok = await saveCurrentSlide('', '');
  currentSlideClear.disabled = false;
  if (ok) {
    currentSlideWeekLabelInput.value = '';
    currentSlideEmbedUrlInput.value = '';
  }
});

currentSlideToArchive.addEventListener('click', async () => {
  currentSlideError.hidden = true;
  currentSlideSuccess.hidden = true;

  const weekLabel = currentSlideWeekLabelInput.value.trim();
  const canvaEmbedUrl = currentSlideEmbedUrlInput.value.trim();

  if (!weekLabel || !canvaEmbedUrl) {
    currentSlideError.textContent = 'Set a week label and Canva embed URL before archiving.';
    currentSlideError.hidden = false;
    return;
  }
  if (!confirm(`Move "${weekLabel}" to the archive and clear the current slide?`)) return;

  currentSlideToArchive.disabled = true;
  try {
    const archiveRes = await fetch('/api/admin/slide-archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekLabel, canvaEmbedUrl }),
    });
    const archiveData = await archiveRes.json();

    if (!archiveRes.ok) {
      currentSlideError.textContent = archiveData.error || 'Could not archive this slide.';
      currentSlideError.hidden = false;
      return;
    }

    const cleared = await saveCurrentSlide('', '');
    if (cleared) {
      currentSlideWeekLabelInput.value = '';
      currentSlideEmbedUrlInput.value = '';
      currentSlideSuccess.textContent = 'Slide moved to the archive.';
      currentSlideSuccess.hidden = false;
    }
    loadSlideArchive();
  } finally {
    currentSlideToArchive.disabled = false;
  }
});

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
  const statArchive = document.getElementById('stat-archive');
  if (statArchive) statArchive.textContent = slides.length;
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

// ---- Community Service clubs ----
const csClubForm = document.getElementById('cs-club-form');
const csClubNameInput = document.getElementById('cs-club-name');
const csClubLogoInput = document.getElementById('cs-club-logo');
const csClubDescriptionInput = document.getElementById('cs-club-description');
const csClubInstagramInput = document.getElementById('cs-club-instagram');
const csClubApplicationInput = document.getElementById('cs-club-application');
const csClubError = document.getElementById('cs-club-error');
const csClubSubmit = document.getElementById('cs-club-submit');
const csClubCancelEdit = document.getElementById('cs-club-cancel-edit');
const csClubAdminList = document.getElementById('cs-club-admin-list');
const csClubEmptyHint = document.getElementById('cs-club-empty-hint');

let editingClubId = null;

function resetCsClubForm() {
  editingClubId = null;
  csClubForm.reset();
  csClubSubmit.textContent = 'Add club';
  csClubCancelEdit.hidden = true;
}

async function loadCsClubs() {
  const res = await fetch('/api/admin/cs-clubs');
  if (!res.ok) return;
  const { clubs } = await res.json();
  renderCsClubsAdmin(clubs);
}

function renderCsClubsAdmin(clubs) {
  csClubAdminList.querySelectorAll('.cs-club-item').forEach((el) => el.remove());
  csClubEmptyHint.hidden = clubs.length > 0;

  clubs.forEach((club) => {
    const div = document.createElement('div');
    div.className = 'cs-club-item';
    div.innerHTML = `
      <div class="cs-club-item-head">
        <div class="cs-club-item-identity">
          ${club.logoUrl ? `<img class="cs-club-item-logo" src="${escapeHtml(club.logoUrl)}" alt="" />` : ''}
          <span class="cs-club-item-name">${escapeHtml(club.name)}</span>
        </div>
        <div class="cs-club-item-actions">
          <button class="edit-btn" aria-label="Edit club">Edit</button>
          <button class="delete-btn" aria-label="Remove club"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>
      <p class="cs-club-item-body">${escapeHtml(club.description)}</p>
      ${club.instagramUrl || club.applicationFormUrl ? `
        <div class="cs-club-item-links">
          ${club.instagramUrl ? `<a href="${escapeHtml(club.instagramUrl)}" target="_blank" rel="noopener">Instagram</a>` : ''}
          ${club.applicationFormUrl ? `<a href="${escapeHtml(club.applicationFormUrl)}" target="_blank" rel="noopener">Application form</a>` : ''}
        </div>` : ''}
    `;
    div.querySelector('.edit-btn').addEventListener('click', () => {
      editingClubId = club.id;
      csClubNameInput.value = club.name;
      csClubDescriptionInput.value = club.description;
      csClubInstagramInput.value = club.instagramUrl || '';
      csClubApplicationInput.value = club.applicationFormUrl || '';
      csClubLogoInput.value = '';
      csClubError.hidden = true;
      csClubSubmit.textContent = 'Save changes';
      csClubCancelEdit.hidden = false;
      csClubForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm(`Remove "${club.name}" from the Community Service page?`)) return;
      await fetch(`/api/admin/cs-clubs/${club.id}`, { method: 'DELETE' });
      if (editingClubId === club.id) resetCsClubForm();
      loadCsClubs();
    });
    csClubAdminList.appendChild(div);
  });
}

csClubCancelEdit.addEventListener('click', () => resetCsClubForm());

csClubForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  csClubError.hidden = true;
  csClubSubmit.disabled = true;
  csClubSubmit.textContent = editingClubId ? 'Saving…' : 'Adding…';

  try {
    const formData = new FormData();
    formData.append('name', csClubNameInput.value.trim());
    formData.append('description', csClubDescriptionInput.value.trim());
    formData.append('instagramUrl', csClubInstagramInput.value.trim());
    formData.append('applicationFormUrl', csClubApplicationInput.value.trim());
    if (csClubLogoInput.files[0]) formData.append('logo', csClubLogoInput.files[0]);

    const url = editingClubId ? `/api/admin/cs-clubs/${editingClubId}` : '/api/admin/cs-clubs';
    const res = await fetch(url, { method: editingClubId ? 'PUT' : 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      csClubError.textContent = data.error || 'Could not save club.';
      csClubError.hidden = false;
      return;
    }

    resetCsClubForm();
    loadCsClubs();
  } catch {
    csClubError.textContent = 'Could not reach the server. Please try again.';
    csClubError.hidden = false;
  } finally {
    csClubSubmit.disabled = false;
    csClubSubmit.textContent = editingClubId ? 'Save changes' : 'Add club';
  }
});

// ---- Community Service events & opportunities ----
const csEventForm = document.getElementById('cs-event-form');
const csEventTitleInput = document.getElementById('cs-event-title');
const csEventClubInput = document.getElementById('cs-event-club');
const csEventDateInput = document.getElementById('cs-event-date');
const csEventSignupInput = document.getElementById('cs-event-signup');
const csEventDescriptionInput = document.getElementById('cs-event-description');
const csEventError = document.getElementById('cs-event-error');
const csEventSubmit = document.getElementById('cs-event-submit');
const csEventAdminList = document.getElementById('cs-event-admin-list');
const csEventEmptyHint = document.getElementById('cs-event-empty-hint');

async function loadCsEvents() {
  const res = await fetch('/api/admin/cs-events');
  if (!res.ok) return;
  const { events } = await res.json();
  renderCsEventsAdmin(events);
}

function renderCsEventsAdmin(events) {
  csEventAdminList.querySelectorAll('.cs-event-item').forEach((el) => el.remove());
  csEventEmptyHint.hidden = events.length > 0;

  events.forEach((event) => {
    const div = document.createElement('div');
    div.className = 'cs-event-item';
    div.innerHTML = `
      <div class="cs-event-item-head">
        <span class="cs-event-item-title">${escapeHtml(event.title)}</span>
        <button class="delete-btn" aria-label="Remove event"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
      <span class="cs-event-item-meta">${escapeHtml(event.club)} &middot; ${escapeHtml(event.eventDate)}</span>
      <p class="cs-event-item-body">${escapeHtml(event.description)}</p>
    `;
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm(`Remove "${event.title}" from the Community Service page?`)) return;
      await fetch(`/api/admin/cs-events/${event.id}`, { method: 'DELETE' });
      loadCsEvents();
    });
    csEventAdminList.appendChild(div);
  });
}

csEventForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  csEventError.hidden = true;
  csEventSubmit.disabled = true;
  csEventSubmit.textContent = 'Posting…';

  try {
    const res = await fetch('/api/admin/cs-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: csEventTitleInput.value.trim(),
        club: csEventClubInput.value.trim(),
        eventDate: csEventDateInput.value.trim(),
        description: csEventDescriptionInput.value.trim(),
        signupUrl: csEventSignupInput.value.trim(),
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      csEventError.textContent = data.error || 'Could not post event.';
      csEventError.hidden = false;
      return;
    }

    csEventForm.reset();
    loadCsEvents();
  } catch {
    csEventError.textContent = 'Could not reach the server. Please try again.';
    csEventError.hidden = false;
  } finally {
    csEventSubmit.disabled = false;
    csEventSubmit.textContent = 'Post opportunity';
  }
});

// ---- Lunch schedule image upload ----
const lunchCurrent = document.getElementById('lunch-current');
const lunchCurrentImage = document.getElementById('lunch-current-image');
const lunchCurrentLabel = document.getElementById('lunch-current-label');
const lunchRemoveBtn = document.getElementById('lunch-remove-btn');
const lunchUploadForm = document.getElementById('lunch-upload-form');
const lunchWeekLabelInput = document.getElementById('lunch-week-label');
const lunchImageInput = document.getElementById('lunch-image-input');
const lunchUploadError = document.getElementById('lunch-upload-error');
const lunchUploadSubmit = document.getElementById('lunch-upload-submit');

async function loadLunchCurrent() {
  const res = await fetch('/api/admin/content');
  if (!res.ok) return;
  const { content } = await res.json();
  renderLunchCurrent(content.lunchSchedule || { weekLabel: '', imageUrl: '' });
}

function renderLunchCurrent(schedule) {
  if (schedule.imageUrl) {
    lunchCurrentImage.src = schedule.imageUrl;
    lunchCurrentLabel.textContent = schedule.weekLabel || 'No week label set';
    lunchCurrent.hidden = false;
  } else {
    lunchCurrent.hidden = true;
  }
}

lunchRemoveBtn.addEventListener('click', async () => {
  if (!confirm('Remove the current lunch menu image?')) return;
  const res = await fetch('/api/admin/lunch-image', { method: 'DELETE' });
  if (res.ok) {
    const { lunchSchedule } = await res.json();
    renderLunchCurrent(lunchSchedule);
  }
});

lunchUploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  lunchUploadError.hidden = true;

  if (!lunchImageInput.files[0]) {
    lunchUploadError.textContent = 'Please choose an image.';
    lunchUploadError.hidden = false;
    return;
  }

  lunchUploadSubmit.disabled = true;
  lunchUploadSubmit.textContent = 'Uploading…';

  try {
    const formData = new FormData();
    formData.append('weekLabel', lunchWeekLabelInput.value.trim());
    formData.append('image', lunchImageInput.files[0]);

    const res = await fetch('/api/admin/lunch-image', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      lunchUploadError.textContent = data.error || 'Could not upload image.';
      lunchUploadError.hidden = false;
      return;
    }

    lunchUploadForm.reset();
    renderLunchCurrent(data.lunchSchedule);
  } catch {
    lunchUploadError.textContent = 'Could not reach the server. Please try again.';
    lunchUploadError.hidden = false;
  } finally {
    lunchUploadSubmit.disabled = false;
    lunchUploadSubmit.textContent = 'Upload menu';
  }
});

// ---- Sidebar navigation ----
const pageTitles = {
  overview: 'Overview',
  students: 'Student Accounts',
  lunch: 'Lunch Schedule',
  archive: 'Announcements',
  community: 'Community Service',
  voice: 'Student Voice',
};

const navItems = document.querySelectorAll('.nav-item[data-page]');
const pageSections = document.querySelectorAll('.admin-page-section[data-section]');
const pageTitleEl = document.getElementById('page-title');

navItems.forEach((item) => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;

    navItems.forEach((n) => n.classList.toggle('active', n === item));
    pageSections.forEach((section) => {
      section.hidden = section.dataset.section !== page;
    });
    pageTitleEl.textContent = pageTitles[page] || 'Overview';
  });
});

const contentDateEl = document.getElementById('content-date');
if (contentDateEl) {
  contentDateEl.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

checkSession();
