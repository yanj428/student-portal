const express = require('express');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { validateOptionalUrl, normalizeUrl, isHttpsUrl } = require('../utils/validateUrl');

// The lunch schedule image is normally set via the upload endpoint
// (server/routes/lunch.js), which produces a relative /uploads/lunch/...
// path rather than a full URL — so this accepts either that, or (since an
// admin could also PUT this endpoint directly) a real https:// URL.
function isValidImageValue(value) {
  if (value === '') return true;
  if (typeof value !== 'string') return false;
  return value.startsWith('/uploads/') || isHttpsUrl(value);
}

const router = express.Router();

// ---- Homepage content: the weekly slide, lunch menu, and lunch schedule
// image. Everything else that used to live here (announcements, calendar
// events, clubs, council, projects, quick links) is now its own collection
// with full admin add/edit/delete — see the other route files.
function validateContent(content) {
  const shape = db.DEFAULT_CONTENT;
  if (!content || typeof content !== 'object') return 'Invalid content.';

  for (const key of Object.keys(shape)) {
    if (Array.isArray(shape[key])) {
      if (!Array.isArray(content[key]) || content[key].length !== shape[key].length) {
        return `"${key}" must be a list of exactly ${shape[key].length} item(s).`;
      }
    } else if (typeof content[key] !== 'object' || content[key] === null || Array.isArray(content[key])) {
      return `"${key}" is invalid.`;
    }
  }

  if (typeof content.weeklySlide.weekLabel !== 'string' || typeof content.weeklySlide.canvaEmbedUrl !== 'string') {
    return 'Weekly slide needs a week label and a Canva embed URL (both can be blank).';
  }
  const canvaError = validateOptionalUrl(content.weeklySlide.canvaEmbedUrl, {
    fieldName: 'Canva embed URL',
    allowedHosts: ['canva.com', 'canva.link'],
  });
  if (canvaError) return canvaError;
  if (typeof content.lunchSchedule.weekLabel !== 'string' || typeof content.lunchSchedule.imageUrl !== 'string') {
    return 'Lunch schedule needs a week label and image (both can be blank).';
  }
  if (!isValidImageValue(content.lunchSchedule.imageUrl)) {
    return 'Lunch schedule image must be an uploaded image or a valid https:// link.';
  }
  for (const l of content.lunchMenu) {
    if (typeof l.weekday !== 'string' || typeof l.item !== 'string') return 'Each lunch entry needs a weekday and item.';
  }

  return null;
}

router.get('/api/content', requireActiveStudent, (req, res) => {
  res.json({ content: db.readContent() });
});

router.get('/api/admin/content', requireAdmin, (req, res) => {
  res.json({ content: db.readContent() });
});

router.put('/api/admin/content', requireAdmin, (req, res) => {
  const { content } = req.body || {};
  const error = validateContent(content);
  if (error) return res.status(400).json({ error });

  content.weeklySlide.canvaEmbedUrl = normalizeUrl(content.weeklySlide.canvaEmbedUrl);
  db.writeContent(content);
  res.json({ content });
});

module.exports = router;
