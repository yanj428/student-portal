const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');

const router = express.Router();

function publicMember(m) {
  return { id: m.id, initials: m.initials, name: m.name, role: m.role, bio: m.bio, createdAt: m.createdAt };
}

router.get('/api/council', requireActiveStudent, (req, res) => {
  res.json({ council: db.readCouncil().map(publicMember) });
});

router.get('/api/admin/council', requireAdmin, (req, res) => {
  res.json({ council: db.readCouncil().map(publicMember) });
});

function validateFields(body) {
  const { initials, name, role, bio } = body || {};
  if (typeof initials !== 'string' || !initials.trim()) return 'Initials are required.';
  if (typeof name !== 'string' || !name.trim()) return 'Name is required.';
  if (typeof role !== 'string' || !role.trim()) return 'Role is required.';
  if (typeof bio !== 'string' || !bio.trim()) return 'Bio is required.';
  return null;
}

router.post('/api/admin/council', requireAdmin, (req, res) => {
  const error = validateFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = db.readCouncil();
  const item = {
    id: crypto.randomUUID(),
    initials: req.body.initials.trim().slice(0, 3),
    name: req.body.name.trim(),
    role: req.body.role.trim(),
    bio: req.body.bio.trim(),
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  db.writeCouncil(items);

  res.status(201).json({ member: publicMember(item) });
});

router.put('/api/admin/council/:id', requireAdmin, (req, res) => {
  const error = validateFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = db.readCouncil();
  const item = items.find((m) => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Council member not found.' });

  item.initials = req.body.initials.trim().slice(0, 3);
  item.name = req.body.name.trim();
  item.role = req.body.role.trim();
  item.bio = req.body.bio.trim();
  db.writeCouncil(items);

  res.json({ member: publicMember(item) });
});

router.delete('/api/admin/council/:id', requireAdmin, (req, res) => {
  const items = db.readCouncil();
  const next = items.filter((m) => m.id !== req.params.id);
  if (next.length === items.length) return res.status(404).json({ error: 'Council member not found.' });
  db.writeCouncil(next);
  res.json({ ok: true });
});

module.exports = router;
