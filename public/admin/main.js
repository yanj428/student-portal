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

initNav();

initAuth(() => {
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
  loadSecurity();
});
