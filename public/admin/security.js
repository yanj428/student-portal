import { escapeHtml, getJSON, sendJSON } from './api.js';

const lockedList = document.getElementById('security-locked-list');
const lockedEmpty = document.getElementById('security-locked-empty');
const unlockAllBtn = document.getElementById('security-unlock-all');
const attemptsBody = document.getElementById('security-attempts-body');
const attemptsFilter = document.getElementById('security-attempts-filter');
const attemptsFilterForm = document.getElementById('security-attempts-filter-form');

function formatTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function minutesUntil(iso) {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
}

export async function loadSecurity() {
  await Promise.all([loadLockedAccounts(), loadAttempts()]);
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
