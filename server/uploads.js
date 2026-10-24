const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

// Kept next to the database when DATA_DIR is set (tests, and the Fly.io
// deployment, where only the mounted volume survives a redeploy), so uploads
// are never lost with the app image and tests never write into the repo.
const UPLOADS_DIR = process.env.DATA_DIR
  ? path.join(path.resolve(process.env.DATA_DIR), 'uploads')
  : path.join(__dirname, '..', 'uploads');
const LUNCH_SUBDIR = 'lunch';
const CLUB_LOGO_SUBDIR = 'club-logos';
const COUNCIL_PHOTO_SUBDIR = 'council-photos';
const CALENDAR_SUBDIR = 'calendar';
for (const subdir of [LUNCH_SUBDIR, CLUB_LOGO_SUBDIR, COUNCIL_PHOTO_SUBDIR, CALENDAR_SUBDIR]) {
  fs.mkdirSync(path.join(UPLOADS_DIR, subdir), { recursive: true });
}

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
// than whatever extension or Content-Type the upload claimed. With no
// `subdir` the image is only ever sent on to an external API (the calendar
// extractor) and never written to disk or served back from our own domain.
function makeImageUpload(maxSizeMb, subdir) {
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
          if (!subdir) return next();

          const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${detected.ext}`;
          const destination = path.join(UPLOADS_DIR, subdir, filename);
          fs.writeFile(destination, req.file.buffer, (writeErr) => {
            if (writeErr) return next(writeErr);
            req.file.filename = filename;
            req.file.path = destination;
            next();
          });
        });
      };
    },
  };
}

// Deletes a previously saved upload by its public URL, ignoring anything
// that isn't a file this server saved under /uploads/<subdir>/.
function removeUpload(url, subdir) {
  const prefix = `/uploads/${subdir}/`;
  if (typeof url === 'string' && url.startsWith(prefix)) {
    fs.unlink(path.join(UPLOADS_DIR, subdir, path.basename(url)), () => {});
  }
}

// For a request that already wrote its upload to disk but then failed
// validation (or found nothing to attach it to), so the file isn't orphaned.
function discardUpload(req) {
  if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
}

module.exports = {
  UPLOADS_DIR,
  LUNCH_SUBDIR,
  CLUB_LOGO_SUBDIR,
  COUNCIL_PHOTO_SUBDIR,
  CALENDAR_SUBDIR,
  lunchImageUpload: makeImageUpload(8, LUNCH_SUBDIR),
  clubLogoUpload: makeImageUpload(4, CLUB_LOGO_SUBDIR),
  councilPhotoUpload: makeImageUpload(4, COUNCIL_PHOTO_SUBDIR),
  // A full-page calendar scan, so a larger cap than the logos and photos.
  calendarImageUpload: makeImageUpload(10, CALENDAR_SUBDIR),
  memoryImageUpload: makeImageUpload(8),
  removeUpload,
  discardUpload,
  detectImageType,
};
