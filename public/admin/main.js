import { initAuth } from './auth.js';
import { initNav } from './nav.js';
import { loadStudents } from './students.js';
import { loadVoicePending } from './voice.js';
import { loadCurrentSlide, loadSlideArchive } from './slides.js';
import { loadClubs } from './clubs.js';
import { loadCsEvents } from './csEvents.js';
import { loadCsResources } from './csResources.js';
import { loadCalendarEvents } from './calendarEvents.js';
import { loadCouncil } from './council.js';
import { loadQuickLinks } from './quickLinks.js';
import { loadLunchCurrent } from './lunch.js';
import { loadCalendarImage } from './calendarImage.js';
import { loadSecurity } from './security.js';

initNav();

initAuth((session) => {
  [
    loadStudents,
    loadVoicePending,
    loadCurrentSlide,
    loadSlideArchive,
    loadClubs,
    loadCsEvents,
    loadCsResources,
    loadCalendarEvents,
    loadCouncil,
    loadQuickLinks,
    loadLunchCurrent,
    loadCalendarImage,
  ].forEach((load) => load());

  // The Security tab (locked accounts, admin management, audit log) is
  // owner-only — an editor admin has full access to student/content data,
  // but not to who else has admin access or the security log of that.
  const isOwner = session.role === 'owner';
  document.getElementById('nav-security').hidden = !isOwner;
  if (isOwner) loadSecurity(session);
});
