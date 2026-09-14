const express = require('express');
const { requireStudentPage } = require('../middleware/pageAuth');

const router = express.Router();

const PAGES = [
  { paths: ['/', '/index.html'], view: 'pages/home' },
  { paths: ['/announcements.html'], view: 'pages/announcements' },
  { paths: ['/community-service.html'], view: 'pages/community-service' },
  { paths: ['/lunch-schedule.html'], view: 'pages/lunch-schedule' },
  { paths: ['/student-voice.html'], view: 'pages/student-voice' },
  { paths: ['/school-calendar.html'], view: 'pages/school-calendar' },
  { paths: ['/clubs.html'], view: 'pages/clubs' },
  { paths: ['/stuco-tracker.html'], view: 'pages/stuco-tracker' },
  { paths: ['/quick-links.html'], view: 'pages/quick-links' },
  { paths: ['/meet-council.html'], view: 'pages/meet-council' },
];

for (const { paths, view } of PAGES) {
  router.get(paths, requireStudentPage, (req, res) => {
    res.render(view, { student: res.locals.student });
  });
}

module.exports = router;
