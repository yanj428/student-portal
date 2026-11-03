import { escapeHtml, getJSON, sendJSON, confirmDelete, TRASH_ICON } from './api.js';

const lockedList = document.getElementById('security-locked-list');
const lockedEmpty = document.getElementById('security-locked-empty');
const unlockAllBtn = document.getElementById('security-unlock-all');
const attemptsBody = document.getElementById('security-attempts-body');
const attemptsFilter = document.getElementById('security-attempts-filter');
const attemptsFilterForm = document.getElementById('security-attempts-filter-form');
const failedOnlyBtn = document.getElementById('security-failed-only');
const attemptsMore = document.getElementById('security-attempts-more');
const attemptsCount = document.getElementById('security-attempts-count');
const auditMore = document.getElementById('audit-log-more');
const auditCount = document.getElementById('audit-log-count');
const statLocked = document.getElementById('sec-stat-locked');
const statLockedNote = document.getElementById('sec-stat-locked-note');
const statFailed = document.getElementById('sec-stat-failed');
const statAdmins = document.getElementById('sec-stat-admins');
const statAdminsNote = document.getElementById('sec-stat-admins-note');
const lockedCount = document.getElementById('sec-locked-count');
const PAGE = 10;
let attemptRows = [];
let attemptShown = PAGE;
let auditRows = [];
let auditShown = PAGE;

// One table shows at a time
document.querySelectorAll('.sec-tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.sec-tab').forEach((t) => t.classList.toggle('on', t === tab));
  document.querySelectorAll('.sec-pane').forEach((pane) => { pane.hidden = pane.dataset.pane !== tab.dataset.pane; });
}));

const cleanEmail = (email) => String(email || '').replace(/^admin:/, '');
const AUDIT_TEXT = {
  'admin.login': () => 'Signed in',
  'admin.password_change': () => 'Changed their password',
  'admin.role_change': (d) => `Made ${d.username} ${d.role === 'owner' ? 'an owner' : 'an editor'}`,
  'admin.delete': (d) => `Removed admin ${d.deletedUsername}`,
  'security.unlock': (d) => `Unlocked ${d.email}`,
  'security.unlock_all': () => 'Unlocked every locked account',
  'student.create': (d) => `Added student ${d.email}`,
  'student.update': (d) => `Edited student ${d.email}`,
  'student.delete': (d) => `Removed student ${d.email}`,
  'student.reset_password': (d) => `Reset the password for ${d.email}`,
  'student.lock': (d) => `Locked ${d.email}`,
  'student.unlock': (d) => `Unlocked ${d.email}`,
};
function describeAudit(entry) {
  const d = entry.details || {};
  const make = AUDIT_TEXT[entry.action];
  return make ? make(d) : [entry.action, ...Object.values(d)].join(' ');
}

const adminCountEl = document.getElementById('admin-count');
const adminList = document.getElementById('admin-list');
const adminListEmpty = document.getElementById('admin-list-empty');

const auditLogBody = document.getElementById('audit-log-body');

let currentAdminId = null;

// POSTs an action and reloads on success; failures are reported, not ignored.
async function postAction(url, body, failureMessage, onDone) {
  try {
    const { ok, data } = await sendJSON(url, 'POST', body);
    if (!ok) {
      alert(data.error || failureMessage);
      return;
    }
    onDone();
  } catch {
    alert('Could not reach the server. Please try again.');
  }
}

function formatTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function minutesUntil(iso) {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
}

export async function loadSecurity(session) {
  currentAdminId = session.id;
  await Promise.all([loadLockedAccounts(), loadAttempts(), loadAdmins(), loadAuditLog()]);
}

async function loadLockedAccounts() {
  const data = await getJSON('/api/admin/security/locked');
  if (!data) return;
  renderLocked(data.locked);
}

function renderLocked(entries) {
  lockedList.querySelectorAll('.simple-item').forEach((el) => el.remove());
  lockedEmpty.hidden = entries.length > 0;
  lockedCount.textContent = entries.length;
  statLocked.textContent = entries.length;
  statLockedNote.textContent = entries.length ? 'Needs a look' : 'All clear';
  statLockedNote.classList.toggle('warn', entries.length > 0);
  unlockAllBtn.hidden = entries.length === 0;

  entries.forEach((entry) => {
    const name = entry.student ? entry.student.fullName : '(no matching account)';
    const reason = entry.adminLocked
      ? 'Locked by an admin'
      : `Auto-locked, clears in about ${minutesUntil(entry.lockedUntil)} min`;

    const div = document.createElement('div');
    div.className = 'simple-item';
    div.innerHTML = `
      <div class="simple-item-head">
        <span class="simple-item-title">${escapeHtml(entry.email)}</span>
        <div class="simple-item-actions">
          <button class="edit-btn security-unlock-btn">Unlock</button>
        </div>
      </div>
      <p class="simple-item-body">${escapeHtml(name)} &middot; ${escapeHtml(reason)}</p>
    `;
    div.querySelector('.security-unlock-btn').addEventListener('click', () =>
      postAction('/api/admin/security/unlock', { email: entry.email }, 'Could not unlock this account.', loadLockedAccounts)
    );
    lockedList.appendChild(div);
  });
}

unlockAllBtn.addEventListener('click', () => {
  if (!confirm('Unlock every locked account? This clears both timed lockouts and admin locks.')) return;
  postAction('/api/admin/security/unlock-all', {}, 'Could not unlock the accounts.', loadLockedAccounts);
});

async function loadAttempts() {
  const email = attemptsFilter.value.trim();
  const url = email ? `/api/admin/security/attempts?email=${encodeURIComponent(email)}` : '/api/admin/security/attempts';
  const data = await getJSON(url);
  if (!data) return;
  attemptRows = data.attempts;
  attemptShown = PAGE;
  if (!email) {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    statFailed.textContent = attemptRows.filter((a) => !a.success && new Date(a.createdAt).getTime() >= dayAgo).length;
  }
  renderAttempts();
}

function renderAttempts() {
  const failedOnly = failedOnlyBtn.getAttribute('aria-pressed') === 'true';
  const rows = failedOnly ? attemptRows.filter((a) => !a.success) : attemptRows;
  attemptsBody.innerHTML = '';
  if (rows.length === 0) {
    attemptsBody.innerHTML = `<tr class="empty-row"><td colspan="4">${failedOnly ? 'No failed attempts.' : 'No login attempts recorded yet.'}</td></tr>`;
  }
  rows.slice(0, attemptShown).forEach((a) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="muted-cell">${formatTime(a.createdAt)}</td>
      <td>${escapeHtml(cleanEmail(a.email))}</td>
      <td>${a.success ? '<span class="attempt-badge success">Success</span>' : `<span class="attempt-badge failed">${escapeHtml(a.reason || 'Failed')}</span>`}</td>
      <td class="muted-cell">${escapeHtml(a.ip || 'N/A')}</td>
    `;
    attemptsBody.appendChild(tr);
  });
  const shown = Math.min(attemptShown, rows.length);
  attemptsCount.textContent = rows.length ? `Showing ${shown} of ${rows.length} · kept for 90 days` : 'Kept for 90 days';
  attemptsMore.hidden = rows.length <= attemptShown;
}

attemptsFilterForm.addEventListener('submit', (e) => {
  e.preventDefault();
  loadAttempts();
});
let searchTimer;
attemptsFilter.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadAttempts, 300);
});
failedOnlyBtn.addEventListener('click', () => {
  failedOnlyBtn.setAttribute('aria-pressed', String(failedOnlyBtn.getAttribute('aria-pressed') !== 'true'));
  failedOnlyBtn.classList.toggle('on');
  attemptShown = PAGE;
  renderAttempts();
});
attemptsMore.addEventListener('click', () => { attemptShown += PAGE; renderAttempts(); });
auditMore.addEventListener('click', () => { auditShown += PAGE; renderAuditLog(); });

async function loadAdmins() {
  const data = await getJSON('/api/admin/admins');
  if (!data) return;
  renderAdmins(data.admins);
}

function renderAdmins(admins) {
  adminCountEl.textContent = admins.length;
  statAdmins.textContent = admins.length;
  const owners = admins.filter((a) => a.role === 'owner').length;
  statAdminsNote.textContent = `${owners} owner${owners === 1 ? '' : 's'}`;
  adminList.querySelectorAll('.simple-item').forEach((el) => el.remove());
  adminListEmpty.hidden = admins.length > 0;

  admins.forEach((admin) => {
    const isSelf = admin.id === currentAdminId;
    const toggleRole = admin.role === 'owner' ? 'editor' : 'owner';
    const div = document.createElement('div');
    div.className = 'simple-item';
    div.innerHTML = `
      <div class="simple-item-head">
        <span class="simple-item-title">${escapeHtml(admin.username)}${isSelf ? ' (you)' : ''}</span>
        <div class="simple-item-actions">
          ${isSelf ? '' : `<button class="edit-btn role-toggle-btn">Make ${toggleRole}</button>
          <button class="delete-btn" aria-label="Remove admin">${TRASH_ICON}</button>`}
        </div>
      </div>
      <p class="simple-item-body">${admin.role === 'owner' ? 'Owner' : 'Editor'}</p>
    `;
    // Your own row has neither button: demoting yourself would lock this tab
    // out mid-session, and removing yourself is refused by the server anyway.
    if (!isSelf) {
      div.querySelector('.role-toggle-btn').addEventListener('click', async () => {
        if (!confirm(`Make ${admin.username} ${toggleRole === 'owner' ? 'an owner' : 'an editor'}?`)) return;
        try {
          const { ok, data } = await sendJSON(`/api/admin/admins/${admin.id}/role`, 'PATCH', { role: toggleRole });
          if (!ok) {
            alert(data.error || 'Could not change this admin’s role.');
            return;
          }
          loadAdmins();
        } catch {
          alert('Could not reach the server. Please try again.');
        }
      });
      div.querySelector('.delete-btn').addEventListener('click', () =>
        confirmDelete(`/api/admin/admins/${admin.id}`, `Remove admin access for ${admin.username}?`, loadAdmins)
      );
    }
    adminList.appendChild(div);
  });
}

async function loadAuditLog() {
  const data = await getJSON('/api/admin/security/audit-log');
  if (!data) return;
  auditRows = data.auditLog;
  auditShown = PAGE;
  renderAuditLog();
}

function renderAuditLog() {
  auditLogBody.innerHTML = '';
  if (auditRows.length === 0) {
    auditLogBody.innerHTML = '<tr class="empty-row"><td colspan="3">No audit log entries yet.</td></tr>';
  }
  auditRows.slice(0, auditShown).forEach((entry) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="muted-cell">${formatTime(entry.createdAt)}</td>
      <td>${escapeHtml(entry.adminUsername)}</td>
      <td>${escapeHtml(describeAudit(entry))}</td>
    `;
    auditLogBody.appendChild(tr);
  });
  const shown = Math.min(auditShown, auditRows.length);
  auditCount.textContent = auditRows.length ? `Showing ${shown} of ${auditRows.length}` : 'Changes and unlocks made by admins';
  auditMore.hidden = auditRows.length <= auditShown;
}
