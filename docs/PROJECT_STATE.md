# Project State

## Pass 0 — Bootstrap (complete)

**Completed:**
- Vite + TypeScript project, port 91210
- Multi-page: `live.html` → `/live`, `control.html` → `/control`
- 1920×1080 Canvas 2D on `/live`, letterboxed to viewport
- Minimal Node `http` production server (no Express)
- `/api/health` endpoint
- Strict TypeScript — separate tsconfigs for client and server
- `CLAUDE.md` with permanent engineering rules

**Architecture:**
```
src/client/live/main.ts      — canvas entry, resize + placeholder render
src/client/control/main.ts   — control panel entry
src/client/shared/types.ts   — SimState, HealthResponse stubs
src/server/index.ts          — http server: routing, static files, /api/health
live.html / control.html     — Vite multi-page HTML entries
vite.config.ts               — multi-page build + /live /control dev rewrite
```

**Known problems:** Requested port 91210 exceeds the TCP max (65535). Corrected to 9210.

---

## Next: Pass 1 — Core Simulation Loop

- Fixed-step loop: 60 TPS simulation, ~30 FPS render via `requestAnimationFrame`
- Seeded PRNG (mulberry32 or xoshiro128**)
- Pre-allocated entity pool — no `new` in hot loops
- Placeholder combatants (colored circles)
- Round lifecycle: `idle → running → ended → idle` — no page reload
- Populate `SimState` type
