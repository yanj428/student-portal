import { escapeHtml } from './api.js';

// Each status gets its own list/empty-state pair in the DOM, and each item
// gets both actions (Approve/Reject) regardless of which list it's in, so
// re-moderating a past decision (e.g. un-rejecting something) is just
// clicking the other button rather than a separate flow.
const SECTIONS = {
  pending: { list: 'voice-pending-list', empty: 'voice-pending-empty' },
  approved: { list: 'voice-approved-list', empty: 'voice-approved-empty' },
  rejected: { list: 'voice-rejected-list', empty: 'voice-rejected-empty' },
};

const voicePendingCount = document.getElementById('voice-pending-count');

export async function loadVoicePending() {
  await Promise.all([renderSection('pending'), renderSection('approved'), renderSection('rejected')]);
}

async function renderSection(status) {
  const res = await fetch(`/api/admin/voice/${status}`);
  if (!res.ok) return;
  const { items } = await res.json();
  renderItems(status, items);

  if (status === 'pending') {
    voicePendingCount.textContent = items.length;
    const statVoice = document.getElementById('stat-voice');
    if (statVoice) statVoice.textContent = items.length;
    const navVoiceBadge = document.getElementById('nav-voice-badge');
    if (navVoiceBadge) {
      navVoiceBadge.textContent = items.length;
      navVoiceBadge.hidden = items.length === 0;
    }
  }
}

function renderItems(status, items) {
  const { list, empty } = SECTIONS[status];
  const listEl = document.getElementById(list);
  const emptyEl = document.getElementById(empty);

  listEl.querySelectorAll('.mod-item').forEach((el) => el.remove());
  emptyEl.hidden = items.length > 0;

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
        <span class="mod-type-badge">${escapeHtml(item.category)}</span>
      </div>
      <div class="mod-item-title">${escapeHtml(item.title)}</div>
      <p class="mod-item-body">${escapeHtml(item.body)}</p>
      <div class="mod-item-actions">
        ${status !== 'approved' ? '<button class="btn primary approve-btn">Approve</button>' : ''}
        ${status !== 'rejected' ? '<button class="btn reject reject-btn">Reject</button>' : ''}
        <button class="btn ghost delete-btn">Delete</button>
      </div>
    `;

    const approveBtn = div.querySelector('.approve-btn');
    if (approveBtn) {
      approveBtn.addEventListener('click', async () => {
        await fetch(`/api/admin/voice/posts/${item.id}/approve`, { method: 'POST' });
        loadVoicePending();
      });
    }
    const rejectBtn = div.querySelector('.reject-btn');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', async () => {
        await fetch(`/api/admin/voice/posts/${item.id}/reject`, { method: 'POST' });
        loadVoicePending();
      });
    }
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Permanently delete this suggestion? This cannot be undone.')) return;
      await fetch(`/api/admin/voice/posts/${item.id}`, { method: 'DELETE' });
      loadVoicePending();
    });

    listEl.appendChild(div);
  });
}
