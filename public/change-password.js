const hintEl = document.getElementById('pw-hint');
const form = document.getElementById('pw-form');
const currentInput = document.getElementById('pw-current');
const newInput = document.getElementById('pw-new');
const confirmInput = document.getElementById('pw-confirm');
const errorEl = document.getElementById('pw-error');
const successEl = document.getElementById('pw-success');
const submitBtn = document.getElementById('pw-submit');
const cancelLine = document.getElementById('pw-cancel-line');

let forced = true;

async function init() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) {
      window.location.href = 'login.html';
      return;
    }
    const { student } = await res.json();

    forced = !!student.mustChangePassword;
    if (forced) {
      hintEl.textContent = 'You need to set a new password before continuing.';
    } else {
      hintEl.textContent = 'Choose a new password for your account.';
      cancelLine.hidden = false;
    }
  } catch {
    window.location.href = 'login.html';
  }
}
init();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  successEl.hidden = true;

  if (newInput.value !== confirmInput.value) {
    errorEl.textContent = 'New passwords do not match.';
    errorEl.hidden = false;
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  try {
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: currentInput.value,
        newPassword: newInput.value,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Could not change password.';
      errorEl.hidden = false;
      return;
    }

    successEl.textContent = 'Password updated. Redirecting…';
    successEl.hidden = false;
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 900);
  } catch {
    errorEl.textContent = 'Could not reach the server. Please try again.';
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save';
  }
});
