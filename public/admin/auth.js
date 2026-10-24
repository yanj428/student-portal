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
        showAdminPanel(await fetchSession());
      } catch {
        showGateError('Could not reach the server. Please try again.');
      }
    });
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
    if (session.isAdmin) showAdminPanel(session);
  })();
}
