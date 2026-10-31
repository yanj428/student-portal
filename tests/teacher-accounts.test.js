const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// A teacher account is an ordinary account whose grade is "Teacher" and whose
// temporary password is kpisteacher.
function addTeacher(email) {
  db.addStudent({
    id: crypto.randomUUID(), firstName: 'Tess', middleName: '', lastName: 'Teacher', nickname: '', email,
    grade: 'Teacher', passwordHash: bcrypt.hashSync('kpisteacher', 10), mustChangePassword: true, createdAt: new Date().toISOString(),
  });
}

test('a teacher signs in with the teacher password and must choose a new one', async () => {
  addTeacher('tess.tea@kpis.ac.th');
  const agent = request.agent(app);
  const res = await agent.post('/api/login').send({ email: 'tess.tea@kpis.ac.th', password: 'kpisteacher' });
  assert.equal(res.status, 200);
  assert.equal(res.body.student.mustChangePassword, true);
  assert.equal(res.body.student.grade, 'Teacher');
});

test('neither default password can be chosen as the new one', async () => {
  addTeacher('tom.tea@kpis.ac.th');
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email: 'tom.tea@kpis.ac.th', password: 'kpisteacher' });
  for (const newPassword of ['kpisteacher', 'keerapat']) {
    const res = await agent.post('/api/change-password').send({ currentPassword: 'kpisteacher', newPassword });
    assert.equal(res.status, 400, newPassword);
  }
  const ok = await agent.post('/api/change-password').send({ currentPassword: 'kpisteacher', newPassword: 'my-own-password-1' });
  assert.equal(ok.status, 200);
});