require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const db = require('./db');

const SCHOOL_DOMAIN = '@kpis.ac.th';
const PORT = process.env.PORT || 8791;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kpis-admin';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me';

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[warn] ADMIN_PASSWORD not set in .env — using the insecure default. Set it before deploying.');
}
if (!process.env.SESSION_SECRET) {
  console.warn('[warn] SESSION_SECRET not set in .env — using an insecure default. Set it before deploying.');
}

const app = express();
app.use(express.json());
app.use(
  session({
    name: 'kpis.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
  })
);

function isValidSchoolEmail(email) {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(SCHOOL_DOMAIN);
}

function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Admin login required.' });
}

function requireStudent(req, res, next) {
  if (req.session.studentId) return next();
  return res.status(401).json({ error: 'Not logged in.' });
}

function publicStudent(student) {
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email,
    grade: student.grade,
    createdAt: student.createdAt,
  };
}

// ---- Admin auth ----
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect admin password.' });
  }
  req.session.isAdmin = true;
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

// ---- Admin: manage student accounts ----
app.get('/api/admin/students', requireAdmin, (req, res) => {
  res.json({ students: db.readStudents().map(publicStudent) });
});

app.post('/api/admin/students', requireAdmin, (req, res) => {
  const { firstName, lastName, email, grade, password } = req.body || {};

  if (!firstName || !lastName || !email || !grade || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!isValidSchoolEmail(email)) {
    return res.status(400).json({ error: `Email must end with ${SCHOOL_DOMAIN}.` });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Temporary password must be at least 8 characters.' });
  }
  if (db.findByEmail(email)) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const student = {
    id: crypto.randomUUID(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
    grade,
    passwordHash: bcrypt.hashSync(password, 10),
    createdAt: new Date().toISOString(),
  };
  db.addStudent(student);
  res.status(201).json({ student: publicStudent(student) });
});

app.delete('/api/admin/students/:id', requireAdmin, (req, res) => {
  const removed = db.removeStudent(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Student not found.' });
  res.json({ ok: true });
});

// ---- Homepage content (text only — the layout/section list is fixed) ----
function validateContent(content) {
  const shape = db.DEFAULT_CONTENT;
  if (!content || typeof content !== 'object') return 'Invalid content.';

  for (const key of Object.keys(shape)) {
    if (!Array.isArray(content[key]) || content[key].length !== shape[key].length) {
      return `"${key}" must be a list of exactly ${shape[key].length} item(s).`;
    }
  }

  for (const a of content.announcements) {
    if (typeof a.title !== 'string' || typeof a.body !== 'string') return 'Each announcement needs a title and body.';
  }
  for (const e of content.calendarEvents) {
    if (![e.day, e.month, e.title, e.subtitle].every((v) => typeof v === 'string')) {
      return 'Each calendar event needs day, month, title, and subtitle.';
    }
  }
  for (const l of content.lunchMenu) {
    if (typeof l.weekday !== 'string' || typeof l.item !== 'string') return 'Each lunch entry needs a weekday and item.';
  }
  for (const c of content.clubs) {
    if (typeof c !== 'string') return 'Each club must be text.';
  }
  for (const p of content.projects) {
    if (typeof p.title !== 'string' || typeof p.percent !== 'number' || p.percent < 0 || p.percent > 100) {
      return 'Each project needs a title and a percent between 0 and 100.';
    }
  }
  for (const q of content.quickLinks) {
    if (typeof q.label !== 'string' || typeof q.url !== 'string') return 'Each quick link needs a label and URL.';
  }
  for (const m of content.council) {
    if (typeof m.initials !== 'string') return 'Each council member needs initials.';
  }

  return null;
}

app.get('/api/content', requireStudent, (req, res) => {
  res.json({ content: db.readContent() });
});

app.get('/api/admin/content', requireAdmin, (req, res) => {
  res.json({ content: db.readContent() });
});

app.put('/api/admin/content', requireAdmin, (req, res) => {
  const { content } = req.body || {};
  const error = validateContent(content);
  if (error) return res.status(400).json({ error });

  db.writeContent(content);
  res.json({ content });
});

// ---- Student Voice (blog-style posts — every post and reply needs admin approval) ----
const VOICE_BODY_MAX = 2000;

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
    body: post.body,
    createdAt: post.createdAt,
    status: post.authorId === viewerId ? post.status : undefined,
    starCount: post.stars.length,
    isStarredByMe: post.stars.includes(viewerId),
    replies: visibleReplies,
  };
}

app.get('/api/voice/posts', requireStudent, (req, res) => {
  const viewerId = req.session.studentId;
  const posts = db
    .readVoicePosts()
    .filter((p) => p.status === 'approved' || p.authorId === viewerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((p) => publicPost(p, viewerId));

  res.json({ posts });
});

app.post('/api/voice/posts', requireStudent, (req, res) => {
  const { body } = req.body || {};
  if (typeof body !== 'string' || !body.trim()) {
    return res.status(400).json({ error: 'Post cannot be empty.' });
  }
  if (body.length > VOICE_BODY_MAX) {
    return res.status(400).json({ error: `Post is too long (max ${VOICE_BODY_MAX} characters).` });
  }

  const student = db.findById(req.session.studentId);
  const posts = db.readVoicePosts();
  const post = {
    id: crypto.randomUUID(),
    authorId: student.id,
    authorName: `${student.firstName} ${student.lastName}`,
    authorGrade: student.grade,
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

app.post('/api/voice/posts/:id/star', requireStudent, (req, res) => {
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

app.post('/api/voice/posts/:id/replies', requireStudent, (req, res) => {
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
app.get('/api/admin/voice/pending', requireAdmin, (req, res) => {
  const posts = db.readVoicePosts();

  const pendingPosts = posts
    .filter((p) => p.status === 'pending')
    .map((p) => ({
      type: 'post',
      id: p.id,
      authorName: p.authorName,
      authorGrade: p.authorGrade,
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

app.post('/api/admin/voice/posts/:id/approve', requireAdmin, (req, res) => {
  const posts = db.readVoicePosts();
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  post.status = 'approved';
  db.writeVoicePosts(posts);
  res.json({ ok: true });
});

app.post('/api/admin/voice/posts/:id/reject', requireAdmin, (req, res) => {
  const posts = db.readVoicePosts();
  const next = posts.filter((p) => p.id !== req.params.id);
  if (next.length === posts.length) return res.status(404).json({ error: 'Post not found.' });
  db.writeVoicePosts(next);
  res.json({ ok: true });
});

app.post('/api/admin/voice/posts/:postId/replies/:replyId/approve', requireAdmin, (req, res) => {
  const posts = db.readVoicePosts();
  const post = posts.find((p) => p.id === req.params.postId);
  const reply = post && post.replies.find((r) => r.id === req.params.replyId);
  if (!reply) return res.status(404).json({ error: 'Reply not found.' });
  reply.status = 'approved';
  db.writeVoicePosts(posts);
  res.json({ ok: true });
});

app.post('/api/admin/voice/posts/:postId/replies/:replyId/reject', requireAdmin, (req, res) => {
  const posts = db.readVoicePosts();
  const post = posts.find((p) => p.id === req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const next = post.replies.filter((r) => r.id !== req.params.replyId);
  if (next.length === post.replies.length) return res.status(404).json({ error: 'Reply not found.' });
  post.replies = next;
  db.writeVoicePosts(posts);
  res.json({ ok: true });
});

// ---- Student auth ----
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const student = db.findByEmail(email);
  if (!student || !bcrypt.compareSync(password, student.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  req.session.studentId = student.id;
  res.json({ student: publicStudent(student) });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('kpis.sid');
    res.json({ ok: true });
  });
});

app.get('/api/me', requireStudent, (req, res) => {
  const student = db.findById(req.session.studentId);
  if (!student) return res.status(401).json({ error: 'Not logged in.' });
  res.json({ student: publicStudent(student) });
});

// ---- Static site ----
app.use(express.static(path.join(__dirname, '..'), { extensions: ['html'] }));

app.listen(PORT, () => {
  console.log(`KPIS student portal running at http://localhost:${PORT}`);
});
