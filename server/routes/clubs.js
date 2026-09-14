const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireStudent } = require('../middleware/auth');
const { UPLOADS_DIR, clubLogoUpload } = require('../uploads');

const router = express.Router();

const CLUB_TYPES = ['community-service', 'after-school'];

function publicClub(club) {
  return {
    id: club.id,
    type: club.type,
    name: club.name,
    description: club.description,
    logoUrl: club.logoUrl || '',
    instagramUrl: club.instagramUrl || '',
    applicationFormUrl: club.applicationFormUrl || '',
    schedule: club.schedule || '',
    advisor: club.advisor || '',
    signupUrl: club.signupUrl || '',
    createdAt: club.createdAt,
  };
}

function filterByType(clubs, type) {
  return type ? clubs.filter((c) => c.type === type) : clubs;
}

router.get('/api/clubs', requireStudent, (req, res) => {
  const clubs = filterByType(db.readClubs(), req.query.type)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(publicClub);
  res.json({ clubs });
});

router.get('/api/admin/clubs', requireAdmin, (req, res) => {
  const clubs = filterByType(db.readClubs(), req.query.type)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(publicClub);
  res.json({ clubs });
});

function readClubFields(body) {
  const { type, name, description, instagramUrl, applicationFormUrl, schedule, advisor, signupUrl } = body || {};
  if (!CLUB_TYPES.includes(type)) {
    return { error: 'Club type must be either community-service or after-school.' };
  }
  if (typeof name !== 'string' || !name.trim()) {
    return { error: 'Club name is required.' };
  }
  if (typeof description !== 'string' || !description.trim()) {
    return { error: 'Description is required.' };
  }
  return {
    fields: {
      type,
      name: name.trim(),
      description: description.trim(),
      instagramUrl: typeof instagramUrl === 'string' ? instagramUrl.trim() : '',
      applicationFormUrl: typeof applicationFormUrl === 'string' ? applicationFormUrl.trim() : '',
      schedule: typeof schedule === 'string' ? schedule.trim() : '',
      advisor: typeof advisor === 'string' ? advisor.trim() : '',
      signupUrl: typeof signupUrl === 'string' ? signupUrl.trim() : '',
    },
  };
}

router.post('/api/admin/clubs', requireAdmin, (req, res) => {
  clubLogoUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Could not upload logo.' });

    const { fields, error } = readClubFields(req.body);
    if (error) return res.status(400).json({ error });

    const clubs = db.readClubs();
    const club = {
      id: crypto.randomUUID(),
      ...fields,
      logoUrl: req.file ? `/uploads/club-logos/${req.file.filename}` : '',
      createdAt: new Date().toISOString(),
    };
    clubs.push(club);
    db.writeClubs(clubs);

    res.status(201).json({ club: publicClub(club) });
  });
});

router.put('/api/admin/clubs/:id', requireAdmin, (req, res) => {
  clubLogoUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Could not upload logo.' });

    const { fields, error } = readClubFields(req.body);
    if (error) return res.status(400).json({ error });

    const clubs = db.readClubs();
    const club = clubs.find((c) => c.id === req.params.id);
    if (!club) return res.status(404).json({ error: 'Club not found.' });

    const previousLogoUrl = club.logoUrl;
    Object.assign(club, fields);
    if (req.file) {
      club.logoUrl = `/uploads/club-logos/${req.file.filename}`;
    }
    db.writeClubs(clubs);

    if (req.file && previousLogoUrl && previousLogoUrl.startsWith('/uploads/club-logos/')) {
      fs.unlink(path.join(UPLOADS_DIR, 'club-logos', path.basename(previousLogoUrl)), () => {});
    }

    res.json({ club: publicClub(club) });
  });
});

router.delete('/api/admin/clubs/:id', requireAdmin, (req, res) => {
  const clubs = db.readClubs();
  const club = clubs.find((c) => c.id === req.params.id);
  if (!club) return res.status(404).json({ error: 'Club not found.' });

  const next = clubs.filter((c) => c.id !== req.params.id);
  db.writeClubs(next);

  if (club.logoUrl && club.logoUrl.startsWith('/uploads/club-logos/')) {
    fs.unlink(path.join(UPLOADS_DIR, 'club-logos', path.basename(club.logoUrl)), () => {});
  }

  res.json({ ok: true });
});

module.exports = router;
