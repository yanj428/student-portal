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

// The buttons the welcome banner can show (up to four): this week's slide, plus
// the same pages as the Jump to tiles.
const HERO_BUTTONS = [{ id: 'slide', title: "This week's slide" }, ...JUMP_TILES];
const HERO_BUTTON_MAX = 4;

const CLUB_TYPES = ['all', 'community-service', 'after-school'];

const CARD_IDS = ['lunch', 'slide'];

// order lists hold ids in the order the student dragged them into. An id that is
// not in the list (a link or club added later) simply goes after the ones that are.
const DEFAULT_SETTINGS = {
  hero: { showDate: true, showButtons: true, showCrest: true, buttons: ['lunch'] }, // buttons in the order shown (this week's slide is the Announcements page's job now)
  jump: { tiles: ['announcements', 'lunch', 'calendar', 'clubs', 'voice', 'links'] }, // in the order shown
  events: { count: 3, showSubtitle: true },
  cards: { lunch: true, slide: false, order: CARD_IDS }, // the slide card is off unless a student turns it on
  clubs: { type: 'all', count: 5, showNames: true, showMore: true, order: [] },
  service: { count: 3, showDescription: true },
  links: { ids: null, order: [] }, // ids: null = every quick link
};

const IDS = WIDGETS.map((w) => w.id);
const isKnown = (id) => typeof id === 'string' && IDS.includes(id);
const TILE_IDS = JUMP_TILES.map((t) => t.id);
const HERO_BUTTON_IDS = HERO_BUTTONS.map((b) => b.id);

const isBool = (v) => typeof v === 'boolean';
const isIdList = (v) => Array.isArray(v) && v.length <= 200 && v.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64) && new Set(v).size === v.length;
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
    const s = { ...base, ...pick(input, ['showDate', 'showButtons', 'showCrest', 'buttons']) };
    if (!isBool(s.showDate) || !isBool(s.showButtons) || !isBool(s.showCrest)) return { error: 'The banner options must be on or off.' };
    if (!isIdList(s.buttons) || !s.buttons.every((id) => HERO_BUTTON_IDS.includes(id)) || s.buttons.length > HERO_BUTTON_MAX) {
      return { error: "Choose up to " + HERO_BUTTON_MAX + " banner buttons from the list." };
    }
    return { settings: { showDate: s.showDate, showButtons: s.showButtons, showCrest: s.showCrest, buttons: s.buttons } };
  },
  jump(input, base) {
    const tiles = input && input.tiles !== undefined ? input.tiles : base.tiles;
    if (!Array.isArray(tiles) || !tiles.every((t) => TILE_IDS.includes(t)) || new Set(tiles).size !== tiles.length) {
      return { error: 'Choose tiles from the list, each at most once.' };
    }
    if (tiles.length === 0) return { error: 'Keep at least one tile, or hide the section instead.' };
    return { settings: { tiles } };
  },
  events(input, base) {
    const s = { ...base, ...pick(input, ['count', 'showSubtitle']) };
    if (!isIntBetween(s.count, 1, 10)) return { error: 'Show between 1 and 10 events.' };
    if (!isBool(s.showSubtitle)) return { error: 'The event details must be on or off.' };
    return { settings: { count: s.count, showSubtitle: s.showSubtitle } };
  },
  cards(input, base) {
    const s = { ...base, ...pick(input, ['lunch', 'slide', 'order']) };
    if (!isBool(s.lunch) || !isBool(s.slide)) return { error: 'The cards must be on or off.' };
    if (!s.lunch && !s.slide) return { error: 'Keep at least one card, or hide the section instead.' };
    if (!isIdList(s.order) || !s.order.every((id) => CARD_IDS.includes(id))) return { error: 'The card order must list the lunch and slide cards.' };
    // Both cards always have a place in the order, even one that is switched off.
    return { settings: { lunch: s.lunch, slide: s.slide, order: [...s.order, ...CARD_IDS.filter((id) => !s.order.includes(id))] } };
  },
  clubs(input, base) {
    const s = { ...base, ...pick(input, ['type', 'count', 'showNames', 'showMore', 'order']) };
    if (!CLUB_TYPES.includes(s.type)) return { error: 'Choose all clubs, community service clubs or after school clubs.' };
    if (!isIntBetween(s.count, 3, 12)) return { error: 'Show between 3 and 12 clubs.' };
    if (!isBool(s.showNames) || !isBool(s.showMore)) return { error: 'The club options must be on or off.' };
    if (!isIdList(s.order)) return { error: 'The club order must be a list of clubs.' };
    return { settings: { type: s.type, count: s.count, showNames: s.showNames, showMore: s.showMore, order: s.order } };
  },
  service(input, base) {
    const s = { ...base, ...pick(input, ['count', 'showDescription']) };
    if (!isIntBetween(s.count, 1, 5)) return { error: 'Show between 1 and 5 posts.' };
    if (!isBool(s.showDescription)) return { error: 'The post details must be on or off.' };
    return { settings: { count: s.count, showDescription: s.showDescription } };
  },
  links(input, base) {
    const s = { ...base, ...pick(input, ['ids', 'order']) };
    if (!isIdList(s.order)) return { error: 'The quick link order must be a list of links.' };
    if (s.ids === null) return { settings: { ids: null, order: s.order } };
    if (!isIdList(s.ids) || s.ids.length > 100) return { error: 'Choose quick links from the list.' };
    return { settings: { ids: s.ids, order: s.order } };
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

// One section's options checked on their own, for the live preview in edit mode.
// \saved\ is the student's saved settings, used for anything the request leaves out.
// Returns { settings } or { error }.
function validateWidgetSettings(id, input, saved) {
  if (!isKnown(id)) return { error: 'Unknown section.' };
  const base = resolveSettings(saved)[id];
  const result = VALIDATORS[id](input, base);
  return result.error ? { error: WIDGETS.find((w) => w.id === id).title + ': ' + result.error } : result;
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

module.exports = { WIDGETS, JUMP_TILES, HERO_BUTTONS, HERO_BUTTON_MAX, DEFAULT_SETTINGS, resolveLayout, validateLayoutInput, validateWidgetSettings };
