const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireStudent } = require('../middleware/auth');

const router = express.Router();

const VOICE_BODY_MAX = 2000;
const VOICE_TITLE_MAX = 120;
const VOICE_CATEGORIES = ['Suggestion', 'Concern', 'Question', 'Shoutout', 'Other'];

function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function publicReply(reply, viewerId) {
  return {
    id: reply.id,
    authorName: reply.authorName,
    authorGrade: reply.authorGrade,
    authorInitials: initials(reply.authorName),
    isMine: reply.authorId === viewerId,
    body: reply.body,
    createdAt: reply.createdAt,
    status: reply.authorId === viewerId ? reply.status : undefined,
  };
}

function publicPost(post, viewerId) {
  const visibleReplies = post.replies
    .filter((r) => r.status === 'approved' || r.authorId === viewerId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((r) => publicReply(r, viewerId));

  return {
    id: post.id,
    authorName: post.authorName,
    authorGrade: post.authorGrade,
    authorInitials: initials(post.authorName),
    isMine: post.authorId === viewerId,
    title: post.title,
    category: post.category,
    body: post.body,
    createdAt: post.createdAt,
    status: post.authorId === viewerId ? post.status : undefined,
    starCount: post.stars.length,
    isStarredByMe: post.stars.includes(viewerId),
    replies: visibleReplies,
  };
}

router.get('/api/voice/posts', requireStudent, (req, res) => {
  const viewerId = req.session.studentId;
  const posts = db
    .readVoicePosts()
    .filter((p) => p.status === 'approved' || p.authorId === viewerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((p) => publicPost(p, viewerId));

  res.json({ posts });
});

router.post('/api/voice/posts', requireStudent, (req, res) => {
  const { title, category, body } = req.body || {};

  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Title is required.' });
  }
  if (title.length > VOICE_TITLE_MAX) {
    return res.status(400).json({ error: `Title is too long (max ${VOICE_TITLE_MAX} characters).` });
  }
  if (!VOICE_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Please choose a category.' });
  }
  if (typeof body !== 'string' || !body.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }
  if (body.length > VOICE_BODY_MAX) {
    return res.status(400).json({ error: `Message is too long (max ${VOICE_BODY_MAX} characters).` });
  }

  const student = db.findById(req.session.studentId);
  const posts = db.readVoicePosts();
  const post = {
    id: crypto.randomUUID(),
    authorId: student.id,
    authorName: `${student.firstName} ${student.lastName}`,
    authorGrade: student.grade,
    title: title.trim(),
    category,
    body: body.trim(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    stars: [],
    replies: [],
  };
  posts.push(post);
  db.writeVoicePosts(posts);

  res.status(201).json({ post: publicPost(post, student.id) });
});

router.post('/api/voice/posts/:id/star', requireStudent, (req, res) => {
  const viewerId = req.session.studentId;
  const posts = db.readVoicePosts();
  const post = posts.find((p) => p.id === req.params.id);
  if (!post || post.status !== 'approved') return res.status(404).json({ error: 'Post not found.' });

  const i = post.stars.indexOf(viewerId);
  if (i === -1) post.stars.push(viewerId);
  else post.stars.splice(i, 1);

  db.writeVoicePosts(posts);
  res.json({ starCount: post.stars.length, isStarredByMe: post.stars.includes(viewerId) });
});

router.post('/api/voice/posts/:id/replies', requireStudent, (req, res) => {
  const { body } = req.body || {};
  if (typeof body !== 'string' || !body.trim()) {
    return res.status(400).json({ error: 'Reply cannot be empty.' });
  }
  if (body.length > VOICE_BODY_MAX) {
    return res.status(400).json({ error: `Reply is too long (max ${VOICE_BODY_MAX} characters).` });
  }

  const posts = db.readVoicePosts();
  const post = posts.find((p) => p.id === req.params.id);
  if (!post || post.status !== 'approved') return res.status(404).json({ error: 'Post not found.' });

  const student = db.findById(req.session.studentId);
  const reply = {
    id: crypto.randomUUID(),
    authorId: student.id,
    authorName: `${student.firstName} ${student.lastName}`,
    authorGrade: student.grade,
    body: body.trim(),
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  post.replies.push(reply);
  db.writeVoicePosts(posts);

  res.status(201).json({ reply: publicReply(reply, student.id) });
});

// ---- Admin: moderate Student Voice ----
router.get('/api/admin/voice/pending', requireAdmin, (req, res) => {
  const posts = db.readVoicePosts();

  const pendingPosts = posts
    .filter((p) => p.status === 'pending')
    .map((p) => ({
      type: 'post',
      id: p.id,
      authorName: p.authorName,
      authorGrade: p.authorGrade,
      title: p.title,
      category: p.category,
      body: p.body,
      createdAt: p.createdAt,
    }));

  const pendingReplies = posts.flatMap((p) =>
    p.replies
      .filter((r) => r.status === 'pending')
      .map((r) => ({
        type: 'reply',
        id: r.id,
        postId: p.id,
        postPreview: p.body.slice(0, 80),
        authorName: r.authorName,
        authorGrade: r.authorGrade,
        body: r.body,
        createdAt: r.createdAt,
      }))
  );

  res.json({
    items: [...pendingPosts, ...pendingReplies].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
  });
});

router.post('/api/admin/voice/posts/:id/approve', requireAdmin, (req, res) => {
  const posts = db.readVoicePosts();
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  post.status = 'approved';
  db.writeVoicePosts(posts);
  res.json({ ok: true });
});

router.post('/api/admin/voice/posts/:id/reject', requireAdmin, (req, res) => {
  const posts = db.readVoicePosts();
  const next = posts.filter((p) => p.id !== req.params.id);
  if (next.length === posts.length) return res.status(404).json({ error: 'Post not found.' });
  db.writeVoicePosts(next);
  res.json({ ok: true });
});

router.post('/api/admin/voice/posts/:postId/replies/:replyId/approve', requireAdmin, (req, res) => {
  const posts = db.readVoicePosts();
  const post = posts.find((p) => p.id === req.params.postId);
  const reply = post && post.replies.find((r) => r.id === req.params.replyId);
  if (!reply) return res.status(404).json({ error: 'Reply not found.' });
  reply.status = 'approved';
  db.writeVoicePosts(posts);
  res.json({ ok: true });
});

router.post('/api/admin/voice/posts/:postId/replies/:replyId/reject', requireAdmin, (req, res) => {
  const posts = db.readVoicePosts();
  const post = posts.find((p) => p.id === req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const next = post.replies.filter((r) => r.id !== req.params.replyId);
  if (next.length === post.replies.length) return res.status(404).json({ error: 'Reply not found.' });
  post.replies = next;
  db.writeVoicePosts(posts);
  res.json({ ok: true });
});

module.exports = router;
