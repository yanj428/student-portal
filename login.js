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

    if (mode === 'signup' && !emailInput.value.trim().toLowerCase().endsWith(SCHOOL_DOMAIN)) {
      showEmailError();
      emailInput.focus();
      return;
    }

    window.location.href = 'index.html';
  });
}
