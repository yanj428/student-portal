import { escapeHtml } from './api.js';

// Each status gets its own list/empty-state/search trio in the DOM, and
// each item gets both actions (Approve/Reject) regardless of which list
// it's in, so re-moderating a past decision (e.g. un-rejecting something)
// is just clicking the other button rather than a separate flow.
const SECTIONS = {
  pending: { list: 'voice-pending-list', empty: 'voice-pending-empty', search: 'voice-pending-search' },
  approved: { list: 'voice-approved-list', empty: 'voice-approved-empty', search: 'voice-approved-search' },
  rejected: { list: 'voice-rejected-list', empty: 'voice-rejected-empty', search: 'voice-rejected-search' },
};

// Keeps each section's full fetched list around so the search box can
// filter client-side without a round trip, and re-render preserves which
// item (if any) was expanded.
const state = { pending: [], approved: [], rejected: [] };
const expanded = { pending: null, approved: null, rejected: null };

const voicePendingCount = document.getElementById('voice-pending-count');

export async function loadVoicePending() {
  await Promise.all([loadSection('pending'), loadSection('approved'), loadSection('rejected')]);
}

async function loadSection(status) {
  const res = await fetch(`/api/admin/voice/${status}`);
  if (!res.ok) return;
  const { items } = await res.json();
  state[status] = items;
  renderSection(status);

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

function matchesSearch(item, query) {
  if (!query) return true;
  const haystack = `${item.title} ${item.body} ${item.authorName}`.toLowerCase();
  return haystack.includes(query);
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function renderSection(status) {
  const { list, empty, search } = SECTIONS[status];
  const listEl = document.getElementById(list);
  const emptyEl = document.getElementById(empty);
  const searchEl = document.getElementById(search);

  const query = searchEl.value.trim().toLowerCase();
  const items = state[status].filter((item) => matchesSearch(item, query));

  listEl.querySelectorAll('.mod-item').forEach((el) => el.remove());
  emptyEl.hidden = items.length > 0;
  emptyEl.textContent = query && state[status].length > 0
    ? 'No suggestions match your search.'
    : emptyEl.dataset.defaultText;

  items.forEach((item) => {
    const isOpen = expanded[status] === item.id;
    const div = document.createElement('div');
    div.className = `mod-item${isOpen ? ' open' : ''}`;
    div.innerHTML = `
      <button class="mod-item-summary" type="button">
        <span class="mod-item-summary-main">
          <span class="mod-item-author">${escapeHtml(item.authorName)}</span>
          <span class="mod-item-title-preview">${escapeHtml(item.title)}</span>
        </span>
        <span class="mod-item-summary-meta">
          <span class="mod-type-badge">${escapeHtml(item.category)}</span>
          <span class="mod-item-date">${formatDate(item.createdAt)}</span>
          <svg class="mod-item-chevron" viewBox="0 0 24 24" fill="none"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </button>
      <div class="mod-item-details" ${isOpen ? '' : 'hidden'}>
        <div class="mod-item-meta">${escapeHtml(item.authorGrade)} &middot; Sent ${formatDate(item.createdAt)}</div>
        <p class="mod-item-body">${escapeHtml(item.body)}</p>
        <div class="mod-item-actions">
          ${status !== 'approved' ? '<button class="btn primary approve-btn">Approve</button>' : ''}
          ${status !== 'rejected' ? '<button class="btn reject reject-btn">Reject</button>' : ''}
          <button class="btn ghost delete-btn">Delete</button>
        </div>
      </div>
    `;

    div.querySelector('.mod-item-summary').addEventListener('click', () => {
      const details = div.querySelector('.mod-item-details');
      const nowOpen = details.hidden;
      details.hidden = !nowOpen;
      div.classList.toggle('open', nowOpen);
      expanded[status] = nowOpen ? item.id : null;
    });

    const approveBtn = div.querySelector('.approve-btn');
    if (approveBtn) {
      approveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch(`/api/admin/voice/posts/${item.id}/approve`, { method: 'POST' });
        loadVoicePending();
      });
    }
    const rejectBtn = div.querySelector('.reject-btn');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch(`/api/admin/voice/posts/${item.id}/reject`, { method: 'POST' });
        loadVoicePending();
      });
    }
    div.querySelector('.delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Permanently delete this suggestion? This cannot be undone.')) return;
      await fetch(`/api/admin/voice/posts/${item.id}`, { method: 'DELETE' });
      loadVoicePending();
    });

    listEl.appendChild(div);
  });
}

Object.entries(SECTIONS).forEach(([status, { empty, search }]) => {
  const emptyEl = document.getElementById(empty);
  emptyEl.dataset.defaultText = emptyEl.textContent;
  document.getElementById(search).addEventListener('input', () => renderSection(status));
});
