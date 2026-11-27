const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const crypto = require('crypto');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');
const { findClub } = require('../server/utils/matchClub');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const club = (name, logoUrl = '', type = 'community-service') => ({ id: crypto.randomUUID(), type, name, logoUrl, createdAt: new Date().toISOString() });
const BETTER = club('BetterWorldThailand', '/uploads/club-logos/better.png');
const PAWS = club('Pawservation Club', '/uploads/club-logos/paws.png');
const VOICE = club('Voice of Society', '/uploads/club-logos/voice-a.png');
const VOICE_TOO = club('Voice of Youth', '');
const NOLOGO = club('Younify', '');

async function loginAsAdmin() {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ password: 'test-admin-pw' });
  return agent;
}

// A date a week from now, so it is never in the past.
const NEXT_WEEK = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const post = (admin, clubText, extra = {}) =>
  admin.post('/api/admin/cs-events').send({ title: 'Beach cleanup', club: clubText, eventDay: NEXT_WEEK, description: 'Bring gloves.', signupUrl: '', ...extra });

test.beforeEach(() => {
  db.writeClubs([BETTER, PAWS, VOICE, VOICE_TOO, NOLOGO]);
  db.writeCsEvents([]);
});

test('the matching rule: exact, loose spelling, partial, and refusing to guess', () => {
  const clubs = [BETTER, PAWS, VOICE, VOICE_TOO];
  assert.equal(findClub(clubs, 'BetterWorldThailand'), BETTER);
  assert.equal(findClub(clubs, '  better world THAILAND '), BETTER, 'case, spaces and punctuation do not matter');
  assert.equal(findClub(clubs, 'Pawservation'), PAWS, 'part of one club name');
  assert.equal(findClub(clubs, 'Annual beach cleanup by BetterWorldThailand'), BETTER, 'the club name inside a longer phrase');
  assert.equal(findClub(clubs, 'Voice'), null, 'two clubs fit, so no guess');
  assert.equal(findClub(clubs, 'Chess club'), null, 'nothing fits');
  assert.equal(findClub(clubs, 'ab'), null, 'too short to mean anything');
  assert.equal(findClub(clubs, ''), null);
});

// Events saved before StuCo's own posts existed carry a typed club name; they
// are still matched to that club's current name and logo.
const legacy = (clubText, extra = {}) => ({ id: crypto.randomUUID(), title: 'Old post', club: clubText, eventDate: 'Sep 1', description: 'x', signupUrl: '', createdAt: new Date().toISOString(), ...extra });

test("StuCo's posts from the admin panel show as hosted by the Student Council, with the crest", async () => {
  const admin = await loginAsAdmin();
  // A club name sent by an older form is ignored: posts from here are StuCo's.
  const res = await post(admin, 'Pawservation');
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.event.club, 'Student Council');
  assert.equal(res.body.event.clubLogoUrl, '/assets/kpis-logo.png');
  assert.equal(res.body.event.clubId, null);
  assert.equal(res.body.event.host, 'stuco');

  const email = 'cs.clubs.student@kpis.ac.th';
  const made = await admin.post('/api/admin/students').send({ firstName: 'Cs', lastName: 'Student', email, grade: '10' });
  const student = request.agent(app);
  await student.post('/api/login').send({ email, password: made.body.password });
  await student.post('/api/change-password').send({ currentPassword: made.body.password, newPassword: 'a-brand-new-pw-1' });
  const seen = (await student.get('/api/cs-events')).body.events[0];
  assert.equal(seen.club, 'Student Council');
  assert.equal(seen.clubLogoUrl, '/assets/kpis-logo.png');
});

test('the hosting club is no longer asked for, but a title, a real date and a description still are', async () => {
  const admin = await loginAsAdmin();
  assert.equal((await post(admin, '', { title: '' })).status, 400);
  assert.equal((await post(admin, '', { eventDay: '' })).status, 400);
  assert.equal((await post(admin, '', { eventDay: 'Sat, Dec 13' })).status, 400);
  assert.equal((await post(admin, '', { eventDay: '2020-01-01' })).status, 400, 'a date that has passed');
  assert.equal((await post(admin, '', { description: '' })).status, 400);
  assert.equal((await post(admin, '')).status, 201);
});

test('posts made before this existed are matched by the name they were typed with', async () => {
  db.writeCsEvents([legacy('betterworldthailand')]);
  const admin = await loginAsAdmin();
  const res = await admin.get('/api/admin/cs-events');
  assert.equal(res.body.events[0].club, 'BetterWorldThailand');
  assert.equal(res.body.events[0].clubLogoUrl, '/uploads/club-logos/better.png');
});

test('a renamed club or a new logo shows on its existing posts, and a deleted club stops matching', async () => {
  const admin = await loginAsAdmin();
  db.writeCsEvents([legacy('BetterWorldThailand', { clubId: BETTER.id })]);

  db.writeClubs([{ ...BETTER, name: 'BetterWorld Thailand 2026', logoUrl: '/uploads/club-logos/new.png' }, PAWS]);
  let events = (await admin.get('/api/admin/cs-events')).body.events;
  assert.equal(events[0].club, 'BetterWorld Thailand 2026');
  assert.equal(events[0].clubLogoUrl, '/uploads/club-logos/new.png');

  db.writeClubs([PAWS]);
  events = (await admin.get('/api/admin/cs-events')).body.events;
  assert.equal(events[0].club, 'BetterWorldThailand', 'falls back to the saved name');
  assert.equal(events[0].clubLogoUrl, '');
});

test('saving an old typed-club post from the admin panel makes it a StuCo post', async () => {
  const old = legacy('Pawservation', { clubId: PAWS.id });
  db.writeCsEvents([old]);
  const admin = await loginAsAdmin();
  const res = await admin.put(`/api/admin/cs-events/${old.id}`).send({ title: 'Old post', eventDay: NEXT_WEEK, description: 'x', signupUrl: '' });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.event.club, 'Student Council');
});

test("admins cannot edit a club leader's event, but can remove it", async () => {
  const leaderEvent = { ...legacy('Pawservation Club', { clubId: PAWS.id }), postedBy: 'leader', eventDay: '2099-01-01' };
  db.writeCsEvents([leaderEvent]);
  const admin = await loginAsAdmin();
  const edit = await admin.put(`/api/admin/cs-events/${leaderEvent.id}`).send({ title: 'Taken over', eventDay: NEXT_WEEK, description: 'x', signupUrl: '' });
  assert.equal(edit.status, 409);
  assert.equal(db.readCsEvents()[0].club, 'Pawservation Club');
  assert.equal((await admin.delete(`/api/admin/cs-events/${leaderEvent.id}`)).status, 200);
});

test('admins can attach up to four pictures to an event', async () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const admin = await loginAsAdmin();
  const event = (await post(admin, '')).body.event;
  const url = `/api/admin/cs-events/${event.id}/images`;
  assert.equal((await request(app).post(url).attach('image', PNG, 'p.png')).status, 401);
  assert.equal((await admin.post(url).attach('image', Buffer.from('not a picture'), 'p.png')).status, 400);
  let last;
  for (let i = 0; i < 4; i++) last = await admin.post(url).attach('image', PNG, `p${i}.png`);
  assert.equal(last.status, 201, last.text);
  assert.equal(last.body.event.images.length, 4);
  assert.equal((await admin.post(url).attach('image', PNG, 'p5.png')).status, 400);
  const removed = await admin.delete(url).send({ url: last.body.event.images[0].url });
  assert.equal(removed.body.event.images.length, 3);
});

test("StuCo's events take a time, place and spots like club leaders' events", async () => {
  const admin = await loginAsAdmin();
  const res = await post(admin, '', { eventTime: '9:00 AM', location: 'Gym', spots: 30, registrationOpen: false });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.event.eventDay, NEXT_WEEK);
  assert.equal(res.body.event.eventTime, '9:00 AM');
  assert.equal(res.body.event.location, 'Gym');
  assert.equal(res.body.event.spots, 30);
  assert.equal(res.body.event.closedReason, 'Registration is closed.');
});

test("community service events with a date show on the students' calendar, not in the admin calendar list", async () => {
  const admin = await loginAsAdmin();
  const event = (await post(admin, '', { title: 'Calendar test run', eventTime: '7:00 AM', location: 'Track' })).body.event;
  db.writeCsEvents([...db.readCsEvents(), legacy('Pawservation', { title: 'Typed-date post' })]);

  const email = 'cs.calendar.student@kpis.ac.th';
  const made = await admin.post('/api/admin/students').send({ firstName: 'Cal', lastName: 'Student', email, grade: '10' });
  const student = request.agent(app);
  await student.post('/api/login').send({ email, password: made.body.password });
  await student.post('/api/change-password').send({ currentPassword: made.body.password, newPassword: 'a-brand-new-pw-1' });

  const cal = (await student.get('/api/calendar-events')).body;
  const item = cal.calendarEvents.find((e) => e.id === `cs-${event.id}`);
  assert.ok(item, 'the dated event is on the calendar');
  assert.equal(item.category, 'csevent');
  assert.equal(item.startDate, NEXT_WEEK);
  assert.equal(item.subtitle, 'Student Council · 7:00 AM · Track');
  assert.equal(item.link, '/community-service#events');
  assert.equal(item.logoUrl, '/assets/kpis-logo.png');
  assert.equal(item.day, String(Number(NEXT_WEEK.slice(8))));
  assert.ok(cal.categories.some((c) => c.id === 'csevent' && c.label === 'Community Service'));
  assert.ok(!cal.calendarEvents.some((e) => e.title === 'Typed-date post'), 'an event with only a typed date has no day to go on');
  assert.ok((await student.get('/api/calendar-events?upcoming=1')).body.calendarEvents.some((e) => e.id === `cs-${event.id}`));

  const adminList = (await admin.get('/api/admin/calendar-events')).body.calendarEvents;
  assert.ok(!adminList.some((e) => String(e.id).startsWith('cs-')));

  // Removing the event takes it off the calendar.
  await admin.delete(`/api/admin/cs-events/${event.id}`);
  assert.ok(!(await student.get('/api/calendar-events')).body.calendarEvents.some((e) => e.id === `cs-${event.id}`));
});
