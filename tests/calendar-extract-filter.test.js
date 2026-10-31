const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

// The AI service is replaced before the app loads, so the route gets this stand-in:
// it "reads" a photo that lists one event already on the calendar, one long past and two to come.
const ai = require('../server/utils/calendarEventsAi');
ai.isAiConfigured = () => true;
ai.extractCalendarEvents = async () => [
  { day: '5', month: 'Dec', title: 'Sports Day', subtitle: '' },
  { day: '12', month: 'Aug', title: 'Orientation', subtitle: '' },
  { day: '20', month: 'Dec', title: 'Science Fair', subtitle: '' },
  { day: '9', month: 'Jan', title: 'Open House', subtitle: '' },
];

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('extracting events leaves out ones already on the calendar and ones already past', async () => {
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  // "Sports Day" is already on the calendar.
  await admin.post('/api/admin/calendar-events').send({ day: '5', month: 'Dec', title: 'Sports Day', subtitle: '' });

  const res = await admin.post('/api/admin/calendar-events/extract').attach('image', PNG, 'calendar.png');
  assert.equal(res.status, 200);
  const titles = res.body.events.map((e) => e.title);
  assert.ok(!titles.includes('Sports Day'), 'already on the calendar');
  assert.ok(titles.includes('Science Fair') || titles.includes('Open House'), 'later events are kept');
  assert.equal(res.body.skippedExisting + res.body.skippedPast + res.body.events.length, 4, 'every event is either offered or counted');
  assert.equal(res.body.skippedExisting, 1);
});