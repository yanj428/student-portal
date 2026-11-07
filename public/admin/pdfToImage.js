// Turns a PDF into one tall picture (every page stacked), so students on any
// device see the menu as a picture instead of needing a PDF viewer.
const BASE = '/vendor/pdfjs/';
const PDFJS = BASE + 'build/pdf.min.mjs';
const WORKER = BASE + 'build/pdf.worker.min.mjs';
const MAX_BYTES = 9 * 1024 * 1024;

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function pdfToImage(file) {
  const pdfjs = await import(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
  const doc = await pdfjs.getDocument({
    data: await file.arrayBuffer(),
    standardFontDataUrl: BASE + 'standard_fonts/',
    cMapUrl: BASE + 'cmaps/',
    cMapPacked: true,
    iccUrl: BASE + 'iccs/',
    wasmUrl: BASE + 'wasm/',
  }).promise;

  // About 1600px wide is sharp on a phone without making a huge file.
  const pages = [];
  for (let n = 1; n <= Math.min(doc.numPages, 4); n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1600 / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(canvas);
  }

  const out = document.createElement('canvas');
  out.width = Math.max(...pages.map((c) => c.width));
  out.height = pages.reduce((sum, c) => sum + c.height, 0);
  const octx = out.getContext('2d');
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, out.width, out.height);
  let y = 0;
  for (const c of pages) {
    octx.drawImage(c, 0, y);
    y += c.height;
  }

  let blob = await toBlob(out, 'image/png');
  let ext = 'png';
  let type = 'image/png';
  if (!blob || blob.size > MAX_BYTES) {
    blob = await toBlob(out, 'image/jpeg', 0.9);
    ext = 'jpg';
    type = 'image/jpeg';
  }
  if (!blob) throw new Error('Could not turn the PDF into a picture.');
  return new File([blob], file.name.replace(/\.pdf$/i, '') + '.' + ext, { type });
}
