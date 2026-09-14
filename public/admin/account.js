import { getJSON, sendJSON } from './api.js';

const passwordForm = document.getElementById('admin-password-form');
const currentPasswordInput = document.getElementById('admin-current-password');
const newPasswordInput = document.getElementById('admin-new-password');
const passwordError = document.getElementById('admin-password-error');
const passwordSuccess = document.getElementById('admin-password-success');

const statusEl = document.getElementById('twofa-status');
const disabledView = document.getElementById('twofa-disabled-view');
const enabledView = document.getElementById('twofa-enabled-view');

const startSetupBtn = document.getElementById('twofa-start-setup');
const setupPanel = document.getElementById('twofa-setup-panel');
const secretEl = document.getElementById('twofa-secret');
const enableCodeInput = document.getElementById('twofa-enable-code');
const enableError = document.getElementById('twofa-enable-error');
const confirmEnableBtn = document.getElementById('twofa-confirm-enable');
const recoveryCodesPanel = document.getElementById('twofa-recovery-codes-panel');
const recoveryCodesEl = document.getElementById('twofa-recovery-codes');

const disableForm = document.getElementById('twofa-disable-form');
const disablePasswordInput = document.getElementById('twofa-disable-password');
const disableError = document.getElementById('twofa-disable-error');

const regenForm = document.getElementById('twofa-regen-form');
const regenPasswordInput = document.getElementById('twofa-regen-password');
const regenError = document.getElementById('twofa-regen-error');
const newRecoveryCodesPanel = document.getElementById('twofa-new-recovery-codes-panel');
const newRecoveryCodesEl = document.getElementById('twofa-new-recovery-codes');

export async function loadAccount() {
  const session = await getJSON('/api/admin/session');
  if (!session) return;
  renderTwofaStatus(!!session.totpEnabled);
}

function renderTwofaStatus(enabled) {
  statusEl.textContent = enabled
    ? 'Two-factor authentication is on for your account.'
    : 'Two-factor authentication is off. Turning it on requires a code from an authenticator app at every login.';
  disabledView.hidden = enabled;
  enabledView.hidden = !enabled;
  setupPanel.hidden = true;
  recoveryCodesPanel.hidden = true;
  newRecoveryCodesPanel.hidden = true;
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

startSetupBtn.addEventListener('click', async () => {
  const { ok, data } = await sendJSON('/api/admin/2fa/setup', 'POST', {});
  if (!ok) return;
  secretEl.textContent = data.secret;
  setupPanel.hidden = false;
  enableCodeInput.value = '';
  enableError.hidden = true;
  enableCodeInput.focus();
});

confirmEnableBtn.addEventListener('click', async () => {
  enableError.hidden = true;
  const { ok, data } = await sendJSON('/api/admin/2fa/enable', 'POST', { code: enableCodeInput.value.trim() });
  if (!ok) {
    enableError.textContent = data.error || 'Incorrect code.';
    enableError.hidden = false;
    return;
  }

  setupPanel.hidden = true;
  recoveryCodesEl.textContent = data.recoveryCodes.join('\n');
  recoveryCodesPanel.hidden = false;
  renderTwofaStatusKeepingRecoveryVisible(true);
});

// Same as renderTwofaStatus, but doesn't hide the just-shown recovery codes
// panel the way switching views normally would.
function renderTwofaStatusKeepingRecoveryVisible(enabled) {
  statusEl.textContent = 'Two-factor authentication is on for your account.';
  disabledView.hidden = enabled;
  enabledView.hidden = !enabled;
}

disableForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  disableError.hidden = true;

  const { ok, data } = await sendJSON('/api/admin/2fa/disable', 'POST', { password: disablePasswordInput.value });
  if (!ok) {
    disableError.textContent = data.error || 'Could not turn off two-factor authentication.';
    disableError.hidden = false;
    return;
  }

  disableForm.reset();
  renderTwofaStatus(false);
});

regenForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  regenError.hidden = true;

  const { ok, data } = await sendJSON('/api/admin/2fa/recovery-codes', 'POST', { password: regenPasswordInput.value });
  if (!ok) {
    regenError.textContent = data.error || 'Could not generate new recovery codes.';
    regenError.hidden = false;
    return;
  }

  regenForm.reset();
  newRecoveryCodesEl.textContent = data.recoveryCodes.join('\n');
  newRecoveryCodesPanel.hidden = false;
});
