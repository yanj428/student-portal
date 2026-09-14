const express = require('express');

const db = require('../db');
const { requireAdmin, requireStudent } = require('../middleware/auth');

const router = express.Router();

// ---- Homepage content (text only — the layout/section list is fixed) ----
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
  if (typeof content.lunchSchedule.weekLabel !== 'string' || typeof content.lunchSchedule.imageUrl !== 'string') {
    return 'Lunch schedule needs a week label and image (both can be blank).';
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
    if (typeof c !== 'object' || c === null || typeof c.name !== 'string' || !c.name.trim()) {
      return 'Each club needs a name.';
    }
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

router.get('/api/content', requireStudent, (req, res) => {
  res.json({ content: db.readContent() });
});

router.get('/api/admin/content', requireAdmin, (req, res) => {
  res.json({ content: db.readContent() });
});

router.put('/api/admin/content', requireAdmin, (req, res) => {
  const { content } = req.body || {};
  const error = validateContent(content);
  if (error) return res.status(400).json({ error });

  db.writeContent(content);
  res.json({ content });
});

module.exports = router;
