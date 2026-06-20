import {
  detectSpriteGrid,
  getFrameRect,
  type FrameRect,
} from './spriteSheet';

const ALPHA_THRESHOLD = 16;
const BG_COLOR_TOLERANCE = 18;
const BG_BUCKET = 8; // quantize colors when voting for border background
const PREFERRED_COLS = 3;
const PREFERRED_ROWS = 3;
const MIN_TILE = 8;

export interface GroundGridConfig {
  columns: number;
  rows: number;
  marginX: number;
  marginY: number;
  spacingX: number;
  spacingY: number;
}

function readImagePixels(image: HTMLImageElement): ImageData | null {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  if (w === 0 || h === 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, w, h);
}

export function detectGroundGrid(
  image: HTMLImageElement,
  override?: Partial<GroundGridConfig>,
): GroundGridConfig {
  const w = image.naturalWidth;
  const h = image.naturalHeight;

  if (override?.columns != null && override?.rows != null) {
    return {
      columns: override.columns,
      rows: override.rows,
      marginX: override.marginX ?? 0,
      marginY: override.marginY ?? 0,
      spacingX: override.spacingX ?? 0,
      spacingY: override.spacingY ?? 0,
    };
  }

  const tileW = w / PREFERRED_COLS;
  const tileH = h / PREFERRED_ROWS;

  if (
    w % PREFERRED_COLS === 0 &&
    h % PREFERRED_ROWS === 0 &&
    Number.isInteger(tileW) &&
    Number.isInteger(tileH) &&
    tileW >= MIN_TILE &&
    tileH >= MIN_TILE &&
    tileW === tileH
  ) {
    return {
      columns: PREFERRED_COLS,
      rows: PREFERRED_ROWS,
      marginX: 0,
      marginY: 0,
      spacingX: 0,
      spacingY: 0,
    };
  }

  const detected = detectSpriteGrid(image);
  return {
    columns: detected.columns,
    rows: detected.rows,
    marginX: detected.marginX,
    marginY: detected.marginY,
    spacingX: detected.spacingX,
    spacingY: detected.spacingY,
  };
}

export function isGroundGridStale(
  image: HTMLImageElement,
  config: GroundGridConfig,
): boolean {
  const detected = detectGroundGrid(image);
  return (
    detected.columns !== config.columns ||
    detected.rows !== config.rows ||
    detected.spacingX !== config.spacingX ||
    detected.spacingY !== config.spacingY ||
    detected.marginX !== config.marginX ||
    detected.marginY !== config.marginY
  );
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function readPixel(data: Uint8ClampedArray, width: number, x: number, y: number): Rgb & { a: number } {
  const i = (y * width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

function bucketKey(r: number, g: number, b: number): string {
  const q = (v: number) => Math.floor(v / BG_BUCKET) * BG_BUCKET;
  return `${q(r)},${q(g)},${q(b)}`;
}

/** Picks the most common color along the cell border (padding is usually on edges). */
function detectCellBackground(pixels: ImageData, cell: FrameRect): Rgb {
  const { width, data } = pixels;
  const { sx, sy, sw, sh } = cell;
  const counts = new Map<string, { r: number; g: number; b: number; n: number }>();

  const sample = (x: number, y: number) => {
    const p = readPixel(data, width, x, y);
    if (p.a < ALPHA_THRESHOLD) return;
    const key = bucketKey(p.r, p.g, p.b);
    const entry = counts.get(key);
    if (entry) {
      entry.r += p.r;
      entry.g += p.g;
      entry.b += p.b;
      entry.n++;
    } else {
      counts.set(key, { r: p.r, g: p.g, b: p.b, n: 1 });
    }
  };

  const x0 = sx;
  const y0 = sy;
  const x1 = sx + sw - 1;
  const y1 = sy + sh - 1;

  for (let x = x0; x <= x1; x++) {
    sample(x, y0);
    if (y1 !== y0) sample(x, y1);
  }
  for (let y = y0 + 1; y < y1; y++) {
    sample(x0, y);
    if (x1 !== x0) sample(x1, y);
  }

  let best: { r: number; g: number; b: number; n: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.n > best.n) best = entry;
  }

  if (!best) return { r: 255, g: 255, b: 255 };

  return {
    r: Math.round(best.r / best.n),
    g: Math.round(best.g / best.n),
    b: Math.round(best.b / best.n),
  };
}

function isPaddingPixel(r: number, g: number, b: number, a: number, bg: Rgb): boolean {
  if (a < ALPHA_THRESHOLD) return true;
  return (
    Math.abs(r - bg.r) <= BG_COLOR_TOLERANCE &&
    Math.abs(g - bg.g) <= BG_COLOR_TOLERANCE &&
    Math.abs(b - bg.b) <= BG_COLOR_TOLERANCE
  );
}

function trimContentBounds(pixels: ImageData, cell: FrameRect): FrameRect {
  const { width, data } = pixels;
  const { sx, sy, sw, sh } = cell;
  const bg = detectCellBackground(pixels, cell);

  let minX = sw;
  let minY = sh;
  let maxX = -1;
  let maxY = -1;

  for (let y = sy; y < sy + sh; y++) {
    for (let x = sx; x < sx + sw; x++) {
      const p = readPixel(data, width, x, y);
      if (isPaddingPixel(p.r, p.g, p.b, p.a, bg)) continue;
      minX = Math.min(minX, x - sx);
      maxX = Math.max(maxX, x - sx);
      minY = Math.min(minY, y - sy);
      maxY = Math.max(maxY, y - sy);
    }
  }

  if (maxX < 0) return cell;

  return {
    sx: sx + minX,
    sy: sy + minY,
    sw: maxX - minX + 1,
    sh: maxY - minY + 1,
  };
}

export class GroundTileSheet {
  readonly image: HTMLImageElement;
  readonly columns: number;
  readonly rows: number;
  readonly tileCount: number;
  readonly grid: GroundGridConfig;
  private cellBounds: FrameRect[];
  private trimmedBounds: FrameRect[];
  /** Largest trimmed content dimension — shared scale keeps all tiles consistent. */
  private maxContentSize: number;

  private constructor(
    image: HTMLImageElement,
    grid: GroundGridConfig,
    cellBounds: FrameRect[],
    trimmedBounds: FrameRect[],
    maxContentSize: number,
  ) {
    this.image = image;
    this.grid = grid;
    this.columns = grid.columns;
    this.rows = grid.rows;
    this.tileCount = grid.columns * grid.rows;
    this.cellBounds = cellBounds;
    this.trimmedBounds = trimmedBounds;
    this.maxContentSize = maxContentSize;
  }

  static fromImage(
    image: HTMLImageElement,
    override?: Partial<GroundGridConfig>,
  ): GroundTileSheet {
    const grid = detectGroundGrid(image, override);
    const pixels = readImagePixels(image);
    const sheet = {
      image,
      columns: grid.columns,
      rows: grid.rows,
      fps: 0,
      marginX: grid.marginX,
      marginY: grid.marginY,
      spacingX: grid.spacingX,
      spacingY: grid.spacingY,
    };

    const cellBounds: FrameRect[] = [];
    const trimmedBounds: FrameRect[] = [];
    const total = grid.columns * grid.rows;
    let maxContentSize = 0;

    for (let i = 0; i < total; i++) {
      const cell = getFrameRect(sheet, i);
      cellBounds.push(cell);
      const trimmed = pixels ? trimContentBounds(pixels, cell) : cell;
      trimmedBounds.push(trimmed);
      maxContentSize = Math.max(maxContentSize, trimmed.sw, trimmed.sh);
    }

    if (maxContentSize < 1) {
      for (const cell of cellBounds) {
        maxContentSize = Math.max(maxContentSize, cell.sw, cell.sh);
      }
    }

    return new GroundTileSheet(image, grid, cellBounds, trimmedBounds, maxContentSize);
  }

  /**
   * Draws a tile centred in the destination cell.
   * Full-bleed tiles (real content fills most of the cell) stretch the whole cell slice.
   * Padded tiles (white/light bg detected) trim margins and share one scale factor.
   */
  drawTile(
    ctx: CanvasRenderingContext2D,
    tileIndex: number,
    destX: number,
    destY: number,
    destSize: number,
  ) {
    if (tileIndex < 0 || tileIndex >= this.tileCount) return;

    const cell = this.cellBounds[tileIndex];
    const { sx, sy, sw, sh } = this.trimmedBounds[tileIndex];
    if (sw <= 0 || sh <= 0) return;

    ctx.imageSmoothingEnabled = false;

    const cellArea = cell.sw * cell.sh;
    const trimArea = sw * sh;
    const fillRatio = cellArea > 0 ? trimArea / cellArea : 0;

    if (fillRatio >= 0.85) {
      ctx.drawImage(
        this.image,
        cell.sx, cell.sy, cell.sw, cell.sh,
        destX, destY, destSize, destSize,
      );
      return;
    }

    const scale = destSize / this.maxContentSize;
    const drawW = Math.round(sw * scale);
    const drawH = Math.round(sh * scale);
    const dx = Math.round(destX + (destSize - drawW) / 2);
    const dy = Math.round(destY + (destSize - drawH) / 2);

    ctx.drawImage(this.image, sx, sy, sw, sh, dx, dy, drawW, drawH);
  }
}
