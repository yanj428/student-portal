const isPdf = (url) => /\.pdf$/i.test(url || '');

(async function loadLunchSchedule() {
  const data = await fetchJson('/api/content');
  if (!data) return;

  const weekLabelEl = document.getElementById('week-label');
  const imageWrap = document.getElementById('lunch-image-wrap');
  const empty = document.getElementById('lunch-empty');
  const image = document.getElementById('lunch-image');
  const pdf = document.getElementById('lunch-pdf');
  const pdfLink = document.getElementById('lunch-pdf-link');

  // The menu is a picture or a PDF. A PDF is shown in a frame, with a link to
  // open it on its own for phones that only preview the first page.
  const schedule = data.content.lunchSchedule || {};
  const url = schedule.imageUrl;
  const showPdf = isPdf(url);
  if (url) {
    if (showPdf) {
      pdf.src = url;
      pdfLink.href = url;
    } else {
      image.src = url;
    }
  }
  image.hidden = !url || showPdf;
  pdf.hidden = !showPdf;
  pdfLink.hidden = !showPdf;
  imageWrap.hidden = !url;
  empty.hidden = !!url;

  weekLabelEl.textContent = schedule.weekLabel || '';
  weekLabelEl.hidden = !schedule.weekLabel;
})();