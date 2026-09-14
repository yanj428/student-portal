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
const postError = document.getElementById('post-error');

const starIcon = (filled) =>
  `<svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}"><path d="M12 3L14.5 8.9L21 9.6L16.2 13.9L17.5 20.3L12 17L6.5 20.3L7.8 13.9L3 9.6L9.5 8.9L12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const replyIcon = () =>
  `<svg viewBox="0 0 24 24" fill="none"><path d="M9 17L4 12L9 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12H14C17.3 12 20 14.7 20 18V19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function renderReply(reply) {
  return `
    <div class="reply-item">
      <div class="reply-avatar">${voiceEscapeHtml(reply.authorInitials)}</div>
      <div class="reply-body-wrap">
        <div class="reply-author">
          ${voiceEscapeHtml(reply.authorName)}
          ${reply.isMine && reply.status === 'pending' ? '<span class="pending-badge">Pending approval</span>' : ''}
        </div>
        <div class="reply-subline">${voiceEscapeHtml(reply.authorGrade)} &middot; ${timeAgo(reply.createdAt)}</div>
        <p class="reply-body">${voiceEscapeHtml(reply.body)}</p>
      </div>
    </div>`;
}

function renderPost(post) {
  const pending = post.isMine && post.status === 'pending';
  return `
    <article class="post-card ${pending ? 'pending' : ''}" data-post-id="${post.id}">
      <div class="post-head">
        <div class="post-avatar">${voiceEscapeHtml(post.authorInitials)}</div>
        <div class="post-meta">
          <div class="post-author">
            ${voiceEscapeHtml(post.authorName)}
            ${pending ? '<span class="pending-badge">Pending approval</span>' : ''}
          </div>
          <div class="post-subline">${voiceEscapeHtml(post.authorGrade)} &middot; ${timeAgo(post.createdAt)}</div>
        </div>
        <span class="category-badge">${voiceEscapeHtml(post.category)}</span>
      </div>

      <h3 class="post-title">${voiceEscapeHtml(post.title)}</h3>
      <p class="post-body">${voiceEscapeHtml(post.body)}</p>

      <div class="post-actions">
        <button class="action-btn star-btn ${post.isStarredByMe ? 'starred' : ''}" ${pending ? 'disabled' : ''} data-post-id="${post.id}">
          ${starIcon(post.isStarredByMe)}
          <span class="star-count">${post.starCount}</span>
        </button>
        <button class="action-btn reply-toggle" ${pending ? 'disabled' : ''} data-post-id="${post.id}">
          ${replyIcon()}
          <span>${post.replies.length ? `${post.replies.length} ${post.replies.length === 1 ? 'reply' : 'replies'}` : 'Reply'}</span>
        </button>
      </div>

      ${
        post.replies.length
          ? `<div class="replies">${post.replies.map(renderReply).join('')}</div>`
          : ''
      }

      <div class="reply-composer" id="reply-composer-${post.id}">
        <textarea placeholder="Write a reply…" maxlength="2000"></textarea>
        <button class="btn primary reply-submit" data-post-id="${post.id}">Reply</button>
      </div>
    </article>`;
}

async function loadPosts() {
  const res = await fetch('/api/voice/posts');
  if (!res.ok) return;
  const { posts } = await res.json();

  feedEmpty.hidden = posts.length > 0;
  feedEl.querySelectorAll('.post-card').forEach((el) => el.remove());
  feedEl.insertAdjacentHTML('beforeend', posts.map(renderPost).join(''));
  wireFeedEvents();
}

function wireFeedEvents() {
  feedEl.querySelectorAll('.star-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      const postId = btn.dataset.postId;
      const res = await fetch(`/api/voice/posts/${postId}/star`, { method: 'POST' });
      if (!res.ok) return;
      const { starCount, isStarredByMe } = await res.json();
      btn.classList.toggle('starred', isStarredByMe);
      btn.querySelector('.star-count').textContent = starCount;
      btn.innerHTML = `${starIcon(isStarredByMe)}<span class="star-count">${starCount}</span>`;
    });
  });

  feedEl.querySelectorAll('.reply-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const composer = document.getElementById(`reply-composer-${btn.dataset.postId}`);
      composer.classList.toggle('open');
      if (composer.classList.contains('open')) composer.querySelector('textarea').focus();
    });
  });

  feedEl.querySelectorAll('.reply-submit').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const postId = btn.dataset.postId;
      const composer = document.getElementById(`reply-composer-${postId}`);
      const textarea = composer.querySelector('textarea');
      const body = textarea.value.trim();
      if (!body) return;

      btn.disabled = true;
      try {
        const res = await fetch(`/api/voice/posts/${postId}/replies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        if (res.ok) {
          textarea.value = '';
          composer.classList.remove('open');
          loadPosts();
        }
      } finally {
        btn.disabled = false;
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
  postSubmit.textContent = 'Submitting…';

  try {
    const res = await fetch('/api/voice/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, category, body }),
    });
    const data = await res.json();

    if (!res.ok) {
      postError.textContent = data.error || 'Could not submit.';
      postError.hidden = false;
      return;
    }

    postForm.reset();
    loadPosts();
  } catch {
    postError.textContent = 'Could not reach the server. Please try again.';
    postError.hidden = false;
  } finally {
    postSubmit.disabled = false;
    postSubmit.textContent = 'Submit';
  }
});

loadPosts();
