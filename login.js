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
  } else {
    welcomeHeading.textContent = 'Welcome!';
    welcomeSubtitle.textContent = 'Please enter your details to login.';
    emailInput.placeholder = 'Enter your email address';
    submitBtn.textContent = 'Log In';
  }

  clearEmailError();
}

function clearEmailError() {
  emailError.hidden = true;
  emailInput.classList.remove('invalid');
}

function showEmailError() {
  emailError.hidden = false;
  emailInput.classList.add('invalid');
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

// Show/hide password
const pwInput = document.getElementById('password');
const pwToggle = document.querySelector('.toggle-pw');
if (pwInput && pwToggle) {
  pwToggle.addEventListener('click', () => {
    const showing = pwInput.type === 'text';
    pwInput.type = showing ? 'password' : 'text';
    pwToggle.classList.toggle('showing', !showing);
  });
}

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
      openProfileModal();
      return;
    }

    window.location.href = 'index.html';
  });
}

// Complete-profile modal (shown right after a successful sign up)
const profileModal = document.getElementById('profile-modal');
const profileForm = document.getElementById('profile-form');
const firstNameInput = document.getElementById('first-name');
const lastNameInput = document.getElementById('last-name');
const nicknameInput = document.getElementById('nickname');
const gradeSelect = document.getElementById('grade');

const previewAvatar = document.getElementById('preview-avatar');
const previewName = document.getElementById('preview-name');
const previewNickname = document.getElementById('preview-nickname');
const previewGrade = document.getElementById('preview-grade');

function openProfileModal() {
  profileModal.hidden = false;
  document.body.style.overflow = 'hidden';
  firstNameInput.focus();
}

function closeProfileModal() {
  profileModal.hidden = true;
  document.body.style.overflow = '';
}

function updatePreview() {
  const first = firstNameInput.value.trim();
  const last = lastNameInput.value.trim();
  const nickname = nicknameInput.value.trim();
  const grade = gradeSelect.value;

  const fullName = [first, last].filter(Boolean).join(' ');
  previewName.textContent = fullName || 'Your name';
  previewAvatar.textContent = ((first[0] || '') + (last[0] || '')).toUpperCase() || '?';
  previewNickname.textContent = nickname ? `"${nickname}"` : 'Nickname';

  if (grade) {
    previewGrade.hidden = false;
    previewGrade.querySelector('span').textContent = grade;
  } else {
    previewGrade.hidden = true;
  }
}

[firstNameInput, lastNameInput, nicknameInput, gradeSelect].forEach((el) => {
  if (el) el.addEventListener('input', updatePreview);
});

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
