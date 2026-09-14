import { escapeHtml } from './api.js';

const voicePendingList = document.getElementById('voice-pending-list');
const voicePendingEmpty = document.getElementById('voice-pending-empty');
const voicePendingCount = document.getElementById('voice-pending-count');

export async function loadVoicePending() {
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
