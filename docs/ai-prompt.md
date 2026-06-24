# AI Agent Prompt Structure

Every time an agent finishes its idle cooldown it fires a single OpenRouter call. This document shows exactly what is sent.

---

## API call shape

```
POST https://openrouter.ai/api/v1/chat/completions
model: <per-agent model string>
tools: [move_to, say, idle, attack]   ← one tool per registered action
tool_choice: required
messages:
  [system]  <system prompt — see below>
  [user]    <world snapshot — see below>
```

---

## System prompt

Assembled in `WorldSnapshot.ts → generateSnapshot()` as a single string:

```
[Arena rules] <arenaRules text, if set by the organiser>
You are "<name>". <personality text>.
HP: <currentHP>/<maxHP>.
Animations: <list of sprite states that have sheets assigned, e.g. idle, walk, attack>
Weapon equipped (use attack action to deal damage).   ← only if equipped
```

**Principles:**
- Arena rules appear first so they govern everything.
- HP is stated explicitly so the agent can play defensively when low.
- Available animations tell the agent what it visually looks like (for roleplay / self-description).
- Weapon line is omitted when unarmed so the prompt stays minimal.

---

## Memory architecture

Each agent has two tiers of memory:

| Tier | Field | Capacity | Content |
|------|-------|----------|---------|
| Working memory | `memory[]` | 10 entries (FIFO) | Recent individual events |
| Experience log | `experience[]` | 8 episode chunks | Compressed older batches |

When working memory overflows past 10 entries, the oldest 5 entries are compressed into one **episode chunk** (e.g. `[Ep.3] Moved to (4,2) → Said "hello" → Attacked Bob → Waited → Moved to (1,1)`) and appended to the experience log. The experience log then sheds its oldest chunk if it exceeds 8. This gives agents durable long-term episodic recall without unbounded context growth.

---

## User message (world snapshot)

```
⚔ Arena rules: Last one standing wins        ← repeated every turn so agents obey

⚠ CROWDING: You are sharing a cell with Bob. Move away from them immediately.
             ← only when another agent is within 1 cell

Past experience (oldest→newest):             ← episode chunks from experience log
  [Ep.1] Spawned near (5,4) → Moved to (3,2) → Said "hello" → Attacked Bob → Waited
  [Ep.2] Moved to (6,1) → Said "I'm hunting" → Attacked Alice → Moved to (4,3) → Waited

Recent memory (oldest→newest):               ← working memory (last 10 events)
  Moved to (5, 3)
  Said: "Hello player"
  Player said: "Fight!"

Grid (17×17, legend: .=ground @=you P=Player A=Bob (agent))
.................
........P........
.....@...........
.......A.........
.................

Nearby:
  P Player at (5,3) dist:2 [85/100HP]
  A Bob (agent) at (7,4) dist:3 [60/100HP]

Choose your next action.
```

**Grid:**
- 17×17 cells centered on the agent (`@`).
- Each cell is one character — no spaces between cells to keep it compact.
- Entities are labelled `P` (player), `A`/`B`/… (other agents in encounter order).

**Nearby line:**
- Only entities within the 8-cell perception radius.
- Includes cell coordinates and HP for each visible entity.

**Memory:**
- Capped at 15 entries. Overflow is compressed into a single `[Earlier: …]` prefix.
- Entries include: spawn position, completed actions, player messages, `[Earlier: …]` summaries.

---

## Tool definitions sent to the LLM

| Tool | Parameters | Effect |
|------|-----------|--------|
| `move_to` | `x: number, y: number` | Walk to grid cell (x, y). Sets `walk` animation while moving, `idle` on arrival. |
| `say` | `message: string` | Show a speech bubble for 3 s. Plays `idle` animation. |
| `idle` | `duration?: number` | Wait in place (default 2 s). |
| `attack` | `target: string` | Walk toward named target, then deal weapon damage. Plays `walk` while closing in, `attack` animation on strike. |

The LLM **must** call exactly one tool per turn (`tool_choice: required`). The engine applies the returned tool call as the agent's next action.

---

## Data that is NOT sent

To keep token usage minimal the following are intentionally omitted:

- Full tile map / ground layout (agents don't need to know tile types)
- Other agents' personality or memory
- Exact world-unit positions (grid cells only)
- Equipped weapon name or damage value (agents know they have a weapon; the engine handles numbers)
- Frame rate, canvas size, or any rendering detail
