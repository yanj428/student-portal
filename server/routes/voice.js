const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { voicePostLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const VOICE_BODY_MAX = 2000;
const VOICE_TITLE_MAX = 120;
const VOICE_CATEGORIES = ['Suggestion', 'Concern', 'Question', 'Shoutout', 'Other'];

// Suggestions are never shared between students - only the author (their
// own submission, so they can see whether StuCo approved or rejected it)
// and admins (who moderate on StuCo's behalf) ever see one.
function publicPost(post) {
  return {
    id: post.id,
    title: post.title,
    category: post.category,
    body: post.body,
    createdAt: post.createdAt,
    status: post.status,
  };
}

function adminPost(post) {
  return {
    id: post.id,
    authorName: post.authorName,
    authorGrade: post.authorGrade,
    title: post.title,
    category: post.category,
    body: post.body,
    createdAt: post.createdAt,
    status: post.status,
  };
}

// ---- Student-facing: submit and track your own suggestions ----

router.get('/api/voice/posts', requireActiveStudent, (req, res) => {
  const posts = db
    .readVoicePosts()
    .filter((p) => p.authorId === req.session.studentId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicPost);

  res.json({ posts });
});

function validatePostFields({ title, category, body }) {
  if (typeof title !== 'string' || !title.trim()) {
    return 'Title is required.';
  }
  if (title.length > VOICE_TITLE_MAX) {
    return `Title is too long (max ${VOICE_TITLE_MAX} characters).`;
  }
  if (!VOICE_CATEGORIES.includes(category)) {
    return 'Please choose a category.';
  }
  if (typeof body !== 'string' || !body.trim()) {
    return 'Message cannot be empty.';
  }
  if (body.length > VOICE_BODY_MAX) {
    return `Message is too long (max ${VOICE_BODY_MAX} characters).`;
  }
  return null;
}

router.post('/api/voice/posts', requireActiveStudent, voicePostLimiter, (req, res) => {
  const error = validatePostFields(req.body || {});
  if (error) return res.status(400).json({ error });
  const { title, category, body } = req.body;

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
  };
  posts.push(post);
  db.writeVoicePosts(posts);

  res.status(201).json({ post: publicPost(post) });
});

// Editing your own suggestion sends it back for review — the content
// changed, so whatever StuCo previously decided no longer necessarily
// applies to what's there now.
router.patch('/api/voice/posts/:id', requireActiveStudent, (req, res) => {
  const posts = db.readVoicePosts();
  const post = posts.find((p) => p.id === req.params.id && p.authorId === req.session.studentId);
  if (!post) return res.status(404).json({ error: 'Suggestion not found.' });

  const error = validatePostFields(req.body || {});
  if (error) return res.status(400).json({ error });
  const { title, category, body } = req.body;

  post.title = title.trim();
  post.category = category;
  post.body = body.trim();
  post.status = 'pending';
  db.writeVoicePosts(posts);

  res.json({ post: publicPost(post) });
});

router.delete('/api/voice/posts/:id', requireActiveStudent, (req, res) => {
  const posts = db.readVoicePosts();
  const next = posts.filter((p) => !(p.id === req.params.id && p.authorId === req.session.studentId));
  if (next.length === posts.length) return res.status(404).json({ error: 'Suggestion not found.' });
  db.writeVoicePosts(next);
  res.json({ ok: true });
});

// ---- Admin: moderate Student Voice on StuCo's behalf ----

function listByStatus(status) {
  const posts = db.readVoicePosts().filter((p) => p.status === status);
  // Oldest-first for the review queue (work through it in submission
  // order); newest-first once it's just a record of past decisions.
  posts.sort((a, b) => (status === 'pending' ? 1 : -1) * (new Date(a.createdAt) - new Date(b.createdAt)));
  return posts.map(adminPost);
}

router.get('/api/admin/voice/pending', requireAdmin, (req, res) => {
  res.json({ items: listByStatus('pending') });
});

router.get('/api/admin/voice/approved', requireAdmin, (req, res) => {
  res.json({ items: listByStatus('approved') });
});

router.get('/api/admin/voice/rejected', requireAdmin, (req, res) => {
  res.json({ items: listByStatus('rejected') });
});

router.post('/api/admin/voice/posts/:id/approve', requireAdmin, (req, res) => {
  const posts = db.readVoicePosts();
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Suggestion not found.' });
  post.status = 'approved';
  db.writeVoicePosts(posts);
  res.json({ ok: true });
});

router.post('/api/admin/voice/posts/:id/reject', requireAdmin, (req, res) => {
  const posts = db.readVoicePosts();
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Suggestion not found.' });
  post.status = 'rejected';
  db.writeVoicePosts(posts);
  res.json({ ok: true });
});

router.delete('/api/admin/voice/posts/:id', requireAdmin, (req, res) => {
  const posts = db.readVoicePosts();
  const next = posts.filter((p) => p.id !== req.params.id);
  if (next.length === posts.length) return res.status(404).json({ error: 'Suggestion not found.' });
  db.writeVoicePosts(next);
  res.json({ ok: true });
});

module.exports = router;
