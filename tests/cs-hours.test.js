const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const path = require('path');
const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');
const { schoolToday, schoolYearStart } = require('../server/utils/csHours');

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

// An account that has already chosen its own password, signed in.
async function signedIn(email, grade, firstName = 'Pat') {
  const created = await (await admin()).post('/api/admin/students').send({ firstName, lastName: 'Tester', email, grade });
  assert.equal(created.status, 201, created.text);
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email, password: created.body.password });
  await agent.post('/api/change-password').send({ currentPassword: created.body.password, newPassword: 'activepassword1' });
  return { agent, id: created.body.student.id };
}

async function coordinator(email) {
  const teacher = await signedIn(email, 'Teacher', 'Cora');
  const res = await (await admin()).post(`/api/admin/students/${teacher.id}/cs-coordinator`).send({ on: true });
  assert.equal(res.status, 200, res.text);
  return teacher;
}

// A complete Project Report. `date`, `hours` and `activity` are shorthands for
// the start date, a single task's hours and the title.
const entry = ({ date = schoolToday(), hours = 2, activity = 'Beach clean-up', ...fields } = {}) => ({
  title: activity,
  serviceGrade: 9,
  startDate: date,
  endDate: '',
  clubId: '',
  organization: 'Green Earth Thailand',
  sdgs: [14],
  need: 'Plastic on the beach harms sea life.',
  goal: 'Clear one kilometre of beach.',
  planned: false,
  actionSummary: 'We picked up rubbish and sorted it for recycling.',
  links: ['https://example.com/our-video'],
  evidence: [],
  reflection: 'I learned how much rubbish washes up every week.',
  tasks: [{ task: 'Cleaning the beach', hours }],
  advisorName: 'Ms. Gia',
  advisorContact: '',
  ...fields,
});

// The 8 bytes every PNG starts with, which is what the upload check looks at.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

test('a student logs hours, which wait for approval and are private to them', async () => {
  const { agent } = await signedIn('hrs.one@kpis.ac.th', 'Grade 10');
  const other = await signedIn('hrs.two@kpis.ac.th', 'Grade 10');

  const created = await agent.post('/api/cs-hours').send(entry({ hours: 1.5 }));
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.entry.status, 'pending');

  const mine = await agent.get('/api/cs-hours');
  assert.equal(mine.body.entries.length, 1);
  assert.deepEqual(mine.body.totals, { approved: 0, approvedThisYear: 0, pending: 1.5 });

  const theirs = await other.agent.get('/api/cs-hours');
  assert.equal(theirs.body.entries.length, 0);
  const steal = await other.agent.delete(`/api/cs-hours/${created.body.entry.id}`);
  assert.equal(steal.status, 404);
});

test('bad entries are refused', async () => {
  const { agent } = await signedIn('hrs.bad@kpis.ac.th', 'Grade 11');
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  for (const bad of [
    entry({ date: tomorrow }),
    entry({ date: '2026-02-30' }),
    entry({ date: 'yesterday' }),
    entry({ hours: 0 }),
    entry({ hours: 301 }),
    entry({ hours: 1.1 }),
    entry({ hours: '2' }),
    entry({ activity: '   ' }),
    entry({ activity: 'x'.repeat(121) }),
  ]) {
    const res = await agent.post('/api/cs-hours').send(bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
});

test('only Grades 9 to 12 log hours', async () => {
  for (const [email, grade] of [['hrs.staff@kpis.ac.th', 'Staff'], ['hrs.teach@kpis.ac.th', 'Teacher'], ['hrs.g8@kpis.ac.th', 'Grade 8'], ['hrs.g6@kpis.ac.th', '6']]) {
    const { agent } = await signedIn(email, grade);
    assert.equal((await agent.post('/api/cs-hours').send(entry())).status, 403, grade);
    assert.equal((await agent.get('/api/cs-hours')).status, 403, grade);
    const page = await agent.get('/community-service');
    assert.equal(page.status, 200);
    assert.doesNotMatch(page.text, /id="hrs-card"/, grade);
  }
  const { agent } = await signedIn('hrs.g9@kpis.ac.th', '9');
  assert.equal((await agent.post('/api/cs-hours').send(entry())).status, 201);
  assert.match((await agent.get('/community-service')).text, /id="hrs-card"/);
});

test('only the coordinator can review, and only a teacher or staff account can be made one', async () => {
  const student = await signedIn('hrs.nosy@kpis.ac.th', 'Grade 12');
  assert.equal((await student.agent.get('/api/cs-hours/review')).status, 403);
  assert.equal((await student.agent.get('/api/cs-hours/export.csv')).status, 403);

  const refused = await (await admin()).post(`/api/admin/students/${student.id}/cs-coordinator`).send({ on: true });
  assert.equal(refused.status, 400);

  const teacher = await signedIn('hrs.plainteacher@kpis.ac.th', 'Teacher');
  assert.equal((await teacher.agent.get('/api/cs-hours/review')).status, 403);
  const page = await teacher.agent.get('/service-hours');
  assert.equal(page.status, 302);
  assert.equal(page.headers.location, '/community-service');

  const unauthenticated = await request(app).post(`/api/admin/students/${teacher.id}/cs-coordinator`).send({ on: true });
  assert.equal(unauthenticated.status, 401);
});

test('the coordinator approves and rejects, and the student sees the result', async () => {
  const student = await signedIn('hrs.flow@kpis.ac.th', 'Grade 9');
  const coord = await coordinator('hrs.coord@kpis.ac.th');

  assert.equal((await coord.agent.get('/service-hours')).status, 200);

  const a = (await student.agent.post('/api/cs-hours').send(entry({ hours: 3 }))).body.entry;
  const b = (await student.agent.post('/api/cs-hours').send(entry({ hours: 2, activity: 'Tutoring' }))).body.entry;

  const review = await coord.agent.get('/api/cs-hours/review');
  assert.equal(review.status, 200);
  const row = review.body.students.find((s) => s.id === student.id);
  assert.equal(row.pending, 5);

  assert.equal((await coord.agent.post(`/api/cs-hours/review/${a.id}/approve`).send({ note: 'Great work' })).status, 200);
  assert.equal((await coord.agent.post(`/api/cs-hours/review/${b.id}/reject`).send({ note: 'Please add the organization' })).status, 200);

  const mine = (await student.agent.get('/api/cs-hours')).body;
  assert.deepEqual(mine.totals, { approved: 3, approvedThisYear: 3, pending: 0 });
  assert.equal(mine.entries.find((e) => e.id === a.id).note, 'Great work');

  // Approved hours are locked for the student; a rejected entry can be fixed and goes back for review.
  assert.equal((await student.agent.put(`/api/cs-hours/${a.id}`).send(entry({ hours: 10 }))).status, 409);
  assert.equal((await student.agent.delete(`/api/cs-hours/${a.id}`)).status, 409);
  const fixed = await student.agent.put(`/api/cs-hours/${b.id}`).send(entry({ hours: 2, activity: 'Tutoring at Baan Kru' }));
  assert.equal(fixed.status, 200);
  assert.equal(fixed.body.entry.status, 'pending');
  assert.equal(fixed.body.entry.note, '');

  const audited = (await coord.agent.get('/api/cs-hours/review')).body.entries.find((e) => e.id === a.id);
  assert.equal(audited.reviewedBy, 'Cora Tester');
});

test('hours count toward 100 to graduate and 25 for this school year', async () => {
  const student = await signedIn('hrs.target@kpis.ac.th', 'Grade 11');
  const coord = await coordinator('hrs.targetsetter@kpis.ac.th');

  const mine = (await student.agent.get('/api/cs-hours')).body;
  assert.deepEqual(mine.targets, { total: 100, yearly: 25 });

  // One entry from this school year and one from the year before.
  const lastYear = new Date(Date.parse(`${schoolYearStart()}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const now = (await student.agent.post('/api/cs-hours').send(entry({ hours: 4 }))).body.entry;
  const before = (await student.agent.post('/api/cs-hours').send(entry({ date: lastYear, hours: 10 }))).body.entry;
  await coord.agent.post(`/api/cs-hours/review/${now.id}/approve`).send({});
  await coord.agent.post(`/api/cs-hours/review/${before.id}/approve`).send({});

  assert.deepEqual((await student.agent.get('/api/cs-hours')).body.totals, { approved: 14, approvedThisYear: 4, pending: 0 });
  const row = (await coord.agent.get('/api/cs-hours/review')).body.students.find((s) => s.id === student.id);
  assert.equal(row.approvedThisYear, 4);
  assert.equal(row.gradeNumber, 11);

  const saved = await coord.agent.put('/api/cs-hours/review/targets').send({ total: 120, yearly: 30 });
  assert.equal(saved.status, 200, saved.text);
  assert.deepEqual((await student.agent.get('/api/cs-hours')).body.targets, { total: 120, yearly: 30 });

  for (const bad of [{ total: 0, yearly: 25 }, { total: 100, yearly: -1 }, { total: '100', yearly: 25 }, { total: 100 }]) {
    assert.equal((await coord.agent.put('/api/cs-hours/review/targets').send(bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await student.agent.put('/api/cs-hours/review/targets').send({ total: 1, yearly: 1 })).status, 403);
  await coord.agent.put('/api/cs-hours/review/targets').send({ total: 100, yearly: 25 });
});

test('the school year starts on August 1', () => {
  assert.equal(schoolYearStart('2026-11-23'), '2026-08-01');
  assert.equal(schoolYearStart('2027-03-10'), '2026-08-01');
  assert.equal(schoolYearStart('2027-08-01'), '2027-08-01');
  assert.equal(schoolYearStart('2027-07-31'), '2026-08-01');
});

test('the spreadsheet export cannot be turned into a formula', async () => {
  const student = await signedIn('hrs.csv@kpis.ac.th', 'Grade 10', 'Csv');
  const coord = await coordinator('hrs.csvcoord@kpis.ac.th');
  await student.agent.post('/api/cs-hours').send(entry({ activity: '=HYPERLINK("http://evil.example","click")' }));

  const res = await coord.agent.get('/api/cs-hours/export.csv');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.text, /"'=HYPERLINK\(""http:\/\/evil\.example"",""click""\)"/);
});

test('changing a coordinator to a student grade removes their access', async () => {
  const coord = await coordinator('hrs.regraded@kpis.ac.th');
  assert.equal((await coord.agent.get('/api/cs-hours/review')).status, 200);
  await (await admin()).put(`/api/admin/students/${coord.id}`).send({ firstName: 'Cora', lastName: 'Tester', email: 'hrs.regraded@kpis.ac.th', grade: 'Grade 12' });
  assert.equal((await coord.agent.get('/api/cs-hours/review')).status, 403);
});

test('deleting an account deletes its hours', async () => {
  const student = await signedIn('hrs.gone@kpis.ac.th', 'Grade 10');
  await student.agent.post('/api/cs-hours').send(entry());
  assert.ok(db.readCsHours().some((e) => e.studentId === student.id));
  await (await admin()).delete(`/api/admin/students/${student.id}`);
  assert.ok(!db.readCsHours().some((e) => e.studentId === student.id));
});

test('a report follows the Project Report form', async () => {
  const { agent } = await signedIn('hrs.form@kpis.ac.th', 'Grade 10');
  db.writeClubs([
    { id: 'club-green', type: 'community-service', name: 'Green Club', sdgs: [13, 15], createdAt: new Date().toISOString() },
    { id: 'club-media', type: 'after-school', name: 'Media Club', createdAt: new Date().toISOString() },
  ]);
  const options = (await agent.get('/api/cs-hours/options')).body;
  assert.deepEqual(options.clubs.map((c) => c.name), ['Green Club']);
  assert.equal(options.sdgs.length, 17);

  const yesterday = new Date(Date.parse(`${schoolToday()}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  for (const [label, bad] of [
    ['no need', entry({ need: '' })],
    ['no reflection', entry({ reflection: ' ' })],
    ['no advisor', entry({ advisorName: '' })],
    ['planned without summaries', entry({ planned: true })],
    ['no evidence at all', entry({ links: [], evidence: [] })],
    ['not a link', entry({ links: ['javascript:alert(1)'] })],
    ['no cause', entry({ sdgs: [] })],
    ['four causes', entry({ sdgs: [1, 2, 3, 4] })],
    ['cause 18', entry({ sdgs: [18] })],
    ['ends before it starts', entry({ date: schoolToday(), endDate: yesterday })],
    ['after-school club', entry({ clubId: 'club-media' })],
    ['no tasks', entry({ tasks: [] })],
    ['task without hours', entry({ tasks: [{ task: 'Helping', hours: null }] })],
    ['no grade', entry({ serviceGrade: undefined })],
    ['grade 8', entry({ serviceGrade: 8 })],
    ['grade as text', entry({ serviceGrade: '10' })],
    ['a grade above the one they are in now', entry({ serviceGrade: 11 })],
    ['over 300 hours in one report', entry({ tasks: [{ task: 'Camp', hours: 200 }, { task: 'Follow-up', hours: 101 }] })],
  ]) {
    assert.equal((await agent.post('/api/cs-hours').send(bad)).status, 400, label);
  }

  const planned = await agent.post('/api/cs-hours').send(entry({
    clubId: 'club-green',
    date: yesterday,
    endDate: schoolToday(),
    sdgs: [13, 15],
    planned: true,
    investigationSummary: 'Surveyed the beach.',
    planningSummary: 'Booked a bus and gloves.',
    tasks: [{ task: 'Planning', hours: 1.5 }, { task: 'Cleaning', hours: 2.25 }],
  }));
  assert.equal(planned.status, 201, planned.text);
  const saved = planned.body.entry;
  assert.equal(saved.clubName, 'Green Club');
  assert.equal(saved.serviceGrade, 9);
  const tenth = (await agent.post('/api/cs-hours').send(entry({ serviceGrade: 10 }))).body.entry;
  assert.equal(tenth.serviceGrade, 10);
  assert.equal(saved.organization, '');
  assert.equal(saved.hours, 3.75);
  assert.deepEqual(saved.sdgs.map((g) => g.name), ['Climate Action', 'Life on Land']);
  assert.equal(saved.planningSummary, 'Booked a bus and gloves.');

  // A task in a long project can take far more than a day.
  const long = await agent.post('/api/cs-hours').send(entry({ tasks: [{ task: 'Helping', hours: 5 }, { task: 'Summer camp', hours: 60 }] }));
  assert.equal(long.status, 201, long.text);
  assert.equal(long.body.entry.hours, 65);

  // Joining someone else's project leaves the planning answers out.
  const joined = (await agent.post('/api/cs-hours').send(entry({ investigationSummary: 'ignored' }))).body.entry;
  assert.equal(joined.investigationSummary, '');
});

test('evidence photos are private to the student and the coordinator', async () => {
  const owner = await signedIn('hrs.photo@kpis.ac.th', 'Grade 12');
  const other = await signedIn('hrs.snoop@kpis.ac.th', 'Grade 12');
  const coord = await coordinator('hrs.photocoord@kpis.ac.th');

  const notImage = await owner.agent.post('/api/cs-hours/evidence').attach('file', Buffer.from('<html>hi</html>'), 'page.png');
  assert.equal(notImage.status, 400);

  const uploaded = await owner.agent.post('/api/cs-hours/evidence').attach('file', PNG, 'beach.png');
  assert.equal(uploaded.status, 201, uploaded.text);
  const photo = uploaded.body.evidence;

  // Someone else's photo cannot be attached to your report.
  const stolen = await other.agent.post('/api/cs-hours').send(entry({ evidence: [{ id: photo.id, section: 'action' }] }));
  assert.equal(stolen.status, 400);

  const report = await owner.agent.post('/api/cs-hours').send(entry({ links: [], evidence: [{ id: photo.id, section: 'action' }] }));
  assert.equal(report.status, 201, report.text);
  assert.equal(report.body.entry.evidence[0].url, `/api/cs-hours/evidence/${photo.id}`);

  const mine = await owner.agent.get(photo.url);
  assert.equal(mine.status, 200);
  assert.equal(mine.headers['content-type'], 'image/png');
  assert.match(mine.headers['content-security-policy'], /sandbox/);
  assert.equal((await other.agent.get(photo.url)).status, 404);
  assert.equal((await request(app).get(photo.url)).status, 401);
  assert.equal((await coord.agent.get(photo.url)).status, 200);

  // Deleting the report deletes the photo with it.
  const file = path.join(dataDir, 'cs-evidence', `${photo.id}.png`);
  assert.ok(fs.existsSync(file));
  await owner.agent.delete(`/api/cs-hours/${report.body.entry.id}`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(!fs.existsSync(file));
  assert.equal((await owner.agent.get(photo.url)).status, 404);
});

test('students see a badge for new replies until they open Community Service', async () => {
  const student = await signedIn('hrs.badge@kpis.ac.th', 'Grade 9');
  const coord = await coordinator('hrs.badgecoord@kpis.ac.th');
  const a = (await student.agent.post('/api/cs-hours').send(entry())).body.entry;

  // The coordinator sees how many reports are waiting.
  assert.match((await coord.agent.get('/service-hours')).text, /class="nav-badge"[^>]*>\d+/);

  await coord.agent.post(`/api/cs-hours/review/${a.id}/approve`).send({ note: 'Nice' });
  const home = await student.agent.get('/');
  assert.match(home.text, /class="nav-badge"[^>]*>1</);

  // The home widget reads without marking anything as seen.
  assert.equal((await student.agent.get('/api/cs-hours')).body.entries[0].isNew, true);
  assert.equal((await student.agent.get('/api/cs-hours?seen=1')).body.entries[0].isNew, true);
  assert.equal((await student.agent.get('/api/cs-hours')).body.entries[0].isNew, false);
  assert.doesNotMatch((await student.agent.get('/')).text, /class="nav-badge"/);
});

test('the coordinator can approve several reports at once, each with its own note', async () => {
  const student = await signedIn('hrs.bulk@kpis.ac.th', 'Grade 11');
  const coord = await coordinator('hrs.bulkcoord@kpis.ac.th');
  const a = (await student.agent.post('/api/cs-hours').send(entry({ hours: 1 }))).body.entry;
  const b = (await student.agent.post('/api/cs-hours').send(entry({ hours: 2 }))).body.entry;
  const c = (await student.agent.post('/api/cs-hours').send(entry({ hours: 4 }))).body.entry;

  assert.equal((await student.agent.post('/api/cs-hours/review/approve-many').send({ items: [{ id: a.id }] })).status, 403);
  assert.equal((await coord.agent.post('/api/cs-hours/review/approve-many').send({ items: [] })).status, 400);
  assert.equal((await coord.agent.post('/api/cs-hours/review/approve-many').send({ items: [{ id: 'nope' }] })).status, 404);

  const res = await coord.agent.post('/api/cs-hours/review/approve-many').send({ items: [{ id: a.id, note: 'Great photos' }, { id: b.id }] });
  assert.equal(res.status, 200, res.text);
  const mine = (await student.agent.get('/api/cs-hours')).body;
  assert.deepEqual(mine.totals, { approved: 3, approvedThisYear: 3, pending: 4 });
  assert.equal(mine.entries.find((e) => e.id === a.id).note, 'Great photos');
  assert.equal(mine.entries.find((e) => e.id === c.id).status, 'pending');
});

test('the home page shows service hours only to Grades 9 to 12, and it can be switched off', async () => {
  const student = await signedIn('hrs.home@kpis.ac.th', 'Grade 10');
  const younger = await signedIn('hrs.home8@kpis.ac.th', 'Grade 8');
  assert.match((await student.agent.get('/')).text, /id="home-hours"/);
  assert.doesNotMatch((await younger.agent.get('/')).text, /id="home-hours"/);

  const { validateWidgetSettings } = require('../server/utils/homeLayout');
  assert.deepEqual(validateWidgetSettings('service', { showHours: false }, null).settings, { count: 3, showDescription: true, showHours: false });
  assert.ok(validateWidgetSettings('service', { showHours: 'no' }, null).error);
});

test('StuCo admins can view every report from the admin panel but cannot approve or decline', async () => {
  const student = await signedIn('hrs.adminview@kpis.ac.th', 'Grade 10');
  const coord = await coordinator('hrs.adminviewcoord@kpis.ac.th');
  const uploaded = (await student.agent.post('/api/cs-hours/evidence').attach('file', PNG, 'proof.png')).body.evidence;
  const a = (await student.agent.post('/api/cs-hours').send(entry({ evidence: [{ id: uploaded.id, section: 'action' }] }))).body.entry;
  const b = (await student.agent.post('/api/cs-hours').send(entry({ hours: 3 }))).body.entry;
  const c = (await student.agent.post('/api/cs-hours').send(entry({ hours: 1 }))).body.entry;

  assert.equal((await request(app).get('/api/admin/cs-hours')).status, 401);
  assert.equal((await student.agent.get('/api/admin/cs-hours')).status, 401);

  const view = await (await admin()).get('/api/admin/cs-hours');
  assert.equal(view.status, 200);
  const seen = view.body.entries.find((e) => e.id === a.id);
  assert.equal(seen.evidence[0].url, `/api/admin/cs-hours/evidence/${uploaded.id}`);
  assert.equal((await (await admin()).get(seen.evidence[0].url)).status, 200);
  assert.equal((await (await admin()).get('/api/admin/cs-hours/export.csv')).status, 200);

  // Only Ms. Gia decides: the admin routes for it do not exist.
  assert.equal((await (await admin()).post(`/api/admin/cs-hours/${a.id}/approve`).send({ note: 'Nice work from StuCo' })).status, 404);
  assert.equal((await (await admin()).post(`/api/admin/cs-hours/${a.id}/reject`).send({})).status, 404);
  assert.equal((await (await admin()).post('/api/admin/cs-hours/approve-many').send({ items: [{ id: b.id }] })).status, 404);
  assert.ok(view.body.entries.filter((e) => e.studentId === student.id).every((e) => e.status === 'pending'));

  await coord.agent.post(`/api/cs-hours/review/${c.id}/reject`).send({ note: 'Add evidence' });
  const mine = (await student.agent.get('/api/cs-hours')).body.entries;
  assert.equal(mine.find((e) => e.id === a.id).status, 'pending');
  assert.equal(mine.find((e) => e.id === c.id).noteFrom, 'Ms. Gia');

  // The hour requirements stay with the coordinator.
  assert.equal((await (await admin()).put('/api/admin/cs-hours/targets').send({ total: 1, yearly: 1 })).status, 404);
});

test('an after-school club marked for service hours can be picked on a report and stays after-school', async () => {
  const student = await signedIn('hrs.media@kpis.ac.th', 'Grade 11');
  const make = async (name, serviceHours) => (await admin()).post('/api/admin/clubs').field('type', 'after-school').field('name', name).field('serviceHours', serviceHours);
  const media = await make('Photo Club Test', 'true');
  const debate = await make('Debate Club Test', 'false');
  assert.equal(media.status, 201, media.text);
  assert.equal(media.body.club.type, 'after-school');
  assert.equal(media.body.club.serviceHours, true);
  assert.equal(debate.body.club.serviceHours, false);

  const names = (await student.agent.get('/api/cs-hours/options')).body.clubs.map((c) => c.name);
  assert.ok(names.includes('Photo Club Test'));
  assert.ok(!names.includes('Debate Club Test'));

  assert.equal((await student.agent.post('/api/cs-hours').send(entry({ clubId: media.body.club.id }))).status, 201);
  assert.equal((await student.agent.post('/api/cs-hours').send(entry({ clubId: debate.body.club.id }))).status, 400);

  // The Clubs page still lists it as an after-school club.
  const afterSchool = (await student.agent.get('/api/clubs?type=after-school')).body.clubs.map((c) => c.name);
  assert.ok(afterSchool.includes('Photo Club Test'));
});

test("the grade a student chose wins over the date, and feeds the per-grade totals", async () => {
  const student = await signedIn('hrs.gradetotals@kpis.ac.th', 'Grade 11');
  const coord = await coordinator('hrs.gradetotalscoord@kpis.ac.th');
  const lastYear = new Date(Date.parse(`${schoolYearStart()}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  // Done last school year, so the date alone would say Grade 10; the student says Grade 9.
  const chosen = (await student.agent.post('/api/cs-hours').send(entry({ date: lastYear, serviceGrade: 9, hours: 2 }))).body.entry;
  const thisYear = (await student.agent.post('/api/cs-hours').send(entry({ serviceGrade: 11, hours: 3 }))).body.entry;
  await coord.agent.post('/api/cs-hours/review/approve-many').send({ items: [{ id: chosen.id }, { id: thisYear.id }] });

  const data = (await student.agent.get('/api/cs-hours')).body;
  assert.equal(data.entries.find((e) => e.id === chosen.id).grade, 9);
  assert.deepEqual(data.gradeTotals, { 9: 2, 10: 0, 11: 3, 12: 0 });
  assert.equal(data.entries.find((e) => e.id === chosen.id).approvedBy, 'CT');
});

test('hours imported from the school sheet (no report, maybe no date) show everywhere without errors', async () => {
  const student = await signedIn('hrs.imported@kpis.ac.th', 'Grade 12');
  const coord = await coordinator('hrs.importedcoord@kpis.ac.th');
  const now = new Date().toISOString();
  const imported = (date, grade, title) => ({
    id: `import-${title}`, studentId: student.id, title, clubId: '', organization: '', date, endDate: '', grade,
    sdgs: [], links: [], evidence: [], tasks: [], hours: 5, advisorName: 'Ms. Gia', status: 'approved', approvedBy: 'GM', createdAt: now,
  });
  db.writeCsHours([...db.readCsHours(), imported('2024-12-14', 10, 'Food drive'), imported(null, 11, 'Fun run')]);

  const mine = await student.agent.get('/api/cs-hours');
  assert.equal(mine.status, 200);
  assert.equal(mine.body.totals.approved, 10);
  const row = mine.body.entries.find((e) => e.title === 'Food drive');
  assert.equal(row.hasReport, false);
  assert.equal(row.grade, 10);
  assert.equal(row.approvedBy, 'GM');

  for (const res of [await coord.agent.get('/api/cs-hours/review'), await (await admin()).get('/api/admin/cs-hours'),
    await coord.agent.get('/api/cs-hours/export.csv'), await (await admin()).get('/api/admin/cs-hours/export.csv')]) {
    assert.equal(res.status, 200, res.text);
  }
});
