import type { ChallengeRecipeId, SessionPhase, TeamStanding } from './session'

export type TeamId = 'GOLD' | 'RED' | 'CYAN' | 'VIOLET' | 'EMERALD' | 'MAGENTA'

// Material profile for the current round's sphere rendering
export type MaterialProfile = 'POLISHED' | 'METALLIC' | 'PEARL' | 'ENERGY'

// Round phases — deterministic ordering
export type Phase =
  | 'PREPARE'
  | 'INTRO'           // 3-5s: round intro screen
  | 'OPENING'         // 45-60s: contestants move, viewers identify teams
  | 'DANGER'          // 45-60s: first elimination mechanics
  | 'ESCALATION'      // 45-75s: increasing pressure
  | 'FINAL'           // up to 45s: maximum pressure
  | 'WINNER'
  | 'LEADERBOARD'     // show session standings after some rounds
  | 'RESET'

// Active Circle Survival event type
export type EventType =
  | 'NONE'
  | 'DANGER_ARC'       // rotating lethal arc on boundary
  | 'SAFE_SECTORS'     // clearly marked safe/danger sectors
  | 'CENTER_REPULSOR'  // central force pushing outward
  | 'PULSE'            // radial physics impulse + visual ring
  | 'GRAVITY_PULL'     // constant inward pull toward center
  | 'GRAVITY_PUSH'     // constant outward push from center

// Gravity core mode for GRAVITY_CORE recipe
export type GravityCoreMode = 'PULL' | 'PUSH' | 'NEUTRAL'

// Trail point for each contestant — fixed-size ring buffer
export interface TrailPoint {
  x: number
  y: number
}

export interface Contestant {
  id: number
  team: TeamId
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  mass: number
  alive: boolean
  // Trail ring buffer (fixed allocation)
  trail: TrailPoint[]
  trailHead: number  // index of next write position
  trailLen: number   // how many valid entries (up to TRAIL_MAX)
}

// Collision contact effect — pre-allocated pool
export interface CollisionEffect {
  active: boolean
  x: number
  y: number
  age: number
  maxAge: number
}

// Elimination burst effect — pre-allocated pool
export interface EliminationEffect {
  active: boolean
  x: number
  y: number
  team: TeamId
  age: number        // ticks since spawn (0 = fresh)
  maxAge: number     // ticks until recycled
}

// Pulse ring effect — pre-allocated pool
export interface PulseRing {
  active: boolean
  x: number
  y: number
  age: number
  maxAge: number
  color: string
}

// Next-event countdown shown to viewers
export interface EventCountdown {
  label: string      // e.g. "DANGER ARC IN"
  ticksRemaining: number
}

// ─── Scoreboard row (per-team, session-persistent) ────────────────────────────

export interface ScoreboardRow {
  team: TeamId
  aliveCount: number    // alive in current round
  sessionPoints: number
  roundWins: number
  isEliminated: boolean // fully out this round
}

// ─── Round intro state ────────────────────────────────────────────────────────

export interface RoundIntroState {
  active: boolean
  recipeName: string
  recipeShortName: string
  roundNumber: number
  isChampionship: boolean
  qualifier: number
  positionInQualifier: number
  ticksRemaining: number
  maxTicks: number
}

// ─── Leaderboard display state ────────────────────────────────────────────────

export interface LeaderboardState {
  active: boolean
  rows: TeamStanding[]
  ticksRemaining: number
  maxTicks: number
}

// ─── Championship win state ───────────────────────────────────────────────────

export interface ChampionshipWinState {
  active: boolean
  team: TeamId
  pointsGained: number
}

export interface SimState {
  tick: number
  phase: Phase
  round: number
  roundTick: number          // tick within current round (resets each round)
  boundaryRadius: number
  fullBoundaryRadius: number
  phaseTicksRemaining: number

  contestants: Contestant[]

  // Current active event
  activeEvent: EventType
  eventTicksRemaining: number

  // Danger arc state (used when activeEvent === 'DANGER_ARC')
  dangerArcAngle: number     // center angle of the danger arc (radians)
  dangerArcSpeed: number     // radians per tick
  dangerArcSpan: number      // half-span of danger zone (radians)
  dangerArcLethal: boolean   // true = crossing boundary here eliminates

  // Center repulsor
  repulsorActive: boolean
  repulsorStrength: number   // force magnitude per tick

  // Pulse event
  pulseRings: PulseRing[]
  // Scheduled pulse countdown (PULSE_PANIC recipe)
  nextPulseCountdown: number  // ticks until next pulse (shown to viewer)

  // Safe sectors (deterministic list of safe arc ranges [start, end] radians)
  safeSectors: Array<[number, number]>
  safeSectorsActive: boolean

  // Pressure phase: boundary starts shrinking progressively from ESCALATION onward
  pressureActive: boolean
  shrinkRate: number

  // Pre-allocated effects pool
  eliminationEffects: EliminationEffect[]

  // Pre-allocated collision effect pool
  collisionEffects: CollisionEffect[]

  // Current round material profile
  roundMaterial: MaterialProfile
  // Override from control panel (null = AUTO / deterministic)
  materialOverride: MaterialProfile | null

  // Next event hint for HUD
  nextEventLabel: string
  nextEventTicksRemaining: number

  // Milestone flags for FINAL display
  shownFinal10: boolean
  shownFinal5: boolean
  shownFinalTwo: boolean
  milestoneLabel: string
  milestoneTicksRemaining: number

  winnerTeam: TeamId | null

  // Winner screen stats
  roundDurationSec: number
  survivorCount: number
  eliminationCount: number

  // ─── Pass 2: Session / Tournament state ──────────────────────────────────

  // Current challenge recipe
  currentRecipeId: ChallengeRecipeId
  currentRecipeName: string
  isChampionshipRound: boolean
  sessionPhase: SessionPhase
  pointMultiplier: number

  // Gravity core state (GRAVITY_CORE recipe)
  gravityCoreMode: GravityCoreMode
  gravityCoreNextChangeIn: number   // ticks until next mode switch (display)
  gravityCoreStrength: number

  // Team elimination announcements
  teamEliminatedLabel: string
  teamEliminatedTicksRemaining: number

  // Session scoreboard rows (persistent across rounds, updated at round end)
  scoreboardRows: ScoreboardRow[]

  // Team finish order for current round (for point awarding)
  roundFinishOrder: TeamId[]

  // Round intro
  roundIntro: RoundIntroState

  // Leaderboard moment
  leaderboard: LeaderboardState

  // Championship win display
  championshipWin: ChampionshipWinState

  // Qualifier / block info
  currentQualifier: number
  currentPositionInQualifier: number
}

export interface HealthResponse {
  status: 'ok' | 'error'
  timestamp: number
  uptime: number
}
