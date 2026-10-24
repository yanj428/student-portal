const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const { requireAdmin, requireActiveStudent } = require('../middleware/auth');
const { COUNCIL_PHOTO_SUBDIR, councilPhotoUpload, removeUpload, discardUpload } = require('../uploads');

const router = express.Router();

function publicMember(m) {
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    grade: m.grade || '',
    photoUrl: m.photoUrl || '',
    group: m.group === 'general-council' ? 'general-council' : 'student-council',
    level: m.level === 'ms' ? 'ms' : 'hs',
    createdAt: m.createdAt,
  };
}

// The admin panel and the public tree page both bucket members by school
// level (HS/MS) crossed with council (Student/General) — this is the one
// place that combination is computed, so both stay in sync with whatever
// bucket key the client sends for reordering.
function bucketOf(m) {
  return `${m.level === 'ms' ? 'ms' : 'hs'}-${m.group === 'general-council' ? 'general-council' : 'student-council'}`;
}

const listCouncil = (req, res) => res.json({ council: db.readCouncil().map(publicMember) });

router.get('/api/council', requireActiveStudent, listCouncil);
router.get('/api/admin/council', requireAdmin, listCouncil);

function readFields(body) {
  const { name, role, grade, group, level } = body || {};
  if (typeof name !== 'string' || !name.trim()) return { error: 'Name is required.' };
  if (typeof role !== 'string' || !role.trim()) return { error: 'Position is required.' };
  if (typeof grade !== 'string') return { error: 'Grade must be text (it can be blank).' };
  return {
    fields: {
      name: name.trim(),
      role: role.trim(),
      grade: grade.trim(),
      group: group === 'general-council' ? 'general-council' : 'student-council',
      level: level === 'ms' ? 'ms' : 'hs',
    },
  };
}

router.post('/api/admin/council', requireAdmin, (req, res) => {
  councilPhotoUpload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Could not upload photo.' });

    const { fields, error } = readFields(req.body);
    if (error) {
      discardUpload(req);
      return res.status(400).json({ error });
    }

    const items = db.readCouncil();
    const item = {
      id: crypto.randomUUID(),
      ...fields,
      photoUrl: req.file ? `/uploads/${COUNCIL_PHOTO_SUBDIR}/${req.file.filename}` : '',
      createdAt: new Date().toISOString(),
    };
    items.push(item);
    db.writeCouncil(items);

    res.status(201).json({ member: publicMember(item) });
  });
});

router.put('/api/admin/council/reorder', requireAdmin, (req, res) => {
  const { bucket, orderedIds } = req.body || {};
  if (typeof bucket !== 'string' || !bucket) return res.status(400).json({ error: 'bucket is required.' });
  if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === 'string')) {
    return res.status(400).json({ error: 'orderedIds must be an array of ids.' });
  }

  const items = db.readCouncil();
  const bucketItems = items.filter((m) => bucketOf(m) === bucket);
  const bucketIds = new Set(bucketItems.map((m) => m.id));
  const sameSet = orderedIds.length === bucketItems.length && new Set(orderedIds).size === orderedIds.length && orderedIds.every((id) => bucketIds.has(id));
  if (!sameSet) return res.status(400).json({ error: 'orderedIds must match the current members of that council exactly.' });

  const byId = new Map(bucketItems.map((m) => [m.id, m]));
  const reordered = orderedIds.map((id) => byId.get(id));
  let cursor = 0;
  const next = items.map((m) => (bucketOf(m) === bucket ? reordered[cursor++] : m));
  db.writeCouncil(next);

  res.json({ council: next.map(publicMember) });
});

router.put('/api/admin/council/:id', requireAdmin, (req, res) => {
  councilPhotoUpload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Could not upload photo.' });

    const { fields, error } = readFields(req.body);
    if (error) {
      discardUpload(req);
      return res.status(400).json({ error });
    }

    const items = db.readCouncil();
    const item = items.find((m) => m.id === req.params.id);
    if (!item) {
      discardUpload(req);
      return res.status(404).json({ error: 'Council member not found.' });
    }

    const previousPhotoUrl = item.photoUrl;
    Object.assign(item, fields);
    if (req.file) item.photoUrl = `/uploads/${COUNCIL_PHOTO_SUBDIR}/${req.file.filename}`;
    else if (req.body.removePhoto === 'true') item.photoUrl = '';
    db.writeCouncil(items);

    if (item.photoUrl !== previousPhotoUrl) removeUpload(previousPhotoUrl, COUNCIL_PHOTO_SUBDIR);

    res.json({ member: publicMember(item) });
  });
});

router.delete('/api/admin/council/:id', requireAdmin, (req, res) => {
  const items = db.readCouncil();
  const item = items.find((m) => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Council member not found.' });

  const next = items.filter((m) => m.id !== req.params.id);
  db.writeCouncil(next);

  removeUpload(item.photoUrl, COUNCIL_PHOTO_SUBDIR);

  res.json({ ok: true });
});

module.exports = router;
