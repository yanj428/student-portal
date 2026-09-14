const express = require('express');
const fs = require('fs');
const path = require('path');

const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { UPLOADS_DIR, lunchImageUpload } = require('../uploads');

const router = express.Router();

router.post('/api/admin/lunch-image', requireAdmin, (req, res) => {
  lunchImageUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Could not upload image.' });
    if (!req.file) return res.status(400).json({ error: 'No image was uploaded.' });

    const weekLabel = typeof req.body.weekLabel === 'string' ? req.body.weekLabel.trim() : '';
    const content = db.readContent();
    const previousImageUrl = content.lunchSchedule.imageUrl;

    content.lunchSchedule = { weekLabel, imageUrl: `/uploads/lunch/${req.file.filename}` };
    db.writeContent(content);

    if (previousImageUrl && previousImageUrl.startsWith('/uploads/lunch/')) {
      const previousPath = path.join(UPLOADS_DIR, 'lunch', path.basename(previousImageUrl));
      fs.unlink(previousPath, () => {});
    }

    res.status(201).json({ lunchSchedule: content.lunchSchedule });
  });
});

router.delete('/api/admin/lunch-image', requireAdmin, (req, res) => {
  const content = db.readContent();
  const imageUrl = content.lunchSchedule.imageUrl;

  content.lunchSchedule = { weekLabel: '', imageUrl: '' };
  db.writeContent(content);

  if (imageUrl && imageUrl.startsWith('/uploads/lunch/')) {
    const imagePath = path.join(UPLOADS_DIR, 'lunch', path.basename(imageUrl));
    fs.unlink(imagePath, () => {});
  }

  res.json({ lunchSchedule: content.lunchSchedule });
});

module.exports = router;
