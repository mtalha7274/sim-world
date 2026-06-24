import { AgentRuntime, type AgentOptions } from './AgentRuntime';
import { OpenRouterProvider } from '../llm/OpenRouterProvider';
import type { LLMProvider, AgentDecisionResponse } from '../llm/LLMProvider';
import type { EngineContext } from './ActionRegistry';
import type { Player } from './Player';

export interface AgentStateSnapshot {
  id: string;
  name: string;
  color: string;
  lifecycleState: 'idle' | 'thinking' | 'acting';
  actionName: string | null;
  memory: string[];
  experience: string[];
  lastDecision: AgentDecisionResponse | null;
  lastErrorMsg: string | null;
  health: { maxHP: number; currentHP: number; isDead: boolean };
  equippedWeaponId: string | null;
  model: string;
}

export class AgentManager {
  private agents: AgentRuntime[] = [];
  private apiKey = '';
  // Cache providers by model so we don't reconstruct on every update().
  private providerCache = new Map<string, LLMProvider>();
  private pauseAI = false;
  private dirty   = false;

  onStateChange?: () => void;
  onAgentError?:  (name: string, color: string, message: string) => void;

  setApiKey(key: string) {
    this.apiKey = key;
    this.providerCache.clear(); // invalidate on key change
  }

  setPauseAI(paused: boolean) {
    this.pauseAI = paused;
  }

  private providerFor(model: string): LLMProvider | null {
    if (!this.apiKey || !model) return null;
    if (!this.providerCache.has(model)) {
      this.providerCache.set(model, new OpenRouterProvider(this.apiKey, model));
    }
    return this.providerCache.get(model)!;
  }

  spawn(opts: AgentOptions): string {
    const agent = new AgentRuntime(opts);
    agent.onError = (msg) => {
      this.onAgentError?.(agent.name, agent.color, msg);
      this.dirty = true;
    };
    this.agents.push(agent);
    this.dirty = true;
    return agent.id;
  }

  remove(id: string) {
    const idx = this.agents.findIndex(a => a.id === id);
    if (idx !== -1) {
      this.agents.splice(idx, 1);
      this.dirty = true;
    }
  }

  private arenaRules = '';
  setArenaRules(rules: string) { this.arenaRules = rules; }

  update(dt: number, player: Player, ctx: EngineContext, playerCtx?: import('./WorldSnapshot').PlayerContext) {
    for (const agent of this.agents) {
      const provider = this.providerFor(agent.model);
      const changed  = agent.update(dt, provider, player.x, player.y, this.agents, this.pauseAI, ctx, this.arenaRules, playerCtx);
      if (changed) this.dirty = true;
    }

    // Remove agents that died during this update.
    const before = this.agents.length;
    this.agents = this.agents.filter(a => !a.health.isDead);
    if (this.agents.length !== before) this.dirty = true;

    if (this.dirty) {
      this.dirty = false;
      this.onStateChange?.();
    }
  }

  getAgents(): AgentRuntime[] {
    return this.agents;
  }

  getAgentById(id: string): AgentRuntime | undefined {
    return this.agents.find(a => a.id === id);
  }

  getAgentByName(name: string): AgentRuntime | undefined {
    return this.agents.find(a => a.name === name);
  }

  getStateSnapshots(): AgentStateSnapshot[] {
    return this.agents.map(a => ({
      id:              a.id,
      name:            a.name,
      color:           a.color,
      lifecycleState:  a.lifecycleState,
      actionName:      a.getActionName(),
      memory:          [...a.memory],
      experience:      [...a.experience],
      lastDecision:    a.lastDecision,
      lastErrorMsg:    a.lastErrorMsg,
      health:          { maxHP: a.health.maxHP, currentHP: a.health.currentHP, isDead: a.health.isDead },
      equippedWeaponId: a.equippedWeaponId,
      model:           a.model,
    }));
  }
}
