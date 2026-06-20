import { Loop }           from './Loop';
import { Camera }         from './Camera';
import { Player }         from './Player';
import { Input }          from './Input';
import { SpriteAnimation, type SpriteSheet } from './SpriteAnimation';
import { Character }      from './Character';
import { GridRenderer, CELL_SIZE } from './GridRenderer';
import { TileMap }        from './TileMap';
import { GroundRenderer } from './GroundRenderer';
import { GroundTileSheet, type GroundGridConfig } from './GroundTileSheet';
import { AgentManager, type AgentStateSnapshot } from './AgentManager';
import { AgentRenderer, drawSpeechBubble, RENDER_HEIGHT } from './AgentRenderer';
import { Health }         from './Health';
import type { EngineContext } from './ActionRegistry';
import type { AnimationState } from './Player';
import type { WeaponDef } from '../store/weapons';

export type { AnimationState };
export type { AgentStateSnapshot };

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

export interface SpawnAgentOpts {
  name: string;
  personality: string;
  model: string;
  color: string;
  maxHP?: number;
  equippedWeaponId?: string | null;
  allowedActions?: string[] | null;
}

export interface PlayerState {
  maxHP: number;
  currentHP: number;
  isDead: boolean;
  equippedWeaponId: string | null;
}

export class World {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr  = 1;

  private loop:           Loop;
  private camera:         Camera;
  private player:         Player;
  private input:          Input;
  private grid:           GridRenderer;
  private character:      Character;   // player's sprite
  private tileMap:        TileMap;
  private groundRenderer: GroundRenderer;
  private groundSheet:    GroundTileSheet | null = null;
  private agentManager:   AgentManager;
  private agentRenderer:  AgentRenderer;

  private playerHealth:   Health = new Health(100);
  private playerWeaponId: string | null = null;
  private playerDead      = false;
  private weaponDefs:     WeaponDef[] = [];
  private playerSpeech:   { message: string; elapsed: number; duration: number } | null = null;

  private resizeTimer = 0;

  // Engine context passed to action definitions — only safe to call World-internal helpers.
  private readonly engineCtx: EngineContext = {
    dealDamage: (targetName, damage) => {
      if (targetName === 'Player') {
        if (this.playerDead) return;
        this.playerHealth.takeDamage(damage);
        if (this.playerHealth.isDead) {
          this.playerDead = true;
          this.onPlayerStateChange?.(this.getPlayerState());
        }
        return;
      }
      const agent = this.agentManager.getAgentByName(targetName);
      if (agent) agent.health.takeDamage(damage);
    },
    findCharacterPosition: (name) => {
      if (name === 'Player') return { x: this.player.x, y: this.player.y };
      const agent = this.agentManager.getAgentByName(name);
      return agent ? { x: agent.x, y: agent.y } : null;
    },
    getWeaponDef: (id) => {
      return this.weaponDefs.find(w => w.id === id) ?? null;
    },
  };

  // React callbacks.
  onAgentsChange?:     (agents: AgentStateSnapshot[]) => void;
  onPlayerStateChange?: (state: PlayerState) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d')!;

    this.camera         = new Camera();
    this.player         = new Player();
    this.input          = new Input();
    this.grid           = new GridRenderer();
    this.character      = new Character();
    this.tileMap        = new TileMap();
    this.groundRenderer = new GroundRenderer();
    this.agentManager   = new AgentManager();
    this.agentRenderer  = new AgentRenderer();
    this.loop           = new Loop(this.update, this.render);

    this.agentManager.onStateChange = () => {
      this.onAgentsChange?.(this.agentManager.getStateSnapshots());
    };

    this.input.attach();
    this.applyDPR();
    window.addEventListener('resize', this.onResize);
  }

  start()   { this.loop.start(); }

  destroy() {
    this.loop.stop();
    this.input.detach();
    window.removeEventListener('resize', this.onResize);
    clearTimeout(this.resizeTimer);
  }

  // ── API key / pause ───────────────────────────────────────────────────────

  setApiKey(key: string) {
    this.agentManager.setApiKey(key);
  }

  setPauseAI(paused: boolean) {
    this.agentManager.setPauseAI(paused);
  }

  // ── Agent API ─────────────────────────────────────────────────────────────

  spawnAgent(opts: SpawnAgentOpts): string {
    const angle = Math.random() * Math.PI * 2;
    const dist  = (3 + Math.random() * 3) * CELL_SIZE;
    const x = this.player.x + Math.cos(angle) * dist;
    const y = this.player.y + Math.sin(angle) * dist;
    return this.agentManager.spawn({ ...opts, x, y });
  }

  removeAgent(id: string) {
    this.agentManager.remove(id);
  }

  getAgentStates(): AgentStateSnapshot[] {
    return this.agentManager.getStateSnapshots();
  }

  updateAgentHP(id: string, maxHP: number) {
    const agent = this.agentManager.getAgentById(id);
    if (agent) agent.setHP(maxHP);
  }

  updateAgentWeapon(id: string, weaponId: string | null) {
    const agent = this.agentManager.getAgentById(id);
    if (agent) agent.equippedWeaponId = weaponId;
  }

  updateAgentModel(id: string, model: string) {
    const agent = this.agentManager.getAgentById(id);
    if (agent) agent.model = model;
  }

  // ── Player API ────────────────────────────────────────────────────────────

  getPlayerState(): PlayerState {
    return {
      maxHP:           this.playerHealth.maxHP,
      currentHP:       this.playerHealth.currentHP,
      isDead:          this.playerDead,
      equippedWeaponId: this.playerWeaponId,
    };
  }

  setPlayerMaxHP(max: number) {
    this.playerHealth.setMax(max);
    this.onPlayerStateChange?.(this.getPlayerState());
  }

  setPlayerWeapon(weaponId: string | null) {
    this.playerWeaponId = weaponId;
    this.onPlayerStateChange?.(this.getPlayerState());
  }

  respawnPlayer() {
    this.playerDead   = false;
    this.player.x     = 0;
    this.player.y     = 0;
    this.playerHealth.reset();
    this.onPlayerStateChange?.(this.getPlayerState());
  }

  // ── Weapon definitions ────────────────────────────────────────────────────

  setWeaponDefs(defs: WeaponDef[]) {
    this.weaponDefs = defs;
  }

  // ── Player → agent messaging ──────────────────────────────────────────────

  broadcastPlayerMessage(text: string, targetId?: string) {
    this.playerSpeech = { message: text, elapsed: 0, duration: 5000 };
    const RADIUS = 8 * CELL_SIZE;
    const agents = this.agentManager.getAgents();

    if (targetId) {
      const agent = this.agentManager.getAgentById(targetId);
      agent?.queueMessage(text);
    } else {
      for (const agent of agents) {
        const dx = agent.x - this.player.x;
        const dy = agent.y - this.player.y;
        if (Math.sqrt(dx * dx + dy * dy) <= RADIUS) {
          agent.queueMessage(text);
        }
      }
    }
    // Notify React so agent memory panels update.
    this.onAgentsChange?.(this.agentManager.getStateSnapshots());
  }

  // ── Character sprite API (player + agents) ────────────────────────────────

  setCharacterAnimation(charId: 'player' | string, state: AnimationState, config: AnimConfig) {
    const sheet: SpriteSheet = {
      image:       config.image,
      columns:     config.columns,
      rows:        config.rows,
      fps:         config.fps,
      frameWidth:  config.frameWidth,
      frameHeight: config.frameHeight,
      marginX:     config.marginX,
      marginY:     config.marginY,
      spacingX:    config.spacingX,
      spacingY:    config.spacingY,
    };
    const anim = new SpriteAnimation(sheet);

    if (charId === 'player') {
      this.character.setAnimation(state, anim);
    } else {
      const agent = this.agentManager.getAgentById(charId);
      agent?.character.setAnimation(state, anim);
    }
  }

  clearCharacterAnimation(charId: 'player' | string, state: AnimationState) {
    if (charId === 'player') {
      this.character.clearAnimation(state);
    } else {
      const agent = this.agentManager.getAgentById(charId);
      agent?.character.clearAnimation(state);
    }
  }

  clearAllCharacterAnimations(charId: 'player' | string) {
    if (charId === 'player') {
      this.character.clearAll();
    } else {
      const agent = this.agentManager.getAgentById(charId);
      agent?.character.clearAll();
    }
  }

  // Legacy shims so existing SpritePanel call sites keep working.
  setAnimation(state: AnimationState, config: AnimConfig)  { this.setCharacterAnimation('player', state, config); }
  clearAnimation(state: AnimationState)                    { this.clearCharacterAnimation('player', state); }
  clearAllAnimations()                                     { this.clearAllCharacterAnimations('player'); }

  // ── Ground / tile API ─────────────────────────────────────────────────────

  setGroundSheet(image: HTMLImageElement | null, grid?: Partial<GroundGridConfig>) {
    this.groundSheet = image ? GroundTileSheet.fromImage(image, grid) : null;
  }

  getGroundSheet(): GroundTileSheet | null { return this.groundSheet; }

  paintCell(cellX: number, cellY: number, tileIndex: number) { this.tileMap.set(cellX, cellY, tileIndex); }
  eraseCell(cellX: number, cellY: number)                    { this.tileMap.delete(cellX, cellY); }
  getTileMap(): Record<string, number>                       { return this.tileMap.toRecord(); }
  loadTileMap(data: Record<string, number>)                  { this.tileMap.loadRecord(data); }
  clearTiles()                                               { this.tileMap.clear(); }

  screenToCell(clientX: number, clientY: number): { cellX: number; cellY: number } {
    const rect   = this.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const worldX  = this.camera.x + screenX - this.cssW / 2;
    const worldY  = this.camera.y + screenY - this.cssH / 2;
    return {
      cellX: Math.floor(worldX / CELL_SIZE),
      cellY: Math.floor(worldY / CELL_SIZE),
    };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private update = (dt: number) => {
    if (!this.playerDead) {
      this.player.update(dt, this.input);

      if (this.input.consumeAttackPress()) {
        this.playerAttack();
      }
    }

    this.camera.update(dt, this.player.x, this.player.y);
    this.character.update(dt, this.player.animationState);
    this.agentManager.update(dt, this.player, this.engineCtx);

    if (this.playerSpeech) {
      this.playerSpeech.elapsed += dt * 1000;
      if (this.playerSpeech.elapsed >= this.playerSpeech.duration) this.playerSpeech = null;
    }
  };

  private playerAttack() {
    const weaponDef  = this.weaponDefs.find(w => w.id === this.playerWeaponId);
    const damage     = weaponDef?.damage ?? 5;
    const rangeWorld = (weaponDef?.rangeInCells ?? 1) * CELL_SIZE;

    let nearest: { name: string; dist: number } | null = null;
    for (const agent of this.agentManager.getAgents()) {
      const dx   = agent.x - this.player.x;
      const dy   = agent.y - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= rangeWorld && (!nearest || dist < nearest.dist)) {
        nearest = { name: agent.name, dist };
      }
    }

    if (nearest) {
      this.engineCtx.dealDamage!(nearest.name, damage);
      // Notify React so health bars refresh.
      this.onAgentsChange?.(this.agentManager.getStateSnapshots());
    }
  }

  private render = () => {
    const { ctx, cssW, cssH, dpr } = this;
    ctx.clearRect(0, 0, cssW, cssH);

    this.groundRenderer.draw(ctx, this.camera, this.groundSheet, this.tileMap, cssW, cssH, dpr);
    this.grid.draw(ctx, this.camera, cssW, cssH, dpr);

    this.agentRenderer.draw(ctx, this.camera, this.agentManager.getAgents(), cssW, cssH);

    if (!this.playerDead) {
      const sp = this.camera.worldToScreen(this.player.x, this.player.y, cssW, cssH);
      this.character.draw(ctx, sp.x, sp.y + this.player.jumpLift, this.player.animationState, this.player.facing);
      const playerHalfH = this.character.hasAnimations() ? RENDER_HEIGHT / 2 : 15;
      this.drawPlayerHealthBar(ctx, sp.x, sp.y, playerHalfH);
      if (this.playerSpeech) drawSpeechBubble(ctx, sp.x, sp.y, playerHalfH + 28, this.playerSpeech);
    }
  };

  private drawPlayerHealthBar(ctx: CanvasRenderingContext2D, cx: number, cy: number, halfH: number) {
    const W = 36; const H = 4;
    const x = cx - W / 2;
    const y = cy - halfH - 8;
    const f = this.playerHealth.fraction;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, y, W, H);
    ctx.fillStyle = f > 0.5 ? '#4caf50' : f > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillRect(x, y, W * f, H);
    ctx.restore();
  }

  private applyDPR() {
    this.dpr  = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.cssW  = rect.width;
    this.cssH  = rect.height;
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
