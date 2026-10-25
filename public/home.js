// Homepage widgets: each section is fetched on its own, so one failing
// endpoint doesn't blank out the rest. A student can hide any widget (see
// home-customize.js), so every loader first checks its section is on the page.

const HEART_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21C12 21 4 15.5 4 9.8C4 7.1 6.1 5 8.7 5C10 5 11.2 5.6 12 6.6C12.8 5.6 14 5 15.3 5C17.9 5 20 7.1 20 9.8C20 15.5 12 21 12 21Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const ARROW_ICON = '<svg class="home-feature-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12H19M13 6L19 12L13 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// What the student chose for a section's content (see home-customize.js); the
// server puts it on the section as data-settings.
function widgetSettings(id) {
  const el = document.querySelector('.home-widget[data-widget="' + id + '"]');
  try {
    return el ? JSON.parse(el.dataset.settings) : {};
  } catch {
    return {};
  }
}

// Puts items in the order the student dragged them into. An item that is not in
// the saved order (a link or club added later) goes after the ones that are.
function sortByOrder(items, order) {
  if (!Array.isArray(order) || order.length === 0) return items;
  const place = new Map(order.map((id, i) => [id, i]));
  const rank = (item) => (place.has(item.id) ? place.get(item.id) : order.length);
  return [...items].sort((a, b) => rank(a) - rank(b));
}

function initials(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Upcoming events: a big date block and a title, three at most.
async function loadEvents() {
  const el = document.getElementById('calendar-list');
  if (!el) return;
  const data = await fetchJson('/api/calendar-events');
  if (!data) return;
  const { count, showSubtitle } = widgetSettings('events');
  const events = data.calendarEvents.slice(0, count || 3);
  el.innerHTML = events.length
    ? events.map((e) => `
        <div class="home-event">
          <div class="home-date"><b>${escapeHtml(e.day)}</b><span>${escapeHtml(e.month)}</span></div>
          <div class="home-event-info">
            <h3>${escapeHtml(e.title)}</h3>
            ${e.subtitle && showSubtitle !== false ? `<p>${escapeHtml(e.subtitle)}</p>` : ''}
          </div>
        </div>`).join('')
    : '<p class="home-empty">Nothing coming up yet.</p>';
}

// Lunch picture and week label, and the weekly slide card + hero button.
async function loadLunchAndSlide() {
  const data = await fetchJson('/api/content');
  if (!data) return;

  const lunch = data.content.lunchSchedule || {};
  const media = document.getElementById('home-lunch-media');
  if (lunch.imageUrl && media && !/\.pdf$/i.test(lunch.imageUrl)) {
    media.innerHTML = `<img src="${escapeHtml(lunch.imageUrl)}" alt="This week's lunch menu" />`;
  }
  const lunchLabel = document.getElementById('home-lunch-label');
  if (lunch.weekLabel && lunchLabel) lunchLabel.textContent = lunch.weekLabel;

  const slide = data.content.weeklySlide || {};
  const slideLabel = document.getElementById('home-slide-label');
  if (slide.weekLabel && slideLabel) slideLabel.textContent = slide.weekLabel;
  // With a slide set, both the card and the hero button open it directly.
  if (slide.canvaEmbedUrl) {
    ['home-slide-card', 'hero-slide-link'].forEach((id) => {
      const link = document.getElementById(id);
      if (!link) return;
      link.href = slide.canvaEmbedUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
  }
}

// Clubs as round logos (initials when a club has no logo), the first few plus a "more" circle.
async function loadClubs() {
  const el = document.getElementById('clubs-list');
  if (!el) return;
  const { type, count, showNames, showMore, order } = widgetSettings('clubs');
  const data = await fetchJson(type && type !== 'all' ? '/api/clubs?type=' + encodeURIComponent(type) : '/api/clubs');
  if (!data) return;
  const clubs = sortByOrder(data.clubs, order);
  const CLUBS_SHOWN = count || 5;
  if (clubs.length === 0) {
    el.innerHTML = '<p class="home-empty">No clubs yet.</p>';
    return;
  }
  const shown = clubs.slice(0, CLUBS_SHOWN);
  const extra = clubs.length - shown.length;
  el.innerHTML =
    shown.map((c) => `
      <a class="home-club" href="/clubs" data-item-id="${escapeHtml(c.id)}" title="${escapeHtml(c.name)}">
        <span class="home-club-logo">${c.logoUrl ? `<img src="${escapeHtml(c.logoUrl)}" alt="" />` : escapeHtml(initials(c.name))}</span>
        ${showNames === false ? '' : `<span class="home-club-name">${nameWithBreaks(c.name)}</span>`}
      </a>`).join('') +
    (extra > 0 && showMore !== false
      ? `<a class="home-club" href="/clubs"><span class="home-club-logo home-club-more">+${extra}</span>${showNames === false ? '' : '<span class="home-club-name">More clubs</span>'}</a>`
      : '');
}

// The latest community service posts (three at most). The section always shows,
// with a friendly message when nothing has been posted yet.
async function loadCommunityService() {
  const el = document.getElementById('cs-events-list');
  if (!el) return;
  const data = await fetchJson('/api/cs-events');
  if (!data) return;
  const { count, showDescription } = widgetSettings('service');
  const events = data.events.slice(0, count || 3);
  el.innerHTML = events.length
    ? events.map((e) => `
        <a class="home-cs-card" href="/community-service">
          <span class="home-cs-icon${e.clubLogoUrl ? ' home-cs-logo' : ''}">${e.clubLogoUrl ? `<img src="${escapeHtml(e.clubLogoUrl)}" alt="" />` : HEART_ICON}</span>
          <span class="home-cs-info">
            <small>${escapeHtml(e.club || 'Community service')}${e.eventDate ? ` &middot; ${escapeHtml(e.eventDate)}` : ''}</small>
            <strong>${escapeHtml(e.title)}</strong>
            ${e.description && showDescription !== false ? `<span class="home-cs-desc">${escapeHtml(e.description)}</span>` : ''}
          </span>
          ${ARROW_ICON}
        </a>`).join('')
    : `<a class="home-cs-card home-cs-empty" href="/community-service">
         <span class="home-cs-icon">${HEART_ICON}</span>
         <span class="home-cs-info">
           <strong>No community service posts yet</strong>
           <span class="home-cs-desc">New volunteer events will show up here.</span>
         </span>
         ${ARROW_ICON}
       </a>`;
}

const LINK_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9.5 14.5L14.5 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M11 7.5L12.2 6.3C13.5 5 15.6 5 16.9 6.3C18.2 7.6 18.2 9.7 16.9 11L15.7 12.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M13 16.5L11.8 17.7C10.5 19 8.4 19 7.1 17.7C5.8 16.4 5.8 14.3 7.1 13L8.3 11.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

// Quick links as shortcut buttons: the chain-link icon, then the link's name.
// They open in a new tab, like the Quick Links page.
function linkCardHtml(q) {
  return `<a class="home-link-card" href="${escapeHtml(q.url)}" target="_blank" rel="noopener" data-item-id="${escapeHtml(q.id)}">${LINK_ICON}<span class="home-link-name">${escapeHtml(q.label)}</span></a>`;
}
// Quick links; hidden when there are none.
async function loadQuickLinks() {
  const section = document.getElementById('home-links-section');
  const list = document.getElementById('quicklinks-list');
  if (!section || !list) return;
  const data = await fetchJson('/api/quick-links');
  if (!data) return;
  // null means every link; otherwise only the ones the student picked
  const { ids, order } = widgetSettings('links');
  const links = sortByOrder(Array.isArray(ids) ? data.quickLinks.filter((q) => ids.includes(q.id)) : data.quickLinks, order);
  if (links.length === 0) return;
  list.innerHTML = links
    .map(linkCardHtml)
    .join('');
  section.hidden = false;
}

// Each section fills itself in from the server. They run once when the page
// loads, and again for one section whenever edit mode redraws it with options
// that are not saved yet (see home-customize.js).
const HOME_LOADERS = {
  events: loadEvents,
  cards: loadLunchAndSlide,
  clubs: loadClubs,
  service: loadCommunityService,
  links: loadQuickLinks,
};
Object.values(HOME_LOADERS).forEach((load) => load());

function refreshHomeWidget(id) {
  if (id === 'hero') {
    updateTodayDate();
    return loadLunchAndSlide(); // the banner's slide button opens this week's slide
  }
  return HOME_LOADERS[id] ? HOME_LOADERS[id]() : undefined;
}