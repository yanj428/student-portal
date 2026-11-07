const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { validateOptionalUrl, normalizeUrl } = require('../utils/validateUrl');
const { listRoute, reorderRoute, deleteRoute } = require('../utils/routeHelpers');

const router = express.Router();

function publicSlide(slide) {
  return { id: slide.id, weekLabel: slide.weekLabel, canvaEmbedUrl: slide.canvaEmbedUrl, archivedAt: slide.archivedAt };
}

// The list is kept in the order the admin arranged it (new slides are added at
// the top), and students see the same order.
const listSlides = listRoute(db.readSlideArchive, 'slides', publicSlide);
router.get('/api/slide-archive', requireActiveStudent, listSlides);
router.get('/api/admin/slide-archive', requireAdmin, listSlides);

// Registered before /:id so "reorder" can never be mistaken for a slide id.
router.put('/api/admin/slide-archive/reorder', requireAdmin, reorderRoute({ read: db.readSlideArchive, write: db.writeSlideArchive, key: 'slides', publicFn: publicSlide, noun: 'archived slides' }));

function readSlideFields(body) {
  const { weekLabel, canvaEmbedUrl } = body || {};
  if (typeof weekLabel !== 'string' || !weekLabel.trim()) {
    return { error: 'Week label is required.' };
  }
  if (typeof canvaEmbedUrl !== 'string' || !canvaEmbedUrl.trim()) {
    return { error: 'Canva link is required.' };
  }
  const urlError = validateOptionalUrl(canvaEmbedUrl, { fieldName: 'Canva link', allowedHosts: ['canva.com', 'canva.link'] });
  if (urlError) return { error: urlError };
  return { weekLabel: weekLabel.trim(), canvaEmbedUrl: normalizeUrl(canvaEmbedUrl) };
}

// Changes an archived slide's label or link; its place in the list and archive date stay.
router.put('/api/admin/slide-archive/:id', requireAdmin, (req, res) => {
  const { weekLabel, canvaEmbedUrl, error } = readSlideFields(req.body);
  if (error) return res.status(400).json({ error });

  const slides = db.readSlideArchive();
  const slide = slides.find((s) => s.id === req.params.id);
  if (!slide) return res.status(404).json({ error: 'Slide not found.' });
  slide.weekLabel = weekLabel;
  slide.canvaEmbedUrl = canvaEmbedUrl;
  db.writeSlideArchive(slides);

  res.json({ slide: publicSlide(slide) });
});

router.post('/api/admin/slide-archive', requireAdmin, (req, res) => {
  const { weekLabel, canvaEmbedUrl, error } = readSlideFields(req.body);
  if (error) return res.status(400).json({ error });

  const slides = db.readSlideArchive();
  const slide = {
    id: crypto.randomUUID(),
    weekLabel,
    canvaEmbedUrl,
    archivedAt: new Date().toISOString(),
  };
  slides.unshift(slide);
  db.writeSlideArchive(slides);

  res.status(201).json({ slide: publicSlide(slide) });
});

router.delete('/api/admin/slide-archive/:id', requireAdmin, deleteRoute({ read: db.readSlideArchive, write: db.writeSlideArchive, notFound: 'Slide not found.' }));

module.exports = router;
