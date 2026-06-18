import type { Camera } from './Camera';

const CELL_SIZE   = 64; // world units per cell
const MAJOR_EVERY = 8;  // one slightly darker line every N cells

const COLOR_MINOR = '#eeeeee';
const COLOR_MAJOR = '#e0e0e0';

export class GridRenderer {
  draw(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    cssW: number,
    cssH: number,
    dpr: number,
  ) {
    const tl     = camera.topLeft(cssW, cssH);
    const startX = Math.floor(tl.x / CELL_SIZE) * CELL_SIZE;
    const startY = Math.floor(tl.y / CELL_SIZE) * CELL_SIZE;
    const endX   = tl.x + cssW;
    const endY   = tl.y + cssH;

    ctx.lineWidth = 1 / dpr;

    // Batch all minor lines into one path flush, then major lines into another.
    // This avoids a strokeStyle + stroke() call per line.
    ctx.beginPath();
    for (let wx = startX; wx <= endX; wx += CELL_SIZE) {
      if (Math.round(wx / CELL_SIZE) % MAJOR_EVERY === 0) continue;
      const px = snapToDevicePixel(wx - tl.x, dpr);
      ctx.moveTo(px, 0); ctx.lineTo(px, cssH);
    }
    for (let wy = startY; wy <= endY; wy += CELL_SIZE) {
      if (Math.round(wy / CELL_SIZE) % MAJOR_EVERY === 0) continue;
      const py = snapToDevicePixel(wy - tl.y, dpr);
      ctx.moveTo(0, py); ctx.lineTo(cssW, py);
    }
    ctx.strokeStyle = COLOR_MINOR;
    ctx.stroke();

    ctx.beginPath();
    for (let wx = startX; wx <= endX; wx += CELL_SIZE) {
      if (Math.round(wx / CELL_SIZE) % MAJOR_EVERY !== 0) continue;
      const px = snapToDevicePixel(wx - tl.x, dpr);
      ctx.moveTo(px, 0); ctx.lineTo(px, cssH);
    }
    for (let wy = startY; wy <= endY; wy += CELL_SIZE) {
      if (Math.round(wy / CELL_SIZE) % MAJOR_EVERY !== 0) continue;
      const py = snapToDevicePixel(wy - tl.y, dpr);
      ctx.moveTo(0, py); ctx.lineTo(cssW, py);
    }
    ctx.strokeStyle = COLOR_MAJOR;
    ctx.stroke();
  }
}

// Align a CSS-pixel coordinate to the nearest device-pixel boundary,
// preventing sub-pixel blurring on lines.
function snapToDevicePixel(cssPx: number, dpr: number): number {
  return Math.round(cssPx * dpr) / dpr;
}
