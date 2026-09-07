// NOTE: this is a static frontend with no backend yet, so this domain check is a
// client-side UX guard only — it stops accidental non-school signups in this demo,
// it is not real access control. Enforce the @kpis.ac.th restriction server-side
// (or via Google Workspace domain restriction on the OAuth app) before going live.
const SCHOOL_DOMAIN = '@kpis.ac.th';

let mode = 'login';

const emailInput = document.getElementById('email');
const emailError = document.getElementById('email-error');
const welcomeHeading = document.getElementById('welcome-heading');
const welcomeSubtitle = document.getElementById('welcome-subtitle');
const submitBtn = document.getElementById('submit-btn');
const forgotLink = document.getElementById('forgot-link');
const confirmPasswordField = document.getElementById('confirm-password-field');
const confirmPasswordInput = document.getElementById('confirm-password');
const confirmPasswordError = document.getElementById('confirm-password-error');

function setMode(nextMode) {
  mode = nextMode;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === mode);
  });

  if (mode === 'signup') {
    welcomeHeading.textContent = 'Create your account';
    welcomeSubtitle.textContent = 'Sign up with your KPIS school email.';
    emailInput.placeholder = 'yourname@kpis.ac.th';
    submitBtn.textContent = 'Sign Up';
    forgotLink.hidden = true;
    confirmPasswordField.hidden = false;
  } else {
    welcomeHeading.textContent = 'Welcome!';
    welcomeSubtitle.textContent = 'Please enter your details to login.';
    emailInput.placeholder = 'Enter your email address';
    submitBtn.textContent = 'Log In';
    forgotLink.hidden = false;
    confirmPasswordField.hidden = true;
  }

  clearEmailError();
  clearConfirmPasswordError();
}

function clearEmailError() {
  emailError.hidden = true;
  emailInput.classList.remove('invalid');
}

function showEmailError() {
  emailError.hidden = false;
  emailInput.classList.add('invalid');
}

function clearConfirmPasswordError() {
  confirmPasswordError.hidden = true;
  confirmPasswordInput.classList.remove('invalid');
}

function showConfirmPasswordError() {
  confirmPasswordError.hidden = false;
  confirmPasswordInput.classList.add('invalid');
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => setMode(tab.dataset.tab));
});

const signupLink = document.querySelector('.signup-line a');
if (signupLink) {
  signupLink.addEventListener('click', (e) => {
    e.preventDefault();
    setMode('signup');
  });
}

emailInput.addEventListener('input', clearEmailError);
confirmPasswordInput.addEventListener('input', clearConfirmPasswordError);

// Show/hide password — wire every password field to its own toggle button
document.querySelectorAll('.password-wrap').forEach((wrap) => {
  const input = wrap.querySelector('input');
  const toggle = wrap.querySelector('.toggle-pw');
  if (!input || !toggle) return;
  toggle.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    toggle.classList.toggle('showing', !showing);
  });
});

const pwInput = document.getElementById('password');

const form = document.getElementById('login-form');
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    if (mode === 'signup') {
      if (!emailInput.value.trim().toLowerCase().endsWith(SCHOOL_DOMAIN)) {
        showEmailError();
        emailInput.focus();
        return;
      }
      if (confirmPasswordInput.value !== pwInput.value) {
        showConfirmPasswordError();
        confirmPasswordInput.focus();
        return;
      }
      openProfileModal();
      return;
    }

    window.location.href = 'index.html';
  });
}

// Complete-profile modal (shown right after a successful sign up)
const profileModal = document.getElementById('profile-modal');
const profileForm = document.getElementById('profile-form');
const nameDisplay = document.getElementById('name-display');
const gradeSelect = document.getElementById('grade');

// Best-effort: derive a display name from the school email's local part,
// e.g. "danial.aliaskarov@kpis.ac.th" -> "Danial Aliaskarov". There's no
// real identity provider wired up yet, so this is just a friendly guess.
function deriveNameFromEmail(email) {
  const localPart = email.split('@')[0] || '';
  const parts = localPart.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return 'Your name';
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function openProfileModal() {
  nameDisplay.textContent = deriveNameFromEmail(emailInput.value.trim());
  gradeSelect.value = '';
  profileModal.hidden = false;
  document.body.style.overflow = 'hidden';
  gradeSelect.focus();
}

function closeProfileModal() {
  profileModal.hidden = true;
  document.body.style.overflow = '';
}

const profileModalClose = document.getElementById('profile-modal-close');
const profileModalCancel = document.getElementById('profile-modal-cancel');
if (profileModalClose) profileModalClose.addEventListener('click', closeProfileModal);
if (profileModalCancel) profileModalCancel.addEventListener('click', closeProfileModal);
if (profileModal) {
  profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) closeProfileModal();
  });
}

if (profileForm) {
  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    window.location.href = 'index.html';
  });
}
