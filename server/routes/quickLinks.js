const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { validateOptionalUrl, normalizeUrl } = require('../utils/validateUrl');
const { listRoute, reorderRoute, deleteRoute } = require('../utils/routeHelpers');
const { quickLinkLogoUpload, QUICK_LINK_LOGO_SUBDIR, removeUpload, discardUpload } = require('../uploads');

const router = express.Router();

function publicLink(q) {
  return { id: q.id, label: q.label, url: q.url, logoUrl: q.logoUrl || '', createdAt: q.createdAt };
}

const listLinks = listRoute(db.readQuickLinks, 'quickLinks', publicLink);
router.get('/api/quick-links', requireActiveStudent, listLinks);
router.get('/api/admin/quick-links', requireAdmin, listLinks);

function validateFields(body) {
  const { label, url } = body || {};
  if (typeof label !== 'string' || !label.trim()) return 'Label is required.';
  if (typeof url !== 'string' || !url.trim()) return 'URL is required.';
  return validateOptionalUrl(url, { fieldName: 'URL', allowHttp: true });
}

router.post('/api/admin/quick-links', requireAdmin, (req, res) => {
  quickLinkLogoUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Could not upload logo.' });

    const error = validateFields(req.body);
    if (error) {
      discardUpload(req);
      return res.status(400).json({ error });
    }

    const items = db.readQuickLinks();
    const item = {
      id: crypto.randomUUID(),
      label: req.body.label.trim(),
      url: normalizeUrl(req.body.url),
      logoUrl: req.file ? `/uploads/${QUICK_LINK_LOGO_SUBDIR}/${req.file.filename}` : '',
      createdAt: new Date().toISOString(),
    };
    items.push(item);
    db.writeQuickLinks(items);

    res.status(201).json({ quickLink: publicLink(item) });
  });
});
// Registered before /:id so "reorder" in the URL can never be mistaken for
// an :id value (same fix as the council reorder route needed).
router.put('/api/admin/quick-links/reorder', requireAdmin, reorderRoute({ read: db.readQuickLinks, write: db.writeQuickLinks, key: 'quickLinks', publicFn: publicLink, noun: 'quick links' }));

router.put('/api/admin/quick-links/:id', requireAdmin, (req, res) => {
  quickLinkLogoUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Could not upload logo.' });

    const error = validateFields(req.body);
    if (error) {
      discardUpload(req);
      return res.status(400).json({ error });
    }

    const items = db.readQuickLinks();
    const item = items.find((q) => q.id === req.params.id);
    if (!item) {
      discardUpload(req);
      return res.status(404).json({ error: 'Quick link not found.' });
    }

    const previousLogoUrl = item.logoUrl || '';
    item.label = req.body.label.trim();
    item.url = normalizeUrl(req.body.url);
    if (req.file) item.logoUrl = `/uploads/${QUICK_LINK_LOGO_SUBDIR}/${req.file.filename}`;
    else if (req.body.removeLogo === 'true') item.logoUrl = '';
    db.writeQuickLinks(items);

    if ((item.logoUrl || '') !== previousLogoUrl) removeUpload(previousLogoUrl, QUICK_LINK_LOGO_SUBDIR);

    res.json({ quickLink: publicLink(item) });
  });
});
router.delete('/api/admin/quick-links/:id', requireAdmin, deleteRoute({
  read: db.readQuickLinks,
  write: db.writeQuickLinks,
  notFound: 'Quick link not found.',
  onRemoved: (link) => removeUpload(link.logoUrl, QUICK_LINK_LOGO_SUBDIR),
}));

module.exports = router;
