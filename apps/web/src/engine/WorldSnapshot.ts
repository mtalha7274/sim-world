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
): AgentDecisionRequest {
  const myCX = toCellX(agent.x);
  const myCY = toCellY(agent.y);

  // ── Visible entities ──────────────────────────────────────────────────────

  type EntityEntry = {
    char: string;
    label: string;
    cellX: number;
    cellY: number;
    distance: number;
    hp?: string;
  };
  const entities: EntityEntry[] = [];

  // Player
  const pCX = toCellX(playerX);
  const pCY = toCellY(playerY);
  const pdx = pCX - myCX;
  const pdy = pCY - myCY;
  if (Math.abs(pdx) <= PERCEPTION_RADIUS && Math.abs(pdy) <= PERCEPTION_RADIUS) {
    const hp = player ? ` [${player.health.currentHP}/${player.health.maxHP}HP]` : '';
    entities.push({
      char: 'P', label: 'Player',
      cellX: pCX, cellY: pCY,
      distance: Math.round(Math.sqrt(pdx * pdx + pdy * pdy)),
      hp,
    });
  }

  // Other agents
  let charCode = 65; // 'A'
  for (const other of allAgents) {
    if (other.id === agent.id) continue;
    const oCX = toCellX(other.x);
    const oCY = toCellY(other.y);
    const dx  = oCX - myCX;
    const dy  = oCY - myCY;
    if (Math.abs(dx) <= PERCEPTION_RADIUS && Math.abs(dy) <= PERCEPTION_RADIUS) {
      entities.push({
        char: String.fromCharCode(charCode++),
        label: `${other.name} (agent)`,
        cellX: oCX,
        cellY: oCY,
        distance: Math.round(Math.sqrt(dx * dx + dy * dy)),
        hp: ` [${other.health.currentHP}/${other.health.maxHP}HP]`,
      });
    }
  }

  // ── ASCII grid ────────────────────────────────────────────────────────────

  const gridLines: string[] = [];
  for (let row = -PERCEPTION_RADIUS; row <= PERCEPTION_RADIUS; row++) {
    const cells: string[] = [];
    for (let col = -PERCEPTION_RADIUS; col <= PERCEPTION_RADIUS; col++) {
      if (col === 0 && row === 0) { cells.push('@'); continue; }
      const cellX  = myCX + col;
      const cellY  = myCY + row;
      const entity = entities.find(e => e.cellX === cellX && e.cellY === cellY);
      cells.push(entity ? entity.char : '.');
    }
    gridLines.push(cells.join(' '));
  }

  // ── Legend & entity list ──────────────────────────────────────────────────

  const legendParts = ['. = grass', '@ = you'];
  if (entities.find(e => e.char === 'P')) legendParts.push('P = Player');
  for (const e of entities.filter(e => e.char !== 'P')) legendParts.push(`${e.char} = ${e.label}`);

  const entitiesLines = entities.length > 0
    ? entities.map(e => `- ${e.label} at (${e.cellX}, ${e.cellY}), ${e.distance} cell${e.distance !== 1 ? 's' : ''} away${e.hp ?? ''}`)
    : ['- None visible'];

  // ── Self status ───────────────────────────────────────────────────────────

  const selfHP = `Your HP: ${agent.health.currentHP}/${agent.health.maxHP}`;

  const worldSnapshot = [
    `You are agent "${agent.name}". Personality: ${agent.personality}`,
    selfHP,
    '',
    'Your recent memory (most recent last):',
    ...agent.memory.map(m => `- ${m}`),
    '',
    'World snapshot (you are at the center, marked @):',
    `Legend: ${legendParts.join(', ')}`,
    '',
    ...gridLines,
    '',
    'Visible entities:',
    ...entitiesLines,
    '',
    'Decide your next action.',
  ].join('\n');

  return {
    systemPrompt: agent.personality,
    worldSnapshot,
    visibleEntities: entities.map(e => ({
      id:       e.char,
      name:     e.label,
      position: { cellX: e.cellX, cellY: e.cellY },
      distance: e.distance,
    })),
    memory:         [...agent.memory],
    allowedActions,
  };
}
