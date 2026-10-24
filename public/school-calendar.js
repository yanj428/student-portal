(async function loadCalendarImage() {
  const data = await fetchJson('/api/content');
  if (!data || !data.content.calendarImage.imageUrl) return;

  const { label, imageUrl } = data.content.calendarImage;
  document.getElementById('calendar-image').src = imageUrl;
  document.getElementById('calendar-image-link').href = imageUrl;
  if (label) document.getElementById('calendar-image-label').textContent = label;
  document.getElementById('calendar-image-card').hidden = false;
  document.getElementById('calendar-image-empty').hidden = true;
})();
