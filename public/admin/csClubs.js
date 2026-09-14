import { escapeHtml, sendForm, del } from './api.js';

const csClubForm = document.getElementById('cs-club-form');
const csClubNameInput = document.getElementById('cs-club-name');
const csClubLogoInput = document.getElementById('cs-club-logo');
const csClubDescriptionInput = document.getElementById('cs-club-description');
const csClubInstagramInput = document.getElementById('cs-club-instagram');
const csClubApplicationInput = document.getElementById('cs-club-application');
const csClubError = document.getElementById('cs-club-error');
const csClubSubmit = document.getElementById('cs-club-submit');
const csClubCancelEdit = document.getElementById('cs-club-cancel-edit');
const csClubAdminList = document.getElementById('cs-club-admin-list');
const csClubEmptyHint = document.getElementById('cs-club-empty-hint');

let editingClubId = null;

function resetCsClubForm() {
  editingClubId = null;
  csClubForm.reset();
  csClubSubmit.textContent = 'Add club';
  csClubCancelEdit.hidden = true;
}

export async function loadCsClubs() {
  const res = await fetch('/api/admin/cs-clubs');
  if (!res.ok) return;
  const { clubs } = await res.json();
  renderCsClubsAdmin(clubs);
}

function renderCsClubsAdmin(clubs) {
  csClubAdminList.querySelectorAll('.cs-club-item').forEach((el) => el.remove());
  csClubEmptyHint.hidden = clubs.length > 0;

  clubs.forEach((club) => {
    const div = document.createElement('div');
    div.className = 'cs-club-item';
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
      ${club.instagramUrl || club.applicationFormUrl ? `
        <div class="cs-club-item-links">
          ${club.instagramUrl ? `<a href="${escapeHtml(club.instagramUrl)}" target="_blank" rel="noopener">Instagram</a>` : ''}
          ${club.applicationFormUrl ? `<a href="${escapeHtml(club.applicationFormUrl)}" target="_blank" rel="noopener">Application form</a>` : ''}
        </div>` : ''}
    `;
    div.querySelector('.edit-btn').addEventListener('click', () => {
      editingClubId = club.id;
      csClubNameInput.value = club.name;
      csClubDescriptionInput.value = club.description;
      csClubInstagramInput.value = club.instagramUrl || '';
      csClubApplicationInput.value = club.applicationFormUrl || '';
      csClubLogoInput.value = '';
      csClubError.hidden = true;
      csClubSubmit.textContent = 'Save changes';
      csClubCancelEdit.hidden = false;
      csClubForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm(`Remove "${club.name}" from the Community Service page?`)) return;
      await del(`/api/admin/cs-clubs/${club.id}`);
      if (editingClubId === club.id) resetCsClubForm();
      loadCsClubs();
    });
    csClubAdminList.appendChild(div);
  });
}

csClubCancelEdit.addEventListener('click', () => resetCsClubForm());

csClubForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  csClubError.hidden = true;
  csClubSubmit.disabled = true;
  csClubSubmit.textContent = editingClubId ? 'Saving…' : 'Adding…';

  try {
    const formData = new FormData();
    formData.append('name', csClubNameInput.value.trim());
    formData.append('description', csClubDescriptionInput.value.trim());
    formData.append('instagramUrl', csClubInstagramInput.value.trim());
    formData.append('applicationFormUrl', csClubApplicationInput.value.trim());
    if (csClubLogoInput.files[0]) formData.append('logo', csClubLogoInput.files[0]);

    const url = editingClubId ? `/api/admin/cs-clubs/${editingClubId}` : '/api/admin/cs-clubs';
    const { ok, data } = await sendForm(url, editingClubId ? 'PUT' : 'POST', formData);

    if (!ok) {
      csClubError.textContent = data.error || 'Could not save club.';
      csClubError.hidden = false;
      return;
    }

    resetCsClubForm();
    loadCsClubs();
  } catch {
    csClubError.textContent = 'Could not reach the server. Please try again.';
    csClubError.hidden = false;
  } finally {
    csClubSubmit.disabled = false;
    csClubSubmit.textContent = editingClubId ? 'Save changes' : 'Add club';
  }
});
