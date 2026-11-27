const db = require('../db');
const { findClub } = require('./matchClub');

// Who hosts a community service event, as students see it. Events StuCo posts
// from the admin panel are its own (the Student Council, with the school
// crest); club leaders' events, and older posts typed with a club's name, show
// that club's current name and logo.
const STUCO_HOST = { name: 'Student Council', logoUrl: '/assets/kpis-logo.png' };

function hostOf(event, clubs = db.readClubs()) {
  if (event.host === 'stuco') return { isStuco: true, club: null, name: STUCO_HOST.name, logoUrl: STUCO_HOST.logoUrl };
  const club = findClub(clubs, event.club, event.clubId);
  return { isStuco: false, club, name: club ? club.name : event.club, logoUrl: club ? club.logoUrl || '' : '' };
}

// Community service events with a real date, in the shape the Upcoming Events
// calendar draws, under their own Community Service colour. Each one links to
// the Events tab, where students read more and register.
const SERVICE_CATEGORY = { id: 'csevent', label: 'Community Service' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function serviceEventsForCalendar() {
  const clubs = db.readClubs();
  return db
    .readCsEvents()
    .filter((e) => e.eventDay)
    .map((e) => {
      const host = hostOf(e, clubs);
      const [year, month, day] = e.eventDay.split('-').map(Number);
      return {
        id: `cs-${e.id}`,
        // day/month/year as the calendar's own events have them (the home page's
        // Coming up list shows these).
        day: String(day),
        month: MONTHS[month - 1],
        year,
        startDate: e.eventDay,
        endDate: e.eventDay,
        category: SERVICE_CATEGORY.id,
        title: e.title,
        subtitle: [host.name, e.eventTime, e.location].filter(Boolean).join(' · '),
        logoUrl: host.logoUrl,
        link: '/community-service#events',
      };
    });
}

module.exports = { STUCO_HOST, hostOf, SERVICE_CATEGORY, serviceEventsForCalendar };
