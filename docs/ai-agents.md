# AI Agents — Architecture Reference

## Overview

Agents are autonomous characters that perceive the world, decide what to do next via an LLM, and execute actions — all without ever blocking the 60fps render loop. The core engine boundary from v1 still applies: React only reads state for display; all game logic (including async agent decisions) lives in the engine layer.

---

## World snapshot format

Each time an agent needs to make a decision, a compact text snapshot is generated fresh from the live game state. The snapshot is what the LLM receives as its `user` message:

```
You are agent "Milo". Personality: curious, a little nervous, loves making friends.

Your recent memory (most recent last):
- Spawned near (10, 12)
- Said: "Hello!"

World snapshot (you are at the center, marked @):
Legend: . = grass, @ = you, P = Player, A = Agent2 (agent)

. . . . . . . . . . . . . . . . .
. . . . . . . . . . . . . . . . .
. . . . . . . . . . . . . . . . .
. . . . . . . P . . . . . . . . .
. . . . . . . . @ . . . . . . . .
. . . . . . . . . . A . . . . . .
. . . . . . . . . . . . . . . . .
. . . . . . . . . . . . . . . . .

Visible entities:
- Player at (9, 11), 2 cells away
- Agent2 (agent) at (12, 13), 4 cells away

Decide your next action.
```

- The grid is `(2 × PERCEPTION_RADIUS + 1)²` cells, centered on the agent (`@`).
- PERCEPTION_RADIUS is 8 cells (constant in `WorldSnapshot.ts`).
- Only grass (`.`) terrain exists right now; water/walls are reserved legend entries once terrain variety is added.
- The snapshot is regenerated from actual game state every call — never cached or hand-written.

---

## Memory

Each agent keeps a `string[]` of short log lines, most recent last. Entries are appended when:
- The agent spawns
- An action completes (e.g. `"Moved to (5, 3)"`, `"Said: \"hello\""`)

**Cap:** The array is capped at 15 entries. When it exceeds that, the oldest entries are concatenated into a single compressed prefix line: `[Earlier: entry1; entry2; ...]`. This avoids unbounded growth without a separate summarisation API call (a deliberate simplicity trade-off for v1; a small LLM summarisation call could replace this later).

The full memory array is included in every decision request.

---

## Turn-based state machine

Each agent runs an independent state machine with three states:

```
        ┌──────────────────────────────────┐
        ↓  cooldown elapsed + provider set  │
    [ idle ] ──────────────────────────► [ thinking ]
        ↑                                    │  Promise resolves
        │  action completes                  ▼
        └─────────────────────────────── [ acting ]
```

- **`idle`**: Agent stands still. After ~1.5 s, fires an async decision request and transitions to `thinking`. If AI is paused globally or no provider is configured, stays idle.
- **`thinking`**: A `provider.decide()` Promise is in flight. The render loop continues normally; a pulsing dot indicator appears above the agent. On resolution, the chosen action's `run()` is called to get an `ActionHandle`, and the agent moves to `acting`. On error/timeout, falls back to `idle`.
- **`acting`**: One generic state. Each frame, `handle.update(dt)` is called (the specific action drives its own logic). When `handle.isComplete()` returns true, the action's memory line is appended and the agent returns to `idle`.

**Concurrency:** Each agent manages its own async Promise independently. One agent waiting on the API never delays any other agent or the player. The render loop is never `await`-ed.

---

## Action registry

Actions are not special-cased in the engine — they are self-describing registry entries. The registry is the single source of truth for everything: what tools are sent to the LLM, how actions are executed, and what ends up in memory.

**Adding a new action** (e.g. `attack`):

1. Open `apps/web/src/engine/ActionRegistry.ts`.
2. Add a new `ActionDefinition<YourParams>` object:
   - `name`: unique string ID
   - `description`: shown to the LLM as the tool description
   - `parameters`: JSON Schema for the tool parameters
   - `traits`: metadata hints (e.g. `movesAgent`, `targetType`, `baseDuration`, `visualEffect`)
   - `run(agent, params, ctx)`: returns an `ActionHandle` with `update(dt)` and `isComplete()` methods
   - `describeForMemory(params)`: returns the memory log line on completion
3. Append it to the `actionRegistry` array.

That's it. No changes to `AgentRuntime`, the LLM tool schema generator, or the state machine — they all derive from the registry generically.

**Current actions:**

| Name | Description |
|------|-------------|
| `move_to(x, y)` | Walks the agent to a grid cell at 120 world-units/sec |
| `say(message)` | Shows a speech bubble for 3 s |
| `idle(duration?)` | Stays still for `duration` seconds (default 2) |

Tools are generated for the LLM by mapping `actionRegistry` → `OpenAI.ChatCompletionTool[]`. Per-agent `allowedActions` can filter this list at decision time.

---

## Provider abstraction

All agent logic depends only on the `LLMProvider` interface:

```ts
interface LLMProvider {
  decide(request: AgentDecisionRequest): Promise<AgentDecisionResponse>;
}
```

`OpenRouterProvider` (`apps/web/src/llm/OpenRouterProvider.ts`) is the only implementation. It uses the `openai` npm package configured with `baseURL: "https://openrouter.ai/api/v1"` and OpenAI-style tool/function calling.

**To add a new provider** (e.g. direct Anthropic API):
1. Create `apps/web/src/llm/AnthropicProvider.ts`.
2. Implement `LLMProvider`.
3. Pass an instance to `world.setLLMProvider(new AnthropicProvider(...))`.

No agent code changes — the interface is the only contract.

---

## API key storage

The OpenRouter API key is stored in `localStorage` under `sim-world-settings-v1` and read back on app load. It is sent directly from the browser to `https://openrouter.ai/api/v1` — there is no backend proxy. This is fine for local personal use. Do not deploy this app publicly with a key configured.

---

## What's deferred (v3+): speculative/prefetch pipeline

In this version agents wait until their current action **completes** before requesting the next decision. A future optimisation is to fire the next LLM request speculatively while the current action is still running (e.g. start thinking while `move_to` is in progress), so the next action is ready the moment the current one finishes — eliminating the idle + API-wait gap.

This was deliberately not built in v2 because:
- It adds complexity (managing in-flight "future" decisions that may be invalidated if state changes mid-action).
- The turn-based model is simpler to reason about and debug.
- The state machine would need a fourth state (or parallel decision slot) and cancellation logic.

The `allowedActions` field on agent creation is already wired through the stack, so restricting which actions a given agent can choose is possible today without any code changes.
