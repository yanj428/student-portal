// Every part of the home page a student can show, hide and reorder, and the
// content options each one has.
const WIDGETS = [
  { id: 'hero', title: 'Welcome banner' },
  { id: 'jump', title: 'Jump to' },
  { id: 'links', title: 'Quick links' },
  { id: 'events', title: 'Coming up' },
  { id: 'cards', title: 'Lunch and slide' },
  { id: 'clubs', title: 'Clubs' },
  { id: 'service', title: 'Community service' },
];

// The tiles the "Jump to" section can show, in the order they are drawn.
const JUMP_TILES = [
  { id: 'announcements', title: 'Announcements' },
  { id: 'lunch', title: 'Lunch' },
  { id: 'calendar', title: 'Calendar' },
  { id: 'clubs', title: 'Clubs' },
  { id: 'voice', title: 'Student Voice' },
  { id: 'links', title: 'Quick Links' },
  { id: 'community', title: 'Community Service' },
  { id: 'council', title: 'Meet Your Council' },
];

const CLUB_TYPES = ['all', 'community-service', 'after-school'];

const DEFAULT_SETTINGS = {
  hero: { showDate: true, showButtons: true },
  jump: { tiles: ['announcements', 'lunch', 'calendar', 'clubs', 'voice', 'links'] },
  events: { count: 3 },
  cards: { lunch: true, slide: true },
  clubs: { type: 'all', count: 5 },
  service: { count: 3 },
  links: { ids: null }, // null = every quick link
};

const IDS = WIDGETS.map((w) => w.id);
const isKnown = (id) => typeof id === 'string' && IDS.includes(id);
const TILE_IDS = JUMP_TILES.map((t) => t.id);

const isBool = (v) => typeof v === 'boolean';
const isIntBetween = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

function pick(obj, keys) {
  const out = {};
  if (obj && typeof obj === 'object') keys.forEach((k) => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

// One validator per widget. Each takes what was sent, fills anything missing
// from `base`, and returns { settings } or { error }. Anything it does not
// know about is dropped, so only these options can ever be stored.
const VALIDATORS = {
  hero(input, base) {
    const s = { ...base, ...pick(input, ['showDate', 'showButtons']) };
    if (!isBool(s.showDate) || !isBool(s.showButtons)) return { error: 'The banner options must be on or off.' };
    return { settings: { showDate: s.showDate, showButtons: s.showButtons } };
  },
  jump(input, base) {
    const tiles = input && input.tiles !== undefined ? input.tiles : base.tiles;
    if (!Array.isArray(tiles) || !tiles.every((t) => TILE_IDS.includes(t)) || new Set(tiles).size !== tiles.length) {
      return { error: 'Choose tiles from the list, each at most once.' };
    }
    if (tiles.length === 0) return { error: 'Keep at least one tile, or hide the section instead.' };
    return { settings: { tiles: TILE_IDS.filter((t) => tiles.includes(t)) } };
  },
  events(input, base) {
    const count = input && input.count !== undefined ? input.count : base.count;
    if (!isIntBetween(count, 1, 10)) return { error: 'Show between 1 and 10 events.' };
    return { settings: { count } };
  },
  cards(input, base) {
    const s = { ...base, ...pick(input, ['lunch', 'slide']) };
    if (!isBool(s.lunch) || !isBool(s.slide)) return { error: 'The cards must be on or off.' };
    if (!s.lunch && !s.slide) return { error: 'Keep at least one card, or hide the section instead.' };
    return { settings: { lunch: s.lunch, slide: s.slide } };
  },
  clubs(input, base) {
    const s = { ...base, ...pick(input, ['type', 'count']) };
    if (!CLUB_TYPES.includes(s.type)) return { error: 'Choose all clubs, community service clubs or after school clubs.' };
    if (!isIntBetween(s.count, 3, 12)) return { error: 'Show between 3 and 12 clubs.' };
    return { settings: { type: s.type, count: s.count } };
  },
  service(input, base) {
    const count = input && input.count !== undefined ? input.count : base.count;
    if (!isIntBetween(count, 1, 5)) return { error: 'Show between 1 and 5 posts.' };
    return { settings: { count } };
  },
  links(input, base) {
    const ids = input && input.ids !== undefined ? input.ids : base.ids;
    if (ids === null) return { settings: { ids: null } };
    if (!Array.isArray(ids) || ids.length > 100 || !ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64) || new Set(ids).size !== ids.length) {
      return { error: 'Choose quick links from the list.' };
    }
    return { settings: { ids } };
  },
};

// Saved settings turned into the full set: anything missing or no longer valid
// falls back to the standard value for that widget.
function resolveSettings(saved) {
  const out = {};
  IDS.forEach((id) => {
    const result = VALIDATORS[id](saved && saved[id], DEFAULT_SETTINGS[id]);
    out[id] = result.error ? { ...DEFAULT_SETTINGS[id] } : result.settings;
  });
  return out;
}

// A saved layout turned into the full, safe picture: every widget appears once
// in the saved order, and any widget added to the site later is appended in
// its standard place instead of silently missing from the student's page.
function resolveLayout(saved) {
  const savedOrder = saved && Array.isArray(saved.order) ? saved.order.filter(isKnown) : [];
  const order = [...new Set(savedOrder)];
  IDS.forEach((id) => {
    if (!order.includes(id)) order.push(id);
  });
  const hidden = saved && Array.isArray(saved.hidden) ? [...new Set(saved.hidden.filter(isKnown))] : [];
  return { order, hidden, settings: resolveSettings(saved && saved.settings) };
}

// What a student sends when saving. `current` is their already-saved layout;
// any content option the request leaves out stays as it was.
// Returns { layout } or { error }.
function validateLayoutInput(body, current) {
  const { order, hidden, settings } = body || {};
  if (!Array.isArray(order) || !Array.isArray(hidden)) return { error: 'Send the widget order and the hidden widgets as lists.' };
  if (order.length !== IDS.length || new Set(order).size !== IDS.length || !order.every(isKnown)) {
    return { error: 'The order must list every widget exactly once.' };
  }
  if (!hidden.every(isKnown) || new Set(hidden).size !== hidden.length) return { error: 'The hidden widgets must be known widgets, listed once each.' };

  if (settings !== undefined && (settings === null || typeof settings !== 'object' || Array.isArray(settings))) {
    return { error: 'The content options must be an object.' };
  }
  if (settings && Object.keys(settings).some((k) => !isKnown(k))) return { error: 'Unknown section in the content options.' };

  const base = resolveSettings(current && current.settings);
  const merged = {};
  for (const id of IDS) {
    const result = VALIDATORS[id](settings ? settings[id] : undefined, base[id]);
    if (result.error) return { error: `${WIDGETS.find((w) => w.id === id).title}: ${result.error}` };
    merged[id] = result.settings;
  }
  return { layout: { order, hidden, settings: merged } };
}

module.exports = { WIDGETS, JUMP_TILES, DEFAULT_SETTINGS, resolveLayout, validateLayoutInput };
