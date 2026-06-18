export interface SpriteSheetConfig {
  image: HTMLImageElement;
  columns: number;
  rows: number;
  fps: number;
  frameWidth?: number;
  frameHeight?: number;
  marginX?: number;
  marginY?: number;
  spacingX?: number;
  spacingY?: number;
}

export interface FrameRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface FrameSize {
  frameWidth: number;
  frameHeight: number;
  totalFrames: number;
}

export interface DetectedGrid {
  columns: number;
  rows: number;
  marginX: number;
  marginY: number;
  spacingX: number;
  spacingY: number;
}

const MIN_FRAME = 8;
const MAX_FRAME = 128;
const MAX_COLS  = 64;
const MAX_ROWS  = 64;

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

function columnAlpha(data: ImageData, x: number, y0: number, y1: number): number {
  const { width, data: px } = data;
  let sum = 0;
  const count = y1 - y0;
  for (let y = y0; y < y1; y++) {
    sum += px[(y * width + x) * 4 + 3];
  }
  return sum / count;
}

function boundaryEmptiness(data: ImageData, x: number): number {
  const { height } = data;
  const bandH = Math.max(1, Math.floor(height * 0.6));
  const y0 = Math.floor((height - bandH) / 2);
  const alpha = columnAlpha(data, x, y0, y0 + bandH);
  return 1 - alpha / 255;
}

function scoreUniformColumns(
  data: ImageData,
  width: number,
  columns: number,
): number {
  const frameW = width / columns;
  if (frameW < MIN_FRAME || !Number.isInteger(frameW)) return -1;

  let score = 0;
  for (let c = 1; c < columns; c++) {
    const x = Math.min(Math.round(c * frameW), width - 1);
    score += boundaryEmptiness(data, x);
  }
  return score / Math.max(columns - 1, 1);
}

function detectSquareRow(width: number, height: number): DetectedGrid | null {
  if (height < MIN_FRAME) return null;
  if (width % height !== 0) return null;

  const columns = width / height;
  if (columns < 2 || columns > MAX_COLS) return null;

  return {
    columns,
    rows: 1,
    marginX: 0,
    marginY: 0,
    spacingX: 0,
    spacingY: 0,
  };
}

function detectByColumnDivisors(
  data: ImageData,
  width: number,
  height: number,
): DetectedGrid | null {
  let best: DetectedGrid | null = null;
  let bestScore = -1;

  for (let columns = 2; columns <= Math.min(MAX_COLS, Math.floor(width / MIN_FRAME)); columns++) {
    if (width % columns !== 0) continue;

    const frameW = width / columns;
    if (frameW < MIN_FRAME || frameW > MAX_FRAME) continue;

    const score = scoreUniformColumns(data, width, columns);
    if (score > bestScore || (score === bestScore && best && columns > best.columns)) {
      bestScore = score;
      best = {
        columns,
        rows: 1,
        marginX: 0,
        marginY: 0,
        spacingX: 0,
        spacingY: 0,
      };
    }
  }

  // Tight sprite sheets often have no empty gutters between frames.
  if (best && bestScore < 0.35) {
    const square: DetectedGrid[] = [];
    const fitsRow: DetectedGrid[] = [];
    for (let columns = 2; columns <= Math.min(MAX_COLS, Math.floor(width / MIN_FRAME)); columns++) {
      if (width % columns !== 0) continue;
      const frameW = width / columns;
      if (frameW < MIN_FRAME) continue;
      const grid = { columns, rows: 1, marginX: 0, marginY: 0, spacingX: 0, spacingY: 0 };
      if (frameW === height) square.push(grid);
      if (frameW <= height) fitsRow.push(grid);
    }
    const pickMost = (list: DetectedGrid[]) =>
      list.reduce((a, b) => (b.columns > a.columns ? b : a), list[0]);
    if (square.length) return pickMost(square);
    if (fitsRow.length) return pickMost(fitsRow);
  }

  return best;
}

function detectMultiRowSquare(data: ImageData, width: number, height: number): DetectedGrid | null {
  let best: DetectedGrid | null = null;
  let bestScore = -1;

  for (let frameSize = MIN_FRAME; frameSize <= Math.min(MAX_FRAME, height, width); frameSize++) {
    if (width % frameSize !== 0 || height % frameSize !== 0) continue;

    const columns = width / frameSize;
    const rows = height / frameSize;
    if (columns < 2 || columns > MAX_COLS || rows > MAX_ROWS) continue;

    const colScore = scoreUniformColumns(data, width, columns);
    const score = colScore + (rows === 1 ? 0.1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = {
        columns,
        rows,
        marginX: 0,
        marginY: 0,
        spacingX: 0,
        spacingY: 0,
      };
    }
  }

  return best;
}

function detectFromGutters(data: ImageData): DetectedGrid | null {
  const { width, height } = data;
  const bandH = Math.max(1, Math.floor(height * 0.6));
  const y0 = Math.floor((height - bandH) / 2);
  const y1 = y0 + bandH;

  const isGutterCol = (x: number) => columnAlpha(data, x, y0, y1) < 12;

  const segments: number[] = [];
  let segStart = 0;
  let inGutter = isGutterCol(0);

  for (let x = 1; x <= width; x++) {
    const gutter = x < width ? isGutterCol(x) : false;
    if (gutter !== inGutter) {
      if (!inGutter) segments.push(x - segStart);
      segStart = x;
      inGutter = gutter;
    }
  }

  if (segments.length < 2) return null;

  const avg = segments.reduce((a, b) => a + b, 0) / segments.length;
  const uniform = segments.every(s => Math.abs(s - avg) / avg < 0.2);
  if (!uniform || avg < MIN_FRAME) return null;

  const frameWidth = Math.round(avg);
  const spacingX = segments.length > 1
    ? Math.round((width - frameWidth * segments.length) / (segments.length - 1))
    : 0;

  return {
    columns: segments.length,
    rows: 1,
    marginX: 0,
    marginY: 0,
    spacingX: Math.max(spacingX, 0),
    spacingY: 0,
  };
}

export function detectSpriteGrid(image: HTMLImageElement): DetectedGrid {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const pixels = readImagePixels(image);

  if (pixels) {
    const byDivisors = detectByColumnDivisors(pixels, w, h);
    if (byDivisors) return byDivisors;

    const gutters = detectFromGutters(pixels);
    if (gutters) return gutters;

    const multiRow = detectMultiRowSquare(pixels, w, h);
    if (multiRow) return multiRow;
  }

  const square = detectSquareRow(w, h);
  if (square) return square;

  if (w >= MIN_FRAME * 2) {
    return { columns: Math.min(Math.max(2, Math.round(w / h)), MAX_COLS), rows: 1, marginX: 0, marginY: 0, spacingX: 0, spacingY: 0 };
  }

  return { columns: 1, rows: 1, marginX: 0, marginY: 0, spacingX: 0, spacingY: 0 };
}

export function isGridConfigStale(
  image: HTMLImageElement,
  columns: number,
  rows: number,
  spacingX = 0,
  spacingY = 0,
  marginX = 0,
  marginY = 0,
): boolean {
  const detected = detectSpriteGrid(image);
  if (detected.columns !== columns || detected.rows !== rows) return true;

  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const fw = (w - marginX * 2 - spacingX * (columns - 1)) / columns;
  const fh = (h - marginY * 2 - spacingY * (rows - 1)) / rows;
  if (fw < MIN_FRAME || fh < MIN_FRAME) return true;
  if (Math.abs(fw - Math.round(fw)) > 0.01 || Math.abs(fh - Math.round(fh)) > 0.01) return true;

  return false;
}

export function getFrameSize(sheet: SpriteSheetConfig): FrameSize {
  const marginX = sheet.marginX ?? 0;
  const marginY = sheet.marginY ?? 0;
  const spacingX = sheet.spacingX ?? 0;
  const spacingY = sheet.spacingY ?? 0;

  const frameWidth = sheet.frameWidth
    ?? (sheet.image.naturalWidth - marginX * 2 - spacingX * (sheet.columns - 1)) / sheet.columns;
  const frameHeight = sheet.frameHeight
    ?? (sheet.image.naturalHeight - marginY * 2 - spacingY * (sheet.rows - 1)) / sheet.rows;

  return {
    frameWidth,
    frameHeight,
    totalFrames: sheet.columns * sheet.rows,
  };
}

export function getFrameRect(sheet: SpriteSheetConfig, frameIndex: number): FrameRect {
  const { frameWidth, frameHeight } = getFrameSize(sheet);
  const col = frameIndex % sheet.columns;
  const row = Math.floor(frameIndex / sheet.columns);
  const marginX = sheet.marginX ?? 0;
  const marginY = sheet.marginY ?? 0;
  const spacingX = sheet.spacingX ?? 0;
  const spacingY = sheet.spacingY ?? 0;

  return {
    sx: marginX + col * (frameWidth + spacingX),
    sy: marginY + row * (frameHeight + spacingY),
    sw: frameWidth,
    sh: frameHeight,
  };
}

export function getGridLines(sheet: SpriteSheetConfig): { vertical: number[]; horizontal: number[] } {
  const { frameWidth, frameHeight } = getFrameSize(sheet);
  const marginX = sheet.marginX ?? 0;
  const marginY = sheet.marginY ?? 0;
  const spacingX = sheet.spacingX ?? 0;
  const spacingY = sheet.spacingY ?? 0;

  const vertical: number[] = [];
  for (let c = 0; c < sheet.columns; c++) {
    vertical.push(marginX + c * (frameWidth + spacingX));
  }
  vertical.push(marginX + sheet.columns * frameWidth + (sheet.columns - 1) * spacingX);

  const horizontal: number[] = [];
  for (let r = 0; r < sheet.rows; r++) {
    horizontal.push(marginY + r * (frameHeight + spacingY));
  }
  horizontal.push(marginY + sheet.rows * frameHeight + (sheet.rows - 1) * spacingY);

  return { vertical, horizontal };
}

export function mergeDetectedGrid(
  zone: Pick<SpriteSheetConfig, 'image' | 'columns' | 'rows' | 'fps' | 'marginX' | 'marginY' | 'spacingX' | 'spacingY'>,
): DetectedGrid & { fps: number } {
  const detected = detectSpriteGrid(zone.image);
  return {
    columns: detected.columns,
    rows: detected.rows,
    marginX: detected.marginX,
    marginY: detected.marginY,
    spacingX: detected.spacingX,
    spacingY: detected.spacingY,
    fps: zone.fps,
  };
}
