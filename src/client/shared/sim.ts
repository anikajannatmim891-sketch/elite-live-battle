import { mulberry32, rngRange, type Rng } from './prng'
import { reflectCircleBoundary, resolveCircleCircle } from './physics'
import type {
  CollisionEffect, Contestant, EliminationEffect, EventType, MaterialProfile,
  Phase, PulseRing, SimState, TeamId, TrailPoint
} from './types'

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAMS: TeamId[] = ['GOLD', 'RED', 'CYAN', 'VIOLET', 'EMERALD', 'MAGENTA']
const CONTESTANTS_PER_TEAM = 6
const TOTAL = TEAMS.length * CONTESTANTS_PER_TEAM   // 36

const FULL_BOUNDARY = 460
const CONTESTANT_RADIUS = 16      // slightly larger for visibility
const CONTESTANT_MASS   = 1
const INIT_SPEED  = 3.5
const MIN_SPEED   = 1.8
const MAX_SPEED   = 8
const WANDER_AMP  = 0.06          // radians of random direction change per tick

const TRAIL_MAX = 12              // trail points per contestant

const EFFECT_POOL_SIZE    = 40      // max simultaneous elimination bursts
const PULSE_POOL_SIZE     = 6       // max simultaneous pulse rings
const COLLISION_POOL_SIZE = 24      // max simultaneous collision contact rings

const MIN_BOUNDARY = 70

// ─── Phase timing (ticks at 60 TPS) ──────────────────────────────────────────
// Normal mode target: 2m30s – 4m00s total
//   PREPARE   5s     = 300
//   OPENING   52s    = 3120
//   DANGER    52s    = 3120
//   ESCALATION 60s   = 3600
//   FINAL     up to 45s = 2700  (forced resolution)
//   WINNER    7s     = 420
//   RESET     4s     = 240
//
// Test mode target: 25-35s total
//   PREPARE   1s  = 60
//   OPENING   7s  = 420
//   DANGER    7s  = 420
//   ESCALATION 10s = 600
//   FINAL     up to 10s = 600
//   WINNER    2s  = 120
//   RESET     1s  = 60

const T = {
  PREPARE_N:    300, PREPARE_T:     60,
  OPENING_N:   3120, OPENING_T:    420,
  DANGER_N:    3120, DANGER_T:     420,
  ESCALATION_N:3600, ESCALATION_T: 600,
  FINAL_N:     2700, FINAL_T:      600,
  WINNER_N:     420, WINNER_T:     120,
  RESET_N:      240, RESET_T:       60,
}

// Shrink rates (boundary units per tick)
const SHRINK_ESCALATION_N = 0.30    // gentle at first
const SHRINK_ESCALATION_T = 0.9     // test: moderate — still 8s+ to force action
const SHRINK_FINAL_N      = 0.65    // faster in final
const SHRINK_FINAL_T      = 2.5     // test: faster in final

// How often events fire (ticks between events) during DANGER/ESCALATION
const EVENT_INTERVAL_N = 900   // ~15s
const EVENT_INTERVAL_T = 90    //  ~1.5s

// Danger arc settings
const DANGER_ARC_SPAN_N  = 0.8   // half-span radians (~92°)
const DANGER_ARC_SPAN_T  = 1.0
const DANGER_ARC_SPEED_N = 0.012
const DANGER_ARC_SPEED_T = 0.04
const DANGER_ARC_DURATION_N = 1800  // 30s
const DANGER_ARC_DURATION_T = 180

// Repulsor settings
const REPULSOR_STRENGTH_N = 0.12
const REPULSOR_STRENGTH_T = 0.20
const REPULSOR_DURATION_N = 1800
const REPULSOR_DURATION_T = 150

// Pulse settings
const PULSE_STRENGTH_N = 2.2
const PULSE_STRENGTH_T = 2.8
const PULSE_DURATION_N = 600   // 10s — includes ring decay
const PULSE_DURATION_T = 90

// Milestone thresholds
const MILESTONE_DURATION = 180  // 3s display

// ─── Material profiles ordered for round cycling ─────────────────────────────

const MATERIAL_CYCLE: MaterialProfile[] = ['POLISHED', 'METALLIC', 'PEARL', 'ENERGY']

function materialForRound(round: number, override: MaterialProfile | null): MaterialProfile {
  if (override !== null) return override
  return MATERIAL_CYCLE[(round - 1) % MATERIAL_CYCLE.length]!
}

// ─── SimConfig ────────────────────────────────────────────────────────────────

export interface SimConfig {
  testMode: boolean
}

// ─── SimEngine ────────────────────────────────────────────────────────────────

export class SimEngine {
  private rng: Rng
  private seed: number
  private testMode: boolean
  private pool: Contestant[]
  private effectPool: EliminationEffect[]
  private pulsePool: PulseRing[]
  private collisionPool: CollisionEffect[]

  // Next-event scheduling
  private nextEventTick: number = 0

  readonly state: SimState

  // Allow control panel to override material (null = AUTO)
  setMaterialOverride(m: MaterialProfile | null): void {
    this.state.materialOverride = m
    // Apply immediately to current round
    this.state.roundMaterial = materialForRound(this.state.round, m)
  }

  constructor(initialSeed: number, config: SimConfig) {
    this.seed     = initialSeed >>> 0
    this.testMode = config.testMode

    // Pre-allocate contestant pool with trail buffers
    this.pool = []
    for (let i = 0; i < TOTAL; i++) {
      const trail: TrailPoint[] = []
      for (let t = 0; t < TRAIL_MAX; t++) trail.push({ x: 0, y: 0 })
      this.pool.push({
        id: i,
        team: TEAMS[Math.floor(i / CONTESTANTS_PER_TEAM)],
        x: 0, y: 0, vx: 0, vy: 0,
        radius: CONTESTANT_RADIUS,
        mass: CONTESTANT_MASS,
        alive: false,
        trail,
        trailHead: 0,
        trailLen: 0,
      })
    }

    // Pre-allocate effect pools
    this.effectPool = []
    for (let i = 0; i < EFFECT_POOL_SIZE; i++) {
      this.effectPool.push({ active: false, x: 0, y: 0, team: 'GOLD', age: 0, maxAge: 0 })
    }
    this.pulsePool = []
    for (let i = 0; i < PULSE_POOL_SIZE; i++) {
      this.pulsePool.push({ active: false, x: 0, y: 0, age: 0, maxAge: 0, color: '#ffffff' })
    }
    this.collisionPool = []
    for (let i = 0; i < COLLISION_POOL_SIZE; i++) {
      this.collisionPool.push({ active: false, x: 0, y: 0, age: 0, maxAge: 0 })
    }

    this.rng = mulberry32(this.seed)
    this.state = {
      tick: 0,
      phase: 'PREPARE',
      round: 0,
      roundTick: 0,
      boundaryRadius:     FULL_BOUNDARY,
      fullBoundaryRadius: FULL_BOUNDARY,
      phaseTicksRemaining: 0,
      contestants: this.pool,
      activeEvent: 'NONE',
      eventTicksRemaining: 0,
      dangerArcAngle: 0,
      dangerArcSpeed: 0,
      dangerArcSpan: 0,
      dangerArcLethal: false,
      repulsorActive: false,
      repulsorStrength: 0,
      pulseRings: this.pulsePool,
      safeSectors: [],
      safeSectorsActive: false,
      pressureActive: false,
      shrinkRate: 0,
      eliminationEffects: this.effectPool,
      collisionEffects: this.collisionPool,
      roundMaterial: 'POLISHED',
      materialOverride: null,
      nextEventLabel: '',
      nextEventTicksRemaining: 0,
      shownFinal10: false,
      shownFinal5: false,
      shownFinalTwo: false,
      milestoneLabel: '',
      milestoneTicksRemaining: 0,
      winnerTeam: null,
      roundDurationSec: 0,
      survivorCount: 0,
      eliminationCount: 0,
    }

    this.beginRound()
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private t<T>(normal: T, test: T): T { return this.testMode ? test : normal }

  private spawnEffect(x: number, y: number, team: TeamId): void {
    for (let i = 0; i < this.effectPool.length; i++) {
      const e = this.effectPool[i]
      if (!e.active) {
        e.active = true; e.x = x; e.y = y; e.team = team
        e.age = 0; e.maxAge = this.t(22, 18)   // < 0.4s at 60 tps
        return
      }
    }
    // pool full — reuse oldest
    let oldest = this.effectPool[0]
    for (let i = 1; i < this.effectPool.length; i++) {
      if ((this.effectPool[i]?.age ?? 0) > (oldest?.age ?? 0)) oldest = this.effectPool[i]!
    }
    if (oldest) {
      oldest.active = true; oldest.x = x; oldest.y = y; oldest.team = team
      oldest.age = 0; oldest.maxAge = this.t(22, 18)
    }
  }

  private spawnCollisionEffect(x: number, y: number): void {
    for (let i = 0; i < this.collisionPool.length; i++) {
      const e = this.collisionPool[i]
      if (!e.active) {
        e.active = true; e.x = x; e.y = y
        e.age = 0; e.maxAge = this.t(14, 10)   // ~0.23s at 60 TPS
        return
      }
    }
    // pool full — reuse oldest
    let oldest = this.collisionPool[0]
    for (let i = 1; i < this.collisionPool.length; i++) {
      if ((this.collisionPool[i]?.age ?? 0) > (oldest?.age ?? 0)) oldest = this.collisionPool[i]!
    }
    if (oldest) {
      oldest.active = true; oldest.x = x; oldest.y = y
      oldest.age = 0; oldest.maxAge = this.t(14, 10)
    }
  }

  private spawnPulseRing(x: number, y: number, color: string): void {    for (let i = 0; i < this.pulsePool.length; i++) {
      const p = this.pulsePool[i]
      if (!p.active) {
        p.active = true; p.x = x; p.y = y; p.color = color
        p.age = 0; p.maxAge = this.t(45, 35)
        return
      }
    }
  }

  // ─── Round lifecycle ──────────────────────────────────────────────────────

  private beginRound(): void {
    this.state.round++
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0
    this.rng = mulberry32(this.seed)

    // Place contestants spread within inner 70% of boundary
    for (let i = 0; i < TOTAL; i++) {
      const c = this.pool[i]
      c.alive = true
      const angle = rngRange(this.rng, 0, Math.PI * 2)
      const r     = rngRange(this.rng, 0.15, 0.68) * FULL_BOUNDARY
      c.x = Math.cos(angle) * r
      c.y = Math.sin(angle) * r
      const vAngle = rngRange(this.rng, 0, Math.PI * 2)
      c.vx = Math.cos(vAngle) * INIT_SPEED
      c.vy = Math.sin(vAngle) * INIT_SPEED
      c.trailHead = 0; c.trailLen = 0
    }

    // Reset effects
    for (let i = 0; i < this.effectPool.length; i++)    this.effectPool[i].active    = false
    for (let i = 0; i < this.pulsePool.length; i++)     this.pulsePool[i].active     = false
    for (let i = 0; i < this.collisionPool.length; i++) this.collisionPool[i].active = false

    this.state.tick = 0
    this.state.roundTick = 0
    this.state.phase = 'PREPARE'
    this.state.boundaryRadius     = FULL_BOUNDARY
    this.state.fullBoundaryRadius = FULL_BOUNDARY
    this.state.winnerTeam         = null
    this.state.phaseTicksRemaining = this.t(T.PREPARE_T, T.PREPARE_N)

    this.state.activeEvent        = 'NONE'
    this.state.eventTicksRemaining = 0
    this.state.dangerArcLethal    = false
    this.state.repulsorActive     = false
    this.state.repulsorStrength   = 0
    this.state.safeSectors        = []
    this.state.safeSectorsActive  = false
    this.state.pressureActive     = false
    this.state.shrinkRate         = 0

    // Select material for this round (deterministic, respects override)
    this.state.roundMaterial = materialForRound(this.state.round, this.state.materialOverride)

    this.state.shownFinal10 = false
    this.state.shownFinal5  = false
    this.state.shownFinalTwo = false
    this.state.milestoneLabel = ''
    this.state.milestoneTicksRemaining = 0

    this.state.roundDurationSec = 0
    this.state.survivorCount = 0
    this.state.eliminationCount = 0

    // Schedule first event for DANGER phase
    this.nextEventTick = 0
    this.updateNextEventHint()
  }

  private updateNextEventHint(): void {
    const ticks = this.nextEventTick - this.state.roundTick
    if (ticks <= 0 || this.state.activeEvent !== 'NONE') {
      this.state.nextEventLabel = ''
      this.state.nextEventTicksRemaining = 0
      return
    }
    const sec = Math.ceil(ticks / 60)
    // Pick a label based on what might come next
    const labels = ['DANGER ARC IN', 'REPULSOR IN', 'PULSE IN', 'EVENT IN']
    const li = Math.floor(this.state.round % labels.length)
    this.state.nextEventLabel = (labels[li] ?? 'EVENT IN') + ' ' + sec
    this.state.nextEventTicksRemaining = ticks
  }

  // ─── Main step ───────────────────────────────────────────────────────────

  step(): void {
    this.state.tick++
    this.state.roundTick++
    this.state.phaseTicksRemaining--

    // Age effects
    this.ageEffects()

    const phase = this.state.phase

    if (phase === 'PREPARE') {
      this.integrate()
      this.collide(false)
      if (this.state.phaseTicksRemaining <= 0) {
        this.enterPhase('OPENING')
      }

    } else if (phase === 'OPENING') {
      this.integrate()
      this.collide(false)
      this.checkMilestones()
      if (this.state.phaseTicksRemaining <= 0) {
        this.enterPhase('DANGER')
      }

    } else if (phase === 'DANGER') {
      this.tickEvent()
      this.integrate()
      this.applyRepulsor()
      this.applyDangerArc()
      this.collide(false)
      this.checkMilestones()
      if (this.state.phaseTicksRemaining <= 0) {
        this.endEvent()
        this.enterPhase('ESCALATION')
      }

    } else if (phase === 'ESCALATION') {
      this.tickEvent()
      // Start gentle boundary shrink
      this.state.pressureActive = true
      this.state.shrinkRate = this.t(SHRINK_ESCALATION_T, SHRINK_ESCALATION_N)
      this.state.boundaryRadius = Math.max(
        MIN_BOUNDARY + 80,
        this.state.boundaryRadius - this.state.shrinkRate
      )
      this.integrate()
      this.applyRepulsor()
      this.applyDangerArc()
      this.eliminateOutside()
      this.collide(true)
      this.checkMilestones()

      const winner = this.findWinner()
      if (winner !== null) {
        this.triggerWinner(winner)
      } else if (this.state.phaseTicksRemaining <= 0) {
        this.endEvent()
        this.enterPhase('FINAL')
      }

    } else if (phase === 'FINAL') {
      this.tickEvent()
      // Faster shrink, boundary goes to minimum
      this.state.shrinkRate = this.t(SHRINK_FINAL_T, SHRINK_FINAL_N)
      this.state.boundaryRadius = Math.max(
        MIN_BOUNDARY,
        this.state.boundaryRadius - this.state.shrinkRate
      )
      this.integrate()
      this.applyRepulsor()
      this.applyDangerArc()
      this.eliminateOutside()
      this.collide(true)
      this.checkMilestones()

      const winner = this.findWinner()
      if (winner !== null) {
        this.triggerWinner(winner)
      } else if (
        this.state.boundaryRadius <= MIN_BOUNDARY ||
        this.state.phaseTicksRemaining <= 0
      ) {
        this.triggerWinner(this.majorityTeam())
      }

    } else if (phase === 'WINNER') {
      // Survivors keep moving slowly
      this.integrateWinner()
      if (this.state.phaseTicksRemaining <= 0) {
        this.state.phase = 'RESET'
        this.state.phaseTicksRemaining = this.t(T.RESET_T, T.RESET_N)
      }

    } else if (phase === 'RESET') {
      if (this.state.phaseTicksRemaining <= 0) {
        this.beginRound()
      }
    }

    // Milestone display decay
    if (this.state.milestoneTicksRemaining > 0) {
      this.state.milestoneTicksRemaining--
    } else {
      this.state.milestoneLabel = ''
    }
  }

  // ─── Phase entry ─────────────────────────────────────────────────────────

  private enterPhase(phase: Phase): void {
    this.state.phase = phase
    switch (phase) {
      case 'OPENING':
        this.state.phaseTicksRemaining = this.t(T.OPENING_T, T.OPENING_N)
        // Schedule first event for DANGER phase — hint only
        this.nextEventTick = this.state.roundTick +
          this.t(T.OPENING_T, T.OPENING_N) +
          this.t(EVENT_INTERVAL_T, EVENT_INTERVAL_N) / 2
        break
      case 'DANGER':
        this.state.phaseTicksRemaining = this.t(T.DANGER_T, T.DANGER_N)
        this.nextEventTick = this.state.roundTick + this.t(60, 300)
        break
      case 'ESCALATION':
        this.state.phaseTicksRemaining = this.t(T.ESCALATION_T, T.ESCALATION_N)
        this.nextEventTick = this.state.roundTick + this.t(45, 240)
        break
      case 'FINAL':
        this.state.phaseTicksRemaining = this.t(T.FINAL_T, T.FINAL_N)
        this.nextEventTick = this.state.roundTick + this.t(30, 180)
        break
      default:
        break
    }
    this.updateNextEventHint()
  }

  // ─── Event system ────────────────────────────────────────────────────────

  private tickEvent(): void {
    const rt = this.state.roundTick
    const phase = this.state.phase

    // Advance danger arc position each tick while active
    if (this.state.activeEvent === 'DANGER_ARC') {
      this.state.dangerArcAngle += this.state.dangerArcSpeed
      this.state.eventTicksRemaining--
      if (this.state.eventTicksRemaining <= 0) {
        this.endEvent()
      } else {
        // Lethal after first 20 ticks
        this.state.dangerArcLethal = this.state.eventTicksRemaining <
          (this.t(DANGER_ARC_DURATION_T, DANGER_ARC_DURATION_N) - 20)
      }
      this.updateNextEventHint()
      return
    }

    if (this.state.activeEvent === 'CENTER_REPULSOR') {
      this.state.eventTicksRemaining--
      if (this.state.eventTicksRemaining <= 0) {
        this.endEvent()
      }
      this.updateNextEventHint()
      return
    }

    if (this.state.activeEvent === 'PULSE') {
      this.state.eventTicksRemaining--
      if (this.state.eventTicksRemaining <= 0) {
        this.endEvent()
      }
      this.updateNextEventHint()
      return
    }

    // Check if it's time to fire the next event
    if (
      (phase === 'DANGER' || phase === 'ESCALATION' || phase === 'FINAL') &&
      this.state.activeEvent === 'NONE' &&
      rt >= this.nextEventTick
    ) {
      this.fireNextEvent()
    }

    this.updateNextEventHint()
  }

  private fireNextEvent(): void {
    // Deterministically pick next event based on round and tick
    const pick = Math.floor(this.rng() * 3)
    const events: EventType[] = ['DANGER_ARC', 'CENTER_REPULSOR', 'PULSE']
    const chosen: EventType = events[pick % events.length] ?? 'PULSE'

    this.state.activeEvent = chosen

    switch (chosen) {
      case 'DANGER_ARC':
        this.state.dangerArcAngle = rngRange(this.rng, 0, Math.PI * 2)
        this.state.dangerArcSpeed = rngRange(this.rng, 0.5, 1.5) *
          (this.rng() > 0.5 ? 1 : -1) *
          this.t(DANGER_ARC_SPEED_T, DANGER_ARC_SPEED_N)
        this.state.dangerArcSpan  = this.t(DANGER_ARC_SPAN_T, DANGER_ARC_SPAN_N)
        this.state.dangerArcLethal = false
        this.state.eventTicksRemaining = this.t(DANGER_ARC_DURATION_T, DANGER_ARC_DURATION_N)
        break
      case 'CENTER_REPULSOR':
        this.state.repulsorActive   = true
        this.state.repulsorStrength = this.t(REPULSOR_STRENGTH_T, REPULSOR_STRENGTH_N)
        this.state.eventTicksRemaining = this.t(REPULSOR_DURATION_T, REPULSOR_DURATION_N)
        break
      case 'PULSE':
        this.firePulse()
        this.state.eventTicksRemaining = this.t(PULSE_DURATION_T, PULSE_DURATION_N)
        break
    }

    // Schedule next event
    this.nextEventTick = this.state.roundTick +
      this.t(EVENT_INTERVAL_T, EVENT_INTERVAL_N)
  }

  private firePulse(): void {
    // Radial impulse from center outward
    const strength = this.t(PULSE_STRENGTH_T, PULSE_STRENGTH_N)
    for (let i = 0; i < TOTAL; i++) {
      const c = this.pool[i]
      if (!c.alive) continue
      const d = Math.sqrt(c.x * c.x + c.y * c.y)
      if (d < 1) continue
      const nx = c.x / d
      const ny = c.y / d
      // Impulse magnitude inversely proportional to distance
      const imp = strength * Math.max(0.3, 1 - d / FULL_BOUNDARY)
      c.vx += nx * imp
      c.vy += ny * imp
      // Clamp speed
      const spd = Math.sqrt(c.vx * c.vx + c.vy * c.vy)
      if (spd > MAX_SPEED) { c.vx *= MAX_SPEED / spd; c.vy *= MAX_SPEED / spd }
    }
    this.spawnPulseRing(0, 0, '#00ddff')
  }

  private endEvent(): void {
    this.state.activeEvent       = 'NONE'
    this.state.eventTicksRemaining = 0
    this.state.dangerArcLethal   = false
    this.state.repulsorActive    = false
    this.state.repulsorStrength  = 0
  }

  // ─── Physics helpers ─────────────────────────────────────────────────────

  private integrate(): void {
    for (let i = 0; i < TOTAL; i++) {
      const c = this.pool[i]
      if (!c.alive) continue

      // Record trail point
      c.trail[c.trailHead].x = c.x
      c.trail[c.trailHead].y = c.y
      c.trailHead = (c.trailHead + 1) % TRAIL_MAX
      if (c.trailLen < TRAIL_MAX) c.trailLen++

      // Wander
      const speed = Math.sqrt(c.vx * c.vx + c.vy * c.vy)
      const curAngle = Math.atan2(c.vy, c.vx)
      const newAngle = curAngle + rngRange(this.rng, -WANDER_AMP, WANDER_AMP)
      const s = speed < MIN_SPEED ? MIN_SPEED : speed
      c.vx = Math.cos(newAngle) * s
      c.vy = Math.sin(newAngle) * s

      c.x += c.vx
      c.y += c.vy
    }
  }

  // Slow movement during winner phase — survivors drift
  private integrateWinner(): void {
    for (let i = 0; i < TOTAL; i++) {
      const c = this.pool[i]
      if (!c.alive) continue
      c.vx *= 0.96
      c.vy *= 0.96
      c.x += c.vx
      c.y += c.vy
      // Keep inside boundary
      reflectCircleBoundary(c, this.state.boundaryRadius)
    }
  }

  private applyRepulsor(): void {
    if (!this.state.repulsorActive) return
    const str = this.state.repulsorStrength
    for (let i = 0; i < TOTAL; i++) {
      const c = this.pool[i]
      if (!c.alive) continue
      const d = Math.sqrt(c.x * c.x + c.y * c.y)
      if (d < 1) continue
      const nx = c.x / d
      const ny = c.y / d
      // Force proportional to how close to center
      const factor = Math.max(0, 1 - d / FULL_BOUNDARY) * str
      c.vx += nx * factor
      c.vy += ny * factor
      const spd = Math.sqrt(c.vx * c.vx + c.vy * c.vy)
      if (spd > MAX_SPEED) { c.vx *= MAX_SPEED / spd; c.vy *= MAX_SPEED / spd }
    }
  }

  private applyDangerArc(): void {
    if (!this.state.dangerArcLethal) return
    if (this.state.activeEvent !== 'DANGER_ARC') return

    const boundary = this.state.boundaryRadius
    const arcAngle = this.state.dangerArcAngle
    const halfSpan = this.state.dangerArcSpan

    for (let i = 0; i < TOTAL; i++) {
      const c = this.pool[i]
      if (!c.alive) continue
      const d = Math.sqrt(c.x * c.x + c.y * c.y)
      // Only check contestants near the boundary
      if (d < boundary - c.radius * 3) continue
      const angle = Math.atan2(c.y, c.x)
      const diff = angleDiff(angle, arcAngle)
      if (Math.abs(diff) < halfSpan) {
        // In the danger zone at the boundary — eliminate
        c.alive = false
        this.spawnEffect(c.x, c.y, c.team)
      }
    }
  }

  private collide(escalation: boolean): void {
    const boundary = this.state.boundaryRadius
    if (!escalation) {
      for (let i = 0; i < TOTAL; i++) {
        if (this.pool[i].alive) reflectCircleBoundary(this.pool[i], boundary)
      }
    }

    // Minimum relative speed (units/tick) to register a collision effect
    // Avoids spawning effects on gentle touches / resting contacts
    const COLLISION_THRESHOLD = 2.5

    for (let i = 0; i < TOTAL - 1; i++) {
      if (!this.pool[i].alive) continue
      for (let j = i + 1; j < TOTAL; j++) {
        if (!this.pool[j].alive) continue
        const a = this.pool[i]!
        const b = this.pool[j]!

        // Check for meaningful impact before resolution
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distSq = dx * dx + dy * dy
        const minDist = a.radius + b.radius
        if (distSq < minDist * minDist && distSq > 0) {
          const dist = Math.sqrt(distSq)
          const nx = dx / dist
          const ny = dy / dist
          const relVDotN = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
          // relVDotN > 0 means approaching; spawn effect if strong enough
          if (relVDotN > COLLISION_THRESHOLD) {
            const cx = (a.x + b.x) * 0.5
            const cy = (a.y + b.y) * 0.5
            this.spawnCollisionEffect(cx, cy)
          }
        }

        resolveCircleCircle(a, b)
      }
    }
  }

  private eliminateOutside(): void {
    const boundary = this.state.boundaryRadius
    for (let i = 0; i < TOTAL; i++) {
      const c = this.pool[i]
      if (!c.alive) continue
      const d = Math.sqrt(c.x * c.x + c.y * c.y)
      if (d > boundary - c.radius) {
        c.alive = false
        this.spawnEffect(c.x, c.y, c.team)
      }
    }
  }

  // ─── Milestone / winner logic ────────────────────────────────────────────

  private checkMilestones(): void {
    let alive = 0
    const teamsAlive = new Set<TeamId>()
    for (let i = 0; i < TOTAL; i++) {
      if (this.pool[i].alive) { alive++; teamsAlive.add(this.pool[i].team) }
    }

    if (!this.state.shownFinal10 && alive <= 10) {
      this.state.shownFinal10 = true
      this.state.milestoneLabel = 'FINAL 10'
      this.state.milestoneTicksRemaining = MILESTONE_DURATION
    }
    if (!this.state.shownFinal5 && alive <= 5) {
      this.state.shownFinal5 = true
      this.state.milestoneLabel = 'FINAL 5'
      this.state.milestoneTicksRemaining = MILESTONE_DURATION
    }
    if (!this.state.shownFinalTwo && teamsAlive.size <= 2) {
      this.state.shownFinalTwo = true
      this.state.milestoneLabel = 'FINAL TWO TEAMS'
      this.state.milestoneTicksRemaining = MILESTONE_DURATION
    }
  }

  private triggerWinner(team: TeamId): void {
    this.state.phase = 'WINNER'
    this.state.winnerTeam = team
    this.state.phaseTicksRemaining = this.t(T.WINNER_T, T.WINNER_N)
    this.endEvent()

    // Compute stats
    this.state.roundDurationSec = Math.floor(this.state.roundTick / 60)
    let survivors = 0
    for (let i = 0; i < TOTAL; i++) if (this.pool[i].alive) survivors++
    this.state.survivorCount    = survivors
    this.state.eliminationCount = TOTAL - survivors
  }

  private findWinner(): TeamId | null {
    let found: TeamId | null = null
    for (let i = 0; i < TOTAL; i++) {
      if (!this.pool[i].alive) continue
      const t = this.pool[i].team
      if (found === null) { found = t }
      else if (found !== t) return null
    }
    return found
  }

  private majorityTeam(): TeamId {
    const counts = [0, 0, 0, 0, 0, 0]
    for (let i = 0; i < TOTAL; i++) {
      if (this.pool[i].alive) {
        const ti = TEAMS.indexOf(this.pool[i].team)
        if (ti >= 0) counts[ti]++
      }
    }
    let best = 0
    for (let k = 1; k < TEAMS.length; k++) {
      if ((counts[k] ?? 0) > (counts[best] ?? 0)) best = k
    }
    return TEAMS[best]!
  }

  private ageEffects(): void {
    for (let i = 0; i < this.effectPool.length; i++) {
      const e = this.effectPool[i]
      if (!e.active) continue
      e.age++
      if (e.age >= e.maxAge) e.active = false
    }
    for (let i = 0; i < this.pulsePool.length; i++) {
      const p = this.pulsePool[i]
      if (!p.active) continue
      p.age++
      if (p.age >= p.maxAge) p.active = false
    }
    for (let i = 0; i < this.collisionPool.length; i++) {
      const e = this.collisionPool[i]
      if (!e.active) continue
      e.age++
      if (e.age >= e.maxAge) e.active = false
    }
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

// Returns signed angle difference in [-PI, PI]
function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d >  Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
