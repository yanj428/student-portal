const express = require('express');

const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { LUNCH_SUBDIR, lunchImageUpload, removeUpload, discardUpload } = require('../uploads');

const router = express.Router();

const WEEK_LABEL_MAX = 100;

router.post('/api/admin/lunch-image', requireAdmin, (req, res) => {
  lunchImageUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Could not upload the menu.' });
    if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });

    const weekLabel = typeof req.body.weekLabel === 'string' ? req.body.weekLabel.trim() : '';
    if (weekLabel.length > WEEK_LABEL_MAX) {
      discardUpload(req);
      return res.status(400).json({ error: `Week label must be ${WEEK_LABEL_MAX} characters or fewer.` });
    }

    const content = db.readContent();
    const previousImageUrl = content.lunchSchedule.imageUrl;

    content.lunchSchedule = { weekLabel, imageUrl: `/uploads/${LUNCH_SUBDIR}/${req.file.filename}` };
    db.writeContent(content);
    removeUpload(previousImageUrl, LUNCH_SUBDIR);

    res.status(201).json({ lunchSchedule: content.lunchSchedule });
  });
});

router.delete('/api/admin/lunch-image', requireAdmin, (req, res) => {
  const content = db.readContent();
  const imageUrl = content.lunchSchedule.imageUrl;

  content.lunchSchedule = { weekLabel: '', imageUrl: '' };
  db.writeContent(content);
  removeUpload(imageUrl, LUNCH_SUBDIR);

  res.json({ lunchSchedule: content.lunchSchedule });
});

module.exports = router;
