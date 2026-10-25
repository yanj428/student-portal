// The "Adjust photo" window. After a file is chosen in a photo field, the admin
// moves and zooms the picture behind a circle (the shape these photos are shown
// in), and what goes to the server is the square picture they framed, not the
// original file. Nothing is sent until the form itself is saved.

const STAGE = 280; // the drawing area, in pixels
const CIRCLE = 240; // the circle the photo is framed in
const OUTPUT = 512; // the finished picture is 512 x 512
const MAX_ZOOM = 3;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// Opens the window for one picture. Resolves with { blob } when the admin
// accepts it, { again: true } for "Choose another", or {} when they cancel.
function openCropper(bitmap) {
  return new Promise((resolve) => {
    const dialog = el('dialog', 'photo-crop');
    dialog.setAttribute('aria-label', 'Adjust photo');

    const head = el('div', 'photo-crop-head');
    head.append(el('strong', '', 'Adjust photo'), el('span', '', 'Drag to move, slide to zoom'));

    const stage = el('canvas', 'photo-crop-stage');
    stage.width = STAGE;
    stage.height = STAGE;
    stage.tabIndex = 0;
    stage.setAttribute('aria-label', 'Photo. Use the arrow keys to move it.');

    const zoomRow = el('div', 'photo-crop-zoom');
    const zoom = el('input');
    zoom.type = 'range';
    zoom.min = '100';
    zoom.max = String(MAX_ZOOM * 100);
    zoom.value = '100';
    zoom.step = '1';
    zoom.setAttribute('aria-label', 'Zoom');
    zoomRow.append(el('span', '', '\u2212'), zoom, el('span', '', '+'));

    const preview = el('div', 'photo-crop-preview');
    const big = el('canvas', 'photo-crop-dot');
    big.width = 64;
    big.height = 64;
    const small = el('canvas', 'photo-crop-dot');
    small.width = 36;
    small.height = 36;
    preview.append(el('p', '', 'How it will look'), el('div', 'photo-crop-dots', ''));
    preview.querySelector('.photo-crop-dots').append(big, small);

    const buttons = el('div', 'photo-crop-buttons');
    const useBtn = el('button', 'btn primary', 'Use this photo');
    useBtn.type = 'button';
    const againBtn = el('button', 'btn ghost', 'Choose another');
    againBtn.type = 'button';
    const cancelBtn = el('button', 'btn ghost', 'Cancel');
    cancelBtn.type = 'button';
    buttons.append(useBtn, againBtn, cancelBtn);
    const side = el('div', 'photo-crop-side');
    side.append(preview, buttons);

    const body = el('div', 'photo-crop-body');
    const left = el('div', 'photo-crop-left');
    left.append(stage, zoomRow);
    body.append(left, side);
    dialog.append(head, body);
    document.body.append(dialog);

    // The picture starts just large enough to cover the circle.
    const baseScale = CIRCLE / Math.min(bitmap.width, bitmap.height);
    let zoomLevel = 1;
    let offsetX = 0;
    let offsetY = 0;

    function size() {
      const scale = baseScale * zoomLevel;
      return { w: bitmap.width * scale, h: bitmap.height * scale };
    }

    // Keeps the picture covering the whole circle, so no empty edge can show.
    function clamp() {
      const { w, h } = size();
      const limitX = Math.max(0, (w - CIRCLE) / 2);
      const limitY = Math.max(0, (h - CIRCLE) / 2);
      offsetX = Math.min(limitX, Math.max(-limitX, offsetX));
      offsetY = Math.min(limitY, Math.max(-limitY, offsetY));
    }

    // Draws the picture centred at (cx, cy), with k = canvas pixels per stage pixel.
    function drawPicture(ctx, cx, cy, k) {
      const { w, h } = size();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, cx + (offsetX - w / 2) * k, cy + (offsetY - h / 2) * k, w * k, h * k);
    }

    function drawDot(canvas) {
      const ctx = canvas.getContext('2d');
      const px = canvas.width;
      ctx.clearRect(0, 0, px, px);
      ctx.save();
      ctx.beginPath();
      ctx.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, px, px);
      drawPicture(ctx, px / 2, px / 2, px / CIRCLE);
      ctx.restore();
    }

    function render() {
      clamp();
      const ctx = stage.getContext('2d');
      ctx.fillStyle = '#2C2C2A';
      ctx.fillRect(0, 0, STAGE, STAGE);
      drawPicture(ctx, STAGE / 2, STAGE / 2, 1);
      // Dim everything outside the circle.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.rect(0, 0, STAGE, STAGE);
      ctx.arc(STAGE / 2, STAGE / 2, CIRCLE / 2, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(STAGE / 2, STAGE / 2, CIRCLE / 2, 0, Math.PI * 2);
      ctx.stroke();
      drawDot(big);
      drawDot(small);
    }

    function setZoom(value) {
      zoomLevel = Math.min(MAX_ZOOM, Math.max(1, value));
      zoom.value = String(Math.round(zoomLevel * 100));
      render();
    }

    zoom.addEventListener('input', () => setZoom(Number(zoom.value) / 100));
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      setZoom(zoomLevel * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    }, { passive: false });

    let drag = null;
    stage.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const ratio = STAGE / stage.getBoundingClientRect().width;
      offsetX += (e.clientX - drag.x) * ratio;
      offsetY += (e.clientY - drag.y) * ratio;
      drag = { x: e.clientX, y: e.clientY };
      render();
    });
    const endDrag = () => {
      drag = null;
      stage.classList.remove('is-dragging');
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[e.key];
      if (!step) return;
      e.preventDefault();
      offsetX += step[0];
      offsetY += step[1];
      render();
    });

    function finish(result) {
      dialog.close();
      dialog.remove();
      resolve(result);
    }

    useBtn.addEventListener('click', () => {
      const out = document.createElement('canvas');
      out.width = OUTPUT;
      out.height = OUTPUT;
      drawPicture(out.getContext('2d'), OUTPUT / 2, OUTPUT / 2, OUTPUT / CIRCLE);
      out.toBlob((blob) => finish(blob ? { blob } : {}), 'image/png');
    });
    againBtn.addEventListener('click', () => finish({ again: true }));
    cancelBtn.addEventListener('click', () => finish({}));
    // Escape closes the window, which counts as cancelling.
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish({});
    });

    dialog.showModal();
    render();
    useBtn.focus();
  });
}

// Wires one <input type="file"> so a chosen picture is framed first. The input
// ends up holding the framed picture, so the form's own save code is unchanged.
export function attachPhotoCropper(input) {
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      input.value = '';
      window.alert('That file could not be opened as a picture. Please choose a JPEG, PNG, WEBP or GIF image.');
      return;
    }

    const result = await openCropper(bitmap);
    bitmap.close();

    if (result.blob) {
      const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
      const transfer = new DataTransfer();
      transfer.items.add(new File([result.blob], `${name}.png`, { type: 'image/png' }));
      input.files = transfer.files;
      return;
    }
    input.value = '';
    if (result.again) input.click();
  });
}