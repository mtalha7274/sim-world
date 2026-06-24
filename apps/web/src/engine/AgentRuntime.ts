import { actionRegistry, type ActionHandle, type ActionDefinition, type EngineContext } from './ActionRegistry';
import type { LLMProvider, AgentDecisionResponse } from '../llm/LLMProvider';
import { generateSnapshot } from './WorldSnapshot';
import { CELL_SIZE } from './GridRenderer';
import { Health } from './Health';
import { Character } from './Character';

export type AgentLifecycleState = 'idle' | 'thinking' | 'acting';

export interface AgentOptions {
  name: string;
  personality: string;
  model: string;
  color: string;
  x: number;
  y: number;
  maxHP?: number;
  equippedWeaponId?: string | null;
  allowedActions?: string[] | null;
}

let nextId = 1;

const IDLE_COOLDOWN    = 1.5;
const MAX_MEMORY       = 10;   // recent working memory entries
const COMPRESS_BATCH   = 5;    // entries to compress when overflow
const MAX_EXPERIENCE   = 8;    // experience chunk slots

export class AgentRuntime {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly personality: string;
  readonly allowedActions: string[] | null;

  model: string;
  equippedWeaponId: string | null;

  // World position — mutated by action handles each frame.
  x: number;
  y: number;
  facing: 'left' | 'right' = 'right';
  movementState: 'idle' | 'walk' | 'attack' = 'idle';

  health: Health;

  // Sprite animations — empty at spawn (falls back to colored placeholder).
  readonly character: Character = new Character();

  speechBubble: { message: string; elapsed: number; duration: number } | null = null;

  lifecycleState: AgentLifecycleState = 'idle';
  memory: string[];
  experience: string[] = [];   // compressed episode summaries, oldest→newest
  lastDecision: AgentDecisionResponse | null = null;

  /** Last LLM error message — read by AgentManager to surface in debug panel. */
  lastErrorMsg: string | null = null;
  /** Called by AgentManager; fires when a new error occurs. */
  onError?: (message: string) => void;

  private idleElapsed = 0;
  private backoffMs   = 0;   // exponential backoff delay after errors
  private retryAt     = 0;   // Date.now() timestamp: don't retry before this

  private decisionReady  = false;
  private decisionResult: AgentDecisionResponse | null = null;
  private decisionError  = false;

  private currentHandle:    ActionHandle | null = null;
  private currentActionDef: ActionDefinition | null = null;
  private currentParams:    Record<string, unknown> = {};

  constructor(opts: AgentOptions) {
    this.id              = `agent-${nextId++}`;
    this.name            = opts.name;
    this.color           = opts.color;
    this.personality     = opts.personality;
    this.model           = opts.model;
    this.x               = opts.x;
    this.y               = opts.y;
    this.equippedWeaponId = opts.equippedWeaponId ?? null;
    this.allowedActions  = opts.allowedActions ?? null;
    this.health          = new Health(opts.maxHP ?? 100);
    const cellX = Math.floor(opts.x / CELL_SIZE);
    const cellY = Math.floor(opts.y / CELL_SIZE);
    this.memory = [`Spawned near (${cellX}, ${cellY})`];
  }

  // Returns true if lifecycle state changed (used by AgentManager to trigger React update).
  update(
    dt: number,
    provider: LLMProvider | null,
    playerX: number,
    playerY: number,
    allAgents: AgentRuntime[],
    isPaused: boolean,
    ctx: EngineContext,
    arenaRules: string,
    playerCtx: import('./WorldSnapshot').PlayerContext | undefined,
  ): boolean {
    if (this.health.isDead) return false;

    // Advance character animation in the update phase.
    const animState = this.character.availableStates().includes(this.movementState as never)
      ? this.movementState as import('./Player').AnimationState
      : 'idle';
    this.character.update(dt, animState);

    // Tick speech bubble.
    if (this.speechBubble) {
      this.speechBubble.elapsed += dt;
      if (this.speechBubble.elapsed >= this.speechBubble.duration) {
        this.speechBubble = null;
      }
    }

    const prevState = this.lifecycleState;

    switch (this.lifecycleState) {
      case 'idle': {
        this.idleElapsed += dt;
        if (this.idleElapsed >= IDLE_COOLDOWN && provider && !isPaused && Date.now() >= this.retryAt) {
          this.startThinking(provider, playerX, playerY, allAgents, arenaRules, playerCtx);
        }
        break;
      }
      case 'thinking': {
        if (this.decisionReady) {
          this.applyDecision(ctx);
        } else if (this.decisionError) {
          this.lifecycleState = 'idle';
          this.idleElapsed    = 0;
          this.decisionError  = false;
        }
        break;
      }
      case 'acting': {
        if (this.currentHandle) {
          this.currentHandle.update(dt);
          if (this.currentHandle.isComplete()) {
            if (this.currentActionDef) {
              this.appendMemory(this.currentActionDef.describeForMemory(this.currentParams));
            }
            this.currentHandle    = null;
            this.currentActionDef = null;
            this.currentParams    = {};
            this.movementState    = 'idle';
            this.lifecycleState   = 'idle';
            this.idleElapsed      = 0;
          }
        }
        break;
      }
    }

    return this.lifecycleState !== prevState;
  }

  getActionName(): string | null {
    return this.currentActionDef?.name ?? null;
  }

  /** Animation states this agent currently has sprites for. */
  get availableAnimations(): string[] {
    return this.character.availableStates();
  }

  /** Append a player message to this agent's memory (for next decision cycle). */
  queueMessage(text: string) {
    this.appendMemory(`Player said: "${text}"`);
  }

  setHP(max: number) {
    this.health.setMax(max);
  }

  private startThinking(
    provider: LLMProvider,
    playerX: number,
    playerY: number,
    allAgents: AgentRuntime[],
    arenaRules: string,
    playerCtx: import('./WorldSnapshot').PlayerContext | undefined,
  ) {
    this.lifecycleState = 'thinking';
    this.decisionReady  = false;
    this.decisionResult = null;
    this.decisionError  = false;

    const allowed = this.allowedActions ?? actionRegistry.map(a => a.name);

    // Detect crowding: other agents within 1 cell of this agent.
    const myCellX = Math.floor(this.x / CELL_SIZE);
    const myCellY = Math.floor(this.y / CELL_SIZE);
    const crowdedBy = allAgents
      .filter(a => a.id !== this.id)
      .filter(a => Math.abs(Math.floor(a.x / CELL_SIZE) - myCellX) <= 1 && Math.abs(Math.floor(a.y / CELL_SIZE) - myCellY) <= 1)
      .map(a => a.name);

    const request = generateSnapshot(this, playerX, playerY, allAgents, allowed, playerCtx, arenaRules, crowdedBy);

    provider.decide(request)
      .then(result => {
        this.lastDecision   = result;
        this.decisionResult = result;
        this.decisionReady  = true;
        // Reset backoff on success.
        this.backoffMs  = 0;
        this.retryAt    = 0;
        this.lastErrorMsg = null;
      })
      .catch(err => {
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.warn(`[Agent:${this.name}] decision failed:`, err);
        this.lastErrorMsg = msg;
        this.onError?.(msg);
        // Exponential backoff: 8s → 16s → 32s → 60s max.
        this.backoffMs = this.backoffMs === 0 ? 8_000 : Math.min(this.backoffMs * 2, 60_000);
        this.retryAt   = Date.now() + this.backoffMs;
        this.decisionError = true;
      });
  }

  private applyDecision(ctx: EngineContext) {
    const result   = this.decisionResult!;
    this.decisionReady = false;

    const actionDef = actionRegistry.find(a => a.name === result.action);
    const fallback  = actionRegistry.find(a => a.name === 'idle')!;
    const def       = actionDef ?? fallback;
    const params    = actionDef ? result.params : {};

    try {
      this.currentHandle    = def.run(this, params, ctx);
      this.currentActionDef = def;
      this.currentParams    = params;
    } catch (e) {
      console.warn(`[Agent:${this.name}] action run() threw:`, e);
      this.currentHandle    = fallback.run(this, {}, ctx);
      this.currentActionDef = fallback;
      this.currentParams    = {};
    }

    this.lifecycleState = 'acting';
  }

  private appendMemory(line: string) {
    this.memory.push(line);
    if (this.memory.length > MAX_MEMORY) {
      // Compress oldest COMPRESS_BATCH entries into one experience chunk.
      const batch = this.memory.splice(0, COMPRESS_BATCH);
      const chunk  = `[Ep.${this.experience.length + 1}] ${batch.join(' → ')}`;
      this.experience.push(chunk);
      // Keep experience bounded — drop oldest chunk.
      if (this.experience.length > MAX_EXPERIENCE) this.experience.shift();
    }
  }
}
