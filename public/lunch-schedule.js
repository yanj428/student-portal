async function loadLunchSchedule() {
  const res = await fetch('/api/content');
  if (!res.ok) return;
  const { content } = await res.json();

  const weekLabelEl = document.getElementById('week-label');
  const imageWrap = document.getElementById('lunch-image-wrap');
  const image = document.getElementById('lunch-image');
  const empty = document.getElementById('lunch-empty');

  const schedule = content.lunchSchedule || {};
  if (schedule.imageUrl) {
    image.src = schedule.imageUrl;
    imageWrap.hidden = false;
    empty.hidden = true;
  } else {
    imageWrap.hidden = true;
    empty.hidden = false;
  }

  if (schedule.weekLabel) {
    weekLabelEl.textContent = schedule.weekLabel;
    weekLabelEl.hidden = false;
  } else {
    weekLabelEl.hidden = true;
  }
}

loadLunchSchedule();
