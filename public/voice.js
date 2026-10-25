function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const feedEl = document.getElementById('voice-feed');
const feedEmpty = document.getElementById('feed-empty');
const postForm = document.getElementById('post-form');
const postTitleInput = document.getElementById('post-title');
const categoryRadios = postForm.querySelectorAll('input[name="post-category"]');
const postInput = document.getElementById('post-input');
const postSubmit = document.getElementById('post-submit');
const postCancel = document.getElementById('post-cancel');
const postError = document.getElementById('post-error');
const composerTitle = document.getElementById('composer-title');
const composerHint = document.getElementById('composer-hint');
const countEl = document.getElementById('voice-count');

const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Not approved' };
const SUBMIT_LABEL = 'Send to StuCo';

// One icon per category, shared by the tiles' look and the list below.
const CATEGORY_ICON = {
  Suggestion: 'M9 18H15M10 21H14M12 3C8.7 3 6 5.5 6 8.6C6 10.6 7 12 8.3 13.2C8.8 13.7 9 14.3 9 15H15C15 14.3 15.2 13.7 15.7 13.2C17 12 18 10.6 18 8.6C18 5.5 15.3 3 12 3Z',
  Concern: 'M12 8V13M12 16.2V16.3M12 21C16.97 21 21 16.97 21 12C21 7.03 16.97 3 12 3C7.03 3 3 7.03 3 12C3 16.97 7.03 21 12 21Z',
  Question: 'M9.5 9C9.5 7.6 10.6 6.5 12 6.5C13.4 6.5 14.5 7.6 14.5 9C14.5 10.4 13.4 10.9 12.7 11.6C12.2 12.1 12 12.6 12 13.5M12 17V17.1M12 21C16.97 21 21 16.97 21 12C21 7.03 16.97 3 12 3C7.03 3 3 7.03 3 12C3 16.97 7.03 21 12 21Z',
  Shoutout: 'M4 20L8 9L15 16L4 20ZM13 4V6M19 6L17.5 7.5M20 12H18M15 9.5C16.2 8.3 17.8 7.6 19.5 7.5',
  Other: 'M6 12H6.01M12 12H12.01M18 12H18.01',
};

let editingId = null;
let posts = [];

const getCategory = () => (postForm.querySelector('input[name="post-category"]:checked') || {}).value || '';
function setCategory(value) {
  categoryRadios.forEach((radio) => {
    radio.checked = radio.value === value;
  });
}
function updateCount() {
  countEl.textContent = `${postInput.value.length} / 2000`;
}
postInput.addEventListener('input', updateCount);

function enterEditMode(post) {
  editingId = post.id;
  postTitleInput.value = post.title;
  setCategory(post.category);
  postInput.value = post.body;
  updateCount();
  composerTitle.textContent = 'Edit your message';
  composerHint.textContent = 'Saving sends this back to StuCo for review.';
  postSubmit.textContent = 'Save changes';
  postCancel.hidden = false;
  postForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function exitEditMode() {
  editingId = null;
  postForm.reset();
  updateCount();
  composerTitle.textContent = 'Share something';
  composerHint.textContent = 'Only StuCo can see what you submit. Other students never will.';
  postSubmit.textContent = SUBMIT_LABEL;
  postCancel.hidden = true;
}

postCancel.addEventListener('click', exitEditMode);

function renderPost(post) {
  const icon = CATEGORY_ICON[post.category] || CATEGORY_ICON.Other;
  return `
    <article class="post-card status-${escapeHtml(post.status)}" data-post-id="${escapeHtml(post.id)}">
      <div class="post-top">
        <span class="post-icon"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${icon}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <div class="post-main">
          <h3 class="post-title">${escapeHtml(post.title)}</h3>
          <span class="post-subline">${escapeHtml(post.category)} &middot; ${timeAgo(post.createdAt)}</span>
        </div>
        <span class="status-badge status-${escapeHtml(post.status)}">${escapeHtml(STATUS_LABEL[post.status] || post.status)}</span>
      </div>
      <p class="post-body">${escapeHtml(post.body)}</p>
      <div class="post-actions">
        <button class="post-action edit-btn" data-post-id="${escapeHtml(post.id)}">Edit</button>
        <button class="post-action post-action-danger delete-btn" data-post-id="${escapeHtml(post.id)}">Delete</button>
      </div>
    </article>`;
}

async function loadPosts() {
  const data = await fetchJson('/api/voice/posts');
  if (!data) return;
  ({ posts } = data);

  feedEmpty.hidden = posts.length > 0;
  feedEl.querySelectorAll('.post-card').forEach((el) => el.remove());
  feedEl.insertAdjacentHTML('beforeend', posts.map(renderPost).join(''));
  wireFeedEvents();
}

function wireFeedEvents() {
  feedEl.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const post = posts.find((p) => p.id === btn.dataset.postId);
      if (post) enterEditMode(post);
    });
  });

  feedEl.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this message? This cannot be undone.')) return;
      const postId = btn.dataset.postId;
      postError.hidden = true;
      try {
        const res = await fetch(`/api/voice/posts/${postId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        if (editingId === postId) exitEditMode();
        loadPosts();
      } catch {
        postError.textContent = 'Could not delete that message. Please try again.';
        postError.hidden = false;
      }
    });
  });
}

postForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  postError.hidden = true;

  const title = postTitleInput.value.trim();
  const category = getCategory();
  const body = postInput.value.trim();

  if (!title || !category || !body) {
    postError.textContent = 'Please choose a category and fill in the title and message.';
    postError.hidden = false;
    return;
  }

  postSubmit.disabled = true;
  postSubmit.textContent = editingId ? 'Saving…' : 'Sending…';

  try {
    const url = editingId ? `/api/voice/posts/${editingId}` : '/api/voice/posts';
    const method = editingId ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, category, body }),
    });
    const data = await res.json();

    if (!res.ok) {
      postError.textContent = data.error || 'Could not save.';
      postError.hidden = false;
      return;
    }

    exitEditMode();
    loadPosts();
  } catch {
    postError.textContent = 'Could not reach the server. Please try again.';
    postError.hidden = false;
  } finally {
    postSubmit.disabled = false;
    postSubmit.textContent = editingId ? 'Save changes' : SUBMIT_LABEL;
  }
});

loadPosts();