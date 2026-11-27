const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');
const { schoolToday } = require('../server/utils/csHours');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

let adminAgent;
async function admin() {
  if (!adminAgent) {
    adminAgent = request.agent(app);
    await adminAgent.post('/api/admin/login').send({ password: 'test-admin-pw' });
  }
  return adminAgent;
}

async function signedIn(email, grade, firstName = 'Pat') {
  const created = await (await admin()).post('/api/admin/students').send({ firstName, lastName: 'Tester', email, grade });
  assert.equal(created.status, 201, created.text);
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email, password: created.body.password });
  await agent.post('/api/change-password').send({ currentPassword: created.body.password, newPassword: 'activepassword1' });
  return { agent, id: created.body.student.id, email };
}

const daysFromToday = (n) => new Date(Date.parse(`${schoolToday()}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

db.writeClubs([
  { id: 'club-green', type: 'community-service', name: 'Green Club', createdAt: new Date().toISOString() },
  { id: 'club-paws', type: 'community-service', name: 'Paws Club', createdAt: new Date().toISOString() },
]);

const eventBody = (fields = {}) => ({
  clubId: 'club-green', title: 'Beach clean-up', eventDay: daysFromToday(7), eventTime: '8:00 AM', location: 'School gate',
  spots: 2, description: 'Pick up rubbish on the beach.', signupUrl: '', registrationOpen: true, ...fields,
});

test('an admin makes a club leader, who gets the My Club Events page', async () => {
  const leader = await signedIn('lead.one@kpis.ac.th', 'Grade 11', 'Lena');
  const other = await signedIn('not.lead@kpis.ac.th', 'Grade 11');

  assert.equal((await (await admin()).post('/api/admin/club-leaders').send({ email: 'nobody@kpis.ac.th', clubId: 'club-green' })).status, 404);
  assert.equal((await (await admin()).post('/api/admin/club-leaders').send({ email: leader.email, clubId: 'nope' })).status, 400);
  assert.equal((await (await admin()).post('/api/admin/club-leaders').send({ email: leader.email, clubId: 'club-green' })).status, 201);
  const list = (await (await admin()).get('/api/admin/club-leaders')).body.leaders;
  assert.deepEqual(list.map((l) => [l.email, l.club]), [[leader.email, 'Green Club']]);

  const page = await leader.agent.get('/club-events');
  assert.equal(page.status, 200);
  assert.match((await leader.agent.get('/')).text, /href="\/club-events"/);
  assert.equal((await other.agent.get('/club-events')).headers.location, '/community-service');
  assert.equal((await other.agent.get('/api/club-events')).status, 403);
  assert.equal((await request(app).post('/api/admin/club-leaders').send({ email: leader.email, clubId: 'club-green' })).status, 401);
});

test('a leader posts events only for their own club, with a real future date', async () => {
  const leader = await signedIn('lead.two@kpis.ac.th', 'Grade 12');
  await (await admin()).post('/api/admin/club-leaders').send({ email: leader.email, clubId: 'club-green' });

  for (const [label, bad] of [
    ['another club', eventBody({ clubId: 'club-paws' })],
    ['no title', eventBody({ title: ' ' })],
    ['no date', eventBody({ eventDay: '' })],
    ['in the past', eventBody({ eventDay: daysFromToday(-1) })],
    ['zero spots', eventBody({ spots: 0 })],
    ['spots as text', eventBody({ spots: '5' })],
    ['not a link', eventBody({ signupUrl: 'javascript:alert(1)' })],
  ]) {
    assert.equal((await leader.agent.post('/api/club-events').send(bad)).status, 400, label);
  }

  const created = await leader.agent.post('/api/club-events').send(eventBody());
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.event.club, 'Green Club');
  assert.equal(created.body.event.spots, 2);

  const edited = await leader.agent.put(`/api/club-events/${created.body.event.id}`).send(eventBody({ title: 'Beach clean-up (bring gloves)' }));
  assert.equal(edited.body.event.title, 'Beach clean-up (bring gloves)');

  // Another club's event is out of reach.
  const pawsEvent = { id: 'paws-1', title: 'Shelter day', club: 'Paws Club', clubId: 'club-paws', eventDate: 'Dec 1', description: 'Walk dogs', createdAt: new Date().toISOString() };
  db.writeCsEvents([...db.readCsEvents(), pawsEvent]);
  assert.equal((await leader.agent.put('/api/club-events/paws-1').send(eventBody())).status, 404);
  assert.equal((await leader.agent.delete('/api/club-events/paws-1')).status, 404);
});

test('students register, the event fills up, and only the right people see the list', async () => {
  const leader = await signedIn('lead.three@kpis.ac.th', 'Grade 12');
  await (await admin()).post('/api/admin/club-leaders').send({ email: leader.email, clubId: 'club-green' });
  const event = (await leader.agent.post('/api/club-events').send(eventBody({ title: 'Mangrove planting' }))).body.event;

  const a = await signedIn('reg.a@kpis.ac.th', 'Grade 9', 'Ann');
  const b = await signedIn('reg.b@kpis.ac.th', 'Grade 10', 'Ben');
  const c = await signedIn('reg.c@kpis.ac.th', 'Grade 11', 'Cat');
  const teacher = await signedIn('reg.teacher@kpis.ac.th', 'Teacher');

  const url = `/api/cs-events/${event.id}/register`;
  assert.equal((await a.agent.post(url)).status, 201);
  assert.equal((await a.agent.post(url)).status, 200); // registering twice is harmless
  assert.equal((await b.agent.post(url)).status, 201);
  const full = await c.agent.post(url);
  assert.equal(full.status, 409);
  assert.match(full.body.error, /full/);
  assert.equal((await teacher.agent.post(url)).status, 403);

  const seenByA = (await a.agent.get('/api/cs-events')).body.events.find((e) => e.id === event.id);
  assert.equal(seenByA.isRegistered, true);
  assert.equal(seenByA.spotsLeft, 0);
  assert.equal(seenByA.canSeeRegistrations, false);

  // Cancelling frees the spot.
  await b.agent.delete(url);
  assert.equal((await c.agent.post(url)).status, 201);

  const list = `/api/cs-events/${event.id}/registrations`;
  assert.equal((await a.agent.get(list)).status, 404);
  const forLeader = await leader.agent.get(list);
  assert.deepEqual(forLeader.body.registrations.map((r) => r.name), ['Ann Tester', 'Cat Tester']);
  const leaderPage = (await leader.agent.get('/api/club-events')).body.events.find((e) => e.id === event.id);
  assert.equal(leaderPage.registrations.length, 2);
  assert.equal((await (await admin()).get(`/api/admin/cs-events/${event.id}/registrations`)).body.registrations.length, 2);

  // The coordinator sees every event's list too.
  const coord = await signedIn('reg.coord@kpis.ac.th', 'Teacher');
  await (await admin()).post(`/api/admin/students/${coord.id}/cs-coordinator`).send({ on: true });
  assert.equal((await coord.agent.get(list)).body.registrations.length, 2);

  // Closing registration stops new sign-ups.
  await leader.agent.put(`/api/club-events/${event.id}`).send(eventBody({ title: 'Mangrove planting', registrationOpen: false, spots: null }));
  assert.equal((await b.agent.post(url)).status, 409);

  // Removing the event removes its registrations; deleting an account removes its own.
  await (await admin()).delete(`/api/admin/students/${a.id}`);
  assert.ok(!db.readCsEventRegistrations().some((r) => r.studentId === a.id));
  await leader.agent.delete(`/api/club-events/${event.id}`);
  assert.ok(!db.readCsEventRegistrations().some((r) => r.eventId === event.id));
});

test('events whose date has passed drop off the students\' list', async () => {
  const student = await signedIn('reg.past@kpis.ac.th', 'Grade 10');
  db.writeCsEvents([
    ...db.readCsEvents(),
    { id: 'old-1', title: 'Old event', club: 'Green Club', clubId: 'club-green', eventDay: daysFromToday(-3), eventDate: 'Past', description: 'Done', createdAt: new Date().toISOString() },
    { id: 'typed-1', title: 'Typed date event', club: 'Green Club', clubId: 'club-green', eventDate: 'Every Friday', description: 'Ongoing', createdAt: new Date().toISOString() },
  ]);
  const ids = (await student.agent.get('/api/cs-events')).body.events.map((e) => e.id);
  assert.ok(!ids.includes('old-1'));
  assert.ok(ids.includes('typed-1'));
  assert.equal((await student.agent.post('/api/cs-events/old-1/register')).status, 409);
});

test('a leader attaches up to four pictures to an event, and they go when the event does', async () => {
  const path = require('path');
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const leader = await signedIn('lead.pics@kpis.ac.th', 'Grade 12');
  const outsider = await signedIn('lead.otherclub@kpis.ac.th', 'Grade 12');
  await (await admin()).post('/api/admin/club-leaders').send({ email: leader.email, clubId: 'club-green' });
  await (await admin()).post('/api/admin/club-leaders').send({ email: outsider.email, clubId: 'club-paws' });
  const event = (await leader.agent.post('/api/club-events').send(eventBody({ title: 'Poster test' }))).body.event;
  const url = `/api/club-events/${event.id}/images`;

  assert.equal((await leader.agent.post(url).attach('image', Buffer.from('<html>no</html>'), 'fake.png')).status, 400);
  assert.equal((await outsider.agent.post(url).attach('image', PNG, 'poster.png')).status, 404);

  let last;
  for (let i = 0; i < 4; i++) last = await leader.agent.post(url).attach('image', PNG, `poster${i}.png`);
  assert.equal(last.status, 201, last.text);
  assert.equal(last.body.event.images.length, 4);
  assert.equal((await leader.agent.post(url).attach('image', PNG, 'one-too-many.png')).status, 400);

  // Students see the pictures on the event.
  const student = await signedIn('pics.viewer@kpis.ac.th', 'Grade 10');
  const seen = (await student.agent.get('/api/cs-events')).body.events.find((e) => e.id === event.id);
  assert.equal(seen.images.length, 4);
  const firstFile = path.join(dataDir, 'uploads', 'event-images', path.basename(seen.images[0].url));
  assert.ok(fs.existsSync(firstFile));

  const removed = await leader.agent.delete(url).send({ url: seen.images[0].url });
  assert.equal(removed.body.event.images.length, 3);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(!fs.existsSync(firstFile));

  const remaining = removed.body.event.images.map((img) => path.join(dataDir, 'uploads', 'event-images', path.basename(img.url)));
  await leader.agent.delete(`/api/club-events/${event.id}`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(remaining.every((f) => !fs.existsSync(f)));
});
