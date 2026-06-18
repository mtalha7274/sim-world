import { useEffect, useRef } from 'react';
import {
  getFrameRect,
  getFrameSize,
  getGridLines,
  type SpriteSheetConfig,
} from '../engine/spriteSheet';

interface Props {
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
  showGrid?: boolean;
}

const MAX_W = 96;
const MAX_H = 80;
const SHEET_MAX_W = 260;

function buildSheet(sheet: Omit<SpriteSheetConfig, 'fps'>, fps: number): SpriteSheetConfig {
  return { ...sheet, fps };
}

function SheetOverview({
  image,
  columns,
  rows,
  frameWidth,
  frameHeight,
  marginX,
  marginY,
  spacingX,
  spacingY,
  showGrid,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const sheet = buildSheet({
      image,
      columns,
      rows,
      frameWidth,
      frameHeight,
      marginX,
      marginY,
      spacingX,
      spacingY,
    }, 8);

    const scale = Math.min(SHEET_MAX_W / image.naturalWidth, 1);
    const drawW = Math.round(image.naturalWidth * scale);
    const drawH = Math.round(image.naturalHeight * scale);

    canvas.width = drawW;
    canvas.height = drawH;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, drawW, drawH);
    ctx.drawImage(image, 0, 0, drawW, drawH);

    if (showGrid) {
      const { vertical, horizontal } = getGridLines(sheet);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = 1;

      for (const vx of vertical) {
        const x = vx * scale + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, drawH);
        ctx.stroke();
      }
      for (const hy of horizontal) {
        const y = hy * scale + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(drawW, y);
        ctx.stroke();
      }
    }
  }, [
    image, columns, rows, frameWidth, frameHeight,
    marginX, marginY, spacingX, spacingY, showGrid,
  ]);

  return (
    <canvas
      ref={canvasRef}
      style={{ imageRendering: 'pixelated', display: 'block', maxWidth: '100%' }}
    />
  );
}

export function AnimationPreview({
  image,
  columns,
  rows,
  fps,
  frameWidth,
  frameHeight,
  marginX,
  marginY,
  spacingX,
  spacingY,
  showGrid = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const sheetConfig = buildSheet({
      image,
      columns,
      rows,
      frameWidth,
      frameHeight,
      marginX,
      marginY,
      spacingX,
      spacingY,
    }, fps);
    const { frameWidth: fw, frameHeight: fh, totalFrames } = getFrameSize(sheetConfig);

    const scale  = Math.min(MAX_W / fw, MAX_H / fh);
    const drawW  = Math.round(fw * scale);
    const drawH  = Math.round(fh * scale);

    canvas.width  = drawW;
    canvas.height = drawH;
    ctx.imageSmoothingEnabled = false;

    const frameDuration = 1 / Math.max(fps, 0.1);
    let elapsed  = 0;
    let frame    = 0;
    let lastTime = performance.now();
    let rafId    = 0;

    function tick(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      elapsed += dt;

      while (elapsed >= frameDuration) {
        elapsed -= frameDuration;
        frame = (frame + 1) % totalFrames;
      }

      const { sx, sy, sw, sh } = getFrameRect(sheetConfig, frame);

      ctx.clearRect(0, 0, drawW, drawH);
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, drawW, drawH);

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    image, columns, rows, fps,
    frameWidth, frameHeight, marginX, marginY, spacingX, spacingY,
  ]);

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <canvas
        ref={canvasRef}
        style={{ imageRendering: 'pixelated', display: 'block' }}
      />
      {showGrid && (
        <SheetOverview
          image={image}
          columns={columns}
          rows={rows}
          fps={fps}
          frameWidth={frameWidth}
          frameHeight={frameHeight}
          marginX={marginX}
          marginY={marginY}
          spacingX={spacingX}
          spacingY={spacingY}
          showGrid={showGrid}
        />
      )}
    </div>
  );
}
