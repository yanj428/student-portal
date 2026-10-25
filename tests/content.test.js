const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

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

function baseContent(overrides = {}) {
  const content = db.DEFAULT_CONTENT;
  return {
    weeklySlide: { ...content.weeklySlide },
    lunchSchedule: { ...content.lunchSchedule },
    calendarImage: { ...content.calendarImage },
    ...overrides,
  };
}

test('saving content drops unknown fields instead of storing them', async () => {
  const admin = await loginAsAdmin();
  const content = baseContent({ injectedField: 'should not be saved', weeklySlide: { weekLabel: 'Week 1', canvaEmbedUrl: '' } });

  const res = await admin.put('/api/admin/content').send({ content });
  assert.equal(res.status, 200);
  assert.equal(res.body.content.injectedField, undefined);

  const fetched = await admin.get('/api/admin/content');
  assert.equal(fetched.body.content.injectedField, undefined);
});

test('a lunch week label over the length cap is rejected', async () => {
  const admin = await loginAsAdmin();
  const content = baseContent({ lunchSchedule: { weekLabel: 'x'.repeat(101), imageUrl: '' } });

  const res = await admin.put('/api/admin/content').send({ content });
  assert.equal(res.status, 400);
});

test('a week label over the length cap is rejected', async () => {
  const admin = await loginAsAdmin();
  const content = baseContent({ weeklySlide: { weekLabel: 'x'.repeat(101), canvaEmbedUrl: '' } });

  const res = await admin.put('/api/admin/content').send({ content });
  assert.equal(res.status, 400);
});

test('a valid content save round-trips correctly', async () => {
  const admin = await loginAsAdmin();
  const content = baseContent({ weeklySlide: { weekLabel: 'Week of Sep 1', canvaEmbedUrl: '' } });
  content.calendarImage.label = 'School year 2026';

  const res = await admin.put('/api/admin/content').send({ content });
  assert.equal(res.status, 200);
  assert.equal(res.body.content.weeklySlide.weekLabel, 'Week of Sep 1');
  assert.equal(res.body.content.calendarImage.label, 'School year 2026');
});
