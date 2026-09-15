const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { validateOptionalUrl, normalizeUrl } = require('../utils/validateUrl');

const router = express.Router();

function publicLink(q) {
  return { id: q.id, label: q.label, url: q.url, createdAt: q.createdAt };
}

router.get('/api/quick-links', requireActiveStudent, (req, res) => {
  res.json({ quickLinks: db.readQuickLinks().map(publicLink) });
});

router.get('/api/admin/quick-links', requireAdmin, (req, res) => {
  res.json({ quickLinks: db.readQuickLinks().map(publicLink) });
});

function validateFields(body) {
  const { label, url } = body || {};
  if (typeof label !== 'string' || !label.trim()) return 'Label is required.';
  if (typeof url !== 'string' || !url.trim()) return 'URL is required.';
  return validateOptionalUrl(url, { fieldName: 'URL', allowHttp: true });
}

router.post('/api/admin/quick-links', requireAdmin, (req, res) => {
  const error = validateFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = db.readQuickLinks();
  const item = {
    id: crypto.randomUUID(),
    label: req.body.label.trim(),
    url: normalizeUrl(req.body.url),
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  db.writeQuickLinks(items);

  res.status(201).json({ quickLink: publicLink(item) });
});

// Registered before /:id so "reorder" in the URL can never be mistaken for
// an :id value (same fix as the council reorder route needed).
router.put('/api/admin/quick-links/reorder', requireAdmin, (req, res) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === 'string')) {
    return res.status(400).json({ error: 'orderedIds must be an array of ids.' });
  }

  const items = db.readQuickLinks();
  const byId = new Map(items.map((q) => [q.id, q]));
  const sameSet = orderedIds.length === items.length && orderedIds.every((id) => byId.has(id));
  if (!sameSet) return res.status(400).json({ error: 'orderedIds must match the current quick links exactly.' });

  db.writeQuickLinks(orderedIds.map((id) => byId.get(id)));
  res.json({ quickLinks: db.readQuickLinks().map(publicLink) });
});

router.put('/api/admin/quick-links/:id', requireAdmin, (req, res) => {
  const error = validateFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = db.readQuickLinks();
  const item = items.find((q) => q.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Quick link not found.' });

  item.label = req.body.label.trim();
  item.url = normalizeUrl(req.body.url);
  db.writeQuickLinks(items);

  res.json({ quickLink: publicLink(item) });
});

router.delete('/api/admin/quick-links/:id', requireAdmin, (req, res) => {
  const items = db.readQuickLinks();
  const next = items.filter((q) => q.id !== req.params.id);
  if (next.length === items.length) return res.status(404).json({ error: 'Quick link not found.' });
  db.writeQuickLinks(next);
  res.json({ ok: true });
});

module.exports = router;
