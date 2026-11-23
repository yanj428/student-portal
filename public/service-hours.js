// Service Hours: the review queue, every Grade 9-12 student's progress, and
// the hour requirements. Used on the coordinator's page on the student site and
// in the admin panel's Service Hours section; #sh-root says which:
//   data-api     the review endpoint (decisions go to <api>/<id>/approve etc.)
//   data-login   where to go when the sign-in has run out
//   data-targets "edit" if this viewer may change the hour requirements
//   data-badge   id of the menu badge showing how many reports wait

(function () {
const root = document.getElementById('sh-root');
if (!root) return;
const API = root.dataset.api;
// An empty data-login (the admin panel) means: leave it to the page's own sign-in screen.
const LOGIN = root.dataset.login === undefined ? '/login' : root.dataset.login;
const CAN_SET_TARGETS = root.dataset.targets === 'edit';

const sh = {
  statPending: document.getElementById('sh-stat-pending'),
  statYear: document.getElementById('sh-stat-year'),
  statYearLabel: document.getElementById('sh-stat-year-label'),
  statDone: document.getElementById('sh-stat-done'),
  statDoneLabel: document.getElementById('sh-stat-done-label'),
  behindLabel: document.getElementById('sh-behind-label'),
  reviewCount: document.getElementById('sh-review-count'),
  reviewList: document.getElementById('sh-review-list'),
  reviewEmpty: document.getElementById('sh-review-empty'),
  bulk: document.getElementById('sh-bulk'),
  selectAll: document.getElementById('sh-select-all'),
  approveSelected: document.getElementById('sh-approve-selected'),
  search: document.getElementById('sh-search'),
  grades: document.getElementById('sh-grades'),
  behind: document.getElementById('sh-behind'),
  studentRows: document.getElementById('sh-student-rows'),
  studentsEmpty: document.getElementById('sh-students-empty'),
  goalsForm: document.getElementById('sh-goals-form'),
  targetTotal: document.getElementById('sh-target-total'),
  targetYearly: document.getElementById('sh-target-yearly'),
  goalsError: document.getElementById('sh-goals-error'),
  goalsSaved: document.getElementById('sh-goals-saved'),
  goalsSave: document.getElementById('sh-goals-save'),
};

let shData = { students: [], entries: [], targets: { total: 100, yearly: 25 } };
let shGrade = 'all';
// The student whose reports are open under their row in the Students table.
let shOpenStudent = null;
// Reports opened to read in full.
const shOpenReports = new Set();
// Reports ticked in the review queue, to approve together.
const shSelected = new Set();
// Notes typed but not sent yet, kept by report so redrawing a list (opening a
// full report, say) never wipes what the coordinator was writing.
const shNotes = new Map();
root.addEventListener('input', (e) => {
  if (e.target.classList.contains('sh-note')) shNotes.set(e.target.dataset.id, e.target.value);
});

function reportToggle(entry) {
  if (!entry.hasReport) return '';
  const open = shOpenReports.has(entry.id);
  return `<button type="button" class="hrs-link sh-read" data-report="${escapeHtml(entry.id)}" aria-expanded="${open}">${open ? 'Hide full report' : 'Read full report'}</button>
    ${open ? reportDetailsHtml(entry) : ''}`;
}

const studentsById = () => new Map(shData.students.map((s) => [s.id, s]));

// ---- Tabs ----
root.querySelectorAll('.sh-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    root.querySelectorAll('.sh-tab').forEach((t) => {
      const active = t === tab;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
      document.getElementById(`sh-panel-${t.dataset.tab}`).hidden = !active;
    });
  });
});

// ---- Summary ----
function renderStats() {
  const { total, yearly } = shData.targets;
  const pending = shData.entries.filter((e) => e.status === 'pending');
  const seniors = shData.students.filter((s) => s.gradeNumber === 12);
  sh.statPending.textContent = pending.length;
  sh.reviewCount.textContent = pending.length;
  sh.reviewCount.hidden = pending.length === 0;
  sh.statYear.textContent = `${shData.students.filter((s) => s.approvedThisYear >= yearly).length} / ${shData.students.length}`;
  sh.statYearLabel.textContent = `students have ${formatHours(yearly)} hours this school year`;
  sh.statDone.textContent = `${seniors.filter((s) => s.approved >= total).length} / ${seniors.length}`;
  sh.statDoneLabel.textContent = `Grade 12 students have all ${formatHours(total)} hours`;
  sh.behindLabel.textContent = `Only students under ${formatHours(yearly)} hours this year`;
  const badge = root.dataset.badge && document.getElementById(root.dataset.badge);
  if (badge) {
    badge.textContent = pending.length;
    badge.hidden = pending.length === 0;
  }
}

// ---- Review queue ----
function decisionButtons(entry) {
  return `
    <div class="sh-decide">
      <label class="sr-only" for="sh-note-${escapeHtml(entry.id)}">Note to the student (optional)</label>
      <input class="hrs-input sh-note" id="sh-note-${escapeHtml(entry.id)}" data-id="${escapeHtml(entry.id)}" type="text" maxlength="500" placeholder="Note to the student (optional)" value="${escapeHtml(shNotes.has(entry.id) ? shNotes.get(entry.id) : entry.status === 'pending' ? '' : entry.note)}" />
      <div class="sh-decide-buttons">
        <button type="button" class="hrs-btn ghost sh-reject" data-decide="reject" data-id="${escapeHtml(entry.id)}"${entry.status === 'rejected' ? ' disabled' : ''}>Not approve</button>
        <button type="button" class="hrs-btn primary" data-decide="approve" data-id="${escapeHtml(entry.id)}"${entry.status === 'approved' ? ' disabled' : ''}>Approve</button>
      </div>
    </div>`;
}

function renderReview() {
  const students = studentsById();
  const pending = shData.entries
    .filter((e) => e.status === 'pending')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  sh.reviewEmpty.hidden = pending.length > 0;
  const pendingIds = new Set(pending.map((e) => e.id));
  [...shSelected].forEach((id) => { if (!pendingIds.has(id)) shSelected.delete(id); });
  sh.bulk.hidden = pending.length < 2;
  updateBulk(pending.length);
  sh.reviewList.innerHTML = pending
    .map((entry) => {
      const student = students.get(entry.studentId);
      return `
      <article class="sh-review-card${shSelected.has(entry.id) ? ' selected' : ''}">
        <div class="sh-review-top">
          <label class="sh-pick"><input type="checkbox" data-pick="${escapeHtml(entry.id)}"${shSelected.has(entry.id) ? ' checked' : ''} /><span class="sr-only">Select ${escapeHtml(entry.title)}</span></label>
          <div class="sh-review-main">
            <p class="sh-review-name">${escapeHtml(student.fullName)} <span class="sh-grade-pill">${escapeHtml(student.gradeLabel)}</span></p>
            <p class="sh-review-activity">${escapeHtml(entry.title)}</p>
            <p class="sh-review-sub">${escapeHtml(reportGrade(entry))}${escapeHtml(reportWith(entry))} &middot; ${escapeHtml(reportDates(entry))} &middot; sent ${escapeHtml(formatEntryDate(entry.createdAt.slice(0, 10)))}</p>
            ${sdgBadgesHtml(entry)}
          </div>
          <span class="sh-review-hours">${escapeHtml(hoursWord(entry.hours))}</span>
        </div>
        ${reportToggle(entry)}
        ${decisionButtons(entry)}
      </article>`;
    })
    .join('');
}

function updateBulk(pendingCount) {
  sh.selectAll.checked = pendingCount > 0 && shSelected.size === pendingCount;
  sh.selectAll.indeterminate = shSelected.size > 0 && shSelected.size < pendingCount;
  sh.approveSelected.disabled = shSelected.size === 0;
  sh.approveSelected.textContent = shSelected.size ? `Approve selected (${shSelected.size})` : 'Approve selected';
}

sh.reviewList.addEventListener('change', (e) => {
  const id = e.target.dataset.pick;
  if (!id) return;
  if (e.target.checked) shSelected.add(id);
  else shSelected.delete(id);
  e.target.closest('.sh-review-card').classList.toggle('selected', e.target.checked);
  updateBulk(shData.entries.filter((x) => x.status === 'pending').length);
});

sh.selectAll.addEventListener('change', () => {
  shSelected.clear();
  if (sh.selectAll.checked) shData.entries.filter((x) => x.status === 'pending').forEach((x) => shSelected.add(x.id));
  renderReview();
});

sh.approveSelected.addEventListener('click', async () => {
  const items = [...shSelected].map((id) => ({ id, note: (shNotes.get(id) || '').trim() }));
  if (!items.length || !confirm(`Approve ${items.length} ${items.length === 1 ? 'report' : 'reports'}? Each student sees the note you typed on their report, if any.`)) return;
  sh.approveSelected.disabled = true;
  try {
    const { ok, data } = await sendHoursJson(`${API}/approve-many`, 'POST', { items });
    if (!ok) alert(data.error || 'Could not approve the reports.');
    else items.forEach(({ id }) => { shSelected.delete(id); shNotes.delete(id); });
  } catch {
    alert('Could not reach the server. Please try again.');
  }
  loadReview();
});

// ---- Students table ----
function renderGradeFilters() {
  const keys = [...new Set(shData.students.map((s) => String(s.gradeNumber)))].sort((a, b) => a - b);
  if (shGrade !== 'all' && !keys.includes(shGrade)) shGrade = 'all';
  sh.grades.innerHTML = [['all', 'All'], ...keys.map((k) => [k, `Grade ${k}`])]
    .map(([key, label]) => `<button type="button" class="sh-chip${key === shGrade ? ' active' : ''}" aria-pressed="${key === shGrade}" data-grade="${escapeHtml(key)}">${escapeHtml(label)}</button>`)
    .join('');
}

sh.grades.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-grade]');
  if (!btn) return;
  shGrade = btn.dataset.grade;
  renderGradeFilters();
  renderStudents();
});
sh.search.addEventListener('input', () => renderStudents());
sh.behind.addEventListener('change', () => renderStudents());

function progressCell(hours, target) {
  const percent = Math.min(100, Math.round((hours / target) * 100));
  const done = hours >= target;
  return `<div class="sh-progress-cell"><div class="hrs-progress${done ? ' done' : ''}"><div class="hrs-progress-bar" data-percent="${percent}"></div></div><span>${escapeHtml(formatHours(hours))} / ${escapeHtml(formatHours(target))}</span></div>`;
}

function studentEntriesHtml(student) {
  const entries = shData.entries
    .filter((e) => e.studentId === student.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (entries.length === 0) return '<p class="sh-empty-line">No reports yet.</p>';
  return entries
    .map((entry) => `
      <div class="sh-entry">
        <div class="sh-entry-main">
          <p class="sh-review-activity">${escapeHtml(entry.title)}</p>
          <p class="sh-review-sub">${escapeHtml(reportGrade(entry))}${escapeHtml(reportWith(entry))} &middot; ${escapeHtml(reportDates(entry))} &middot; ${escapeHtml(hoursWord(entry.hours))}${entry.hasReport ? '' : ' &middot; no report (from the school record)'}${entry.reviewedBy || entry.approvedBy ? ` &middot; reviewed by ${escapeHtml(entry.reviewedBy || entry.approvedBy)}` : ''}</p>
          ${entry.note && entry.status !== 'pending' ? `<p class="hrs-entry-note"><strong>Note:</strong> ${escapeHtml(entry.note)}</p>` : ''}
        </div>
        <span class="hrs-status status-${escapeHtml(entry.status)}">${escapeHtml(HOURS_STATUS_LABEL[entry.status])}</span>
        <div class="sh-entry-report">${reportToggle(entry)}</div>
        ${decisionButtons(entry)}
      </div>`)
    .join('');
}

function renderStudents() {
  const query = sh.search.value.trim().toLowerCase();
  const students = shData.students
    .filter((s) => shGrade === 'all' || String(s.gradeNumber) === shGrade)
    .filter((s) => !query || `${s.fullName} ${s.email}`.toLowerCase().includes(query))
    .filter((s) => !sh.behind.checked || s.approvedThisYear < shData.targets.yearly)
    .sort((a, b) => a.gradeNumber - b.gradeNumber || a.fullName.localeCompare(b.fullName));

  sh.studentsEmpty.hidden = students.length > 0;
  sh.studentRows.innerHTML = students
    .map((s) => {
      const open = s.id === shOpenStudent;
      return `
      <tr class="sh-student-row${open ? ' open' : ''}" data-student="${escapeHtml(s.id)}" tabindex="0" aria-expanded="${open}">
        <td><span class="sh-student-name">${escapeHtml(s.fullName)}</span><span class="sh-student-email">${escapeHtml(s.email)}</span></td>
        <td>${escapeHtml(s.gradeLabel)}</td>
        <td>${progressCell(s.approvedThisYear, shData.targets.yearly)}</td>
        <td>${progressCell(s.approved, shData.targets.total)}</td>
        <td class="num">${s.pending ? escapeHtml(formatHours(s.pending)) : '-'}</td>
      </tr>
      ${open ? `<tr class="sh-student-detail"><td colspan="5">${studentEntriesHtml(s)}</td></tr>` : ''}`;
    })
    .join('');
  // Set from script: the site's Content-Security-Policy blocks style="" attributes in HTML.
  sh.studentRows.querySelectorAll('[data-percent]').forEach((bar) => {
    bar.style.width = `${bar.dataset.percent}%`;
  });
}

function toggleStudent(row) {
  shOpenStudent = shOpenStudent === row.dataset.student ? null : row.dataset.student;
  renderStudents();
}
sh.studentRows.addEventListener('click', (e) => {
  const row = e.target.closest('.sh-student-row');
  if (row) toggleStudent(row);
});

// Read full report, in both the review queue and a student's list.
root.addEventListener('click', (e) => {
  const id = e.target.closest('[data-report]')?.dataset.report;
  if (!id) return;
  if (shOpenReports.has(id)) shOpenReports.delete(id);
  else shOpenReports.add(id);
  renderReview();
  renderStudents();
});
sh.studentRows.addEventListener('keydown', (e) => {
  const row = e.target.closest('.sh-student-row');
  if (row && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    toggleStudent(row);
  }
});

// ---- Approve / not approve (both the queue and a student's entries) ----
root.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-decide]');
  if (!btn) return;
  const container = btn.closest('.sh-decide');
  const note = container.querySelector('.sh-note').value.trim();
  container.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    const { ok, data } = await sendHoursJson(`${API}/${btn.dataset.id}/${btn.dataset.decide}`, 'POST', { note });
    if (!ok) alert(data.error || 'Could not save the decision.');
    else {
      shNotes.delete(btn.dataset.id);
      shSelected.delete(btn.dataset.id);
    }
  } catch {
    alert('Could not reach the server. Please try again.');
  }
  loadReview();
});

// ---- Requirements ----
function renderTargets() {
  sh.targetTotal.value = shData.targets.total;
  sh.targetYearly.value = shData.targets.yearly;
}
// Only the coordinator sets the requirements; other viewers just see them.
if (!CAN_SET_TARGETS) {
  sh.targetTotal.disabled = true;
  sh.targetYearly.disabled = true;
  sh.goalsSave.hidden = true;
}

sh.goalsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  sh.goalsError.hidden = true;
  sh.goalsSaved.hidden = true;
  sh.goalsSave.disabled = true;
  try {
    const body = { total: Number(sh.targetTotal.value), yearly: Number(sh.targetYearly.value) };
    const { ok, data } = await sendHoursJson('/api/cs-hours/review/targets', 'PUT', body);
    if (!ok) {
      sh.goalsError.textContent = data.error || 'Could not save.';
      sh.goalsError.hidden = false;
      return;
    }
    sh.goalsSaved.hidden = false;
    loadReview();
  } catch {
    sh.goalsError.textContent = 'Could not reach the server. Please try again.';
    sh.goalsError.hidden = false;
  } finally {
    sh.goalsSave.disabled = false;
  }
});

async function loadReview() {
  let data;
  try {
    const res = await fetch(API);
    if (res.status === 401) {
      if (LOGIN) window.location.href = LOGIN;
      return;
    }
    if (!res.ok) return;
    data = await res.json();
  } catch {
    return;
  }
  shData = data;
  renderStats();
  renderReview();
  renderGradeFilters();
  renderStudents();
  // Typing in a requirement box is not interrupted by a reload after a decision.
  if (!sh.goalsForm.contains(document.activeElement)) renderTargets();
}

loadReview();

// New reports show up on their own: every minute while the page is in view,
// and straight away when it comes back into view. A refresh waits while
// something is being typed, so a half-written note is never interrupted.
const typingHere = () => root.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)
  && document.activeElement.type !== 'checkbox';
const inView = () => document.visibilityState === 'visible' && root.offsetParent !== null;
function refreshSoon() {
  if (inView() && !typingHere()) loadReview();
}
setInterval(refreshSoon, 60 * 1000);
document.addEventListener('visibilitychange', refreshSoon);
// In the admin panel the section is shown and hidden by the sidebar.
const section = root.closest('.admin-page-section');
if (section) new MutationObserver(refreshSoon).observe(section, { attributes: true, attributeFilter: ['hidden'] });
})();
