const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const LUNCH_UPLOADS_DIR = path.join(UPLOADS_DIR, 'lunch');
const CLUB_LOGO_UPLOADS_DIR = path.join(UPLOADS_DIR, 'club-logos');
fs.mkdirSync(LUNCH_UPLOADS_DIR, { recursive: true });
fs.mkdirSync(CLUB_LOGO_UPLOADS_DIR, { recursive: true });

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function makeImageUpload(destination, maxSizeMb) {
  return multer({
    storage: multer.diskStorage({
      destination,
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) return cb(new Error('Only JPEG, PNG, WEBP, or GIF images are allowed.'));
      cb(null, true);
    },
  });
}

const lunchImageUpload = makeImageUpload(LUNCH_UPLOADS_DIR, 8);
const clubLogoUpload = makeImageUpload(CLUB_LOGO_UPLOADS_DIR, 4);

module.exports = {
  UPLOADS_DIR,
  LUNCH_UPLOADS_DIR,
  CLUB_LOGO_UPLOADS_DIR,
  lunchImageUpload,
  clubLogoUpload,
};
