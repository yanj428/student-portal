function mcEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  // See voice.js's copy of this helper for why quotes need handling
  // separately from the &/</> the textContent/innerHTML round-trip covers.
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const MC_PERSON_ICON = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="1.7"/><path d="M4.5 19C4.5 15.4 7.4 12.5 11 12.5H13C16.6 12.5 19.5 15.4 19.5 19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

const LEADERSHIP_ROLES = ['president', 'vice president'];
const isAdvisor = (role) => (role || '').trim().toLowerCase().includes('advisor');
const isLeadership = (role) => LEADERSHIP_ROLES.includes((role || '').trim().toLowerCase());

function renderCouncilCard(member) {
  const article = document.createElement('article');
  article.className = 'council-page-card';
  article.innerHTML = `
    <div class="council-page-avatar${member.photoUrl ? ' has-photo' : ''}">${
      member.photoUrl ? `<img src="${mcEscapeHtml(member.photoUrl)}" alt="${mcEscapeHtml(member.name || '')}" />` : MC_PERSON_ICON
    }</div>
    <h3>${mcEscapeHtml(member.name || '')}</h3>
    ${member.grade ? `<p class="council-page-grade">${mcEscapeHtml(member.grade)}</p>` : ''}
    ${member.role ? `<p class="council-page-role">${mcEscapeHtml(member.role)}</p>` : ''}
  `;
  return article;
}

function buildGrid(members, narrow) {
  const grid = document.createElement('div');
  grid.className = narrow ? 'council-page-grid council-page-grid-narrow' : 'council-page-grid';
  members.forEach((member) => grid.appendChild(renderCouncilCard(member)));
  return grid;
}

function buildSubtier(members) {
  if (members.length === 0) return null;
  const wrap = document.createElement('div');
  wrap.className = 'council-subtier';
  wrap.appendChild(buildGrid(members, true));
  return wrap;
}

function buildStem(extraClass) {
  const stem = document.createElement('div');
  stem.className = extraClass ? `council-tier-stem ${extraClass}` : 'council-tier-stem';
  return stem;
}

// A Student Council tier is broken into three sub-groups stacked vertically —
// advisor(s), then President/Vice President, then everyone else — each only
// appearing if it actually has members, so a school with no advisor on file
// doesn't show an empty "Advisor" slot.
function buildStudentCouncilTier(label, members) {
  if (members.length === 0) return null;

  const advisors = members.filter((m) => isAdvisor(m.role));
  const leadership = members.filter((m) => !isAdvisor(m.role) && isLeadership(m.role));
  const others = members.filter((m) => !isAdvisor(m.role) && !isLeadership(m.role));

  const tier = document.createElement('div');
  tier.className = 'council-tier';
  tier.innerHTML = `<div class="council-tier-label">${mcEscapeHtml(label)}</div>`;
  tier.appendChild(buildStem());

  const subtiers = [buildSubtier(advisors), buildSubtier(leadership), buildSubtier(others)];
  subtiers.filter(Boolean).forEach((subtier, index, arr) => {
    tier.appendChild(subtier);
    if (index < arr.length - 1) tier.appendChild(buildStem('council-subtier-connector'));
  });

  return tier;
}

function buildFlatTier(label, members) {
  if (members.length === 0) return null;
  const tier = document.createElement('div');
  tier.className = 'council-tier';
  tier.innerHTML = `<div class="council-tier-label">${mcEscapeHtml(label)}</div>`;
  tier.appendChild(buildStem());
  tier.appendChild(buildGrid(members, false));
  return tier;
}

async function loadCouncilPage() {
  const res = await fetch('/api/council');
  if (!res.ok) return;
  const { council } = await res.json();

  const treeEl = document.getElementById('council-tree');
  const overallEmptyEl = document.getElementById('council-page-empty');
  overallEmptyEl.hidden = council.length > 0;
  treeEl.hidden = council.length === 0;
  treeEl.innerHTML = '';

  const byBucket = (level, group) => council.filter((m) => (m.level === 'ms' ? 'ms' : 'hs') === level && (m.group === 'general-council' ? 'general-council' : 'student-council') === group);

  const tiers = [
    buildStudentCouncilTier('HS Student Council', byBucket('hs', 'student-council')),
    buildStudentCouncilTier('MS Student Council', byBucket('ms', 'student-council')),
    buildFlatTier('HS General Council', byBucket('hs', 'general-council')),
    buildFlatTier('MS General Council', byBucket('ms', 'general-council')),
  ].filter(Boolean);

  tiers.forEach((tier, index) => {
    treeEl.appendChild(tier);
    if (index < tiers.length - 1) treeEl.appendChild(buildStem('council-tree-connector'));
  });
}

loadCouncilPage();
