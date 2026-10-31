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

const EMBED_URL = 'https://www.canva.com/design/DAHZXeUOZz4/iIcOaVDhg7KH0FiNUGdHMw/view?embed';
const EMBED_CODE = `<div style="position: relative; width: 100%; height: 0; padding-top: 56.2500%;"><iframe loading="lazy" style="position: absolute;" src="${EMBED_URL}" allowfullscreen="allowfullscreen" allow="fullscreen"></iframe></div><a href="https:&#x2F;&#x2F;www.canva.com&#x2F;design&#x2F;DAHZXeUOZz4&#x2F;x&#x2F;view" target="_blank" rel="noopener">Student WIP</a> by Someone`;
const withSlide = (slide) => baseContent({ weeklySlide: { weekLabel: 'Week 3', canvaEmbedUrl: '', embedUrl: '', ...slide } });

test('the slide can be a pasted embed code, and only its frame address is kept', async () => {
  const admin = await loginAsAdmin();
  const res = await admin.put('/api/admin/content').send({ content: withSlide({ embedUrl: EMBED_CODE }) });
  assert.equal(res.status, 200);
  assert.equal(res.body.content.weeklySlide.embedUrl, EMBED_URL);
  assert.equal(res.body.content.weeklySlide.canvaEmbedUrl, '');
  assert.ok(!JSON.stringify(res.body.content).includes('<iframe'), 'no pasted HTML is stored');
});

test('the slide can be the embed link itself, and a plain Canva link in the embed box becomes an embed', async () => {
  const admin = await loginAsAdmin();
  assert.equal((await admin.put('/api/admin/content').send({ content: withSlide({ embedUrl: EMBED_URL }) })).body.content.weeklySlide.embedUrl, EMBED_URL);
  const plain = await admin.put('/api/admin/content').send({ content: withSlide({ embedUrl: 'https://www.canva.com/design/DAHZ/abc/view' }) });
  assert.equal(plain.body.content.weeklySlide.embedUrl, 'https://www.canva.com/design/DAHZ/abc/view?embed');
});

test('a normal link and an embed together are refused, so only one is ever set', async () => {
  const admin = await loginAsAdmin();
  const res = await admin.put('/api/admin/content').send({ content: withSlide({ canvaEmbedUrl: 'https://www.canva.com/design/DAHZ/abc/view', embedUrl: EMBED_URL }) });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /not both/);
  // each on its own still works, and switching clears the other
  assert.equal((await admin.put('/api/admin/content').send({ content: withSlide({ canvaEmbedUrl: 'https://www.canva.com/design/DAHZ/abc/view' }) })).status, 200);
  const switched = await admin.put('/api/admin/content').send({ content: withSlide({ embedUrl: EMBED_URL }) });
  assert.equal(switched.body.content.weeklySlide.canvaEmbedUrl, '');
});

test('an embed from anywhere but Canva, or code with no frame, is refused', async () => {
  const admin = await loginAsAdmin();
  for (const embedUrl of ['https://evil.example.com/design/x/view?embed', 'javascript:alert(1)', '<iframe src="javascript:alert(1)"></iframe>', '<div>no frame here</div>', 'https://www.canva.com/not-a-design']) {
    assert.equal((await admin.put('/api/admin/content').send({ content: withSlide({ embedUrl }) })).status, 400, embedUrl);
  }
});

test('content saved before embeds existed still saves and shows an empty embed', async () => {
  const admin = await loginAsAdmin();
  const old = baseContent({ weeklySlide: { weekLabel: 'Old', canvaEmbedUrl: '' } });
  const res = await admin.put('/api/admin/content').send({ content: old });
  assert.equal(res.status, 200);
  assert.equal(res.body.content.weeklySlide.embedUrl, '');
});