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

const IDLE_COOLDOWN = 1.5;
const MAX_MEMORY    = 15;

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
  movementState: 'idle' | 'walk' = 'idle';

  health: Health;

  // Sprite animations — empty at spawn (falls back to colored placeholder).
  readonly character: Character = new Character();

  speechBubble: { message: string; elapsed: number; duration: number } | null = null;

  lifecycleState: AgentLifecycleState = 'idle';
  memory: string[];
  lastDecision: AgentDecisionResponse | null = null;

  private idleElapsed = 0;

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
  ): boolean {
    if (this.health.isDead) return false;

    // Advance character animation in the update phase.
    this.character.update(dt, this.movementState === 'walk' ? 'walk' : 'idle');

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
        if (this.idleElapsed >= IDLE_COOLDOWN && provider && !isPaused) {
          this.startThinking(provider, playerX, playerY, allAgents);
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
  ) {
    this.lifecycleState = 'thinking';
    this.decisionReady  = false;
    this.decisionResult = null;
    this.decisionError  = false;

    const allowed = this.allowedActions ?? actionRegistry.map(a => a.name);
    const request = generateSnapshot(this, playerX, playerY, allAgents, allowed);

    provider.decide(request)
      .then(result => {
        this.lastDecision  = result;
        this.decisionResult = result;
        this.decisionReady  = true;
      })
      .catch(err => {
        console.warn(`[Agent:${this.name}] decision failed:`, err);
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
      const overflow = this.memory.splice(0, this.memory.length - MAX_MEMORY);
      this.memory.unshift(`[Earlier: ${overflow.join('; ')}]`);
    }
  }
}
