const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireStudent } = require('../middleware/auth');

const router = express.Router();

function publicSlide(slide) {
  return { id: slide.id, weekLabel: slide.weekLabel, canvaEmbedUrl: slide.canvaEmbedUrl, archivedAt: slide.archivedAt };
}

router.get('/api/slide-archive', requireStudent, (req, res) => {
  const slides = db
    .readSlideArchive()
    .sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt))
    .map(publicSlide);
  res.json({ slides });
});

router.get('/api/admin/slide-archive', requireAdmin, (req, res) => {
  const slides = db
    .readSlideArchive()
    .sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt))
    .map(publicSlide);
  res.json({ slides });
});

router.post('/api/admin/slide-archive', requireAdmin, (req, res) => {
  const { weekLabel, canvaEmbedUrl } = req.body || {};
  if (typeof weekLabel !== 'string' || !weekLabel.trim()) {
    return res.status(400).json({ error: 'Week label is required.' });
  }
  if (typeof canvaEmbedUrl !== 'string' || !canvaEmbedUrl.trim()) {
    return res.status(400).json({ error: 'Canva embed URL is required.' });
  }

  const slides = db.readSlideArchive();
  const slide = {
    id: crypto.randomUUID(),
    weekLabel: weekLabel.trim(),
    canvaEmbedUrl: canvaEmbedUrl.trim(),
    archivedAt: new Date().toISOString(),
  };
  slides.push(slide);
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
