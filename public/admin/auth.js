// Admin login gate: password step, then (when the account has 2FA on) a
// verification-code step, then shows the panel and calls back into
// main.js's loaders.

const gate = document.getElementById('gate');
const gateForm = document.getElementById('gate-form');
const adminEmailInput = document.getElementById('admin-email');
const adminPasswordInput = document.getElementById('admin-password');
const gateError = document.getElementById('gate-error');
const adminPage = document.getElementById('admin-page');
const adminLogout = document.getElementById('admin-logout');
const currentAdminEmailEl = document.getElementById('current-admin-email');

const totpForm = document.getElementById('totp-form');
const totpCodeInput = document.getElementById('totp-code');
const totpError = document.getElementById('totp-error');
const totpCancel = document.getElementById('totp-cancel');

export function initAuth(onLogin) {
  function showAdminPanel(email) {
    gate.hidden = true;
    adminPage.hidden = false;
    if (currentAdminEmailEl && email) currentAdminEmailEl.textContent = email;
    onLogin();
  }

  function showGate() {
    gate.hidden = false;
    adminPage.hidden = true;
    gateForm.hidden = false;
    totpForm.hidden = true;
  }

  function showTotpStep() {
    gateForm.hidden = true;
    totpForm.hidden = false;
    totpCodeInput.value = '';
    totpCodeInput.focus();
  }

  async function showError(el, res) {
    let message = 'Something went wrong. Please try again.';
    try {
      message = (await res.json()).error || message;
    } catch {
      // keep the default
    }
    el.textContent = message;
    el.hidden = false;
  }

  gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    gateError.hidden = true;

    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmailInput.value, password: adminPasswordInput.value }),
    });

    if (!res.ok) {
      await showError(gateError, res);
      return;
    }
    const data = await res.json();
    adminPasswordInput.value = '';
    if (data.requiresTotp) {
      showTotpStep();
      return;
    }
    showAdminPanel(data.email);
  });

  totpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    totpError.hidden = true;

    const value = totpCodeInput.value.trim();
    const isRecoveryCode = value.includes('-') || value.length > 6;
    const body = isRecoveryCode ? { recoveryCode: value } : { code: value };

    const res = await fetch('/api/admin/login/verify-totp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      await showError(totpError, res);
      return;
    }
    const data = await res.json();
    showAdminPanel(data.email);
  });

  totpCancel.addEventListener('click', () => {
    showGate();
  });

  adminLogout.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    showGate();
  });

  (async function checkSession() {
    const res = await fetch('/api/admin/session');
    const data = await res.json();
    if (data.isAdmin) showAdminPanel(data.email);
    else showGate();
  })();
}
