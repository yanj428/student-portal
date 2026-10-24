const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const crypto = require('crypto');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function loginAsAdmin() {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ password: 'test-admin-pw' });
  return agent;
}

function seedEvent({ day, month, title, createdAt }) {
  const items = db.readCalendarEvents();
  items.push({ id: crypto.randomUUID(), day, month, title, subtitle: '', createdAt });
  db.writeCalendarEvents(items);
}

test('an event whose date has passed is permanently removed on read', async () => {
  const admin = await loginAsAdmin();
  // A fixed date safely in the past no matter when this test runs.
  seedEvent({ day: '1', month: 'Jan', title: 'Long gone', createdAt: '2020-01-05T00:00:00.000Z' });

  const res = await admin.get('/api/admin/calendar-events');
  assert.equal(res.body.calendarEvents.some((e) => e.title === 'Long gone'), false);

  // Actually deleted, not just filtered out of this one response.
  assert.equal(db.readCalendarEvents().some((e) => e.title === 'Long gone'), false);
});

test('a future event is kept', async () => {
  const admin = await loginAsAdmin();
  const now = new Date();
  const futureMonthIndex = (now.getMonth() + 2) % 12;
  const monthName = new Date(2000, futureMonthIndex, 1).toLocaleString('en-US', { month: 'short' });
  seedEvent({ day: '15', month: monthName, title: 'Still upcoming', createdAt: now.toISOString() });

  const res = await admin.get('/api/admin/calendar-events');
  assert.equal(res.body.calendarEvents.some((e) => e.title === 'Still upcoming'), true);
});

test('a small backdate (recorded a couple days after the fact) stays in its creation year, not bumped to next year', async () => {
  const admin = await loginAsAdmin();
  const now = new Date();
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(now.getDate() - 2);
  // Entered a couple of days after the fact - a normal admin lag, not "this
  // clearly means next year". Should resolve to this year and (since it's
  // already passed) be deleted, not kept around for another year.
  seedEvent({
    day: String(twoDaysAgo.getDate()),
    month: twoDaysAgo.toLocaleString('en-US', { month: 'short' }),
    title: 'Recorded a bit late',
    createdAt: now.toISOString(),
  });

  const res = await admin.get('/api/admin/calendar-events');
  assert.equal(res.body.calendarEvents.some((e) => e.title === 'Recorded a bit late'), false);
});

test('a date well over a month before its own creation date is understood as the next occurrence, not deleted', async () => {
  const admin = await loginAsAdmin();
  const now = new Date();
  // 7 months "before" now (well past the grace window) - e.g. an annual
  // event entered again shortly after last year's already happened.
  const pastMonthIndex = (now.getMonth() - 7 + 12) % 12;
  const monthName = new Date(2000, pastMonthIndex, 1).toLocaleString('en-US', { month: 'short' });
  seedEvent({ day: '15', month: monthName, title: 'Annual event, entered early', createdAt: now.toISOString() });

  const res = await admin.get('/api/admin/calendar-events');
  assert.equal(res.body.calendarEvents.some((e) => e.title === 'Annual event, entered early'), true);
});

test('editing an old event to a date that already passed this year moves it to next year instead of deleting it', async () => {
  const admin = await loginAsAdmin();
  const now = new Date();
  const monthName = (offset) => new Date(2000, (now.getMonth() + offset + 12) % 12, 1).toLocaleString('en-US', { month: 'short' });

  // Created six months ago for a date next month, so it is still upcoming.
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(now.getMonth() - 6);
  seedEvent({ day: '15', month: monthName(1), title: 'Postponed to next year', createdAt: sixMonthsAgo.toISOString() });
  const id = db.readCalendarEvents().find((e) => e.title === 'Postponed to next year').id;

  // The admin edits it to a month three months back - which can only mean that
  // month next year. Judged against the old creation date it looked long past
  // and was deleted on the next read.
  const res = await admin
    .put(`/api/admin/calendar-events/${id}`)
    .send({ day: '15', month: monthName(-3), title: 'Postponed to next year', subtitle: '' });
  assert.equal(res.status, 200);

  const list = await admin.get('/api/admin/calendar-events');
  assert.equal(list.body.calendarEvents.some((e) => e.title === 'Postponed to next year'), true);
});

test('a day range expires by its last day, not its first', async () => {
  const admin = await loginAsAdmin();
  const now = new Date();
  // Day 1 of this month has certainly passed by "now" (unless today is the
  // 1st) - if expiry used the range's first day instead of its last, this
  // would be wrongly deleted. Ending the range on today itself is always
  // still "not yet expired" (its 23:59:59 hasn't passed), regardless of
  // month length.
  seedEvent({
    day: `1-${now.getDate()}`,
    month: now.toLocaleString('en-US', { month: 'short' }),
    title: 'Multi-day range',
    createdAt: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
  });

  const res = await admin.get('/api/admin/calendar-events');
  assert.equal(res.body.calendarEvents.some((e) => e.title === 'Multi-day range'), true);
});
