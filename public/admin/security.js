import { escapeHtml, getJSON, sendJSON, confirmDelete, TRASH_ICON } from './api.js';

const lockedList = document.getElementById('security-locked-list');
const lockedEmpty = document.getElementById('security-locked-empty');
const unlockAllBtn = document.getElementById('security-unlock-all');
const attemptsBody = document.getElementById('security-attempts-body');
const attemptsFilter = document.getElementById('security-attempts-filter');
const attemptsFilterForm = document.getElementById('security-attempts-filter-form');

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
  renderAttempts(data.attempts);
}

function renderAttempts(attempts) {
  attemptsBody.innerHTML = '';
  if (attempts.length === 0) {
    attemptsBody.innerHTML = '<tr class="empty-row"><td colspan="4">No login attempts recorded yet.</td></tr>';
    return;
  }
  attempts.forEach((a) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(a.email)}</td>
      <td>${escapeHtml(a.ip || 'N/A')}</td>
      <td>${a.success ? '<span class="attempt-badge success">Success</span>' : `<span class="attempt-badge failed">${escapeHtml(a.reason || 'Failed')}</span>`}</td>
      <td>${formatTime(a.createdAt)}</td>
    `;
    attemptsBody.appendChild(tr);
  });
}

attemptsFilterForm.addEventListener('submit', (e) => {
  e.preventDefault();
  loadAttempts();
});

async function loadAdmins() {
  const data = await getJSON('/api/admin/admins');
  if (!data) return;
  renderAdmins(data.admins);
}

function renderAdmins(admins) {
  adminCountEl.textContent = admins.length;
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
  renderAuditLog(data.auditLog);
}

function renderAuditLog(entries) {
  auditLogBody.innerHTML = '';
  if (entries.length === 0) {
    auditLogBody.innerHTML = '<tr class="empty-row"><td colspan="4">No audit log entries yet.</td></tr>';
    return;
  }
  entries.forEach((entry) => {
    const tr = document.createElement('tr');
    const details = entry.details ? Object.values(entry.details).join(', ') : '';
    tr.innerHTML = `
      <td>${escapeHtml(entry.adminUsername)}</td>
      <td>${escapeHtml(entry.action)}</td>
      <td>${escapeHtml(details)}</td>
      <td>${formatTime(entry.createdAt)}</td>
    `;
    auditLogBody.appendChild(tr);
  });
}
