import type { Camera } from './Camera';
import type { AgentRuntime } from './AgentRuntime';

const PH_W = 22;
const PH_H = 30;
const PH_R = 5;
export const RENDER_HEIGHT = 64;

const HP_BAR_W = 36;
const HP_BAR_H = 4;

// ── Shared speech bubble renderer (also used by World for the player) ─────────
export function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  topOffset: number,           // distance from cy to the bottom of the bubble tail
  bubble: { message: string; elapsed: number; duration: number },
) {
  const MAX_W   = 160;
  const PAD     = 8;
  const FS      = 11;
  const LINE_H  = FS + 3;
  const fadeStart = bubble.duration * 0.6;
  const alpha = bubble.elapsed < fadeStart
    ? 1
    : Math.max(0, 1 - (bubble.elapsed - fadeStart) / (bubble.duration - fadeStart));

  ctx.save();
  ctx.font = `${FS}px sans-serif`;

  const words = bubble.message.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > MAX_W - PAD * 2 && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  if (!lines.length) lines.push(bubble.message);

  const textW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const bW = Math.min(textW + PAD * 2, MAX_W);
  const bH = lines.length * LINE_H + PAD * 2;
  const bX = cx - bW / 2;
  const bY = cy - topOffset - bH - 8; // 8px gap above tail
  const r  = 6;

  ctx.globalAlpha = alpha;
  ctx.fillStyle   = 'rgba(255,255,255,0.96)';
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(bX + r, bY);
  ctx.lineTo(bX + bW - r, bY);
  ctx.arcTo(bX + bW, bY, bX + bW, bY + r, r);
  ctx.lineTo(bX + bW, bY + bH - r);
  ctx.arcTo(bX + bW, bY + bH, bX + bW - r, bY + bH, r);
  ctx.lineTo(cx + 6, bY + bH);
  ctx.lineTo(cx, bY + bH + 8);
  ctx.lineTo(cx - 6, bY + bH);
  ctx.lineTo(bX + r, bY + bH);
  ctx.arcTo(bX, bY + bH, bX, bY + bH - r, r);
  ctx.lineTo(bX, bY + r);
  ctx.arcTo(bX, bY, bX + r, bY, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle    = 'rgba(20,20,20,0.9)';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], cx, bY + PAD + i * LINE_H);
  }
  ctx.restore();
}

// ── AgentRenderer ─────────────────────────────────────────────────────────────

export class AgentRenderer {
  draw(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    agents: AgentRuntime[],
    cssW: number,
    cssH: number,
  ) {
    const now = Date.now();
    for (const agent of agents) {
      const sp = camera.worldToScreen(agent.x, agent.y, cssW, cssH);
      this.drawAgent(ctx, sp.x, sp.y, agent, now);
    }
  }

  private drawAgent(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    agent: AgentRuntime,
    now: number,
  ) {
    const hasSprite = agent.character.hasAnimations();
    // halfH is the distance from the character's center (sy) to the top of the visual.
    const halfH = hasSprite ? RENDER_HEIGHT / 2 : PH_H / 2;

    if (hasSprite) {
      const avail = agent.character.availableStates();
      const animState = avail.includes(agent.movementState as never)
        ? agent.movementState as import('./Player').AnimationState
        : 'idle';
      agent.character.draw(ctx, sx, sy, animState, agent.facing);
    } else {
      this.drawPlaceholder(ctx, sx, sy, agent.color);
    }

    this.drawHealthBar(ctx, sx, sy, halfH, agent.health.fraction);
    this.drawNameLabel(ctx, sx, sy, halfH, agent.name);

    if (agent.lifecycleState === 'thinking') this.drawThinkingDots(ctx, sx, sy, halfH, now);
    if (agent.speechBubble) drawSpeechBubble(ctx, sx, sy, halfH + 28, agent.speechBubble);
  }

  private drawPlaceholder(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) {
    const x = cx - PH_W / 2;
    const y = cy - PH_H / 2;
    const r = PH_R;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + PH_W - r, y);
    ctx.arcTo(x + PH_W, y, x + PH_W, y + r, r);
    ctx.lineTo(x + PH_W, y + PH_H - r);
    ctx.arcTo(x + PH_W, y + PH_H, x + PH_W - r, y + PH_H, r);
    ctx.lineTo(x + r, y + PH_H);
    ctx.arcTo(x, y + PH_H, x, y + PH_H - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 4, cy - 4, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
    ctx.restore();
  }

  private drawHealthBar(ctx: CanvasRenderingContext2D, cx: number, cy: number, halfH: number, fraction: number) {
    const topY = cy - halfH - 8;
    const x    = cx - HP_BAR_W / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, topY, HP_BAR_W, HP_BAR_H);
    const color = fraction > 0.5 ? '#4caf50' : fraction > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillStyle = color;
    ctx.fillRect(x, topY, HP_BAR_W * fraction, HP_BAR_H);
    ctx.restore();
  }

  private drawNameLabel(ctx: CanvasRenderingContext2D, cx: number, cy: number, halfH: number, name: string) {
    ctx.save();
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(40, 40, 40, 0.7)';
    ctx.fillText(name, cx, cy - halfH - 12);
    ctx.restore();
  }

  private drawThinkingDots(ctx: CanvasRenderingContext2D, cx: number, cy: number, halfH: number, now: number) {
    const baseY = cy - halfH - 24;
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const phase = (now / 350 + i * 0.6) % (Math.PI * 2);
      const alpha = 0.3 + 0.7 * ((Math.sin(phase) + 1) / 2);
      ctx.beginPath();
      ctx.arc(cx - 5 + i * 5, baseY, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(80,80,80,${alpha.toFixed(2)})`;
      ctx.fill();
    }
    ctx.restore();
  }
}
