import { escapeHtml, getJSON, sendJSON } from './api.js';

const lockedList = document.getElementById('security-locked-list');
const lockedEmpty = document.getElementById('security-locked-empty');
const unlockAllBtn = document.getElementById('security-unlock-all');
const attemptsBody = document.getElementById('security-attempts-body');
const attemptsFilter = document.getElementById('security-attempts-filter');
const attemptsFilterForm = document.getElementById('security-attempts-filter-form');

const adminCountEl = document.getElementById('admin-count');
const adminList = document.getElementById('admin-list');
const adminListEmpty = document.getElementById('admin-list-empty');
const adminCreateForm = document.getElementById('admin-create-form');
const newAdminEmail = document.getElementById('new-admin-email');
const newAdminPassword = document.getElementById('new-admin-password');
const newAdminRole = document.getElementById('new-admin-role');
const adminCreateError = document.getElementById('admin-create-error');

const auditLogBody = document.getElementById('audit-log-body');

let currentAdminId = null;

function formatTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function minutesUntil(iso) {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
}

export async function loadSecurity() {
  const session = await getJSON('/api/admin/session');
  if (session) currentAdminId = session.id;
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
    const name = entry.student ? `${entry.student.firstName} ${entry.student.lastName}` : '(no matching account)';
    const reason = entry.adminLocked
      ? 'Locked by an admin'
      : `Auto-locked — clears in about ${minutesUntil(entry.lockedUntil)} min`;

    const div = document.createElement('div');
    div.className = 'simple-item';
    div.innerHTML = `
      <div class="simple-item-head">
        <span class="simple-item-title">${escapeHtml(entry.email)}</span>
        <div class="simple-item-actions">
          <button class="edit-btn security-unlock-btn" data-email="${escapeHtml(entry.email)}">Unlock</button>
        </div>
      </div>
      <p class="simple-item-body">${escapeHtml(name)} &middot; ${escapeHtml(reason)}</p>
    `;
    div.querySelector('.security-unlock-btn').addEventListener('click', async () => {
      await sendJSON('/api/admin/security/unlock', 'POST', { email: entry.email });
      loadLockedAccounts();
    });
    lockedList.appendChild(div);
  });
}

unlockAllBtn.addEventListener('click', async () => {
  if (!confirm('Unlock every locked account? This clears both timed lockouts and admin locks.')) return;
  await sendJSON('/api/admin/security/unlock-all', 'POST', {});
  loadLockedAccounts();
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
      <td>${escapeHtml(a.ip || '—')}</td>
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
        <span class="simple-item-title">${escapeHtml(admin.email)}${isSelf ? ' (you)' : ''}</span>
        <div class="simple-item-actions">
          <button class="edit-btn role-toggle-btn">Make ${toggleRole}</button>
          ${isSelf ? '' : '<button class="delete-btn" aria-label="Remove admin"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'}
        </div>
      </div>
      <p class="simple-item-body">${admin.role === 'owner' ? 'Owner' : 'Editor'}</p>
    `;
    div.querySelector('.role-toggle-btn').addEventListener('click', async () => {
      if (!confirm(`Make ${admin.email} ${toggleRole === 'owner' ? 'an owner' : 'an editor'}?`)) return;
      const { ok, data } = await sendJSON(`/api/admin/admins/${admin.id}/role`, 'PATCH', { role: toggleRole });
      if (!ok) {
        alert(data.error || 'Could not change this admin’s role.');
        return;
      }
      loadAdmins();
    });
    if (!isSelf) {
      div.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!confirm(`Remove admin access for ${admin.email}?`)) return;
        const { ok, data } = await sendJSON(`/api/admin/admins/${admin.id}`, 'DELETE', {});
        if (!ok) {
          alert(data.error || 'Could not remove this admin.');
          return;
        }
        loadAdmins();
      });
    }
    adminList.appendChild(div);
  });
}

adminCreateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  adminCreateError.hidden = true;

  const { ok, data } = await sendJSON('/api/admin/admins', 'POST', {
    email: newAdminEmail.value.trim(),
    password: newAdminPassword.value,
    role: newAdminRole.value,
  });

  if (!ok) {
    adminCreateError.textContent = data.error || 'Could not add this admin.';
    adminCreateError.hidden = false;
    return;
  }

  adminCreateForm.reset();
  loadAdmins();
});

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
      <td>${escapeHtml(entry.adminEmail)}</td>
      <td>${escapeHtml(entry.action)}</td>
      <td>${escapeHtml(details)}</td>
      <td>${formatTime(entry.createdAt)}</td>
    `;
    auditLogBody.appendChild(tr);
  });
}
