// Wires a "View more / View less" button that collapses a section's body.
export function bindViewMore(toggle, body) {
  toggle.addEventListener('click', () => {
    const nowOpen = body.hidden;
    body.hidden = !nowOpen;
    toggle.textContent = nowOpen ? 'View less' : 'View more';
  });
}
