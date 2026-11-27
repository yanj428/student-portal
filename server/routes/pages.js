const express = require('express');
const db = require('../db');
const { requireStudentPage } = require('../middleware/pageAuth');
const { WIDGETS, JUMP_TILES, resolveLayout } = require('../utils/homeLayout');
const { NAV_ITEMS } = require('../utils/navItems');
const { logsServiceHours } = require('../utils/csHours');

const router = express.Router();

const PAGES = [
  { paths: ['/'], view: 'pages/home' },
  { paths: ['/announcements'], view: 'pages/announcements' },
  { paths: ['/upcoming-events'], view: 'pages/upcoming-events' },
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
    let extra = {};
    if (view === 'pages/home') extra = { homeWidgets: WIDGETS, jumpTiles: JUMP_TILES, navItems: NAV_ITEMS, homeLayout: resolveLayout(db.getHomeLayout(res.locals.student.id)), logsHours: logsServiceHours(res.locals.student.grade) };
    if (view === 'pages/community-service') extra = { logsHours: logsServiceHours(res.locals.student.grade) };
    res.render(view, { student: res.locals.student, ...extra });
  });
}

// The community service project report form (new, or ?id= to fix one).
router.get('/service-report', requireStudentPage, (req, res) => {
  if (!logsServiceHours(res.locals.student.grade)) return res.redirect('/community-service');
  res.render('pages/service-report', { student: res.locals.student });
});

// Club leaders post and manage their club's community service events here.
router.get('/club-events', requireStudentPage, (req, res) => {
  if (!res.locals.ledClubs.length) return res.redirect('/community-service');
  res.render('pages/club-events', { student: res.locals.student, ledClubs: res.locals.ledClubs });
});

// Only the community service coordinator has this page; anyone else who
// follows a link to it lands on the ordinary Community Service page.
router.get('/service-hours', requireStudentPage, (req, res) => {
  if (!res.locals.student.csCoordinator) return res.redirect('/community-service');
  res.render('pages/service-hours', { student: res.locals.student });
});

module.exports = router;
