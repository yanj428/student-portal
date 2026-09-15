const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const LUNCH_UPLOADS_DIR = path.join(UPLOADS_DIR, 'lunch');
const CLUB_LOGO_UPLOADS_DIR = path.join(UPLOADS_DIR, 'club-logos');
fs.mkdirSync(LUNCH_UPLOADS_DIR, { recursive: true });
fs.mkdirSync(CLUB_LOGO_UPLOADS_DIR, { recursive: true });

// Identifies a file by its actual bytes (the "magic number" every image
// format starts with), not by the Content-Type header the browser sent —
// that header is just a claim the uploader makes about their own file, so
// checking only it would let someone upload e.g. an .html file that lies
// about being a PNG and have it served back, as-is, from our own domain.
function detectImageType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: '.png', mimetype: 'image/png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: '.jpg', mimetype: 'image/jpeg' };
  }
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) {
    return { ext: '.gif', mimetype: 'image/gif' };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ext: '.webp', mimetype: 'image/webp' };
  }
  return null;
}

// Uploads go to memory first (these are small, capped well under 10MB) so
// the real file type can be checked before anything touches disk, and the
// file is saved under an extension based on what it actually is rather
// than whatever extension or Content-Type the upload claimed.
function makeImageUpload(destinationDir, maxSizeMb) {
  const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxSizeMb * 1024 * 1024 } });

  return {
    single(fieldName) {
      const inner = memoryUpload.single(fieldName);
      return (req, res, next) => {
        inner(req, res, (err) => {
          if (err) return next(err);
          if (!req.file) return next();

          const detected = detectImageType(req.file.buffer);
          if (!detected) return next(new Error('Only JPEG, PNG, WEBP, or GIF images are allowed.'));

          const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${detected.ext}`;
          fs.writeFile(path.join(destinationDir, filename), req.file.buffer, (writeErr) => {
            if (writeErr) return next(writeErr);
            req.file.filename = filename;
            req.file.path = path.join(destinationDir, filename);
            req.file.mimetype = detected.mimetype;
            next();
          });
        });
      };
    },
  };
}

const lunchImageUpload = makeImageUpload(LUNCH_UPLOADS_DIR, 8);
const clubLogoUpload = makeImageUpload(CLUB_LOGO_UPLOADS_DIR, 4);

// Same real-content-type check as makeImageUpload, but for a one-off image
// that's only ever sent on to an external API (the AI menu extractor) and
// never written to disk or served back from our own domain.
function makeMemoryImageUpload(maxSizeMb) {
  const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxSizeMb * 1024 * 1024 } });

  return {
    single(fieldName) {
      const inner = memoryUpload.single(fieldName);
      return (req, res, next) => {
        inner(req, res, (err) => {
          if (err) return next(err);
          if (!req.file) return next();

          const detected = detectImageType(req.file.buffer);
          if (!detected) return next(new Error('Only JPEG, PNG, WEBP, or GIF images are allowed.'));

          req.file.mimetype = detected.mimetype;
          next();
        });
      };
    },
  };
}

const memoryImageUpload = makeMemoryImageUpload(8);

module.exports = {
  UPLOADS_DIR,
  LUNCH_UPLOADS_DIR,
  CLUB_LOGO_UPLOADS_DIR,
  lunchImageUpload,
  clubLogoUpload,
  memoryImageUpload,
  detectImageType,
};
