import { CELL_SIZE } from './GridRenderer';

export interface JSONSchema {
  type: string;
  properties?: Record<string, { type: string; description?: string; default?: unknown }>;
  required?: string[];
}

export interface ActionHandle {
  update(dt: number): void;
  isComplete(): boolean;
}

// Minimal mutable interface actions need from an agent — no circular import with AgentRuntime.
export interface AgentRuntimeRef {
  x: number;
  y: number;
  facing: 'left' | 'right';
  movementState: 'idle' | 'walk';
  name: string;
  equippedWeaponId: string | null;
  speechBubble: { message: string; elapsed: number; duration: number } | null;
}

// Context supplied by World when running an action. Optional fields keep the
// interface easy to extend — existing actions won't break when new fields are added.
export interface EngineContext {
  dealDamage?: (targetName: string, damage: number) => void;
  findCharacterPosition?: (name: string) => { x: number; y: number } | null;
  getWeaponDef?: (id: string) => { damage: number; rangeInCells: number } | null;
}

export interface ActionDefinition<TParams = Record<string, unknown>> {
  name: string;
  description: string;
  parameters: JSONSchema;
  traits: {
    movesAgent?: boolean;
    targetType?: 'cell' | 'entity' | 'none';
    baseDuration?: number;
    visualEffect?: 'speech_bubble' | 'none' | 'custom';
  };
  run(agent: AgentRuntimeRef, params: TParams, ctx: EngineContext): ActionHandle;
  describeForMemory(params: TParams): string;
}

const AGENT_WALK_SPEED = 120; // world units/sec
const ARRIVAL_THRESHOLD = 4;  // world units

// ── move_to ───────────────────────────────────────────────────────────────────

const moveToAction: ActionDefinition<{ x: number; y: number }> = {
  name: 'move_to',
  description: 'Walk to the specified grid cell coordinates (x, y).',
  parameters: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'Target cell X coordinate' },
      y: { type: 'number', description: 'Target cell Y coordinate' },
    },
    required: ['x', 'y'],
  },
  traits: { movesAgent: true, targetType: 'cell' },
  run(agent, params) {
    const targetX = params.x * CELL_SIZE + CELL_SIZE / 2;
    const targetY = params.y * CELL_SIZE + CELL_SIZE / 2;
    let done = false;
    return {
      update(dt) {
        if (done) return;
        const dx = targetX - agent.x;
        const dy = targetY - agent.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= ARRIVAL_THRESHOLD) {
          agent.x = targetX;
          agent.y = targetY;
          agent.movementState = 'idle';
          done = true;
          return;
        }
        const step = Math.min(AGENT_WALK_SPEED * dt, dist);
        agent.x += (dx / dist) * step;
        agent.y += (dy / dist) * step;
        agent.facing = dx < 0 ? 'left' : 'right';
        agent.movementState = 'walk';
      },
      isComplete() { return done; },
    };
  },
  describeForMemory(params) { return `Moved to (${params.x}, ${params.y})`; },
};

// ── say ───────────────────────────────────────────────────────────────────────

const sayAction: ActionDefinition<{ message: string }> = {
  name: 'say',
  description: 'Say something out loud, shown as a speech bubble.',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'The message to say aloud' },
    },
    required: ['message'],
  },
  traits: { targetType: 'none', baseDuration: 3, visualEffect: 'speech_bubble' },
  run(agent, params) {
    const duration = 3;
    agent.speechBubble = { message: params.message, elapsed: 0, duration };
    agent.movementState = 'idle';
    let elapsed = 0;
    return {
      update(dt) { elapsed += dt; },
      isComplete() { return elapsed >= duration; },
    };
  },
  describeForMemory(params) { return `Said: "${params.message}"`; },
};

// ── idle ──────────────────────────────────────────────────────────────────────

const idleAction: ActionDefinition<{ duration?: number }> = {
  name: 'idle',
  description: 'Stand still and do nothing for a given duration (default 2 seconds).',
  parameters: {
    type: 'object',
    properties: {
      duration: { type: 'number', description: 'Seconds to stay idle', default: 2 },
    },
  },
  traits: { targetType: 'none', baseDuration: 2 },
  run(agent, params) {
    const duration = params.duration ?? 2;
    agent.movementState = 'idle';
    let elapsed = 0;
    return {
      update(dt) { elapsed += dt; },
      isComplete() { return elapsed >= duration; },
    };
  },
  describeForMemory() { return 'Stayed idle'; },
};

// ── attack ────────────────────────────────────────────────────────────────────

const attackAction: ActionDefinition<{ target: string }> = {
  name: 'attack',
  description: 'Move toward and attack a visible character by name. Requires an equipped weapon (or uses fists if unarmed).',
  parameters: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'Name of the target (from Visible entities list)' },
    },
    required: ['target'],
  },
  traits: { movesAgent: true, targetType: 'entity' },
  run(agent, params, ctx) {
    let done    = false;
    let struck  = false;
    return {
      update(dt) {
        if (done) return;

        const targetPos = ctx.findCharacterPosition?.(params.target);
        if (!targetPos) { agent.movementState = 'idle'; done = true; return; }

        const weaponDef = agent.equippedWeaponId ? ctx.getWeaponDef?.(agent.equippedWeaponId) : null;
        const rangeWorld = (weaponDef?.rangeInCells ?? 1) * CELL_SIZE;

        const dx = targetPos.x - agent.x;
        const dy = targetPos.y - agent.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > rangeWorld) {
          // Walk toward target, leaving one cell's gap so we don't overlap.
          const step = Math.min(AGENT_WALK_SPEED * dt, dist - rangeWorld + ARRIVAL_THRESHOLD);
          agent.x += (dx / dist) * step;
          agent.y += (dy / dist) * step;
          agent.facing = dx < 0 ? 'left' : 'right';
          agent.movementState = 'walk';
        } else if (!struck) {
          struck = true;
          agent.movementState = 'idle';
          ctx.dealDamage?.(params.target, weaponDef?.damage ?? 5);
          done = true;
        }
      },
      isComplete() { return done; },
    };
  },
  describeForMemory(params) { return `Attacked ${params.target}`; },
};

// Registry is the single source of truth. Add new ActionDefinitions here only.
export const actionRegistry: ActionDefinition[] = [
  moveToAction,
  sayAction,
  idleAction,
  attackAction,
];
