import { escapeHtml, getJSON, ITEM_ACTIONS_HTML } from './api.js';
import { crudPanel } from './crud.js';
import { bindViewMore } from './viewMore.js';

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
const advisorInput = document.getElementById('club-advisor');
const signupInput = document.getElementById('club-signup');
const typeFieldGroups = document.querySelectorAll('.club-type-fields');

const LISTS = {
  'community-service': {
    listEl: document.getElementById('club-list-community-service'),
    emptyEl: document.getElementById('club-empty-community-service'),
    toggle: document.getElementById('club-community-service-toggle'),
    body: document.getElementById('club-community-service-body'),
  },
  'after-school': {
    listEl: document.getElementById('club-list-after-school'),
    emptyEl: document.getElementById('club-empty-after-school'),
    toggle: document.getElementById('club-after-school-toggle'),
    body: document.getElementById('club-after-school-body'),
  },
};
Object.values(LISTS).forEach(({ toggle, body }) => bindViewMore(toggle, body));

const currentType = () => document.querySelector('input[name="club-type"]:checked').value;

function updateVisibleFields() {
  typeFieldGroups.forEach((group) => {
    group.hidden = group.dataset.for !== currentType();
  });
}
typeRadios.forEach((r) => r.addEventListener('change', updateVisibleFields));
updateVisibleFields();

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
    sdgsInput.value = club.sdgs.join(', ');
    leadersInput.value = club.leaders;
    contactsInput.value = club.contacts;
    instagramInput.value = club.instagramUrl;
    applicationInput.value = club.applicationFormUrl;
    scheduleInput.value = club.schedule;
    advisorInput.value = club.advisor;
    signupInput.value = club.signupUrl;
    logoInput.value = '';
    removeLogoInput.checked = false;
    removeLogoRow.hidden = !club.logoUrl;
  },
  onReset: () => {
    updateVisibleFields();
    removeLogoRow.hidden = true;
  },
  reload: () => loadClubs(),
});

function metaHtml(club) {
  const link = (url, label) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${label}</a>`;
  return [
    club.advisor ? `<span>Advisor: ${escapeHtml(club.advisor)}</span>` : '',
    club.instagramUrl ? link(club.instagramUrl, 'Instagram') : '',
    club.applicationFormUrl ? link(club.applicationFormUrl, 'Application form') : '',
    club.schedule ? `<span>${escapeHtml(club.schedule)}</span>` : '',
    club.signupUrl ? link(club.signupUrl, 'Sign-up link') : '',
  ].join('');
}

export async function loadClubs() {
  const data = await getJSON('/api/admin/clubs');
  if (!data) return;

  Object.entries(LISTS).forEach(([type, { listEl, emptyEl }]) => {
    listEl.querySelectorAll('.simple-item').forEach((el) => el.remove());
    const clubs = data.clubs.filter((c) => c.type === type);
    emptyEl.hidden = clubs.length > 0;

    clubs.forEach((club) => {
      const meta = metaHtml(club);
      const div = document.createElement('div');
      div.className = 'simple-item';
      div.innerHTML = `
        <div class="simple-item-head">
          <div class="item-identity">
            ${club.logoUrl ? `<img class="item-logo" src="${escapeHtml(club.logoUrl)}" alt="" />` : ''}
            <span class="simple-item-title">${escapeHtml(club.name)}</span>
          </div>
          ${ITEM_ACTIONS_HTML}
        </div>
        ${club.mission ? `<p class="simple-item-body">${escapeHtml(club.mission)}</p>` : ''}
        ${meta ? `<div class="item-meta">${meta}</div>` : ''}
      `;
      panel.bindRow(div, club, `Remove "${club.name}"?`);
      listEl.appendChild(div);
    });
  });
}
