const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireStudent } = require('../middleware/auth');
const { UPLOADS_DIR, clubLogoUpload } = require('../uploads');

const router = express.Router();

function publicCsClub(club) {
  return {
    id: club.id,
    name: club.name,
    description: club.description,
    logoUrl: club.logoUrl || '',
    instagramUrl: club.instagramUrl || '',
    applicationFormUrl: club.applicationFormUrl || '',
    createdAt: club.createdAt,
  };
}

router.get('/api/cs-clubs', requireStudent, (req, res) => {
  const clubs = db
    .readCsClubs()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(publicCsClub);
  res.json({ clubs });
});

router.get('/api/admin/cs-clubs', requireAdmin, (req, res) => {
  const clubs = db
    .readCsClubs()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(publicCsClub);
  res.json({ clubs });
});

router.post('/api/admin/cs-clubs', requireAdmin, (req, res) => {
  clubLogoUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Could not upload logo.' });

    const { name, description, instagramUrl, applicationFormUrl } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Club name is required.' });
    }
    if (typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'Description is required.' });
    }

    const clubs = db.readCsClubs();
    const club = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      logoUrl: req.file ? `/uploads/club-logos/${req.file.filename}` : '',
      instagramUrl: typeof instagramUrl === 'string' ? instagramUrl.trim() : '',
      applicationFormUrl: typeof applicationFormUrl === 'string' ? applicationFormUrl.trim() : '',
      createdAt: new Date().toISOString(),
    };
    clubs.push(club);
    db.writeCsClubs(clubs);

    res.status(201).json({ club: publicCsClub(club) });
  });
});

router.put('/api/admin/cs-clubs/:id', requireAdmin, (req, res) => {
  clubLogoUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Could not upload logo.' });

    const { name, description, instagramUrl, applicationFormUrl } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Club name is required.' });
    }
    if (typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'Description is required.' });
    }

    const clubs = db.readCsClubs();
    const club = clubs.find((c) => c.id === req.params.id);
    if (!club) return res.status(404).json({ error: 'Club not found.' });

    const previousLogoUrl = club.logoUrl;

    club.name = name.trim();
    club.description = description.trim();
    club.instagramUrl = typeof instagramUrl === 'string' ? instagramUrl.trim() : '';
    club.applicationFormUrl = typeof applicationFormUrl === 'string' ? applicationFormUrl.trim() : '';
    if (req.file) {
      club.logoUrl = `/uploads/club-logos/${req.file.filename}`;
    }
    db.writeCsClubs(clubs);

    if (req.file && previousLogoUrl && previousLogoUrl.startsWith('/uploads/club-logos/')) {
      fs.unlink(path.join(UPLOADS_DIR, 'club-logos', path.basename(previousLogoUrl)), () => {});
    }

    res.json({ club: publicCsClub(club) });
  });
});

router.delete('/api/admin/cs-clubs/:id', requireAdmin, (req, res) => {
  const clubs = db.readCsClubs();
  const club = clubs.find((c) => c.id === req.params.id);
  if (!club) return res.status(404).json({ error: 'Club not found.' });

  const next = clubs.filter((c) => c.id !== req.params.id);
  db.writeCsClubs(next);

  if (club.logoUrl && club.logoUrl.startsWith('/uploads/club-logos/')) {
    fs.unlink(path.join(UPLOADS_DIR, 'club-logos', path.basename(club.logoUrl)), () => {});
  }

  res.json({ ok: true });
});

module.exports = router;
