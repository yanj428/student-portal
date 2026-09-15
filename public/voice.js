function voiceEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  // The textContent/innerHTML round-trip only encodes &, <, and > — quotes
  // aren't special in HTML text content, only inside an attribute value,
  // which is exactly where this output often ends up (href="...", etc.).
  // Without this, a value containing a literal " could break out of that
  // attribute.
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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
const postCategorySelect = document.getElementById('post-category');
const postInput = document.getElementById('post-input');
const postSubmit = document.getElementById('post-submit');
const postCancel = document.getElementById('post-cancel');
const postError = document.getElementById('post-error');
const composerTitle = document.getElementById('composer-title');
const composerHint = document.getElementById('composer-hint');

const STATUS_LABEL = { pending: 'Pending review', approved: 'Approved', rejected: 'Not approved' };

let editingId = null;
let posts = [];

function enterEditMode(post) {
  editingId = post.id;
  postTitleInput.value = post.title;
  postCategorySelect.value = post.category;
  postInput.value = post.body;
  composerTitle.textContent = 'Edit suggestion';
  composerHint.textContent = 'Saving sends this back to StuCo for review.';
  postSubmit.textContent = 'Save changes';
  postCancel.hidden = false;
  postForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function exitEditMode() {
  editingId = null;
  postForm.reset();
  composerTitle.textContent = 'Share something';
  composerHint.textContent = 'Only StuCo can see what you submit. Other students never will.';
  postSubmit.textContent = 'Submit';
  postCancel.hidden = true;
}

postCancel.addEventListener('click', exitEditMode);

function renderPost(post) {
  return `
    <article class="post-card status-${post.status}" data-post-id="${post.id}">
      <div class="post-head">
        <div class="post-meta">
          <div class="post-author">
            <span class="status-badge status-${post.status}">${voiceEscapeHtml(STATUS_LABEL[post.status] || post.status)}</span>
          </div>
          <div class="post-subline">${timeAgo(post.createdAt)}</div>
        </div>
        <span class="category-badge">${voiceEscapeHtml(post.category)}</span>
      </div>

      <h3 class="post-title">${voiceEscapeHtml(post.title)}</h3>
      <p class="post-body">${voiceEscapeHtml(post.body)}</p>

      <div class="post-actions">
        <button class="btn ghost edit-btn" data-post-id="${post.id}">Edit</button>
        <button class="btn reject delete-btn" data-post-id="${post.id}">Delete</button>
      </div>
    </article>`;
}

async function loadPosts() {
  const res = await fetch('/api/voice/posts');
  if (!res.ok) return;
  ({ posts } = await res.json());

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
      if (!confirm('Delete this suggestion? This cannot be undone.')) return;
      const postId = btn.dataset.postId;
      const res = await fetch(`/api/voice/posts/${postId}`, { method: 'DELETE' });
      if (res.ok) {
        if (editingId === postId) exitEditMode();
        loadPosts();
      }
    });
  });
}

postForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  postError.hidden = true;

  const title = postTitleInput.value.trim();
  const category = postCategorySelect.value;
  const body = postInput.value.trim();

  if (!title || !category || !body) {
    postError.textContent = 'Please fill in title, category, and message.';
    postError.hidden = false;
    return;
  }

  postSubmit.disabled = true;
  postSubmit.textContent = editingId ? 'Saving…' : 'Submitting…';

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
    postSubmit.textContent = editingId ? 'Save changes' : 'Submit';
  }
});

loadPosts();
