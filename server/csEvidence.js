const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const db = require('./db');
const { detectImageType } = require('./uploads');

// Evidence for community service reports (photos of students, certificates)
// is kept out of the public /uploads folder: only the student who uploaded it
// and the coordinator may see it, so it is only ever served through
// GET /api/cs-hours/evidence/:id, which checks who is asking.
const EVIDENCE_DIR = process.env.DATA_DIR
  ? path.join(path.resolve(process.env.DATA_DIR), 'cs-evidence')
  : path.join(__dirname, '..', 'data', 'cs-evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const EVIDENCE_MAX_MB = 8;
const NAME_MAX = 100;
// An upload that never made it onto a saved report (the student closed the
// form) is removed after this long.
const UNATTACHED_TTL_MS = 24 * 60 * 60 * 1000;

const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: EVIDENCE_MAX_MB * 1024 * 1024, files: 1 } });

function detectPdf(buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-' ? { ext: '.pdf', mimetype: 'application/pdf' } : null;
}

const fileFor = (item) => path.join(EVIDENCE_DIR, `${item.id}${item.ext}`);

function deleteFiles(items) {
  items.forEach((item) => fs.unlink(fileFor(item), () => {}));
}

// Multer middleware plus the real-type check. Errors are answered here as a
// 400 with a message the student can act on, instead of the generic 500.
function receiveEvidence(req, res, next) {
  memoryUpload.single('file')(req, res, (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({ error: tooBig ? `Files must be ${EVIDENCE_MAX_MB} MB or smaller.` : 'Could not read that file.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
    const detected = detectImageType(req.file.buffer) || detectPdf(req.file.buffer);
    if (!detected) return res.status(400).json({ error: 'Upload a photo (JPEG, PNG, WEBP or GIF) or a PDF.' });
    req.evidenceType = detected;
    next();
  });
}

function saveEvidence(studentId, file, detected) {
  const item = {
    id: crypto.randomUUID(),
    studentId,
    ext: detected.ext,
    mimetype: detected.mimetype,
    name: (file.originalname || `evidence${detected.ext}`).replace(/[\r\n"]/g, '').slice(0, NAME_MAX),
    size: file.size,
    attached: false,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(fileFor(item), file.buffer);

  const now = Date.now();
  const all = db.readCsEvidence();
  const stale = all.filter((e) => !e.attached && now - Date.parse(e.createdAt) > UNATTACHED_TTL_MS);
  deleteFiles(stale);
  db.writeCsEvidence([...all.filter((e) => !stale.includes(e)), item]);
  return item;
}

// Marks the evidence a saved report uses as attached and deletes whatever the
// student removed from it, so files never outlive the report they belong to.
function syncAttachedEvidence(studentId, keptIds, droppedIds) {
  const all = db.readCsEvidence();
  const dropped = all.filter((e) => e.studentId === studentId && droppedIds.includes(e.id) && !keptIds.includes(e.id));
  deleteFiles(dropped);
  db.writeCsEvidence(all.filter((e) => !dropped.includes(e)).map((e) => (keptIds.includes(e.id) && e.studentId === studentId ? { ...e, attached: true } : e)));
}

function removeEvidenceOfStudent(studentId) {
  const all = db.readCsEvidence();
  deleteFiles(all.filter((e) => e.studentId === studentId));
  db.writeCsEvidence(all.filter((e) => e.studentId !== studentId));
}

function findEvidence(id) {
  return db.readCsEvidence().find((e) => e.id === id) || null;
}

module.exports = { EVIDENCE_MAX_MB, receiveEvidence, saveEvidence, syncAttachedEvidence, removeEvidenceOfStudent, findEvidence, fileFor };
