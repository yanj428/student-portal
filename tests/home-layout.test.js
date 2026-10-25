const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { initTestEnv } = require('./helpers/setup');
const dataDir = initTestEnv();

const request = require('supertest');
const app = require('../server/server');
const db = require('../server/db');
const { resolveLayout, DEFAULT_SETTINGS } = require('../server/utils/homeLayout');

test.after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const DEFAULT_ORDER = ['hero', 'jump', 'links', 'events', 'cards', 'clubs', 'service'];
const STANDARD = { order: DEFAULT_ORDER, hidden: [], settings: DEFAULT_SETTINGS };
const orderAndHidden = (layout) => ({ order: layout.order, hidden: layout.hidden });
let counter = 0;

// A signed-in student (default password already changed, as a real one must).
async function signedInStudent() {
  const email = `home.layout.${++counter}@kpis.ac.th`;
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-admin-pw' });
  const created = await admin.post('/api/admin/students').send({ firstName: 'Lay', lastName: 'Out', email, grade: '10' });
  const agent = request.agent(app);
  await agent.post('/api/login').send({ email, password: created.body.password });
  await agent.post('/api/change-password').send({ currentPassword: created.body.password, newPassword: 'a-brand-new-pw-1' });
  return { agent, id: created.body.student.id };
}

// The page draws every widget in the student's order and marks the hidden ones
// (they stay in the page so edit mode can show them again). Read that back.
function pageLayout(html) {
  const found = [...html.matchAll(/<div class="home-widget( is-hidden)?" data-widget="(\w+)"/g)];
  return { order: found.map((m) => m[2]), hidden: found.filter((m) => m[1]).map((m) => m[2]) };
}

test('a student who has never customized gets the standard layout', async () => {
  const { agent } = await signedInStudent();
  const res = await agent.get('/api/home-layout');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.layout, STANDARD);
  assert.equal(res.body.widgets.length, 7);
  assert.equal(res.body.jumpTiles.length, 8);
});

test('Quick links sits right below Jump to on the standard home page', async () => {
  const { agent } = await signedInStudent();
  const page = pageLayout((await agent.get('/')).text);
  assert.deepEqual(page.order.slice(0, 3), ['hero', 'jump', 'links']);
});

test('the home layout needs a signed-in student', async () => {
  assert.equal((await request(app).get('/api/home-layout')).status, 401);
  assert.equal((await request(app).put('/api/home-layout').send({ order: DEFAULT_ORDER, hidden: [] })).status, 401);
  assert.equal((await request(app).delete('/api/home-layout')).status, 401);
});

test('a saved order and hidden widget are kept and the home page is drawn that way', async () => {
  const { agent } = await signedInStudent();
  const order = ['links', 'clubs', 'events', 'hero', 'jump', 'cards', 'service'];
  const put = await agent.put('/api/home-layout').send({ order, hidden: ['cards'] });
  assert.equal(put.status, 200);
  assert.deepEqual(orderAndHidden((await agent.get('/api/home-layout')).body.layout), { order, hidden: ['cards'] });

  const page = pageLayout((await agent.get('/')).text);
  assert.deepEqual(page.order, order);
  assert.deepEqual(page.hidden, ['cards']);
});

test('invalid layouts are refused and change nothing', async () => {
  const { agent } = await signedInStudent();
  const good = ['events', 'hero', 'jump', 'cards', 'clubs', 'service', 'links'];
  await agent.put('/api/home-layout').send({ order: good, hidden: [] });

  const bad = [
    { order: good.slice(1), hidden: [] },
    { order: [...good.slice(1), 'jump'], hidden: [] },
    { order: [...good.slice(1), 'banner'], hidden: [] },
    { order: good, hidden: ['nope'] },
    { order: good, hidden: ['jump', 'jump'] },
    { order: 'jump', hidden: [] },
    { order: good },
  ];
  for (const body of bad) {
    assert.equal((await agent.put('/api/home-layout').send(body)).status, 400, JSON.stringify(body));
  }
  assert.deepEqual((await agent.get('/api/home-layout')).body.layout.order, good);
});

test('reset puts a student back on the standard layout', async () => {
  const { agent } = await signedInStudent();
  await agent.put('/api/home-layout').send({ order: [...DEFAULT_ORDER].reverse(), hidden: ['clubs'] });
  const res = await agent.delete('/api/home-layout');
  assert.equal(res.status, 200);
  assert.deepEqual((await agent.get('/api/home-layout')).body.layout, STANDARD);
});

test("one student's layout does not change another's", async () => {
  const a = await signedInStudent();
  const b = await signedInStudent();
  await a.agent.put('/api/home-layout').send({ order: [...DEFAULT_ORDER].reverse(), hidden: ['jump'] });
  assert.deepEqual((await b.agent.get('/api/home-layout')).body.layout, STANDARD);
});

test('a widget added to the site later still shows for students with an older saved layout', () => {
  const layout = resolveLayout({ order: ['links', 'jump'], hidden: ['ghost'] });
  assert.deepEqual(layout.order, ['links', 'jump', 'hero', 'events', 'cards', 'clubs', 'service']);
  assert.deepEqual(layout.hidden, []);
});

test('removing a student also removes their saved layout', async () => {
  const { agent, id } = await signedInStudent();
  await agent.put('/api/home-layout').send({ order: [...DEFAULT_ORDER].reverse(), hidden: [] });
  assert.ok(db.getHomeLayout(id));
  db.removeStudent(id);
  assert.equal(db.getHomeLayout(id), null);
});

test('hiding every widget still leaves the page and a way back', async () => {
  const { agent } = await signedInStudent();
  await agent.put('/api/home-layout').send({ order: DEFAULT_ORDER, hidden: DEFAULT_ORDER });
  const html = (await agent.get('/')).text;
  assert.deepEqual(pageLayout(html).hidden, DEFAULT_ORDER);
  assert.match(html, /Everything is hidden/);
  assert.match(html, /Customize home page/);
});

test('the welcome banner can be hidden and moved like any other part of the page', async () => {
  const { agent } = await signedInStudent();
  const order = ['jump', 'events', 'cards', 'clubs', 'service', 'links', 'hero'];
  await agent.put('/api/home-layout').send({ order, hidden: [] });
  assert.equal(pageLayout((await agent.get('/')).text).order.at(-1), 'hero', 'the banner is now last');

  await agent.put('/api/home-layout').send({ order, hidden: ['hero'] });
  const html = (await agent.get('/')).text;
  assert.deepEqual(pageLayout(html).hidden, ['hero']);
  assert.match(html, /Customize home page/, 'the Customize button is always there');
});

test('every widget has its content on the page, hidden or not, so edit mode can show it again', async () => {
  const { agent } = await signedInStudent();
  await agent.put('/api/home-layout').send({ order: DEFAULT_ORDER, hidden: ['clubs'] });
  const html = (await agent.get('/')).text;
  assert.match(html, /<div class="home-widget is-hidden" data-widget="clubs"[^>]*>[\s\S]*<h2>Clubs<\/h2>/);
});
// ---- What is inside each section ----

const base = (settings) => ({ order: DEFAULT_ORDER, hidden: [], settings });
const fromPage = (html, id) => {
  const m = html.match(new RegExp('<div class="home-widget[^"]*" data-widget="' + id + '"[^>]*data-settings="([^"]*)"'));
  return m ? JSON.parse(m[1].replace(/&#34;/g, '"').replace(/&quot;/g, '"')) : null;
};

test('every section starts with its standard content options', async () => {
  const { agent } = await signedInStudent();
  const html = (await agent.get('/')).text;
  Object.keys(DEFAULT_SETTINGS).forEach((id) => assert.deepEqual(fromPage(html, id), DEFAULT_SETTINGS[id], id));
});

test('chosen content options are saved and drawn: tiles, cards and the banner', async () => {
  const { agent } = await signedInStudent();
  const put = await agent.put('/api/home-layout').send(base({
    jump: { tiles: ['council', 'lunch', 'community'] },
    cards: { lunch: false, slide: true },
    hero: { showDate: false, showButtons: false },
    events: { count: 6 },
    clubs: { type: 'after-school', count: 8 },
    service: { count: 2 },
  }));
  assert.equal(put.status, 200);

  const html = (await agent.get('/')).text;
  const tiles = [...html.matchAll(/class="home-tile" href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tiles, ['/meet-council', '/lunch-schedule', '/community-service'], 'only the chosen tiles, in the order chosen');
  assert.ok(!html.includes('id="home-lunch-media"'), 'the lunch card is gone');
  assert.ok(html.includes('id="home-slide-card"'), 'the slide card stays');
  assert.match(html, /home-duo home-duo-single/, 'one card fills the row');
  assert.ok(!html.includes('id="today-date"'), 'no date in the banner');
  assert.ok(!html.includes('home-hero-actions'), 'no buttons in the banner');
  assert.deepEqual(fromPage(html, 'events'), { count: 6, showSubtitle: true });
  assert.deepEqual(fromPage(html, 'clubs'), { ...DEFAULT_SETTINGS.clubs, type: 'after-school', count: 8 });
  assert.deepEqual(fromPage(html, 'service'), { count: 2, showDescription: true });
});

test('saving without content options keeps the ones already saved', async () => {
  const { agent } = await signedInStudent();
  await agent.put('/api/home-layout').send(base({ events: { count: 5 } }));
  await agent.put('/api/home-layout').send({ order: [...DEFAULT_ORDER].reverse(), hidden: [] });
  const layout = (await agent.get('/api/home-layout')).body.layout;
  assert.equal(layout.settings.events.count, 5);
  assert.equal(layout.order[0], [...DEFAULT_ORDER].reverse()[0], 'the saved order is kept too');
});

test('a quick links choice is kept: some links, or all of them', async () => {
  const { agent } = await signedInStudent();
  await agent.put('/api/home-layout').send(base({ links: { ids: ['a', 'b'] } }));
  assert.deepEqual((await agent.get('/api/home-layout')).body.layout.settings.links, { ids: ['a', 'b'], order: [] });
  await agent.put('/api/home-layout').send(base({ links: { ids: null } }));
  assert.deepEqual((await agent.get('/api/home-layout')).body.layout.settings.links, { ids: null, order: [] });
});

test('content options outside the allowed choices are refused and change nothing', async () => {
  const { agent } = await signedInStudent();
  const bad = [
    { events: { count: 0 } },
    { events: { count: 11 } },
    { events: { count: '3' } },
    { service: { count: 6 } },
    { clubs: { type: 'sports' } },
    { clubs: { count: 2 } },
    { jump: { tiles: [] } },
    { jump: { tiles: ['nowhere'] } },
    { jump: { tiles: ['lunch', 'lunch'] } },
    { cards: { lunch: false, slide: false } },
    { hero: { showDate: 'yes' } },
    { links: { ids: 'all' } },
    { links: { ids: [123] } },
    { links: { order: 'a,b' } },
    { links: { order: ['a', 'a'] } },
    { clubs: { order: [1] } },
    { clubs: { showNames: 'yes' } },
    { cards: { order: ['lunch', 'banner'] } },
    { cards: { order: ['lunch', 'lunch'] } },
    { hero: { showCrest: 1 } },
    { hero: { buttons: ['clubs', 'nowhere'] } },
    { hero: { buttons: ['slide', 'lunch', 'clubs', 'voice', 'links'] } },
    { hero: { buttons: ['lunch', 'lunch'] } },
    { hero: { buttons: 'lunch' } },
    { events: { showSubtitle: 'no' } },
    { service: { showDescription: null } },
    { banner: { x: 1 } },
  ];
  for (const settings of bad) {
    assert.equal((await agent.put('/api/home-layout').send(base(settings))).status, 400, JSON.stringify(settings));
  }
  assert.equal((await agent.put('/api/home-layout').send({ ...base({}), settings: [] })).status, 400);
  assert.deepEqual((await agent.get('/api/home-layout')).body.layout, STANDARD);
});

test('reset also puts every section back to its standard content', async () => {
  const { agent } = await signedInStudent();
  await agent.put('/api/home-layout').send(base({ events: { count: 9 }, hero: { showDate: false } }));
  await agent.delete('/api/home-layout');
  assert.deepEqual((await agent.get('/api/home-layout')).body.layout.settings, DEFAULT_SETTINGS);
});

test('a stored option that is no longer valid falls back to the standard one', () => {
  const layout = resolveLayout({ order: DEFAULT_ORDER, hidden: [], settings: { events: { count: 500 }, clubs: { type: 'all', count: 6 } } });
  assert.deepEqual(layout.settings.events, DEFAULT_SETTINGS.events);
  assert.deepEqual(layout.settings.clubs, { ...DEFAULT_SETTINGS.clubs, count: 6 });
});
test('dragged item orders are kept: jump tiles and cards are drawn in the order chosen', async () => {
  const { agent } = await signedInStudent();
  const put = await agent.put('/api/home-layout').send(base({
    jump: { tiles: ['links', 'lunch', 'announcements'] },
    cards: { order: ['slide', 'lunch'] },
  }));
  assert.equal(put.status, 200);

  const html = (await agent.get('/')).text;
  const tiles = [...html.matchAll(/class="home-tile" href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tiles, ['/quick-links', '/lunch-schedule', '/announcements']);
  assert.ok(html.indexOf('id="home-slide-card"') < html.indexOf('<a class="home-feature" href="/lunch-schedule"'), 'the slide card comes first');
  assert.deepEqual((await agent.get('/api/home-layout')).body.layout.settings.cards.order, ['slide', 'lunch']);
});

test('a card order always keeps both cards, even when one is left out of it', async () => {
  const { agent } = await signedInStudent();
  await agent.put('/api/home-layout').send(base({ cards: { order: ['slide'] } }));
  assert.deepEqual((await agent.get('/api/home-layout')).body.layout.settings.cards.order, ['slide', 'lunch']);
});

test('club and quick link orders are saved, and the new on/off options too', async () => {
  const { agent } = await signedInStudent();
  const put = await agent.put('/api/home-layout').send(base({
    clubs: { order: ['c2', 'c1'], showNames: false, showMore: false },
    links: { order: ['l3', 'l1'] },
    hero: { showCrest: false },
    events: { showSubtitle: false },
    service: { showDescription: false },
  }));
  assert.equal(put.status, 200);
  const settings = (await agent.get('/api/home-layout')).body.layout.settings;
  assert.deepEqual(settings.clubs, { ...DEFAULT_SETTINGS.clubs, order: ['c2', 'c1'], showNames: false, showMore: false });
  assert.deepEqual(settings.links, { ids: null, order: ['l3', 'l1'] });
  assert.equal(settings.hero.showCrest, false);
  assert.equal(settings.events.showSubtitle, false);
  assert.equal(settings.service.showDescription, false);

  const html = (await agent.get('/')).text;
  assert.ok(!html.includes('home-hero-crest'), 'the crest is gone from the banner');
});

test('the banner buttons are chosen from the list and drawn in the order chosen', async () => {
  const { agent } = await signedInStudent();
  const put = await agent.put('/api/home-layout').send(base({ hero: { buttons: ['clubs', 'slide', 'community', 'council'] } }));
  assert.equal(put.status, 200);

  const html = (await agent.get('/')).text;
  const actions = html.match(/<div class="home-hero-actions"[\s\S]*?<\/div>/)[0];
  const hrefs = [...actions.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ['/clubs', '/announcements', '/community-service', '/meet-council']);
  assert.match(actions, /home-pill-light" href="\/clubs"/, 'the first button is the filled one');
  assert.equal((actions.match(/id="hero-slide-link"/g) || []).length, 1, 'the slide button keeps its link to this week\'s slide');
});

test('the banner can have no buttons at all, and the choice list is offered to the editor', async () => {
  const { agent } = await signedInStudent();
  assert.equal((await agent.put('/api/home-layout').send(base({ hero: { buttons: [] } }))).status, 200);
  assert.ok(!(await agent.get('/')).text.includes('home-hero-actions'));
  const offered = (await agent.get('/api/home-layout')).body;
  assert.equal(offered.heroButtons.length, 9, 'the slide plus the eight pages');
  assert.equal(offered.heroButtonMax, 4);
});

test('the preview draws one section with options that are not saved, and saves nothing', async () => {
  const { agent } = await signedInStudent();
  const res = await agent.post('/api/home-layout/preview').send({ widget: 'jump', settings: { tiles: ['council', 'lunch'] } });
  assert.equal(res.status, 200);
  const tiles = [...res.body.html.matchAll(/class="home-tile" href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tiles, ['/meet-council', '/lunch-schedule']);
  assert.deepEqual(res.body.settings.tiles, ['council', 'lunch']);

  // The banner is drawn with the student's own name and the chosen buttons.
  const hero = await agent.post('/api/home-layout/preview').send({ widget: 'hero', settings: { buttons: ['clubs'], showCrest: false } });
  assert.match(hero.body.html, /Welcome back, /);
  assert.ok(!hero.body.html.includes('home-hero-crest'));
  assert.match(hero.body.html, /href="\/clubs"/);

  assert.deepEqual((await agent.get('/api/home-layout')).body.layout, STANDARD, 'nothing was saved');
});

test('a preview with options outside the allowed choices is refused, and it needs a signed-in student', async () => {
  const { agent } = await signedInStudent();
  assert.equal((await agent.post('/api/home-layout/preview').send({ widget: 'events', settings: { count: 99 } })).status, 400);
  assert.equal((await agent.post('/api/home-layout/preview').send({ widget: 'banner', settings: {} })).status, 400);
  assert.equal((await agent.post('/api/home-layout/preview').send({ widget: '../pages/home', settings: {} })).status, 400);
  assert.equal((await request(app).post('/api/home-layout/preview').send({ widget: 'jump', settings: {} })).status, 401);
});