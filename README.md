# Sim World

A minimalist 2D sim world running entirely in the browser. Smooth 60fps canvas renderer, infinite faint grid, free-moving character with sprite sheet animations.

## Structure

```
/
  apps/web        — Vite + React + TypeScript frontend
  packages/       — Reserved for shared packages (future)
```

All game logic lives in `apps/web/src/engine/` as pure vanilla TypeScript — no React dependencies. React only mounts the canvas and renders the side panel UI.

## Running

```bash
pnpm install
pnpm dev          # starts apps/web on http://localhost:5173
```

Or from the web app directly:

```bash
cd apps/web
pnpm dev
```

## Controls

| Input | Action |
|-------|--------|
| WASD / Arrow keys | Move (8-directional) |
| Shift + WASD | Run (faster) |
| Space | Jump |

## Sprite Panel

Open the panel on the right side to configure character animations:

1. Drop a sprite sheet PNG into the **Idle**, **Walk**, or **Run** zone.
2. Set **columns** (frames per row), **rows**, and **fps**.
3. Watch the live preview confirm correct slicing.
4. Click **Apply** to put the animation on the character.

Sprites and settings persist across page reloads via localStorage.

## Engine Architecture

```
engine/
  Loop.ts          — Single rAF loop, delta-time, visibility pause/resume
  Camera.ts        — Smooth-following camera with exponential lerp
  Player.ts        — Position, velocity, movement state, facing direction
  Input.ts         — Keyboard handler, 8-directional + diagonal normalisation
  SpriteAnimation.ts — Time-based frame animation (fps-independent)
  Character.ts     — Draws active animation or placeholder
  GridRenderer.ts  — Infinite-feeling faint grid (only visible lines drawn)
  World.ts         — Wires everything together; public API for React layer
```

## Adding a Backend Later

Drop a new `apps/server` workspace alongside `apps/web`. Shared types can live in a `packages/shared` package. The frontend engine is fully offline — no networking assumptions baked in.
