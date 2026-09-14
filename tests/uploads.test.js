const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');
const { detectImageType } = require('../server/uploads');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function loginAsAdmin() {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').send({ password: 'test-admin-pw' });
  return agent;
}

test('detectImageType identifies real PNG/JPEG/GIF/WEBP bytes and rejects everything else', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const gif = Buffer.from('GIF89a' + 'xxxx', 'ascii');
  const webp = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP', 'ascii')]);
  const html = Buffer.from('<html><script>alert(1)</script></html>', 'ascii');

  assert.equal(detectImageType(png).ext, '.png');
  assert.equal(detectImageType(jpeg).ext, '.jpg');
  assert.equal(detectImageType(gif).ext, '.gif');
  assert.equal(detectImageType(webp).ext, '.webp');
  assert.equal(detectImageType(html), null);
});

test('a club logo upload is rejected when the file content does not match its claimed image type', async () => {
  const admin = await loginAsAdmin();
  const maliciousFile = Buffer.from('<html><body>not actually a png</body></html>');

  const res = await admin
    .post('/api/admin/clubs')
    .field('type', 'community-service')
    .field('name', 'Fake Logo Club')
    .field('description', 'Testing upload validation.')
    .attach('logo', maliciousFile, 'evil.png');

  assert.equal(res.status, 400);
  assert.match(res.body.error, /jpeg|png|webp|gif/i);
});

test('a club logo upload succeeds with a genuine PNG', async () => {
  const admin = await loginAsAdmin();
  const realPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);

  const res = await admin
    .post('/api/admin/clubs')
    .field('type', 'community-service')
    .field('name', 'Real Logo Club')
    .field('description', 'Testing a genuine upload.')
    .attach('logo', realPng, 'logo.png');

  assert.equal(res.status, 201);
  assert.match(res.body.club.logoUrl, /^\/uploads\/club-logos\/.*\.png$/);

  await admin.delete(`/api/admin/clubs/${res.body.club.id}`);
});
