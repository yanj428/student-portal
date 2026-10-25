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

const post = (admin, clubText, extra = {}) =>
  admin.post('/api/admin/cs-events').send({ title: 'Beach cleanup', club: clubText, eventDate: 'Nov 8', description: 'Bring gloves.', signupUrl: '', ...extra });

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

test('a post saved with a loosely typed club gets the exact name and the logo', async () => {
  const admin = await loginAsAdmin();
  const res = await post(admin, 'better world thailand');
  assert.equal(res.status, 201);
  assert.equal(res.body.event.club, 'BetterWorldThailand');
  assert.equal(res.body.event.clubLogoUrl, '/uploads/club-logos/better.png');
  assert.equal(res.body.event.clubId, BETTER.id);
  assert.equal(db.readCsEvents()[0].club, 'BetterWorldThailand', 'the exact name is what is stored');
});

test('students see the logo on the post', async () => {
  const admin = await loginAsAdmin();
  await post(admin, 'Pawservation');
  const email = 'cs.clubs.student@kpis.ac.th';
  const made = await admin.post('/api/admin/students').send({ firstName: 'Cs', lastName: 'Student', email, grade: '10' });
  const student = request.agent(app);
  await student.post('/api/login').send({ email, password: made.body.password });
  await student.post('/api/change-password').send({ currentPassword: made.body.password, newPassword: 'a-brand-new-pw-1' });

  const res = await student.get('/api/cs-events');
  assert.equal(res.body.events[0].club, 'Pawservation Club');
  assert.equal(res.body.events[0].clubLogoUrl, '/uploads/club-logos/paws.png');
});

test('a club that is not in the clubs list is kept as typed, with no logo', async () => {
  const admin = await loginAsAdmin();
  const res = await post(admin, 'Beach Cleanup Crew');
  assert.equal(res.status, 201);
  assert.equal(res.body.event.club, 'Beach Cleanup Crew');
  assert.equal(res.body.event.clubLogoUrl, '');
  assert.equal(res.body.event.clubId, null);
});

test('a name that could be two clubs is not guessed', async () => {
  const admin = await loginAsAdmin();
  const res = await post(admin, 'Voice');
  assert.equal(res.body.event.club, 'Voice');
  assert.equal(res.body.event.clubLogoUrl, '');
});

test('a matched club without a logo shows no logo, not a broken one', async () => {
  const admin = await loginAsAdmin();
  const res = await post(admin, 'younify');
  assert.equal(res.body.event.club, 'Younify');
  assert.equal(res.body.event.clubLogoUrl, '');
});

test('posts made before this existed are matched by the name they were typed with', async () => {
  db.writeCsEvents([{ id: crypto.randomUUID(), title: 'Old post', club: 'betterworldthailand', eventDate: 'Sep 1', description: 'x', signupUrl: '', createdAt: new Date().toISOString() }]);
  const admin = await loginAsAdmin();
  const res = await admin.get('/api/admin/cs-events');
  assert.equal(res.body.events[0].club, 'BetterWorldThailand');
  assert.equal(res.body.events[0].clubLogoUrl, '/uploads/club-logos/better.png');
});

test('a renamed club or a new logo shows on its existing posts, and a deleted club stops matching', async () => {
  const admin = await loginAsAdmin();
  await post(admin, 'BetterWorldThailand');

  db.writeClubs([{ ...BETTER, name: 'BetterWorld Thailand 2026', logoUrl: '/uploads/club-logos/new.png' }, PAWS]);
  let events = (await admin.get('/api/admin/cs-events')).body.events;
  assert.equal(events[0].club, 'BetterWorld Thailand 2026');
  assert.equal(events[0].clubLogoUrl, '/uploads/club-logos/new.png');

  db.writeClubs([PAWS]);
  events = (await admin.get('/api/admin/cs-events')).body.events;
  assert.equal(events[0].club, 'BetterWorldThailand', 'falls back to the saved name');
  assert.equal(events[0].clubLogoUrl, '');
});

test('editing a post to a different club moves the logo', async () => {
  const admin = await loginAsAdmin();
  const created = await post(admin, 'BetterWorldThailand');
  const res = await admin
    .put(`/api/admin/cs-events/${created.body.event.id}`)
    .send({ title: 'Beach cleanup', club: 'paws', eventDate: 'Nov 8', description: 'Bring gloves.', signupUrl: '' });
  assert.equal(res.status, 200);
  assert.equal(res.body.event.club, 'Pawservation Club');
  assert.equal(res.body.event.clubLogoUrl, '/uploads/club-logos/paws.png');
});

test('the admin form can ask which club a name means, and only admins can ask', async () => {
  const admin = await loginAsAdmin();
  const found = await admin.get('/api/admin/cs-events/club-match').query({ name: 'paws' });
  assert.equal(found.status, 200);
  assert.deepEqual(found.body.club, { id: PAWS.id, name: 'Pawservation Club', logoUrl: '/uploads/club-logos/paws.png' });
  assert.equal((await admin.get('/api/admin/cs-events/club-match').query({ name: 'zzz nothing' })).body.club, null);
  assert.equal((await request(app).get('/api/admin/cs-events/club-match').query({ name: 'paws' })).status, 401);
});
