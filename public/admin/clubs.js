import { escapeHtml, getJSON, TRASH_ICON, renderRows } from './api.js';
import { crudPanel } from './crud.js';
import { attachPhotoCropper } from './photoCrop.js';

const typeRadios = document.querySelectorAll('input[name="club-type"]');
const nameInput = document.getElementById('club-name');
const logoInput = document.getElementById('club-logo');
const removeLogoRow = document.getElementById('club-remove-logo-row');
const removeLogoInput = document.getElementById('club-remove-logo');
const missionInput = document.getElementById('club-mission');
const goalsInput = document.getElementById('club-goals');
const sdgsInput = document.getElementById('club-sdgs');
const leadersInput = document.getElementById('club-leaders');
const contactsInput = document.getElementById('club-contacts');
const instagramInput = document.getElementById('club-instagram');
const applicationInput = document.getElementById('club-application');
const scheduleInput = document.getElementById('club-schedule');
const meetingDayInput = document.getElementById('club-meeting-day');
const meetingTimeInput = document.getElementById('club-meeting-time');
const advisorInput = document.getElementById('club-advisor');
const signupInput = document.getElementById('club-signup');
const typeFieldGroups = document.querySelectorAll('.club-type-fields');

const LISTS = {
  'community-service': {
    listEl: document.getElementById('club-list-community-service'),
    emptyEl: document.getElementById('club-empty-community-service'),
    count: document.getElementById('club-count-community-service'),
  },
  'after-school': {
    listEl: document.getElementById('club-list-after-school'),
    emptyEl: document.getElementById('club-empty-after-school'),
    count: document.getElementById('club-count-after-school'),
  },
};
const typeSwitch = document.querySelectorAll('#club-type-switch button');
const searchInput = document.getElementById('club-search');
let shownType = 'community-service';
let allClubs = [];
const NONE_TEXT = Object.fromEntries(Object.entries(LISTS).map(([type, { emptyEl }]) => [type, emptyEl.textContent]));
const currentType = () => document.querySelector('input[name="club-type"]:checked').value;

function updateVisibleFields() {
  typeFieldGroups.forEach((group) => {
    group.hidden = group.dataset.for !== currentType();
  });
}
typeRadios.forEach((r) => r.addEventListener('change', updateVisibleFields));
updateVisibleFields();

attachPhotoCropper(logoInput);

// ---- UN goals: a tile for each of the 17, click to switch on or off ----
// The chosen numbers live in the hidden #club-sdgs box as "3, 4", which is what is sent.
const sdgPicker = document.getElementById('club-sdg-picker');
const sdgSummary = document.getElementById('club-sdg-summary');
let sdgGoals = [];
const chosenSdgs = () => sdgsInput.value.split(',').map((s) => Number(s.trim())).filter(Boolean);
function paintSdgs() {
  const chosen = chosenSdgs();
  sdgPicker.querySelectorAll('.sdg-tile').forEach((tile) => {
    const on = chosen.includes(Number(tile.dataset.n));
    tile.classList.toggle('on', on);
    tile.setAttribute('aria-pressed', String(on));
  });
  sdgSummary.textContent = chosen.length
    ? `Chosen: ${chosen.sort((a, b) => a - b).map((n) => `Goal ${n}`).join(', ')}`
    : 'No goal chosen.';
}
function setSdgs(numbers) {
  sdgsInput.value = [...new Set(numbers)].sort((a, b) => a - b).join(', ');
  paintSdgs();
}
sdgPicker.addEventListener('click', (e) => {
  const tile = e.target.closest('.sdg-tile');
  if (!tile) return;
  const n = Number(tile.dataset.n);
  const chosen = chosenSdgs();
  setSdgs(chosen.includes(n) ? chosen.filter((x) => x !== n) : [...chosen, n]);
});
getJSON('/api/admin/sdgs').then((data) => {
  if (!data) return;
  sdgGoals = data.goals;
  sdgPicker.innerHTML = sdgGoals.map((g) => `
    <button type="button" class="sdg-tile" data-n="${g.number}" aria-pressed="false" title="Goal ${g.number}: ${escapeHtml(g.name)}">
      ${g.url ? `<img src="/${escapeHtml(g.url)}" alt="Goal ${g.number}: ${escapeHtml(g.name)}" />` : `<span class="sdg-num">${g.number}</span>`}
      <span class="sdg-tick" aria-hidden="true">&#10003;</span>
    </button>`).join('');
  paintSdgs();
});

// ---- The form is four short steps; Save works on any of them ----
const form = document.getElementById('club-form');
const stepPanels = form.querySelectorAll('.form-step');
const stepTabs = form.querySelectorAll('#club-steps .step');
const backBtn = document.getElementById('club-back');
const nextBtn = document.getElementById('club-next');
let step = 1;
function showStep(n) {
  step = Math.min(4, Math.max(1, n));
  stepPanels.forEach((panelEl) => { panelEl.hidden = Number(panelEl.dataset.step) !== step; });
  stepTabs.forEach((tab) => tab.classList.toggle('on', Number(tab.dataset.go) === step));
  backBtn.hidden = step === 1;
  nextBtn.hidden = step === 4;
}
stepTabs.forEach((tab) => tab.addEventListener('click', () => showStep(Number(tab.dataset.go))));
backBtn.addEventListener('click', () => showStep(step - 1));
nextBtn.addEventListener('click', () => showStep(step + 1));
// A required box on a step that is not showing would block Save without a word, so go to it.
form.addEventListener('invalid', (e) => {
  const owner = e.target.closest('.form-step');
  if (owner) showStep(Number(owner.dataset.step));
}, true);
showStep(1);
const panel = crudPanel({
  form: document.getElementById('club-form'),
  submitBtn: document.getElementById('club-submit'),
  cancelBtn: document.getElementById('club-cancel-edit'),
  errorEl: document.getElementById('club-error'),
  endpoint: '/api/admin/clubs',
  addLabel: 'Add club',
  saveError: 'Could not save club.',
  readPayload: () => {
    const type = currentType();
    // Fields for the other club type are sent blank so a stale value left in
    // a hidden input can't block saving or stick around after a type change.
    const only = (forType, input) => (type === forType ? input.value.trim() : '');
    const fields = {
      type,
      name: nameInput.value.trim(),
      mission: missionInput.value.trim(),
      goals: goalsInput.value.trim(),
      sdgs: sdgsInput.value.trim(),
      leaders: leadersInput.value.trim(),
      contacts: contactsInput.value.trim(),
      instagramUrl: instagramInput.value.trim(),
      advisor: advisorInput.value.trim(),
      applicationFormUrl: only('community-service', applicationInput),
      schedule: only('after-school', scheduleInput),
      meetingDay: only('after-school', meetingDayInput),
      meetingTime: only('after-school', meetingTimeInput),
      signupUrl: only('after-school', signupInput),
    };
    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => formData.append(key, value));
    if (logoInput.files[0]) formData.append('logo', logoInput.files[0]);
    if (removeLogoInput.checked) formData.append('removeLogo', 'true');
    return formData;
  },
  fill: (club) => {
    document.querySelector(`input[name="club-type"][value="${club.type}"]`).checked = true;
    updateVisibleFields();
    nameInput.value = club.name;
    missionInput.value = club.mission;
    goalsInput.value = club.goals;
    setSdgs(club.sdgs);
    leadersInput.value = club.leaders;
    contactsInput.value = club.contacts;
    instagramInput.value = club.instagramUrl;
    applicationInput.value = club.applicationFormUrl;
    scheduleInput.value = club.schedule;
    meetingDayInput.value = club.meetingDay || '';
    meetingTimeInput.value = club.meetingTime || '';
    advisorInput.value = club.advisor;
    signupInput.value = club.signupUrl;
    logoInput.value = '';
    removeLogoInput.checked = false;
    removeLogoRow.hidden = !club.logoUrl;
    showStep(1);
  },
  onReset: () => {
    updateVisibleFields();
    setSdgs([]);
    removeLogoRow.hidden = true;
    showStep(1);
  },
  reload: () => loadClubs(),
});

const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase() || '?';

// A few small facts per club, and a note for what is still missing.
function chipsHtml(club) {
  const chip = (text, cls = '') => `<span class="chip${cls}">${escapeHtml(text)}</span>`;
  const when = [club.meetingDay, club.meetingTime].filter(Boolean).join(' · ');
  const chips = [
    club.leaders ? chip(`Leaders: ${club.leaders}`) : '',
    club.advisor ? chip(`Advisor: ${club.advisor}`) : '',
    club.sdgs && club.sdgs.length ? chip(`SDG ${club.sdgs.join(', ')}`) : '',
    club.type === 'after-school' && when ? chip(when) : '',
    club.type === 'after-school' && club.schedule ? chip(club.schedule) : '',
    club.type === 'community-service' && club.applicationFormUrl ? chip('Application open', ' ok') : '',
    club.type === 'after-school' && club.signupUrl ? chip('Sign-up open', ' ok') : '',
  ];
  const gaps = [
    !club.mission ? 'Needs mission' : '',
    !club.advisor ? 'No advisor' : '',
    club.type === 'after-school' && !when ? 'No meeting time' : '',
  ].filter(Boolean).map((text) => chip(text, ' warn'));
  return [...chips, ...gaps].join('');
}

function cardHtml(club) {
  return `
    <div class="club-actions">
      <button class="edit-btn" aria-label="Edit">Edit</button>
      <button class="delete-btn" aria-label="Remove">${TRASH_ICON}</button>
    </div>
    <div class="club-head">
      <div class="club-logo">${club.logoUrl ? `<img src="${escapeHtml(club.logoUrl)}" alt="" />` : escapeHtml(initials(club.name))}</div>
      <b class="club-name">${escapeHtml(club.name)}</b>
    </div>
    <p class="club-mission${club.mission ? '' : ' none'}">${club.mission ? escapeHtml(club.mission) : 'No mission yet'}</p>
    <div class="club-chips">${chipsHtml(club)}</div>`;
}

function renderClubs() {
  const query = searchInput.value.trim().toLowerCase();
  Object.entries(LISTS).forEach(([type, { listEl, emptyEl, count }]) => {
    const ofType = allClubs.filter((c) => c.type === type);
    count.textContent = ofType.length;
    const shown = ofType.filter((c) => !query || `${c.name} ${c.leaders} ${c.advisor} ${c.mission}`.toLowerCase().includes(query));
    emptyEl.textContent = query && ofType.length ? 'No clubs match your search.' : NONE_TEXT[type];
    renderRows(listEl, emptyEl, shown, (div, club) => {
      div.classList.add('club-card');
      div.innerHTML = cardHtml(club);
      panel.bindRow(div, club, `Remove "${club.name}"?`);
    });
    listEl.hidden = type !== shownType;
  });
}

typeSwitch.forEach((btn) => btn.addEventListener('click', () => {
  shownType = btn.dataset.type;
  typeSwitch.forEach((b) => b.classList.toggle('on', b === btn));
  renderClubs();
}));
searchInput.addEventListener('input', renderClubs);

export async function loadClubs() {
  const data = await getJSON('/api/admin/clubs');
  if (!data) return;
  allClubs = data.clubs;
  renderClubs();
}