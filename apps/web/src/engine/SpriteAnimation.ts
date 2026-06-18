import {
  getFrameRect,
  getFrameSize,
  type SpriteSheetConfig,
} from './spriteSheet';

export type SpriteSheet = SpriteSheetConfig;

export class SpriteAnimation {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly totalFrames: number;

  private elapsed = 0;
  private frameIndex = 0;

  constructor(private sheet: SpriteSheet) {
    const size = getFrameSize(sheet);
    this.frameWidth  = size.frameWidth;
    this.frameHeight = size.frameHeight;
    this.totalFrames = size.totalFrames;
  }

  update(dt: number) {
    if (this.totalFrames <= 1) return;
    const frameDuration = 1 / this.sheet.fps;
    this.elapsed += dt;
    while (this.elapsed >= frameDuration) {
      this.elapsed -= frameDuration;
      this.frameIndex = (this.frameIndex + 1) % this.totalFrames;
    }
  }

  reset() {
    this.elapsed = 0;
    this.frameIndex = 0;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    drawW: number,
    drawH: number,
    flipH: boolean,
  ) {
    const { sx, sy, sw, sh } = getFrameRect(this.sheet, this.frameIndex);

    ctx.save();
    ctx.translate(screenX, screenY);
    if (flipH) ctx.scale(-1, 1);
    ctx.drawImage(
      this.sheet.image,
      sx, sy, sw, sh,
      -drawW / 2, -drawH / 2, drawW, drawH,
    );
    ctx.restore();
  }

  renderSize(targetHeight: number): [number, number] {
    const scale = targetHeight / this.frameHeight;
    return [Math.round(this.frameWidth * scale), targetHeight];
  }
}
