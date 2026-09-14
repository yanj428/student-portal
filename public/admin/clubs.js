import { escapeHtml, sendForm, del } from './api.js';

const clubForm = document.getElementById('club-form');
const clubTypeRadios = document.querySelectorAll('input[name="club-type"]');
const clubNameInput = document.getElementById('club-name');
const clubLogoInput = document.getElementById('club-logo');
const clubDescriptionInput = document.getElementById('club-description');
const clubInstagramInput = document.getElementById('club-instagram');
const clubApplicationInput = document.getElementById('club-application');
const clubScheduleInput = document.getElementById('club-schedule');
const clubAdvisorInput = document.getElementById('club-advisor');
const clubSignupInput = document.getElementById('club-signup');
const clubError = document.getElementById('club-error');
const clubSubmit = document.getElementById('club-submit');
const clubCancelEdit = document.getElementById('club-cancel-edit');
const typeFieldGroups = document.querySelectorAll('.club-type-fields');

const listEls = {
  'community-service': document.getElementById('club-list-community-service'),
  'after-school': document.getElementById('club-list-after-school'),
};
const emptyEls = {
  'community-service': document.getElementById('club-empty-community-service'),
  'after-school': document.getElementById('club-empty-after-school'),
};

let editingClubId = null;

function currentType() {
  return document.querySelector('input[name="club-type"]:checked').value;
}

function updateVisibleFields() {
  const type = currentType();
  typeFieldGroups.forEach((group) => {
    group.hidden = group.dataset.for !== type;
  });
}
clubTypeRadios.forEach((r) => r.addEventListener('change', updateVisibleFields));
updateVisibleFields();

function resetClubForm() {
  editingClubId = null;
  clubForm.reset();
  updateVisibleFields();
  clubSubmit.textContent = 'Add club';
  clubCancelEdit.hidden = true;
}

export async function loadClubs() {
  const res = await fetch('/api/admin/clubs');
  if (!res.ok) return;
  const { clubs } = await res.json();
  renderClubs(clubs);
}

function clubCard(club) {
  const div = document.createElement('div');
  div.className = 'cs-club-item';
  const meta =
    club.type === 'community-service'
      ? [club.instagramUrl ? `<a href="${escapeHtml(club.instagramUrl)}" target="_blank" rel="noopener">Instagram</a>` : '', club.applicationFormUrl ? `<a href="${escapeHtml(club.applicationFormUrl)}" target="_blank" rel="noopener">Application form</a>` : '']
      : [club.schedule ? escapeHtml(club.schedule) : '', club.advisor ? `Advisor: ${escapeHtml(club.advisor)}` : '', club.signupUrl ? `<a href="${escapeHtml(club.signupUrl)}" target="_blank" rel="noopener">Sign-up link</a>` : ''];
  const metaHtml = meta.filter(Boolean).join(' · ');

  div.innerHTML = `
    <div class="cs-club-item-head">
      <div class="cs-club-item-identity">
        ${club.logoUrl ? `<img class="cs-club-item-logo" src="${escapeHtml(club.logoUrl)}" alt="" />` : ''}
        <span class="cs-club-item-name">${escapeHtml(club.name)}</span>
      </div>
      <div class="cs-club-item-actions">
        <button class="edit-btn" aria-label="Edit club">Edit</button>
        <button class="delete-btn" aria-label="Remove club"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
    </div>
    <p class="cs-club-item-body">${escapeHtml(club.description)}</p>
    ${metaHtml ? `<div class="cs-club-item-links">${metaHtml}</div>` : ''}
  `;

  div.querySelector('.edit-btn').addEventListener('click', () => {
    editingClubId = club.id;
    document.querySelector(`input[name="club-type"][value="${club.type}"]`).checked = true;
    updateVisibleFields();
    clubNameInput.value = club.name;
    clubDescriptionInput.value = club.description;
    clubInstagramInput.value = club.instagramUrl || '';
    clubApplicationInput.value = club.applicationFormUrl || '';
    clubScheduleInput.value = club.schedule || '';
    clubAdvisorInput.value = club.advisor || '';
    clubSignupInput.value = club.signupUrl || '';
    clubLogoInput.value = '';
    clubError.hidden = true;
    clubSubmit.textContent = 'Save changes';
    clubCancelEdit.hidden = false;
    clubForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  div.querySelector('.delete-btn').addEventListener('click', async () => {
    if (!confirm(`Remove "${club.name}"?`)) return;
    await del(`/api/admin/clubs/${club.id}`);
    if (editingClubId === club.id) resetClubForm();
    loadClubs();
  });

  return div;
}

function renderClubs(clubs) {
  for (const type of Object.keys(listEls)) {
    listEls[type].querySelectorAll('.cs-club-item').forEach((el) => el.remove());
    const typeClubs = clubs.filter((c) => c.type === type);
    emptyEls[type].hidden = typeClubs.length > 0;
    typeClubs.forEach((club) => listEls[type].appendChild(clubCard(club)));
  }
}

clubCancelEdit.addEventListener('click', () => resetClubForm());

clubForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clubError.hidden = true;
  clubSubmit.disabled = true;
  clubSubmit.textContent = editingClubId ? 'Saving…' : 'Adding…';

  try {
    const formData = new FormData();
    formData.append('type', currentType());
    formData.append('name', clubNameInput.value.trim());
    formData.append('description', clubDescriptionInput.value.trim());
    formData.append('instagramUrl', clubInstagramInput.value.trim());
    formData.append('applicationFormUrl', clubApplicationInput.value.trim());
    formData.append('schedule', clubScheduleInput.value.trim());
    formData.append('advisor', clubAdvisorInput.value.trim());
    formData.append('signupUrl', clubSignupInput.value.trim());
    if (clubLogoInput.files[0]) formData.append('logo', clubLogoInput.files[0]);

    const url = editingClubId ? `/api/admin/clubs/${editingClubId}` : '/api/admin/clubs';
    const { ok, data } = await sendForm(url, editingClubId ? 'PUT' : 'POST', formData);

    if (!ok) {
      clubError.textContent = data.error || 'Could not save club.';
      clubError.hidden = false;
      return;
    }

    resetClubForm();
    loadClubs();
  } catch {
    clubError.textContent = 'Could not reach the server. Please try again.';
    clubError.hidden = false;
  } finally {
    clubSubmit.disabled = false;
    clubSubmit.textContent = editingClubId ? 'Save changes' : 'Add club';
  }
});
