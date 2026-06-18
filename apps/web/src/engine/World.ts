import { Loop }           from './Loop';
import { Camera }         from './Camera';
import { Player }         from './Player';
import { Input }          from './Input';
import { SpriteAnimation, type SpriteSheet } from './SpriteAnimation';
import { Character }      from './Character';
import { GridRenderer }   from './GridRenderer';
import type { AnimationState } from './Player';

export type { AnimationState };

export interface AnimConfig {
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

export class World {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;

  private loop: Loop;
  private camera: Camera;
  private player: Player;
  private input: Input;
  private grid: GridRenderer;
  private character: Character;

  private resizeTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.camera    = new Camera();
    this.player    = new Player();
    this.input     = new Input();
    this.grid      = new GridRenderer();
    this.character = new Character();
    this.loop      = new Loop(this.update, this.render);

    this.input.attach();
    this.applyDPR();
    window.addEventListener('resize', this.onResize);
  }

  start() {
    this.loop.start();
  }

  destroy() {
    this.loop.stop();
    this.input.detach();
    window.removeEventListener('resize', this.onResize);
    clearTimeout(this.resizeTimer);
  }

  setAnimation(state: AnimationState, config: AnimConfig) {
    const sheet: SpriteSheet = {
      image:        config.image,
      columns:      config.columns,
      rows:         config.rows,
      fps:          config.fps,
      frameWidth:   config.frameWidth,
      frameHeight:  config.frameHeight,
      marginX:      config.marginX,
      marginY:      config.marginY,
      spacingX:     config.spacingX,
      spacingY:     config.spacingY,
    };
    this.character.setAnimation(state, new SpriteAnimation(sheet));
  }

  clearAnimation(state: AnimationState) {
    this.character.clearAnimation(state);
  }

  clearAllAnimations() {
    this.character.clearAll();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private update = (dt: number) => {
    this.player.update(dt, this.input);
    this.camera.update(dt, this.player.x, this.player.y);
    this.character.update(dt, this.player.animationState);
  };

  private render = () => {
    const { ctx, cssW, cssH, dpr } = this;

    ctx.clearRect(0, 0, cssW, cssH);

    this.grid.draw(ctx, this.camera, cssW, cssH, dpr);

    const sp = this.camera.worldToScreen(this.player.x, this.player.y, cssW, cssH);
    this.character.draw(
      ctx,
      sp.x,
      sp.y + this.player.jumpLift,
      this.player.animationState,
      this.player.facing,
    );
  };

  private applyDPR() {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.canvas.width  = this.cssW * this.dpr;
    this.canvas.height = this.cssH * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  private onResize = () => {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.applyDPR(), 120);
  };
}
