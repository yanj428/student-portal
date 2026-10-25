const express = require('express');

const db = require('../db');
const { requireActiveStudent } = require('../middleware/auth');
const { WIDGETS, JUMP_TILES, resolveLayout, validateLayoutInput } = require('../utils/homeLayout');

const router = express.Router();

router.get('/api/home-layout', requireActiveStudent, (req, res) => {
  res.json({ widgets: WIDGETS, jumpTiles: JUMP_TILES, layout: resolveLayout(db.getHomeLayout(req.student.id)) });
});

router.put('/api/home-layout', requireActiveStudent, (req, res) => {
  const { layout, error } = validateLayoutInput(req.body, db.getHomeLayout(req.student.id));
  if (error) return res.status(400).json({ error });
  db.setHomeLayout(req.student.id, layout);
  res.json({ layout: resolveLayout(layout) });
});

// Back to the standard layout.
router.delete('/api/home-layout', requireActiveStudent, (req, res) => {
  db.clearHomeLayout(req.student.id);
  res.json({ layout: resolveLayout(null) });
});

module.exports = router;