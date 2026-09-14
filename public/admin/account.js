import { sendJSON } from './api.js';

const passwordForm = document.getElementById('admin-password-form');
const currentPasswordInput = document.getElementById('admin-current-password');
const newPasswordInput = document.getElementById('admin-new-password');
const passwordError = document.getElementById('admin-password-error');
const passwordSuccess = document.getElementById('admin-password-success');

export async function loadAccount() {
  // Nothing to fetch — this tab is just the password-change form.
}

passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  passwordError.hidden = true;
  passwordSuccess.hidden = true;

  const { ok, data } = await sendJSON('/api/admin/change-password', 'POST', {
    currentPassword: currentPasswordInput.value,
    newPassword: newPasswordInput.value,
  });

  if (!ok) {
    passwordError.textContent = data.error || 'Could not change your password.';
    passwordError.hidden = false;
    return;
  }

  passwordForm.reset();
  passwordSuccess.hidden = false;
});
