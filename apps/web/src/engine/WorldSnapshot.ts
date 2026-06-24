import { CELL_SIZE } from './GridRenderer';
import type { AgentDecisionRequest } from '../llm/LLMProvider';
import type { AgentRuntime } from './AgentRuntime';

const PERCEPTION_RADIUS = 8;

function toCellX(wx: number) { return Math.floor(wx / CELL_SIZE); }
function toCellY(wy: number) { return Math.floor(wy / CELL_SIZE); }

export interface PlayerContext {
  x: number;
  y: number;
  health: { currentHP: number; maxHP: number };
  equippedWeaponName?: string;
}

export function generateSnapshot(
  agent: AgentRuntime,
  playerX: number,
  playerY: number,
  allAgents: AgentRuntime[],
  allowedActions: string[],
  player?: PlayerContext,
  arenaRules?: string,
  crowdedBy?: string[],
): AgentDecisionRequest {
  const myCX = toCellX(agent.x);
  const myCY = toCellY(agent.y);

  // ── Visible entities ──────────────────────────────────────────────────────

  type EntityEntry = { char: string; label: string; cellX: number; cellY: number; distance: number; hp: string };
  const entities: EntityEntry[] = [];

  const pCX = toCellX(playerX);
  const pCY = toCellY(playerY);
  const pdx = pCX - myCX;
  const pdy = pCY - myCY;
  if (Math.abs(pdx) <= PERCEPTION_RADIUS && Math.abs(pdy) <= PERCEPTION_RADIUS) {
    const hp = player ? ` [${player.health.currentHP}/${player.health.maxHP}HP]` : '';
    entities.push({ char: 'P', label: 'Player', cellX: pCX, cellY: pCY, distance: Math.round(Math.sqrt(pdx * pdx + pdy * pdy)), hp });
  }

  let charCode = 65;
  for (const other of allAgents) {
    if (other.id === agent.id) continue;
    const oCX = toCellX(other.x);
    const oCY = toCellY(other.y);
    const dx  = oCX - myCX;
    const dy  = oCY - myCY;
    if (Math.abs(dx) <= PERCEPTION_RADIUS && Math.abs(dy) <= PERCEPTION_RADIUS) {
      entities.push({ char: String.fromCharCode(charCode++), label: `${other.name} (agent)`, cellX: oCX, cellY: oCY, distance: Math.round(Math.sqrt(dx * dx + dy * dy)), hp: ` [${other.health.currentHP}/${other.health.maxHP}HP]` });
    }
  }

  // ── ASCII grid ────────────────────────────────────────────────────────────

  const gridLines: string[] = [];
  for (let row = -PERCEPTION_RADIUS; row <= PERCEPTION_RADIUS; row++) {
    const cells: string[] = [];
    for (let col = -PERCEPTION_RADIUS; col <= PERCEPTION_RADIUS; col++) {
      if (col === 0 && row === 0) { cells.push('@'); continue; }
      const entity = entities.find(e => e.cellX === myCX + col && e.cellY === myCY + row);
      cells.push(entity ? entity.char : '.');
    }
    gridLines.push(cells.join(''));
  }

  const legendParts = ['.=ground', '@=you'];
  if (entities.find(e => e.char === 'P')) legendParts.push('P=Player');
  for (const e of entities.filter(e => e.char !== 'P')) legendParts.push(`${e.char}=${e.label}`);

  // ── Available animations ──────────────────────────────────────────────────

  const anims = agent.availableAnimations;
  const animLine = anims.length > 0 ? `Animations: ${anims.join(', ')}` : 'Animations: placeholder shape';

  // ── System prompt ─────────────────────────────────────────────────────────

  const sysLines: string[] = [];
  if (arenaRules?.trim()) sysLines.push(`[Arena rules] ${arenaRules.trim()}`);
  sysLines.push(`You are "${agent.name}". ${agent.personality}`);
  sysLines.push(`HP: ${agent.health.currentHP}/${agent.health.maxHP}. ${animLine}.`);
  if (agent.equippedWeaponId) sysLines.push('You have a weapon equipped — use the attack action to deal damage.');

  // ── World snapshot body ───────────────────────────────────────────────────

  const parts: string[] = [];

  // Repeat arena rules in the observation so agents cannot miss them.
  if (arenaRules?.trim()) {
    parts.push(`⚔ Arena rules: ${arenaRules.trim()}`);
    parts.push('');
  }

  // Crowding alert.
  if (crowdedBy && crowdedBy.length > 0) {
    parts.push(`⚠ CROWDING: You are sharing a cell with ${crowdedBy.join(', ')}. Move away from them immediately.`);
    parts.push('');
  }

  // Experience log (compressed older episodes).
  if (agent.experience.length > 0) {
    parts.push('Past experience (oldest→newest):');
    for (const ep of agent.experience) parts.push(`  ${ep}`);
    parts.push('');
  }

  // Working memory.
  parts.push('Recent memory (oldest→newest):');
  for (const m of agent.memory) parts.push(`  ${m}`);
  parts.push('');

  // Grid.
  parts.push(`Grid (${PERCEPTION_RADIUS*2+1}×${PERCEPTION_RADIUS*2+1}, legend: ${legendParts.join(' ')})`);
  parts.push(...gridLines);
  parts.push('');

  // Entities.
  const entityLines = entities.length > 0
    ? entities.map(e => `  ${e.char} ${e.label} at (${e.cellX},${e.cellY}) dist:${e.distance}${e.hp}`)
    : ['  none visible'];
  parts.push('Nearby:');
  parts.push(...entityLines);
  parts.push('');
  parts.push('Choose your next action.');

  return {
    systemPrompt: sysLines.join(' '),
    worldSnapshot: parts.join('\n'),
    visibleEntities: entities.map(e => ({ id: e.char, name: e.label, position: { cellX: e.cellX, cellY: e.cellY }, distance: e.distance })),
    memory: [...agent.memory],
    allowedActions,
  };
}
