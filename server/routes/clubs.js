const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { CLUB_LOGO_SUBDIR, clubLogoUpload, removeUpload, discardUpload } = require('../uploads');
const { validateOptionalUrl, normalizeUrl } = require('../utils/validateUrl');

const router = express.Router();

// The badge image for SDG <n> is whichever of public/assets/sdg/<n>.<ext> exists.
// A goal with no image yet gets no badge, so the card never shows a broken picture.
const SDG_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'sdg');
const SDG_EXTENSIONS = ['png', 'webp', 'jpg'];

function sdgBadges(numbers) {
  return numbers.flatMap((number) => {
    const ext = SDG_EXTENSIONS.find((e) => fs.existsSync(path.join(SDG_DIR, `${number}.${e}`)));
    return ext ? [{ number, url: `assets/sdg/${number}.${ext}` }] : [];
  });
}

const CLUB_TYPES = ['community-service', 'after-school'];

function publicClub(club) {
  return {
    id: club.id,
    type: club.type,
    name: club.name,
    mission: club.mission || '',
    goals: club.goals || '',
    sdgs: club.sdgs || [],
    sdgBadges: sdgBadges(club.sdgs || []),
    leaders: club.leaders || '',
    contacts: club.contacts || '',
    logoUrl: club.logoUrl || '',
    instagramUrl: club.instagramUrl || '',
    applicationFormUrl: club.applicationFormUrl || '',
    meetingDay: club.meetingDay || '',
    meetingTime: club.meetingTime || '',
    schedule: club.schedule || '',
    advisor: club.advisor || '',
    signupUrl: club.signupUrl || '',
    createdAt: club.createdAt,
  };
}

function filterByType(clubs, type) {
  return type ? clubs.filter((c) => c.type === type) : clubs;
}

function listClubs(req, res) {
  const clubs = filterByType(db.readClubs(), req.query.type)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(publicClub);
  res.json({ clubs });
}

router.get('/api/clubs', requireActiveStudent, listClubs);
router.get('/api/admin/clubs', requireAdmin, listClubs);

const TEXT_LIMITS = { mission: 2000, goals: 2000, leaders: 500, contacts: 500, advisor: 200, schedule: 200, meetingDay: 100, meetingTime: 100 };

// UN Sustainable Development Goal numbers, typed as "4, 9". The badge image for
// each lives at public/assets/sdg/<number>.png; a goal with no image yet is
// simply not shown on the club's card.
function parseSdgs(value) {
  if (value === undefined || value === '') return { sdgs: [] };
  if (typeof value !== 'string') return { error: 'SDG goals must be numbers separated by commas.' };
  const numbers = value.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  if (!numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 17)) {
    return { error: 'SDG goals must be numbers from 1 to 17, separated by commas.' };
  }
  return { sdgs: [...new Set(numbers)] };
}

function readClubFields(body) {
  const { type, name, mission, goals, sdgs, leaders, contacts, instagramUrl, applicationFormUrl, schedule, meetingDay, meetingTime, advisor, signupUrl } = body || {};
  if (!CLUB_TYPES.includes(type)) {
    return { error: 'Club type must be either community-service or after-school.' };
  }
  if (typeof name !== 'string' || !name.trim()) {
    return { error: 'Club name is required.' };
  }

  const texts = { mission, goals, leaders, contacts, advisor, schedule, meetingDay, meetingTime };
  for (const [field, value] of Object.entries(texts)) {
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string') return { error: `${field} must be text.` };
    if (value.trim().length > TEXT_LIMITS[field]) return { error: `${field} must be ${TEXT_LIMITS[field]} characters or fewer.` };
  }

  const parsedSdgs = parseSdgs(sdgs);
  if (parsedSdgs.error) return { error: parsedSdgs.error };

  const urlError =
    validateOptionalUrl(instagramUrl, { fieldName: 'Instagram link', allowedHosts: ['instagram.com'] }) ||
    validateOptionalUrl(applicationFormUrl, { fieldName: 'Application form link' }) ||
    validateOptionalUrl(signupUrl, { fieldName: 'Signup link' });
  if (urlError) return { error: urlError };

  return {
    fields: {
      type,
      name: name.trim(),
      mission: typeof mission === 'string' ? mission.trim() : '',
      goals: typeof goals === 'string' ? goals.trim() : '',
      sdgs: parsedSdgs.sdgs,
      leaders: typeof leaders === 'string' ? leaders.trim() : '',
      contacts: typeof contacts === 'string' ? contacts.trim() : '',
      instagramUrl: normalizeUrl(instagramUrl),
      applicationFormUrl: normalizeUrl(applicationFormUrl),
      schedule: typeof schedule === 'string' ? schedule.trim() : '',
      meetingDay: typeof meetingDay === 'string' ? meetingDay.trim() : '',
      meetingTime: typeof meetingTime === 'string' ? meetingTime.trim() : '',
      advisor: typeof advisor === 'string' ? advisor.trim() : '',
      signupUrl: normalizeUrl(signupUrl),
    },
  };
}

router.post('/api/admin/clubs', requireAdmin, (req, res) => {
  clubLogoUpload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Could not upload logo.' });

    const { fields, error } = readClubFields(req.body);
    if (error) {
      discardUpload(req);
      return res.status(400).json({ error });
    }

    const clubs = db.readClubs();
    const club = {
      id: crypto.randomUUID(),
      ...fields,
      logoUrl: req.file ? `/uploads/${CLUB_LOGO_SUBDIR}/${req.file.filename}` : '',
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
    if (error) {
      discardUpload(req);
      return res.status(400).json({ error });
    }

    const clubs = db.readClubs();
    const club = clubs.find((c) => c.id === req.params.id);
    if (!club) {
      discardUpload(req);
      return res.status(404).json({ error: 'Club not found.' });
    }

    const previousLogoUrl = club.logoUrl;
    Object.assign(club, fields);
    if (req.file) club.logoUrl = `/uploads/${CLUB_LOGO_SUBDIR}/${req.file.filename}`;
    else if (req.body.removeLogo === 'true') club.logoUrl = '';
    db.writeClubs(clubs);

    if (club.logoUrl !== previousLogoUrl) removeUpload(previousLogoUrl, CLUB_LOGO_SUBDIR);

    res.json({ club: publicClub(club) });
  });
});

router.delete('/api/admin/clubs/:id', requireAdmin, (req, res) => {
  const clubs = db.readClubs();
  const club = clubs.find((c) => c.id === req.params.id);
  if (!club) return res.status(404).json({ error: 'Club not found.' });

  const next = clubs.filter((c) => c.id !== req.params.id);
  db.writeClubs(next);

  removeUpload(club.logoUrl, CLUB_LOGO_SUBDIR);

  res.json({ ok: true });
});

module.exports = router;
