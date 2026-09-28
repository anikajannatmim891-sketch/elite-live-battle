# Project State

## Pass 0 — Bootstrap (complete)

**Completed:**
- Vite + TypeScript project, port 9210
- Multi-page: `live.html` → `/live`, `control.html` → `/control`
- 1920×1080 Canvas 2D on `/live`, letterboxed to viewport
- Minimal Node `http` production server (no Express)
- `/api/health` endpoint
- Strict TypeScript — separate tsconfigs for client and server
- `CLAUDE.md` with permanent engineering rules

**Architecture:**
```
src/client/live/main.ts      — canvas entry, resize + render loop
src/client/control/main.ts   — control panel entry
src/client/shared/types.ts   — SimState, Contestant, TeamId, Phase, HealthResponse
src/server/index.ts          — http server: routing, static files, /api/health
live.html / control.html     — Vite multi-page HTML entries
vite.config.ts               — multi-page build + /live /control dev rewrite
```

---

## Pass 1A — Core Simulation + Circle Survival (complete)

**Completed:**
- Deterministic seeded PRNG: Mulberry32 (`src/client/shared/prng.ts`)
  - `Math.random()` not used for gameplay
  - Seed evolved with LCG between rounds
- Fixed-step simulation engine (`src/client/shared/sim.ts`)
  - 60 TPS fixed-step loop via accumulator in RAF
  - Pre-allocated contestant pool (no allocations in hot loops)
- Lightweight physics (`src/client/shared/physics.ts`)
  - Circle/circle elastic collision with penetration correction
  - Circle/circular-boundary reflection
  - Finite-value guard + speed cap (MAX_SPEED = 8)
- Six teams: GOLD, RED, CYAN, VIOLET, EMERALD, MAGENTA
  - 6 contestants per team × 6 teams = 36 total
  - Each: radius=14, mass=1, seeded initial position + velocity
- CIRCLE SURVIVAL arena with full lifecycle:
  - PREPARE → ACTIVE → ESCALATION → WINNER → RESET → (new round)
  - No page reload between rounds
  - Contestants wander with small PRNG-driven direction perturbation each tick
  - ESCALATION: boundary shrinks; contestants outside boundary are eliminated
  - Winner: last surviving team; majority fallback if boundary hits minimum
- Renderer (`src/client/live/renderer.ts`)
  - Black background, arena circle, team-colored contestant circles
  - HUD: ELITE LIVE BATTLE, ROUND n, CIRCLE SURVIVAL, timer (s), remaining count
  - ESCALATION: orange glow ring on boundary
  - WINNER: large team-color banner
- Test mode: `/live?test=1`
  - Vite dev server query-string passthrough fixed
  - PREPARE=1s, ACTIVE=3s, shrink 10× faster, WINNER=2s

**Known issues / notes:**
- Contestants initialize spread within inner 68% of boundary; initial overlap possible
  before first tick resolves collisions. Penetration correction handles it.
- `TEAMS.indexOf()` called in `majorityTeam()` — O(n) but only on round-end; negligible.

---

## Next: Pass 1B

- (TBD by user)
