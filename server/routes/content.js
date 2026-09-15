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

const WEEK_LABEL_MAX = 100;
const LUNCH_ITEM_MAX = 200;

// ---- Homepage content: the weekly slide, lunch menu, and lunch schedule
// image. Everything else that used to live here (announcements, calendar
// events, clubs, council, projects, quick links) is now its own collection
// with full admin add/edit/delete — see the other route files.
function validateContent(content) {
  const shape = db.DEFAULT_CONTENT;
  if (!content || typeof content !== 'object') return { error: 'Invalid content.' };

  for (const key of Object.keys(shape)) {
    if (Array.isArray(shape[key])) {
      if (!Array.isArray(content[key]) || content[key].length !== shape[key].length) {
        return { error: `"${key}" must be a list of exactly ${shape[key].length} item(s).` };
      }
    } else if (typeof content[key] !== 'object' || content[key] === null || Array.isArray(content[key])) {
      return { error: `"${key}" is invalid.` };
    }
  }

  const { weekLabel: slideWeekLabel, canvaEmbedUrl } = content.weeklySlide;
  if (typeof slideWeekLabel !== 'string' || typeof canvaEmbedUrl !== 'string') {
    return { error: 'Weekly slide needs a week label and a Canva embed URL (both can be blank).' };
  }
  if (slideWeekLabel.length > WEEK_LABEL_MAX) return { error: `Week label must be ${WEEK_LABEL_MAX} characters or fewer.` };
  const canvaError = validateOptionalUrl(canvaEmbedUrl, {
    fieldName: 'Canva embed URL',
    allowedHosts: ['canva.com', 'canva.link'],
  });
  if (canvaError) return { error: canvaError };

  const { weekLabel: lunchWeekLabel, imageUrl } = content.lunchSchedule;
  if (typeof lunchWeekLabel !== 'string' || typeof imageUrl !== 'string') {
    return { error: 'Lunch schedule needs a week label and image (both can be blank).' };
  }
  if (lunchWeekLabel.length > WEEK_LABEL_MAX) return { error: `Week label must be ${WEEK_LABEL_MAX} characters or fewer.` };
  if (!isValidImageValue(imageUrl)) {
    return { error: 'Lunch schedule image must be an uploaded image or a valid https:// link.' };
  }

  for (const l of content.lunchMenu) {
    if (typeof l.weekday !== 'string' || typeof l.item !== 'string') return { error: 'Each lunch entry needs a weekday and item.' };
    if (l.item.length > LUNCH_ITEM_MAX) return { error: `Lunch item must be ${LUNCH_ITEM_MAX} characters or fewer.` };
  }

  // Rebuilt from only the fields above rather than passed through as-is —
  // an admin session is trusted to manage this content, but not to add
  // arbitrary extra fields to what gets stored.
  return {
    fields: {
      weeklySlide: { weekLabel: slideWeekLabel.trim(), canvaEmbedUrl: normalizeUrl(canvaEmbedUrl) },
      lunchSchedule: { weekLabel: lunchWeekLabel.trim(), imageUrl },
      lunchMenu: content.lunchMenu.map((l) => ({ weekday: l.weekday, item: l.item.trim() })),
    },
  };
}

router.get('/api/content', requireActiveStudent, (req, res) => {
  res.json({ content: db.readContent() });
});

router.get('/api/admin/content', requireAdmin, (req, res) => {
  res.json({ content: db.readContent() });
});

router.put('/api/admin/content', requireAdmin, (req, res) => {
  const { fields, error } = validateContent(req.body && req.body.content);
  if (error) return res.status(400).json({ error });

  db.writeContent(fields);
  res.json({ content: fields });
});

module.exports = router;
