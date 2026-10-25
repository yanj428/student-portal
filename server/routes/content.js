const express = require('express');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { validateOptionalUrl, normalizeUrl } = require('../utils/validateUrl');

// The lunch schedule image is set via the upload endpoint
// (server/routes/lunch.js), which produces a relative /uploads/lunch/...
// path. External URLs aren't accepted: the CSP only allows same-origin
// images, so they would render broken. Path segments like ".." are rejected
// so the value can't point outside the uploads folder.
function isValidImageValue(value) {
  if (value === '') return true;
  if (typeof value !== 'string') return false;
  return value.startsWith('/uploads/') && !value.includes('..') && !value.includes('\\');
}

const router = express.Router();

const WEEK_LABEL_MAX = 100;

// ---- Page content: the weekly slide, the lunch schedule image and the
// school year calendar image.
function validateContent(content) {
  const shape = db.DEFAULT_CONTENT;
  if (!content || typeof content !== 'object') return { error: 'Invalid content.' };

  for (const key of Object.keys(shape)) {
    if (typeof content[key] !== 'object' || content[key] === null || Array.isArray(content[key])) {
      return { error: `"${key}" is invalid.` };
    }
  }

  const { weekLabel: slideWeekLabel, canvaEmbedUrl } = content.weeklySlide;
  if (typeof slideWeekLabel !== 'string' || typeof canvaEmbedUrl !== 'string') {
    return { error: 'Weekly slide needs a week label and a Canva link (both can be blank).' };
  }
  if (slideWeekLabel.length > WEEK_LABEL_MAX) return { error: `Week label must be ${WEEK_LABEL_MAX} characters or fewer.` };
  const canvaError = validateOptionalUrl(canvaEmbedUrl, {
    fieldName: 'Canva link',
    allowedHosts: ['canva.com', 'canva.link'],
  });
  if (canvaError) return { error: canvaError };

  const { weekLabel: lunchWeekLabel, imageUrl } = content.lunchSchedule;
  if (typeof lunchWeekLabel !== 'string' || typeof imageUrl !== 'string') {
    return { error: 'Lunch schedule needs a week label and image (both can be blank).' };
  }
  if (lunchWeekLabel.length > WEEK_LABEL_MAX) return { error: `Week label must be ${WEEK_LABEL_MAX} characters or fewer.` };
  if (!isValidImageValue(imageUrl)) {
    return { error: 'Lunch schedule image must be an uploaded image.' };
  }

  const { label: calendarLabel, imageUrl: calendarImageUrl } = content.calendarImage;
  if (typeof calendarLabel !== 'string' || typeof calendarImageUrl !== 'string') {
    return { error: 'Calendar image needs a label and image (both can be blank).' };
  }
  if (calendarLabel.length > WEEK_LABEL_MAX) return { error: `Calendar label must be ${WEEK_LABEL_MAX} characters or fewer.` };
  if (!isValidImageValue(calendarImageUrl)) return { error: 'Calendar image must be an uploaded image.' };

  // Rebuilt from only the fields above rather than passed through as-is —
  // an admin session is trusted to manage this content, but not to add
  // arbitrary extra fields to what gets stored.
  return {
    fields: {
      weeklySlide: { weekLabel: slideWeekLabel.trim(), canvaEmbedUrl: normalizeUrl(canvaEmbedUrl) },
      lunchSchedule: { weekLabel: lunchWeekLabel.trim(), imageUrl },
      calendarImage: { label: calendarLabel.trim(), imageUrl: calendarImageUrl },
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
