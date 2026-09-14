import { initAuth } from './auth.js';
import { initNav } from './nav.js';
import { loadStudents } from './students.js';
import { loadVoicePending } from './voice.js';
import { loadCurrentSlide, loadSlideArchive } from './slides.js';
import { loadCsClubs } from './csClubs.js';
import { loadCsEvents } from './csEvents.js';
import { loadLunchCurrent } from './lunch.js';

initNav();

initAuth(() => {
  loadStudents();
  loadVoicePending();
  loadCurrentSlide();
  loadSlideArchive();
  loadCsClubs();
  loadCsEvents();
  loadLunchCurrent();
});
