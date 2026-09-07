const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const VOICE_FILE = path.join(DATA_DIR, 'voice-posts.json');
const SLIDE_ARCHIVE_FILE = path.join(DATA_DIR, 'slide-archive.json');
const CS_CLUBS_FILE = path.join(DATA_DIR, 'cs-clubs.json');
const CS_EVENTS_FILE = path.join(DATA_DIR, 'cs-events.json');

// Text shown on the homepage. Admins edit these values; the page layout itself is fixed.
const DEFAULT_CONTENT = {
  announcements: [
    { title: 'Prelim payment due', body: "Please clear your prelim payment before the end of this week to avoid late fees." },
    { title: 'Exam schedule posted', body: 'The final exam schedule has been posted. Check your dashboard for your exact dates and rooms.' },
    { title: 'Community Service sign-ups open', body: "Sign up for this term's community service projects before spots fill up." },
  ],
  calendarEvents: [
    { day: '12', month: 'Sep', title: 'Midterm Exams Begin', subtitle: 'All grades · Main building' },
    { day: '18', month: 'Sep', title: 'StuCo General Assembly', subtitle: 'Grades 9–12 · Auditorium' },
    { day: '25', month: 'Sep', title: 'Community Service Day', subtitle: 'All grades · Off-campus' },
  ],
  lunchMenu: [
    { weekday: 'Mon', item: 'Green curry & rice' },
    { weekday: 'Tue', item: 'Pad kra pao chicken' },
    { weekday: 'Wed', item: 'Spaghetti bolognese' },
    { weekday: 'Thu', item: 'Tom yum noodle soup' },
    { weekday: 'Fri', item: 'Fried rice & salad bar' },
  ],
  clubs: ['Robotics', 'Debate', 'Art & Design', 'Basketball'],
  projects: [
    { title: 'Spirit Week Planning', percent: 70 },
    { title: 'Recycling Drive', percent: 35 },
  ],
  quickLinks: [
    { label: 'Student Email', url: '#' },
    { label: 'Library Catalog', url: '#' },
    { label: 'Student Handbook', url: '#' },
    { label: 'Print Center', url: '#' },
  ],
  council: [
    { initials: 'EM' },
    { initials: 'RK' },
    { initials: 'TS' },
  ],
  weeklySlide: {
    weekLabel: '',
    canvaEmbedUrl: '',
  },
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STUDENTS_FILE)) fs.writeFileSync(STUDENTS_FILE, '[]\n');
  if (!fs.existsSync(CONTENT_FILE)) fs.writeFileSync(CONTENT_FILE, JSON.stringify(DEFAULT_CONTENT, null, 2) + '\n');
  if (!fs.existsSync(VOICE_FILE)) fs.writeFileSync(VOICE_FILE, '[]\n');
  if (!fs.existsSync(SLIDE_ARCHIVE_FILE)) fs.writeFileSync(SLIDE_ARCHIVE_FILE, '[]\n');
  if (!fs.existsSync(CS_CLUBS_FILE)) fs.writeFileSync(CS_CLUBS_FILE, '[]\n');
  if (!fs.existsSync(CS_EVENTS_FILE)) fs.writeFileSync(CS_EVENTS_FILE, '[]\n');
}

function readStudents() {
  ensureStore();
  const raw = fs.readFileSync(STUDENTS_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeStudents(students) {
  ensureStore();
  fs.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2) + '\n');
}

function findByEmail(email) {
  const normalized = email.trim().toLowerCase();
  return readStudents().find((s) => s.email.toLowerCase() === normalized) || null;
}

function findById(id) {
  return readStudents().find((s) => s.id === id) || null;
}

function addStudent(student) {
  const students = readStudents();
  students.push(student);
  writeStudents(students);
  return student;
}

function removeStudent(id) {
  const students = readStudents();
  const next = students.filter((s) => s.id !== id);
  writeStudents(next);
  return next.length !== students.length;
}

function readContent() {
  ensureStore();
  const raw = fs.readFileSync(CONTENT_FILE, 'utf8');
  let content;
  try {
    content = JSON.parse(raw);
  } catch {
    return DEFAULT_CONTENT;
  }

  // Backfill keys added to DEFAULT_CONTENT after this file was first written.
  for (const key of Object.keys(DEFAULT_CONTENT)) {
    if (!(key in content)) content[key] = DEFAULT_CONTENT[key];
  }
  return content;
}

function writeContent(content) {
  ensureStore();
  fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2) + '\n');
}

function readVoicePosts() {
  ensureStore();
  const raw = fs.readFileSync(VOICE_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeVoicePosts(posts) {
  ensureStore();
  fs.writeFileSync(VOICE_FILE, JSON.stringify(posts, null, 2) + '\n');
}

function readSlideArchive() {
  ensureStore();
  const raw = fs.readFileSync(SLIDE_ARCHIVE_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeSlideArchive(slides) {
  ensureStore();
  fs.writeFileSync(SLIDE_ARCHIVE_FILE, JSON.stringify(slides, null, 2) + '\n');
}

function readCsClubs() {
  ensureStore();
  const raw = fs.readFileSync(CS_CLUBS_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeCsClubs(clubs) {
  ensureStore();
  fs.writeFileSync(CS_CLUBS_FILE, JSON.stringify(clubs, null, 2) + '\n');
}

function readCsEvents() {
  ensureStore();
  const raw = fs.readFileSync(CS_EVENTS_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeCsEvents(events) {
  ensureStore();
  fs.writeFileSync(CS_EVENTS_FILE, JSON.stringify(events, null, 2) + '\n');
}

module.exports = {
  readStudents,
  writeStudents,
  findByEmail,
  findById,
  addStudent,
  removeStudent,
  readContent,
  writeContent,
  readVoicePosts,
  writeVoicePosts,
  readSlideArchive,
  writeSlideArchive,
  readCsClubs,
  writeCsClubs,
  readCsEvents,
  writeCsEvents,
  DEFAULT_CONTENT,
};
