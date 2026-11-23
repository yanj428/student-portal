const fs = require('fs');
const path = require('path');

// The 17 UN Sustainable Development Goals: clubs show the ones they work on,
// and students tag their community service projects with them.
const SDG_NAMES = [
  'No Poverty', 'Zero Hunger', 'Good Health and Well-being', 'Quality Education', 'Gender Equality',
  'Clean Water and Sanitation', 'Affordable and Clean Energy', 'Decent Work and Economic Growth',
  'Industry, Innovation and Infrastructure', 'Reduced Inequalities', 'Sustainable Cities and Communities',
  'Responsible Consumption and Production', 'Climate Action', 'Life Below Water', 'Life on Land',
  'Peace, Justice and Strong Institutions', 'Partnerships for the Goals',
];

// The badge image for SDG <n> is whichever of public/assets/sdg/<n>.<ext> exists.
// A goal with no image yet gets no badge, so the card never shows a broken picture.
const SDG_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'sdg');
// The official picture (png, webp, jpg) wins over a plain colored tile (svg) for the same goal.
const SDG_EXTENSIONS = ['png', 'webp', 'jpg', 'svg'];

function sdgBadges(numbers) {
  return numbers.flatMap((number) => {
    const ext = SDG_EXTENSIONS.find((e) => fs.existsSync(path.join(SDG_DIR, `${number}.${e}`)));
    return ext ? [{ number, url: `assets/sdg/${number}.${ext}` }] : [];
  });
}

// All 17 goals with their badge, for the pickers.
function allSdgs() {
  return SDG_NAMES.map((name, i) => ({ number: i + 1, name, url: (sdgBadges([i + 1])[0] || {}).url || '' }));
}

module.exports = { SDG_NAMES, sdgBadges, allSdgs };
