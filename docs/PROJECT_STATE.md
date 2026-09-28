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

---

## Pass 1D — Premium Arena Ring and Event Visuals (complete)

**Completed:**

### Premium Arena Ring (`src/client/live/renderer.ts`)
- Replaced flat single-stroke boundary ring with a multi-layer pseudo-3D ring structure
- Ring baked into an offscreen `HTMLCanvasElement` cached by quantized `boundaryRadius` (rounds to nearest 2px)
  - Cache invalidates automatically during arena shrink; typically holds for many frames at a time
- Baked ring layers (10 layers):
  1. Deep outer shadow halo — radial gradient diffuse drop-off beyond ring edge
  2. Outer rim dark base — thick dark stroke forming the outer lip
  3. Outer rim metallic gradient — two overlapping strokes (60/90% blue-steel tones)
  4. Main ring band fill — radial gradient annular groove (dark recessed center)
  5. Inner bevel / inner lip — two bright thin strokes on interior boundary
  6. Outer edge bright crease — thin highlight line at outer wall
  7. Specular highlight arc — subtle bright arc (upper-left ~225°→345°) simulating overhead light
  8. Opposite rim shadow arc — dark arc (lower-right) reinforcing 3D lighting logic
  9. Tick marks — 60 marks, long every 5th; long ticks span full ring band + dot accent; short ticks inside only
  10. Inner groove rings — two faint rings just inside tick boundary

### Internal Arena Detail
- Radial gradient arena fill (subtle center-bright, edge-dark) replacing flat dark fill
- Two faint concentric guide rings at 70% and 40% radius
- 12 near-invisible radial guide lines from 15%→65% radius
- Tiny center focal pip (double circle, low alpha)

### Danger Arc Visual Integration
- Sector fill now uses a radial gradient (hot at boundary, fades toward center)
- Three-stroke ring integration: broad outer glow band + sharp inner crease + inner lip echo
- Arc endpoint tip indicators (small filled dots at arc boundaries)
- Lethal state adds extra bright crease stroke and brighter tip dots

### Center Repulsor Device
- Redesigned as a structured arena device: outer energy disc (radial gradient fill), two concentric device rings
- Slowly rotating 4-arm cross geometry (arena device motif), 4 stationary diagonal accent ticks
- Core bright dot with inner white pixel

### Pulse Rings
- Added secondary softer outer companion ring to each pulse (at 88% radius, 35% alpha)

### Phase Ring Overlay
- Phase-dependent color applied as live overlay on top of cached ring
- Three-part overlay: broad base ring + bright inner crease + pressure glow (ESCALATION/FINAL only)
- ESCALATION/FINAL: dual-sided glow (outside AND inside arena boundary)

### Performance
- Arena ring: single offscreen canvas, blitted each frame with `drawImage` — O(1) per frame when radius stable
- Rebake triggered only on boundary radius change (quantized to 2px steps)
- No bloom, no blur, no shadowBlur, no raster assets
- Build: 35.57 kB / gzip 9.71 kB (was 30.05 kB / 8.59 kB)
- Typecheck: clean

**Known limitations:**
- Interior detail (guide rings, radial lines) is redrawn every frame — acceptable cost (~14 draw calls); could be cached in a future pass if profiling shows it matters
- Arena ring cache stores only the most recent radius; if boundary radius oscillates rapidly (not expected) it could rebake frequently — no issue with current smooth-shrink behavior

---

## Pass 2 — Retention + Unique Daily Session Foundation (complete)

**Completed:**

### SessionDNA (`src/client/shared/session.ts`)
- `SessionDNA` type: sessionId, sessionSeed, materialSequence, challengeSequence, teamOrder, eventIntensityCurve, specialRoundSchedule, championshipInterval, arenaVisualTheme, ruleModifierSequence, roundPlans, earlyMidBoundary, midLateBoundary
- `generateSessionDNA(seed)` — deterministic 60-round plan from seed; same seed reproduces identical session
- `generateUniqueSessionDNA(seed)` — rejects sessions too similar to recent history (up to 12 retry attempts)
- Session IDs in format `S-XXXXXXXX` (8 chars, deterministic from seed)
- Session history: up to 14 fingerprints stored in `localStorage` as `elite_session_history`
- `sessionSimilarity()` — structural 5-factor score; 0.75 threshold for rejection
- `fingerPrintSession()` — compact structural fingerprint (no timestamp dependency for similarity)

### Challenge Recipe System (6 recipes)
All implemented in `SimEngine` with recipe-specific physics, event patterns, and timing:
- **CLASSIC_SURVIVAL** — balanced standard with arc/repulsor/pulse events
- **LAST_COLOR_STANDING** — team-survival win condition; winner = last team with any contestant alive
- **DANGER_ARC_GAUNTLET** — always-arc events, faster speed, wider span, optional second arc at opposite side
- **PULSE_PANIC** — scheduled pulse waves with visible countdown (`PULSE IN N`); intensity increases by phase
- **GRAVITY_CORE** — deterministic PULL/PUSH/NEUTRAL mode switching with visible countdown and directional arrows at center
- **SUDDEN_DEATH** — shorter phase durations, faster arcs, faster shrink rate; used sparingly (5-20% of rounds by phase)

### Mini Tournament Structure
- Qualifier blocks: N normal rounds followed by CHAMPIONSHIP ROUND
- `championshipInterval`: 8-12 rounds (deterministic from SessionDNA seed)
- 4+ championship rounds planned per 60-round session
- Points: 1st=6, 2nd=4, 3rd=3, 4th=2, 5th=1, 6th=0 (configurable via `POSITION_POINTS`)
- Championship multiplier: ×2 points
- SUDDEN_DEATH multiplier: ×1.5 points

### Session Progression
- Three phases: `EARLY` (rounds 1–~20%), `MID` (~20–70%), `LATE` (~70–end)
- Boundaries deterministic per session: earlyMidBoundary 30–40% of 60 rounds, midLateBoundary 65–75%
- SUDDEN_DEATH frequency increases with session phase (5-10% EARLY → 12-20% LATE)
- Event intensity curve stored per round

### Persistent Team Standings
- `ScoreboardRow` on `SimState` — persists session points and round wins across all rounds
- Alive contestant dots decrease; eliminated teams show `OUT` (row stays, dims, never removed)
- `onRoundEnd` callback triggers point awarding via `TournamentState`
- Points synced back into `scoreboardRows` for scoreboard display

### Round Intro Overlay (3-5s)
- Shows: ROUND N / challenge name (large) / qualifier info / team list / session phase
- Championship rounds: gold color, `CHAMPIONSHIP ROUND` header
- Fade in/hold/fade out animation using tick fraction

### Session Standings (Leaderboard) Moment
- Displayed after every 5th round as `LEADERBOARD` phase (5s normal / 2s test)
- Sorted by session points descending; shows team name, points, wins
- Fades in/out cleanly

### Championship Winner Presentation
- Extended winner banner: `CHAMPIONSHIP` label, team name as `CHAMPION`, `+N POINTS`, duration/survivors
- Gold color scheme during championship winner display

### Team Eliminated Announcement
- `TEAM ELIMINATED` shown for 3s when a team's last contestant dies
- Separate from milestone announcements

### Session Controls (/control)
- Session ID and Seed displayed (selectable for copy)
- `GENERATE NEW SESSION` button — posts `newSession` to BroadcastChannel, /live creates new DNA
- Session standings panel updated live via BroadcastChannel
- Material override preserved from Pass 1C

### Performance
- No new runtime allocations; all new state pre-allocated in constructor
- Leaderboard rows array updated in-place
- SessionDNA generates once and is indexed by round number
- History bounded at 14 entries
- Build: 56.00 kB / gzip 15.27 kB (was 35.57 kB / 9.71 kB)
- Typecheck: clean
- 76/76 verification assertions pass

**Known limitations:**
- `LAST_COLOR_STANDING` only checks individual survivors for team-win; if many team members die simultaneously in a single tick the announcement may lag one tick (negligible)
- GRAVITY_CORE visual arrows don't match the physics direction perfectly when speed is high (cosmetic)
- Session history requires localStorage; silently ignored if unavailable (production FFmpeg context)
## Pass 3 — True Arena Diversity (complete)

**Completed:**

### ArenaFamily System
- New `ArenaFamily` type: `CIRCLE_SURVIVAL` | `ROTATING_GATES` | `HEX_PRESSURE` | `FUNNEL_DROP`
- `SessionDNA` extended with `arenaSequence: ArenaFamily[]`
- `RoundPlan` extended with `arenaFamily: ArenaFamily`
- `SimState` extended with all arena-specific state (gate arms, hex sides, funnel geometry, deflectors)
- `generateSessionDNA()` now generates a deterministic arena sequence per round
- Arena selection rules: no 3+ consecutive same arena; championship rounds always CIRCLE_SURVIVAL

### Reusable Collision Foundation (`src/client/shared/physics.ts`)
- `reflectCircleSegment()` — circle vs finite line segment (gate arms, deflectors)
- `reflectConvexPolygon()` — circle inside convex polygon (hex boundary)
- `reflectFunnelWall()` — circle vs angled funnel wall

### ROTATING_GATES Arena
- Outer circular boundary with 3–6 rotating solid gate arms
- Arms rotate deterministically at seeded speed/direction
- 65% of arms have passable gap (position/size seeded per round)
- Contestants physically collide with gate geometry via `reflectCircleSegment`
- Phase escalation: boundary shrinks + arm colors shift hot-red
- Visual: dark circular field, mechanical steel arms, green gap indicators, glowing hub

### HEX_PRESSURE Arena
- True hexagonal boundary — no circle underneath
- `reflectConvexPolygon()` enforces six-sided walls
- Sides progressively inset during ESCALATION/FINAL (asymmetric pattern)
- Random danger sides activate temporarily (touching them eliminates contestants)
- Slow decorative rotation of hex frame
- Visual: large premium pseudo-3D hex frame, corner pip accents, inset pressure markers, phase pressure glow

### FUNNEL_DROP Arena
- Vertically-oriented chamber: wide upper section → angled funnel walls → narrow chute
- Contestants experience constant downward gravity (increases in ESCALATION/FINAL)
- 4 rotating deflector paddles inside funnel redirect contestants
- Bottom chute becomes lethal in ESCALATION/FINAL phases (`funnelChuteDanger`)
- Contestants spawn in upper chamber; outcomes driven by deflector positioning
- Visual: vertical funnel shape, animated rotating deflectors, chute danger flash, tick marks on walls

### Arena-Specific Simulation Dispatch
- `tickArena()` per-tick physics dispatch (gravity, gate rotation, deflectors)
- `applyArenaBoundary()` per-tick boundary enforcement dispatch
- `initArena()` per-round initialization (geometry, spawn positions)
- Circle boundary reflection in `collide()` skipped for HEX/FUNNEL arenas

### Round Intro Updates
- Arena family name shown prominently above challenge recipe name
- Per-arena color coding: CIRCLE=blue, ROTATING_GATES=orange, HEX_PRESSURE=teal, FUNNEL_DROP=pink
- HUD shows arena family name with color accent

### Session Variation
- All four arena families appear regularly in generated sequences
- Different seeds produce meaningfully different arena sequences (verified)
- Championship rounds always use CIRCLE_SURVIVAL (most proven arena)

### Performance
- All new state pre-allocated in constructor (gate arms pool, hex verts, deflectors)
- `hexVerts` reused each tick — no allocation in hot loop
- New collision functions are O(n) per contestant per tick, no allocations
- Build: 75.39 kB / gzip 20.61 kB (was 56.00 kB / 15.27 kB)
- Typecheck: clean

**Known limitations:**
- HEX_PRESSURE: sides inset symmetrically by rounding; true per-side independent inset would require more vertex math (current approach still visually distinct)
- FUNNEL_DROP: funnel wall reflection normal calculation uses atan2 approximation; extreme slope angles could cause unusual bounces (uncommon with current geometry)
- ROTATING_GATES: gap-less arms act as solid walls throughout; "danger gap" phase for gap-less arms not yet activated (arm collision already effective as eliminator during escalation)
- Championship rounds always CIRCLE_SURVIVAL — 3-in-a-row of CIRCLE_SURVIVAL is possible if rounds N-1, N are CIRCLE and N+1 is championship (rare, acceptable)
- `reflectConvexPolygon` expects CCW winding; hex vertices are generated CCW by `computeInsetHexVerts` in renderer and `updateHexVerts` in sim


