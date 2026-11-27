import { escapeHtml, getJSON, sendJSON, del } from './api.js';

// Club leaders: accounts that can post their club's community service events
// on the student site (the My Club Events page).

const form = document.getElementById('club-leader-form');
const clubSelect = document.getElementById('club-leader-club');
const emailInput = document.getElementById('club-leader-email');
const errorEl = document.getElementById('club-leader-error');
const listEl = document.getElementById('club-leader-list');
const emptyEl = document.getElementById('club-leader-empty');

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

export async function loadClubLeaders() {
  const [clubs, data] = await Promise.all([getJSON('/api/admin/clubs'), getJSON('/api/admin/club-leaders')]);
  if (!clubs || !data) return;
  const chosen = clubSelect.value;
  clubSelect.innerHTML = clubs.clubs.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
  if (chosen) clubSelect.value = chosen;

  emptyEl.hidden = data.leaders.length > 0;
  listEl.innerHTML = data.leaders
    .map((l) => `
      <div class="simple-item">
        <div class="simple-item-head">
          <span class="simple-item-title">${escapeHtml(l.name)} <span class="grade-pill">${escapeHtml(l.club)}</span></span>
          <button type="button" class="btn ghost" data-student="${escapeHtml(l.studentId)}" data-club="${escapeHtml(l.clubId)}">Remove</button>
        </div>
        <div class="item-meta"><span>${escapeHtml(l.email)}</span></div>
      </div>`)
    .join('');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  try {
    const { ok, data } = await sendJSON('/api/admin/club-leaders', 'POST', { email: emailInput.value.trim(), clubId: clubSelect.value });
    if (!ok) return showError(data.error || 'Could not add the leader.');
    emailInput.value = '';
    loadClubLeaders();
  } catch {
    showError('Could not reach the server. Please try again.');
  }
});

listEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-student]');
  if (!btn) return;
  if (!confirm('Remove this club leader? They will no longer be able to post events for this club.')) return;
  const { ok, data } = await del(`/api/admin/club-leaders/${encodeURIComponent(btn.dataset.student)}/${encodeURIComponent(btn.dataset.club)}`);
  if (!ok) return alert(data.error || 'Could not remove the leader.');
  loadClubLeaders();
});
