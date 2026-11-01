// The Overview page: what needs attention, and shortcuts into the other pages.
import { openDrawerFor } from './drawer.js';

export function initOverview() {
  const voiceCard = document.getElementById('attention-voice');
  const lockedCard = document.getElementById('attention-locked');
  const clear = document.getElementById('attention-clear');
  const voiceCount = document.getElementById('attention-voice-count');
  const statVoice = document.getElementById('stat-voice');
  const statLocked = document.getElementById('stat-locked');

  // The counts are filled in by the pages that load them, so follow those numbers.
  function refresh() {
    const voice = Number(statVoice.textContent) || 0;
    const locked = Number(statLocked.textContent) || 0;
    voiceCount.textContent = voice;
    voiceCard.hidden = voice === 0;
    lockedCard.hidden = locked === 0;
    clear.hidden = voice > 0 || locked > 0;
  }
  const watch = new MutationObserver(refresh);
  [statVoice, statLocked].forEach((el) => watch.observe(el, { childList: true, characterData: true, subtree: true }));
  refresh();

  document.querySelectorAll('#admin-page [data-go]').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelector(`.nav-item[data-page="${el.dataset.go}"]`).click();
      if (el.dataset.open) openDrawerFor(el.dataset.open);
    });
  });
}
