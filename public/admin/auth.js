// Admin login gate: username + password, then shows the panel and calls
// back into main.js with the signed-in admin's session.
import { withBusy } from './api.js';

const gate = document.getElementById('gate');
const gateForm = document.getElementById('gate-form');
const adminUsernameInput = document.getElementById('admin-username');
const adminPasswordInput = document.getElementById('admin-password');
const gateError = document.getElementById('gate-error');
const adminPage = document.getElementById('admin-page');
const adminLogout = document.getElementById('admin-logout');
const currentAdminUsernameEl = document.getElementById('current-admin-username');
const passwordGate = document.getElementById('password-gate');
const passwordForm = document.getElementById('password-form');
const pwCurrent = document.getElementById('pw-current');
const pwNew = document.getElementById('pw-new');
const pwConfirm = document.getElementById('pw-confirm');
const pwError = document.getElementById('pw-error');

async function fetchSession() {
  return (await fetch('/api/admin/session')).json();
}

export function initAuth(onLogin) {
  function showAdminPanel(session) {
    gate.hidden = true;
    adminPage.hidden = false;
    currentAdminUsernameEl.textContent = session.username;
    onLogin(session);
  }

  // An account made with a temporary password has to choose its own before
  // anything else loads: the server refuses every other request until then.
  function showPasswordGate() {
    gate.hidden = true;
    passwordGate.hidden = false;
    pwCurrent.focus();
  }

  function showGateError(message) {
    gateError.textContent = message;
    gateError.hidden = false;
  }

  // Raw fetch (not sendJSON): a wrong password is a 401, which sendJSON would
  // take for an expired session and answer by reloading the page.
  gateForm.addEventListener('submit', (e) => {
    e.preventDefault();
    gateError.hidden = true;

    withBusy(gateForm.querySelector('button[type="submit"]'), 'Signing in…', async () => {
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: adminUsernameInput.value, password: adminPasswordInput.value }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          showGateError(data.error || 'Something went wrong. Please try again.');
          return;
        }
        adminPasswordInput.value = '';
        await continueAfterSignIn();
      } catch {
        showGateError('Could not reach the server. Please try again.');
      }
    });
  });

  async function continueAfterSignIn() {
    const session = await fetchSession();
    if (session.isAdmin && session.mustChangePassword) showPasswordGate();
    else showAdminPanel(session);
  }

  // Raw fetch again: a wrong current password is a 401.
  passwordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    pwError.hidden = true;
    if (pwNew.value !== pwConfirm.value) {
      pwError.textContent = 'The two new passwords do not match.';
      pwError.hidden = false;
      return;
    }
    withBusy(passwordForm.querySelector('button[type="submit"]'), 'Saving…', async () => {
      try {
        const res = await fetch('/api/admin/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: pwCurrent.value, newPassword: pwNew.value }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          pwError.textContent = data.error || 'Something went wrong. Please try again.';
          pwError.hidden = false;
          return;
        }
        [pwCurrent, pwNew, pwConfirm].forEach((input) => { input.value = ''; });
        passwordGate.hidden = true;
        showAdminPanel(await fetchSession());
      } catch {
        pwError.textContent = 'Could not reach the server. Please try again.';
        pwError.hidden = false;
      }
    });
  });

  document.getElementById('pw-logout').addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      window.location.reload();
    }
  });

  // A full reload (rather than just showing the gate) clears every panel's
  // rendered data, so the next admin to log in can't see the previous
  // admin's Security tab or lists left behind in the DOM.
  adminLogout.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      window.location.reload();
    }
  });

  (async function checkSession() {
    const session = await fetchSession();
    if (session.isAdmin && session.mustChangePassword) showPasswordGate();
    else if (session.isAdmin) showAdminPanel(session);
  })();
}
