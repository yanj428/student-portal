const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { validateOptionalUrl, normalizeUrl } = require('../utils/validateUrl');

const router = express.Router();

function publicSlide(slide) {
  return { id: slide.id, weekLabel: slide.weekLabel, canvaEmbedUrl: slide.canvaEmbedUrl, archivedAt: slide.archivedAt };
}

// The list is kept in the order the admin arranged it (new slides are added at
// the top), and students see the same order.
router.get('/api/slide-archive', requireActiveStudent, (req, res) => {
  res.json({ slides: db.readSlideArchive().map(publicSlide) });
});

router.get('/api/admin/slide-archive', requireAdmin, (req, res) => {
  res.json({ slides: db.readSlideArchive().map(publicSlide) });
});

// Registered before /:id so "reorder" can never be mistaken for a slide id.
router.put('/api/admin/slide-archive/reorder', requireAdmin, (req, res) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === 'string')) {
    return res.status(400).json({ error: 'orderedIds must be an array of ids.' });
  }

  const slides = db.readSlideArchive();
  const byId = new Map(slides.map((s) => [s.id, s]));
  const sameSet = orderedIds.length === slides.length && new Set(orderedIds).size === orderedIds.length && orderedIds.every((id) => byId.has(id));
  if (!sameSet) return res.status(400).json({ error: 'orderedIds must match the current archived slides exactly.' });

  db.writeSlideArchive(orderedIds.map((id) => byId.get(id)));
  res.json({ slides: orderedIds.map((id) => publicSlide(byId.get(id))) });
});

router.post('/api/admin/slide-archive', requireAdmin, (req, res) => {
  const { weekLabel, canvaEmbedUrl } = req.body || {};
  if (typeof weekLabel !== 'string' || !weekLabel.trim()) {
    return res.status(400).json({ error: 'Week label is required.' });
  }
  if (typeof canvaEmbedUrl !== 'string' || !canvaEmbedUrl.trim()) {
    return res.status(400).json({ error: 'Canva link is required.' });
  }
  const urlError = validateOptionalUrl(canvaEmbedUrl, { fieldName: 'Canva link', allowedHosts: ['canva.com', 'canva.link'] });
  if (urlError) return res.status(400).json({ error: urlError });

  const slides = db.readSlideArchive();
  const slide = {
    id: crypto.randomUUID(),
    weekLabel: weekLabel.trim(),
    canvaEmbedUrl: normalizeUrl(canvaEmbedUrl),
    archivedAt: new Date().toISOString(),
  };
  slides.unshift(slide);
  db.writeSlideArchive(slides);

  res.status(201).json({ slide: publicSlide(slide) });
});

router.delete('/api/admin/slide-archive/:id', requireAdmin, (req, res) => {
  const slides = db.readSlideArchive();
  const next = slides.filter((s) => s.id !== req.params.id);
  if (next.length === slides.length) return res.status(404).json({ error: 'Slide not found.' });
  db.writeSlideArchive(next);
  res.json({ ok: true });
});

module.exports = router;
