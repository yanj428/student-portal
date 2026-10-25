const express = require('express');
const db = require('../db');
const { requireStudentPage } = require('../middleware/pageAuth');
const { WIDGETS, JUMP_TILES, resolveLayout } = require('../utils/homeLayout');
const { NAV_ITEMS } = require('../utils/navItems');

const router = express.Router();

const PAGES = [
  { paths: ['/'], view: 'pages/home' },
  { paths: ['/announcements'], view: 'pages/announcements' },
  { paths: ['/community-service'], view: 'pages/community-service' },
  { paths: ['/lunch-schedule'], view: 'pages/lunch-schedule' },
  { paths: ['/student-voice'], view: 'pages/student-voice' },
  { paths: ['/school-calendar'], view: 'pages/school-calendar' },
  { paths: ['/clubs'], view: 'pages/clubs' },
  { paths: ['/quick-links'], view: 'pages/quick-links' },
  { paths: ['/meet-council'], view: 'pages/meet-council' },
];

for (const { paths, view } of PAGES) {
  router.get(paths, requireStudentPage, (req, res) => {
    const extra = view === 'pages/home' ? { homeWidgets: WIDGETS, jumpTiles: JUMP_TILES, navItems: NAV_ITEMS, homeLayout: resolveLayout(db.getHomeLayout(res.locals.student.id)) } : {};
    res.render(view, { student: res.locals.student, ...extra });
  });
}

module.exports = router;
