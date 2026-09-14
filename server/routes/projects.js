const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');

const router = express.Router();

const STATUSES = ['On Track', 'At Risk', 'Complete'];

function publicProject(p) {
  return { id: p.id, title: p.title, description: p.description, lead: p.lead, status: p.status, percent: p.percent, createdAt: p.createdAt };
}

router.get('/api/projects', requireActiveStudent, (req, res) => {
  res.json({ projects: db.readProjects().map(publicProject) });
});

router.get('/api/admin/projects', requireAdmin, (req, res) => {
  res.json({ projects: db.readProjects().map(publicProject) });
});

function validateFields(body) {
  const { title, description, lead, status, percent } = body || {};
  if (typeof title !== 'string' || !title.trim()) return 'Title is required.';
  if (typeof description !== 'string' || !description.trim()) return 'Description is required.';
  if (typeof lead !== 'string' || !lead.trim()) return 'Team / lead is required.';
  if (!STATUSES.includes(status)) return 'Status must be On Track, At Risk, or Complete.';
  const percentNum = Number(percent);
  if (!Number.isFinite(percentNum) || percentNum < 0 || percentNum > 100) return 'Percent must be a number between 0 and 100.';
  return null;
}

router.post('/api/admin/projects', requireAdmin, (req, res) => {
  const error = validateFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = db.readProjects();
  const item = {
    id: crypto.randomUUID(),
    title: req.body.title.trim(),
    description: req.body.description.trim(),
    lead: req.body.lead.trim(),
    status: req.body.status,
    percent: Number(req.body.percent),
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  db.writeProjects(items);

  res.status(201).json({ project: publicProject(item) });
});

router.put('/api/admin/projects/:id', requireAdmin, (req, res) => {
  const error = validateFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = db.readProjects();
  const item = items.find((p) => p.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Project not found.' });

  item.title = req.body.title.trim();
  item.description = req.body.description.trim();
  item.lead = req.body.lead.trim();
  item.status = req.body.status;
  item.percent = Number(req.body.percent);
  db.writeProjects(items);

  res.json({ project: publicProject(item) });
});

router.delete('/api/admin/projects/:id', requireAdmin, (req, res) => {
  const items = db.readProjects();
  const next = items.filter((p) => p.id !== req.params.id);
  if (next.length === items.length) return res.status(404).json({ error: 'Project not found.' });
  db.writeProjects(next);
  res.json({ ok: true });
});

module.exports = router;
