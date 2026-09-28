import { mulberry32, rngRange, type Rng } from './prng'
import { reflectCircleBoundary, resolveCircleCircle } from './physics'
import type { Contestant, Phase, SimState, TeamId } from './types'

const TEAMS: TeamId[] = ['GOLD', 'RED', 'CYAN', 'VIOLET', 'EMERALD', 'MAGENTA']
const CONTESTANTS_PER_TEAM = 6
const TOTAL = TEAMS.length * CONTESTANTS_PER_TEAM   // 36

const FULL_BOUNDARY = 460
const CONTESTANT_RADIUS = 14
const CONTESTANT_MASS = 1
const INIT_SPEED = 3.5
const MIN_SPEED = 1.5
const WANDER_AMP = 0.08  // radians of random direction change per tick

// Boundary shrink per tick during ESCALATION
const SHRINK_NORMAL = 0.45
const SHRINK_TEST = 4.5
const MIN_BOUNDARY = 60

// Phase durations in ticks (at 60 TPS)
const TICKS_PREPARE_NORMAL = 180
const TICKS_PREPARE_TEST   = 60
const TICKS_ACTIVE_NORMAL  = 1080
const TICKS_ACTIVE_TEST    = 180
const TICKS_WINNER_NORMAL  = 300
const TICKS_WINNER_TEST    = 120
const TICKS_RESET_NORMAL   = 60
const TICKS_RESET_TEST     = 30

export interface SimConfig {
  testMode: boolean
}

export class SimEngine {
  private rng: Rng
  private seed: number
  private testMode: boolean
  private pool: Contestant[]

  readonly state: SimState

  constructor(initialSeed: number, config: SimConfig) {
    this.seed = initialSeed >>> 0
    this.testMode = config.testMode

    // Build pre-allocated contestant pool — never reallocated
    this.pool = []
    for (let i = 0; i < TOTAL; i++) {
      this.pool.push({
        id: i,
        team: TEAMS[Math.floor(i / CONTESTANTS_PER_TEAM)],
        x: 0, y: 0, vx: 0, vy: 0,
        radius: CONTESTANT_RADIUS,
        mass: CONTESTANT_MASS,
        alive: false,
      })
    }

    this.rng = mulberry32(this.seed)
    this.state = {
      tick: 0,
      phase: 'PREPARE',
      round: 0,
      boundaryRadius: FULL_BOUNDARY,
      fullBoundaryRadius: FULL_BOUNDARY,
      phaseTicksRemaining: 0,
      contestants: this.pool,
      winnerTeam: null,
    }

    this.beginRound()
  }

  private prepareTicks(): number  { return this.testMode ? TICKS_PREPARE_TEST  : TICKS_PREPARE_NORMAL }
  private activeTicks(): number   { return this.testMode ? TICKS_ACTIVE_TEST   : TICKS_ACTIVE_NORMAL }
  private winnerTicks(): number   { return this.testMode ? TICKS_WINNER_TEST   : TICKS_WINNER_NORMAL }
  private resetTicks(): number    { return this.testMode ? TICKS_RESET_TEST    : TICKS_RESET_NORMAL }
  private shrinkRate(): number    { return this.testMode ? SHRINK_TEST         : SHRINK_NORMAL }

  private beginRound(): void {
    this.state.round++
    // Evolve seed with LCG so each round differs
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0
    this.rng = mulberry32(this.seed)

    // Place contestants spread within inner 70% of boundary
    for (let i = 0; i < TOTAL; i++) {
      const c = this.pool[i]
      c.alive = true
      const angle = rngRange(this.rng, 0, Math.PI * 2)
      const r = rngRange(this.rng, 0.15, 0.68) * FULL_BOUNDARY
      c.x = Math.cos(angle) * r
      c.y = Math.sin(angle) * r
      const vAngle = rngRange(this.rng, 0, Math.PI * 2)
      c.vx = Math.cos(vAngle) * INIT_SPEED
      c.vy = Math.sin(vAngle) * INIT_SPEED
    }

    this.state.tick = 0
    this.state.phase = 'PREPARE'
    this.state.boundaryRadius = FULL_BOUNDARY
    this.state.fullBoundaryRadius = FULL_BOUNDARY
    this.state.winnerTeam = null
    this.state.phaseTicksRemaining = this.prepareTicks()
  }

  step(): void {
    this.state.tick++
    this.state.phaseTicksRemaining--

    const phase: Phase = this.state.phase

    if (phase === 'PREPARE') {
      this.integrate()
      this.collide(false)
      if (this.state.phaseTicksRemaining <= 0) {
        this.state.phase = 'ACTIVE'
        this.state.phaseTicksRemaining = this.activeTicks()
      }

    } else if (phase === 'ACTIVE') {
      this.integrate()
      this.collide(false)
      if (this.state.phaseTicksRemaining <= 0) {
        this.state.phase = 'ESCALATION'
        this.state.phaseTicksRemaining = 99999
      }

    } else if (phase === 'ESCALATION') {
      this.state.boundaryRadius = Math.max(MIN_BOUNDARY, this.state.boundaryRadius - this.shrinkRate())
      this.integrate()
      this.eliminateOutside()
      this.collide(true)

      const winner = this.findWinner()
      if (winner !== null || this.state.boundaryRadius <= MIN_BOUNDARY) {
        this.state.phase = 'WINNER'
        this.state.winnerTeam = winner ?? this.majorityTeam()
        this.state.phaseTicksRemaining = this.winnerTicks()
      }

    } else if (phase === 'WINNER') {
      if (this.state.phaseTicksRemaining <= 0) {
        this.state.phase = 'RESET'
        this.state.phaseTicksRemaining = this.resetTicks()
      }

    } else if (phase === 'RESET') {
      if (this.state.phaseTicksRemaining <= 0) {
        this.beginRound()
      }
    }
  }

  // Integrate positions and apply wander (small PRNG-driven direction nudge)
  private integrate(): void {
    for (let i = 0; i < TOTAL; i++) {
      const c = this.pool[i]
      if (!c.alive) continue

      // Wander: perturb direction slightly each tick
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

  // Apply boundary reflection and circle/circle collisions
  private collide(escalation: boolean): void {
    const boundary = this.state.boundaryRadius

    if (!escalation) {
      for (let i = 0; i < TOTAL; i++) {
        if (this.pool[i].alive) reflectCircleBoundary(this.pool[i], boundary)
      }
    }

    for (let i = 0; i < TOTAL - 1; i++) {
      if (!this.pool[i].alive) continue
      for (let j = i + 1; j < TOTAL; j++) {
        if (!this.pool[j].alive) continue
        resolveCircleCircle(this.pool[i], this.pool[j])
      }
    }
  }

  // Eliminate contestants whose center is outside the current boundary
  private eliminateOutside(): void {
    const boundary = this.state.boundaryRadius
    for (let i = 0; i < TOTAL; i++) {
      const c = this.pool[i]
      if (!c.alive) continue
      const d = Math.sqrt(c.x * c.x + c.y * c.y)
      if (d > boundary - c.radius) {
        c.alive = false
      }
    }
  }

  // Returns the sole surviving team, or null if more than one team remains
  private findWinner(): TeamId | null {
    let found: TeamId | null = null
    for (let i = 0; i < TOTAL; i++) {
      if (!this.pool[i].alive) continue
      const t = this.pool[i].team
      if (found === null) {
        found = t
      } else if (found !== t) {
        return null // at least two teams alive
      }
    }
    return found // null means everyone dead (handled by caller)
  }

  // Returns the team with the most alive contestants (tie-breaks by TEAMS order)
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
    return TEAMS[best]
  }
}
