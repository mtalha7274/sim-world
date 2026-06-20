import type { SpriteAnimation } from './SpriteAnimation';
import type { AnimationState, Facing } from './Player';

const RENDER_HEIGHT = 64;
const PLACEHOLDER_W = 22;
const PLACEHOLDER_H = 30;
const PLACEHOLDER_RADIUS = 5;

export class Character {
  private animations = new Map<AnimationState, SpriteAnimation>();
  private currentState: AnimationState = 'idle';

  hasAnimations(): boolean { return this.animations.size > 0; }

  setAnimation(state: AnimationState, anim: SpriteAnimation) {
    this.animations.set(state, anim);
  }

  clearAnimation(state: AnimationState) {
    this.animations.delete(state);
  }

  clearAll() {
    this.animations.clear();
    this.currentState = 'idle';
  }

  update(dt: number, state: AnimationState) {
    if (state !== this.currentState) {
      this.animations.get(this.currentState)?.reset();
      this.currentState = state;
    }
    this.animations.get(state)?.update(dt);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    state: AnimationState,
    facing: Facing,
  ) {
    const anim = this.animations.get(state);
    const flipH = facing === 'left';

    if (anim) {
      const [drawW, drawH] = anim.renderSize(RENDER_HEIGHT);
      anim.draw(ctx, screenX, screenY, drawW, drawH, flipH);
    } else {
      this.drawPlaceholder(ctx, screenX, screenY, flipH);
    }
  }

  private drawPlaceholder(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    flipH: boolean,
  ) {
    const x = cx - PLACEHOLDER_W / 2;
    const y = cy - PLACEHOLDER_H / 2;
    const r = PLACEHOLDER_RADIUS;

    ctx.save();
    if (flipH) {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + PLACEHOLDER_W - r, y);
    ctx.arcTo(x + PLACEHOLDER_W, y, x + PLACEHOLDER_W, y + r, r);
    ctx.lineTo(x + PLACEHOLDER_W, y + PLACEHOLDER_H - r);
    ctx.arcTo(x + PLACEHOLDER_W, y + PLACEHOLDER_H, x + PLACEHOLDER_W - r, y + PLACEHOLDER_H, r);
    ctx.lineTo(x + r, y + PLACEHOLDER_H);
    ctx.arcTo(x, y + PLACEHOLDER_H, x, y + PLACEHOLDER_H - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();

    ctx.fillStyle = '#1a1a2e';
    ctx.fill();

    const dotX = flipH ? cx - 4 : cx + 4;
    ctx.beginPath();
    ctx.arc(dotX, cy - 4, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff44';
    ctx.fill();

    ctx.restore();
  }
}
