const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { validateOptionalUrl, normalizeUrl } = require('../utils/validateUrl');
const { listRoute, reorderRoute, deleteRoute } = require('../utils/routeHelpers');

const router = express.Router();

const TITLE_MAX = 150;

function publicResource(r) {
  return { id: r.id, title: r.title, url: r.url, createdAt: r.createdAt };
}

// The links shown under "Resources" on the Community Service page.
const listResources = listRoute(db.readCsResources, 'resources', publicResource);
router.get('/api/cs-resources', requireActiveStudent, listResources);
router.get('/api/admin/cs-resources', requireAdmin, listResources);

function validateFields(body) {
  const { title, url } = body || {};
  if (typeof title !== 'string' || !title.trim()) return 'Title is required.';
  if (title.trim().length > TITLE_MAX) return `Title must be ${TITLE_MAX} characters or fewer.`;
  if (typeof url !== 'string' || !url.trim()) return 'Link is required.';
  return validateOptionalUrl(url, { fieldName: 'Link', allowHttp: true });
}

router.post('/api/admin/cs-resources', requireAdmin, (req, res) => {
  const error = validateFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = db.readCsResources();
  const item = {
    id: crypto.randomUUID(),
    title: req.body.title.trim(),
    url: normalizeUrl(req.body.url),
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  db.writeCsResources(items);

  res.status(201).json({ resource: publicResource(item) });
});

// Registered before /:id so "reorder" can never be mistaken for a resource id.
router.put('/api/admin/cs-resources/reorder', requireAdmin, reorderRoute({ read: db.readCsResources, write: db.writeCsResources, key: 'resources', publicFn: publicResource, noun: 'resources' }));

router.put('/api/admin/cs-resources/:id', requireAdmin, (req, res) => {
  const error = validateFields(req.body);
  if (error) return res.status(400).json({ error });

  const items = db.readCsResources();
  const item = items.find((r) => r.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Resource not found.' });

  item.title = req.body.title.trim();
  item.url = normalizeUrl(req.body.url);
  db.writeCsResources(items);

  res.json({ resource: publicResource(item) });
});

router.delete('/api/admin/cs-resources/:id', requireAdmin, deleteRoute({ read: db.readCsResources, write: db.writeCsResources, notFound: 'Resource not found.' }));

module.exports = router;