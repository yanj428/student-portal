const express = require('express');

const db = require('../db');
const { requireActiveStudent } = require('../middleware/auth');
const { WIDGETS, JUMP_TILES, HERO_BUTTONS, HERO_BUTTON_MAX, resolveLayout, validateLayoutInput, validateWidgetSettings } = require('../utils/homeLayout');
const { NAV_ITEMS } = require('../utils/navItems');

const router = express.Router();

router.get('/api/home-layout', requireActiveStudent, (req, res) => {
  res.json({ widgets: WIDGETS, jumpTiles: JUMP_TILES, heroButtons: HERO_BUTTONS, heroButtonMax: HERO_BUTTON_MAX, layout: resolveLayout(db.getHomeLayout(req.student.id)) });
});

router.put('/api/home-layout', requireActiveStudent, (req, res) => {
  const { layout, error } = validateLayoutInput(req.body, db.getHomeLayout(req.student.id));
  if (error) return res.status(400).json({ error });
  db.setHomeLayout(req.student.id, layout);
  res.json({ layout: resolveLayout(layout) });
});

// Draws one section with options that are not saved yet, so edit mode can show
// the student what they are about to get. Nothing is stored.
router.post('/api/home-layout/preview', requireActiveStudent, (req, res) => {
  const { widget, settings } = req.body || {};
  const { settings: options, error } = validateWidgetSettings(widget, settings, (db.getHomeLayout(req.student.id) || {}).settings);
  if (error) return res.status(400).json({ error });
  res.render('partials/home-widgets/' + widget, { options, student: req.student, navItems: NAV_ITEMS }, (err, html) => {
    if (err) return res.status(500).json({ error: 'Could not draw the preview.' });
    res.json({ html, settings: options });
  });
});

// Back to the standard layout.
router.delete('/api/home-layout', requireActiveStudent, (req, res) => {
  db.clearHomeLayout(req.student.id);
  res.json({ layout: resolveLayout(null) });
});

module.exports = router;