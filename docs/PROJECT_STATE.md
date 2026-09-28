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
- Test mode: `/live?test=1`

---

## Pass 1B — Circle Survival Mastery (complete)

**Completed:**

### Round Pacing
- Phase structure rewritten: PREPARE → OPENING → DANGER → ESCALATION → FINAL → WINNER → RESET
- Normal mode target: 2:20–3:35 total (validated numerically)
  - PREPARE 5s, OPENING 52s, DANGER 52s, ESCALATION 60s, FINAL 45s, WINNER 7s, RESET 4s
  - No winner possible until at least 1:49 (pre-phases only)
- Test mode target: 23–35s (empirically ~25-30s with physics)
  - PREPARE 1s, OPENING 7s, DANGER 7s, ESCALATION 10s, FINAL 10s, WINNER 2s, RESET 1s
- No page reload between rounds confirmed

### Circle Survival Events (deterministic, not simultaneous)
- **DANGER ARC**: Colored arc rotates around circumference; lethal when contestants approach boundary within arc span. Visual: fill wedge + glowing edge band. Fires during DANGER/ESCALATION/FINAL.
- **CENTER REPULSOR**: Central force pushes contestants outward, changes battle dynamics. Visual: pulsing circle + cross geometry at center. Affects actual physics.
- **PULSE**: Radial outward impulse applied to all contestants; magnitude proportional to proximity to center. Visual: expanding ring from center. Instantaneous physics event.
- Events fire deterministically (PRNG-driven) at ~15s intervals in normal mode, ~1.5s in test mode. Only one event active at a time.

### Contestant Visuals
- Radius increased 14→16 for better visibility
- Team-colored body with crisp black outline ring + white stroke
- Inner highlight circle (top-left)
- 12-point trail ring buffer per contestant (pre-allocated, no hot-loop allocs)
- Trail fades from transparent to 35% alpha

### Elimination Feedback
- Pre-allocated effect pool (40 slots) — no runtime allocation
- Expanding ring + 5 outward streaks in team color
- Duration: ~0.36s (22 ticks at 60 TPS), then recycled
- Triggered on every elimination (boundary, danger arc)

### Arena Visual Language
- Dark arena fill
- Circumference tick marks (60 marks, long every 5th)
- Danger arc highlight with opacity/color based on lethal state
- Center repulsor geometry (active only when event fires)
- Pulse rings expanding from center (pre-allocated pool of 6)
- Boundary ring changes color: gray → orange (ESCALATION) → red (FINAL)
- Outer glow during ESCALATION/FINAL phases

### Team Scoreboard
- Right-side compact panel: team label, color swatch, pip count, numeric count
- Pips go dark when contestant is eliminated
- Count goes dim when team is fully eliminated

### Event Countdown / Indicators
- Active event shown in HUD top-right
- Countdown hint shown when next event is ≤15s away
- "PRESSURE RISING" / "PRESSURE CRITICAL" during ESCALATION/FINAL

### Milestone Announcements
- "FINAL 10" at 10 alive, "FINAL 5" at 5 alive, "FINAL TWO TEAMS" at 2 teams
- 3-second display, fade-in/out

### Winner Presentation
- Team-colored panel with team name, "WINS ROUND N"
- Stats row: duration, survivors, eliminations
- Survivors keep slow drifting motion during winner display

### Performance
- No external libraries, no blur, no shadowBlur
- All effect objects pre-allocated; ring buffers for trails
- 60 TPS simulation, 30 FPS render target preserved
- Bundle: 22 kB gzip 6.7 kB (unchanged from 1A)

**Known issues / notes:**
- Test mode rounds run ~23-30s in practice (slightly under 25-35s target at lower end due to contestants starting near boundary)
- Danger arc lethal window starts after 20 ticks of arc being active (prevents instant surprise kills)
- `TEAMS.indexOf()` still called in `majorityTeam()` — O(n) but only on round-end; negligible
- SAFE_SECTORS event type defined in types but not yet activated in sim (foundation ready)

---

---

## Pass 1C — Premium Sphere Materials and Effects (complete)

**Completed:**

### Material System (`src/client/live/material.ts`)
- New `MaterialProfile` type: `POLISHED` | `METALLIC` | `PEARL` | `ENERGY`
- Each profile baked into an offscreen `HTMLCanvasElement` per (material + team + radius bucket)
- Cache keyed by `material:team:radiusBucket` — O(1) drawImage per sphere per frame after first use
- No per-frame gradient allocation; 24 total cached surfaces (4 profiles × 6 teams × 1 radius)
- Profiles:
  - **POLISHED**: radial gradient UL→LR, rim light, crisp specular, micro secondary glint
  - **METALLIC**: high-contrast sharper falloff, colored rim tint, narrow specular streak
  - **PEARL**: soft near-white center, iridescent sheen layer, diffuse specular, warm rim
  - **ENERGY**: dark outer/bright core, two concentric energy rings, colored rim, crisp specular

### Round Material Selection
- `roundMaterial` on `SimState` — set deterministically from `(round - 1) % 4`
- Cycle: Round 1 = POLISHED, 2 = METALLIC, 3 = PEARL, 4 = ENERGY, then repeats
- HUD displays `MATERIAL: <NAME>` in small muted text
- `materialOverride: MaterialProfile | null` on SimState for control panel

### Motion Trails
- Replaced flat uniform-width trail with tapered trail
- Each segment scales width from ~1.5px (tail) to ~r*0.55 (near head)
- Alpha also scales 0 → 42% toward head
- Team-colored, crisp, bounded to 12-point ring buffer (unchanged)

### Collision Contact Effects
- New `CollisionEffect` type and pre-allocated pool of 24 slots in sim
- Detected in `collide()`: relative velocity along normal > 2.5 units/tick threshold
- Visual: small expanding ring (4→18px) + brief inner flash for first 25% of life
- Duration: ~0.23s (14 ticks); neutral bright tone (warm white)
- No physics change; no blur; bounded pool

### Elimination Effect Refinement
- Phase-1 flash: brief scale bloom at sphere position (t < 0.15)
- Primary expanding team-colored ring (6→48px)
- Secondary soft white ring
- 5 geometric outward streaks with taper
- All effects fade cleanly; pool of 40 slots (unchanged)

### Control Panel (`/control`)
- Material selector: AUTO / POLISHED / METALLIC / PEARL / ENERGY
- Uses `BroadcastChannel('elite-live-battle')` — no architectural disruption
- `/live` listens on same channel, calls `sim.setMaterialOverride()`
- AUTO = deterministic per-round cycle

### Performance
- Sphere cache: 24 offscreen canvases, each ~80×80px (~500 KB total, stable)
- Collision pool: 24 slots, no runtime allocation
- Elimination pool: 40 slots (unchanged)
- Trail ring buffers: 12 pts per contestant (unchanged)
- No blur, no shadowBlur, no image textures
- Build: 30.05 kB / gzip 8.59 kB (was 22 kB / 6.7 kB)
- Typecheck: clean

**Known limitations:**
- Offscreen sphere canvases are baked at first use; if radius changes mid-round the cache updates on next bucket boundary (no issue with current fixed radius=16)
- Collision effect threshold (2.5 units/tick) may occasionally miss low-speed grazes — intentional
- `BroadcastChannel` material override only works when /live and /control are open in the same browser (same origin); fine for development use
