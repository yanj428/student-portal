const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireStudent } = require('../middleware/auth');

const router = express.Router();

function publicAnnouncement(a) {
  return { id: a.id, title: a.title, body: a.body, createdAt: a.createdAt };
}

router.get('/api/announcements', requireStudent, (req, res) => {
  const items = db.readAnnouncements()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicAnnouncement);
  res.json({ announcements: items });
});

router.get('/api/admin/announcements', requireAdmin, (req, res) => {
  const items = db.readAnnouncements()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicAnnouncement);
  res.json({ announcements: items });
});

function validateFields(body) {
  const { title, body: text } = body || {};
  if (typeof title !== 'string' || !title.trim()) return 'Title is required.';
  if (typeof text !== 'string' || !text.trim()) return 'Body is required.';
  return null;
}

router.post('/api/admin/announcements', requireAdmin, (req, res) => {
  const error = validateFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = db.readAnnouncements();
  const item = {
    id: crypto.randomUUID(),
    title: req.body.title.trim(),
    body: req.body.body.trim(),
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  db.writeAnnouncements(items);

  res.status(201).json({ announcement: publicAnnouncement(item) });
});

router.put('/api/admin/announcements/:id', requireAdmin, (req, res) => {
  const error = validateFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = db.readAnnouncements();
  const item = items.find((a) => a.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Announcement not found.' });

  item.title = req.body.title.trim();
  item.body = req.body.body.trim();
  db.writeAnnouncements(items);

  res.json({ announcement: publicAnnouncement(item) });
});

router.delete('/api/admin/announcements/:id', requireAdmin, (req, res) => {
  const items = db.readAnnouncements();
  const next = items.filter((a) => a.id !== req.params.id);
  if (next.length === items.length) return res.status(404).json({ error: 'Announcement not found.' });
  db.writeAnnouncements(next);
  res.json({ ok: true });
});

module.exports = router;
