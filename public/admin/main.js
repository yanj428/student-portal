import { initAuth } from './auth.js';
import { initNav } from './nav.js';
import { loadStudents } from './students.js';
import { loadVoicePending } from './voice.js';
import { loadCurrentSlide, loadSlideArchive } from './slides.js';
import { loadClubs } from './clubs.js';
import { loadCsEvents } from './csEvents.js';
import { loadAnnouncements } from './announcements.js';
import { loadCalendarEvents } from './calendarEvents.js';
import { loadCouncil } from './council.js';
import { loadProjects } from './projects.js';
import { loadQuickLinks } from './quickLinks.js';
import { loadLunchCurrent } from './lunch.js';
import { loadSecurity } from './security.js';
import { getJSON } from './api.js';

initNav();

initAuth(async () => {
  loadStudents();
  loadVoicePending();
  loadCurrentSlide();
  loadSlideArchive();
  loadClubs();
  loadCsEvents();
  loadAnnouncements();
  loadCalendarEvents();
  loadCouncil();
  loadProjects();
  loadQuickLinks();
  loadLunchCurrent();

  // The Security tab (locked accounts, admin management, audit log) is
  // owner-only — an editor admin has full access to student/content data,
  // but not to who else has admin access or the security log of that.
  const session = await getJSON('/api/admin/session');
  const isOwner = session && session.role === 'owner';
  const securityNavItem = document.getElementById('nav-security');
  if (securityNavItem) securityNavItem.hidden = !isOwner;
  if (isOwner) loadSecurity();
});
