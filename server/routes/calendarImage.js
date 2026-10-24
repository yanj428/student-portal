const express = require('express');

const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { CALENDAR_SUBDIR, calendarImageUpload, removeUpload, discardUpload } = require('../uploads');

const router = express.Router();

const LABEL_MAX = 100;

// The school year calendar picture shown on the School Calendar page.
router.post('/api/admin/calendar-image', requireAdmin, (req, res) => {
  calendarImageUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Could not upload image.' });
    if (!req.file) return res.status(400).json({ error: 'No image was uploaded.' });

    const label = typeof req.body.label === 'string' ? req.body.label.trim() : '';
    if (label.length > LABEL_MAX) {
      discardUpload(req);
      return res.status(400).json({ error: `Label must be ${LABEL_MAX} characters or fewer.` });
    }

    const content = db.readContent();
    const previousImageUrl = content.calendarImage.imageUrl;

    content.calendarImage = { label, imageUrl: `/uploads/${CALENDAR_SUBDIR}/${req.file.filename}` };
    db.writeContent(content);
    removeUpload(previousImageUrl, CALENDAR_SUBDIR);

    res.status(201).json({ calendarImage: content.calendarImage });
  });
});

router.delete('/api/admin/calendar-image', requireAdmin, (req, res) => {
  const content = db.readContent();
  const { imageUrl } = content.calendarImage;

  content.calendarImage = { label: '', imageUrl: '' };
  db.writeContent(content);
  removeUpload(imageUrl, CALENDAR_SUBDIR);

  res.json({ calendarImage: content.calendarImage });
});

module.exports = router;
