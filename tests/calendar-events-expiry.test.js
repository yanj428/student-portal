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

function seedEvent({ day, month, year, title, createdAt }) {
  const items = db.readCalendarEvents();
  items.push({ id: crypto.randomUUID(), day, month, ...(year ? { year } : {}), title, subtitle: '', createdAt });
  db.writeCalendarEvents(items);
}

test('a past event is kept and still listed, with its year', async () => {
  const admin = await loginAsAdmin();
  seedEvent({ day: '1', month: 'Jan', year: 2020, title: 'Long gone', createdAt: '2020-01-05T00:00:00.000Z' });

  const res = await admin.get('/api/admin/calendar-events');
  const event = res.body.calendarEvents.find((e) => e.title === 'Long gone');
  assert.equal(event.year, 2020);
  assert.equal(db.readCalendarEvents().some((e) => e.title === 'Long gone'), true);
});

test('?upcoming=1 leaves out events that have passed but keeps today and later', async () => {
  const admin = await loginAsAdmin();
  const { todayAtSchool } = require('../server/utils/calendarCandidates');
  const today = todayAtSchool();
  const month = new Date(2000, today.month, 1).toLocaleString('en-US', { month: 'short' });
  seedEvent({ day: '1', month: 'Jan', year: 2020, title: 'Old news', createdAt: '2020-01-05T00:00:00.000Z' });
  seedEvent({ day: String(today.day), month, year: today.year, title: 'Happening today', createdAt: new Date().toISOString() });
  seedEvent({ day: '1', month: 'Jan', year: today.year + 1, title: 'Next year', createdAt: new Date().toISOString() });

  const all = await admin.get('/api/admin/calendar-events');
  assert.equal(all.body.calendarEvents.some((e) => e.title === 'Old news'), true);

  const upcoming = await admin.get('/api/admin/calendar-events?upcoming=1');
  const titles = upcoming.body.calendarEvents.map((e) => e.title);
  assert.equal(titles.includes('Old news'), false);
  assert.equal(titles.includes('Happening today'), true);
  assert.equal(titles.includes('Next year'), true);
});

test('events are sorted by year, then month, then day', async () => {
  const admin = await loginAsAdmin();
  seedEvent({ day: '2', month: 'Feb', year: 2031, title: 'Sort B', createdAt: '2031-01-01T00:00:00.000Z' });
  seedEvent({ day: '30', month: 'Dec', year: 2030, title: 'Sort A', createdAt: '2030-01-01T00:00:00.000Z' });
  const res = await admin.get('/api/admin/calendar-events');
  const titles = res.body.calendarEvents.map((e) => e.title);
  assert.ok(titles.indexOf('Sort A') < titles.indexOf('Sort B'));
});

test('a new event gets this school year\'s year and a guessed category', async () => {
  const admin = await loginAsAdmin();
  const res = await admin.post('/api/admin/calendar-events').send({ day: '12', month: 'Sep', title: 'Midterm Exams Begin', subtitle: '' });
  assert.equal(res.status, 201);
  assert.equal(res.body.calendarEvent.category, 'academic');
  assert.ok(Number.isInteger(res.body.calendarEvent.year));
});

test('an explicit year and category are saved, and bad ones are refused', async () => {
  const admin = await loginAsAdmin();
  const ok = await admin.post('/api/admin/calendar-events').send({ day: '3', month: 'Mar', year: '2027', category: 'sports', title: 'Sports Day', subtitle: '' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.calendarEvent.year, 2027);
  assert.equal(ok.body.calendarEvent.category, 'sports');

  const badYear = await admin.post('/api/admin/calendar-events').send({ day: '3', month: 'Mar', year: 'soon', title: 'x', subtitle: '' });
  assert.equal(badYear.status, 400);
  const badCategory = await admin.post('/api/admin/calendar-events').send({ day: '3', month: 'Mar', category: 'nope', title: 'x', subtitle: '' });
  assert.equal(badCategory.status, 400);
});

test('an event saved before years existed gets its year from when it was created', async () => {
  const admin = await loginAsAdmin();
  seedEvent({ day: '15', month: 'Feb', title: 'Legacy event', createdAt: '2025-10-01T00:00:00.000Z' });
  const res = await admin.get('/api/admin/calendar-events');
  const event = res.body.calendarEvents.find((e) => e.title === 'Legacy event');
  assert.equal(event.year, 2026); // Feb falls in the school year that starts in Aug 2025
  assert.equal(event.category, 'school');
});

test('editing an event keeps its year unless the date moves or a year is given', async () => {
  const admin = await loginAsAdmin();
  const created = await admin.post('/api/admin/calendar-events').send({ day: '3', month: 'Mar', year: '2027', title: 'Keeps year', subtitle: '' });
  const id = created.body.calendarEvent.id;

  const same = await admin.put(`/api/admin/calendar-events/${id}`).send({ day: '3', month: 'Mar', title: 'Keeps year, renamed', subtitle: '' });
  assert.equal(same.body.calendarEvent.year, 2027);

  const moved = await admin.put(`/api/admin/calendar-events/${id}`).send({ day: '3', month: 'Mar', year: '2028', title: 'Keeps year, renamed', subtitle: '' });
  assert.equal(moved.body.calendarEvent.year, 2028);
});