// Forms that add or edit something open in a panel that slides in from the right,
// instead of sitting above the list. Each one gets an "Add ..." button where it used to
// be; pressing Edit on a row opens the same panel filled in (crud.js announces that).
//
//   form     id of the form, or of any element inside the box that should slide in
//   whole    true when the form's whole box (title, hint and form) slides in, false for the form alone
//   add      text of the button, e.g. 'Add club'
//   title    heading shown at the top of the panel when only the form slides in

const DRAWERS = [
  { form: 'create-form', whole: true, add: 'Add account' },
  { form: 'calendar-event-form', add: 'Add event', title: 'Event' },
  { form: 'calendar-ai-image-input', whole: true, add: 'Add from a photo' },
  { form: 'club-form', add: 'Add club', title: 'Club' },
  { form: 'cs-event-form', add: 'Add event', title: 'Community service event' },
  { form: 'cs-resource-form', add: 'Add resource', title: 'Community service resource' },
  { form: 'council-form', add: 'Add member', title: 'Council member' },
  { form: 'quicklink-form', add: 'Add link', title: 'Quick link' },
];

const backdrop = document.createElement('div');
backdrop.className = 'drawer-backdrop';
backdrop.hidden = true;
document.body.appendChild(backdrop);

const toast = document.createElement('div');
toast.className = 'drawer-toast';
toast.setAttribute('role', 'status');
toast.hidden = true;
document.body.appendChild(toast);
let toastTimer = null;

export function showToast(text) {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 7000);
}

let openDrawer = null;

function close() {
  if (!openDrawer) return;
  openDrawer.classList.remove('is-open');
  backdrop.hidden = true;
  document.body.classList.remove('drawer-is-open');
  openDrawer = null;
}

function open(el, heading) {
  if (openDrawer && openDrawer !== el) close();
  if (heading) el.querySelector('.drawer-title').textContent = heading;
  el.classList.add('is-open');
  backdrop.hidden = false;
  document.body.classList.add('drawer-is-open');
  openDrawer = el;
}

backdrop.addEventListener('click', close);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
});

export function initDrawers() {
  DRAWERS.forEach(({ form: id, whole, add, title }) => {
    const anchor = document.getElementById(id);
    if (!anchor) return;
    const el = whole ? anchor.closest('.panel') : anchor.closest('form');
    if (!el) return;

    // A heading with a close button at the top of the panel.
    const head = document.createElement('div');
    head.className = 'drawer-head';
    head.innerHTML = `<strong class="drawer-title">${whole ? '' : `Add ${title.toLowerCase()}`}</strong><button type="button" class="drawer-x" aria-label="Close">&times;</button>`;
    el.prepend(head);
    head.querySelector('.drawer-x').addEventListener('click', () => {
      // Closing an edit also clears the form, so it does not stay half-changed.
      const cancel = el.querySelector('[id$="cancel-edit"]');
      if (cancel && !cancel.hidden) cancel.click();
      else close();
    });

    el.classList.add('drawer');

    const bar = document.createElement('div');
    bar.className = 'drawer-bar';
    bar.innerHTML = `<button type="button" class="btn primary drawer-add">+ ${add}</button>`;
    el.before(bar);
    bar.querySelector('button').addEventListener('click', () => {
      el.querySelectorAll('details').forEach((d) => { d.open = false; });
      open(el, whole ? '' : `Add ${title.toLowerCase()}`);
    });

    el.addEventListener('crud:edit', () => {
      el.querySelectorAll('details').forEach((d) => { d.open = true; });
      open(el, whole ? '' : `Edit ${title.toLowerCase()}`);
    });
    el.addEventListener('crud:saved', () => {
      // A message the form shows after saving (like a new account's password) moves to a notice that outlasts the panel.
      const note = el.querySelector('.field-success:not([hidden])');
      showToast(note ? note.textContent : 'Saved');
      if (note) note.hidden = true;
    });
    el.addEventListener('crud:reset', close);
  });
}

// Lets other code (the Overview shortcuts) open a drawer by the id of something inside it.
export function openDrawerFor(id) {
  const el = document.getElementById(id);
  const target = el && (el.closest('.drawer') || el);
  if (!target) return;
  const bar = target.previousElementSibling;
  if (bar && bar.classList.contains('drawer-bar')) bar.querySelector('button').click();
}
