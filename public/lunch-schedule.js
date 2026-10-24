(async function loadLunchSchedule() {
  const data = await fetchJson('/api/content');
  if (!data) return;

  const weekLabelEl = document.getElementById('week-label');
  const imageWrap = document.getElementById('lunch-image-wrap');
  const empty = document.getElementById('lunch-empty');

  const schedule = data.content.lunchSchedule || {};
  if (schedule.imageUrl) document.getElementById('lunch-image').src = schedule.imageUrl;
  imageWrap.hidden = !schedule.imageUrl;
  empty.hidden = !!schedule.imageUrl;

  weekLabelEl.textContent = schedule.weekLabel || '';
  weekLabelEl.hidden = !schedule.weekLabel;
})();
