/**
 * SESSION DNA — deterministic session planning for Elite Live Battle
 *
 * One SessionDNA = one complete livestream session plan.
 * Generated from a seed; same seed → same plan.
 * No Math.random() used anywhere here.
 */

import { mulberry32, type Rng } from './prng'
import type { MaterialProfile, TeamId } from './types'

// ─── Challenge Recipe Types ───────────────────────────────────────────────────

export type ChallengeRecipeId =
  | 'CLASSIC_SURVIVAL'
  | 'LAST_COLOR_STANDING'
  | 'DANGER_ARC_GAUNTLET'
  | 'PULSE_PANIC'
  | 'GRAVITY_CORE'
  | 'SUDDEN_DEATH'

export interface ChallengeRecipe {
  id: ChallengeRecipeId
  name: string
  shortName: string
  isChampionship: boolean
  pointMultiplier: number
}

// ─── Session Phase ────────────────────────────────────────────────────────────

export type SessionPhase = 'EARLY' | 'MID' | 'LATE'

// ─── Scoring system ───────────────────────────────────────────────────────────

// Points awarded by finishing position (index 0 = 1st place, index 5 = 6th)
export const POSITION_POINTS = [6, 4, 3, 2, 1, 0]

// ─── Team Standing ────────────────────────────────────────────────────────────

export interface TeamStanding {
  team: TeamId
  sessionPoints: number
  roundWins: number
}

// ─── Round Plan ───────────────────────────────────────────────────────────────

export interface RoundPlan {
  roundNumber: number
  recipe: ChallengeRecipe
  materialProfile: MaterialProfile
  sessionPhase: SessionPhase
  isChampionship: boolean
  qualifier: number   // which qualifier block (1-based)
  positionInQualifier: number  // 1..N within that block
}

// ─── Session DNA ──────────────────────────────────────────────────────────────

export interface SessionDNA {
  sessionId: string
  sessionSeed: number
  materialSequence: MaterialProfile[]
  challengeSequence: ChallengeRecipeId[]
  teamOrder: TeamId[]
  eventIntensityCurve: number[]   // one value per round 0.0-1.0
  specialRoundSchedule: number[]  // round numbers that are championship
  championshipInterval: number    // rounds between championships
  arenaVisualTheme: number        // 0-3 (future use)
  ruleModifierSequence: number[]  // per-round modifier flags (future)
  roundPlans: RoundPlan[]
  earlyMidBoundary: number       // round number where EARLY→MID
  midLateBoundary: number        // round number where MID→LATE
}

// ─── All challenge recipes ────────────────────────────────────────────────────

export const ALL_RECIPES: Record<ChallengeRecipeId, ChallengeRecipe> = {
  CLASSIC_SURVIVAL: {
    id: 'CLASSIC_SURVIVAL',
    name: 'CLASSIC SURVIVAL',
    shortName: 'CLASSIC',
    isChampionship: false,
    pointMultiplier: 1,
  },
  LAST_COLOR_STANDING: {
    id: 'LAST_COLOR_STANDING',
    name: 'LAST COLOR STANDING',
    shortName: 'LAST COLOR',
    isChampionship: false,
    pointMultiplier: 1,
  },
  DANGER_ARC_GAUNTLET: {
    id: 'DANGER_ARC_GAUNTLET',
    name: 'DANGER ARC GAUNTLET',
    shortName: 'ARC GAUNTLET',
    isChampionship: false,
    pointMultiplier: 1,
  },
  PULSE_PANIC: {
    id: 'PULSE_PANIC',
    name: 'PULSE PANIC',
    shortName: 'PULSE PANIC',
    isChampionship: false,
    pointMultiplier: 1,
  },
  GRAVITY_CORE: {
    id: 'GRAVITY_CORE',
    name: 'GRAVITY CORE',
    shortName: 'GRAVITY CORE',
    isChampionship: false,
    pointMultiplier: 1,
  },
  SUDDEN_DEATH: {
    id: 'SUDDEN_DEATH',
    name: 'SUDDEN DEATH',
    shortName: 'SUDDEN DEATH',
    isChampionship: false,
    pointMultiplier: 1.5,
  },
}

// Championship variant with higher multiplier
export const CHAMPIONSHIP_RECIPE: ChallengeRecipe = {
  id: 'CLASSIC_SURVIVAL',
  name: 'CHAMPIONSHIP ROUND',
  shortName: 'CHAMPIONSHIP',
  isChampionship: true,
  pointMultiplier: 2,
}

// ─── Normal recipe pool (excludes SUDDEN_DEATH — used sparingly) ──────────────

const NORMAL_RECIPE_POOL: ChallengeRecipeId[] = [
  'CLASSIC_SURVIVAL',
  'LAST_COLOR_STANDING',
  'DANGER_ARC_GAUNTLET',
  'PULSE_PANIC',
  'GRAVITY_CORE',
]

// Materials for round cycling
const MATERIAL_CYCLE: MaterialProfile[] = ['POLISHED', 'METALLIC', 'PEARL', 'ENERGY']

// ─── Session ID generation ────────────────────────────────────────────────────

function generateSessionId(seed: number): string {
  // Deterministic short ID from seed — no Math.random
  const rng = mulberry32(seed)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = 'S-'
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(rng() * chars.length)]
  }
  return id
}

// ─── Structural similarity fingerprint ───────────────────────────────────────

export interface SessionFingerprint {
  sessionId: string
  seed: number
  challengeHash: number    // simple hash of challenge sequence
  materialHash: number
  championshipPositions: number[]
  championshipInterval: number
  theme: number
  timestamp: number
}

function hashSequence(seq: (string | number)[]): number {
  let h = 0x811c9dc5
  for (const item of seq) {
    const s = String(item)
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
    }
  }
  return h
}

export function fingerprintSession(dna: SessionDNA): SessionFingerprint {
  return {
    sessionId: dna.sessionId,
    seed: dna.sessionSeed,
    challengeHash: hashSequence(dna.challengeSequence),
    materialHash: hashSequence(dna.materialSequence),
    championshipPositions: dna.specialRoundSchedule.slice(0, 6),
    championshipInterval: dna.championshipInterval,
    theme: dna.arenaVisualTheme,
    timestamp: Date.now(),
  }
}

/**
 * Compute structural similarity between two fingerprints.
 * Returns 0.0 (completely different) to 1.0 (identical).
 */
export function sessionSimilarity(a: SessionFingerprint, b: SessionFingerprint): number {
  let score = 0
  let factors = 0

  // Challenge hash match
  factors++
  if (a.challengeHash === b.challengeHash) score += 1

  // Material hash match
  factors++
  if (a.materialHash === b.materialHash) score += 1

  // Championship interval match
  factors++
  if (a.championshipInterval === b.championshipInterval) score += 1

  // Theme match
  factors++
  if (a.theme === b.theme) score += 0.5

  // Championship positions overlap
  const posSetA = new Set(a.championshipPositions)
  const posSetB = new Set(b.championshipPositions)
  let overlap = 0
  for (const p of posSetA) { if (posSetB.has(p)) overlap++ }
  const totalUnion = new Set([...posSetA, ...posSetB]).size
  factors++
  score += totalUnion > 0 ? overlap / totalUnion : 1

  return score / factors
}

// ─── Session history (localStorage) ──────────────────────────────────────────

const HISTORY_KEY = 'elite_session_history'
const MAX_HISTORY = 14   // keep last 2 weeks of sessions

export function loadSessionHistory(): SessionFingerprint[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SessionFingerprint[]
  } catch {
    return []
  }
}

export function saveSessionToHistory(fp: SessionFingerprint): void {
  try {
    const history = loadSessionHistory()
    history.unshift(fp)
    // Bound history size
    while (history.length > MAX_HISTORY) history.pop()
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  } catch {
    // localStorage not available — ignore
  }
}

/**
 * Check if a candidate DNA is too similar to recent sessions.
 * Returns true if the session is sufficiently unique.
 */
export function isSufficientlyUnique(dna: SessionDNA, history: SessionFingerprint[]): boolean {
  const candidate = fingerprintSession(dna)
  const SIMILARITY_THRESHOLD = 0.75
  // Only check recent sessions (last 7)
  const recent = history.slice(0, 7)
  for (const fp of recent) {
    if (sessionSimilarity(candidate, fp) >= SIMILARITY_THRESHOLD) {
      return false
    }
  }
  return true
}

// ─── SessionDNA generator ─────────────────────────────────────────────────────

/**
 * Generate a deterministic SessionDNA from a seed.
 * Plans approximately 60 rounds (enough for ~3-4 hours at 3min/round).
 */
export function generateSessionDNA(seed: number): SessionDNA {
  const rng = mulberry32(seed >>> 0)

  const sessionId = generateSessionId(seed)

  // Championship interval: 8-12 rounds (deterministic from rng)
  const championshipInterval = 8 + Math.floor(rng() * 5)  // 8,9,10,11,12

  // Arena visual theme: 0-3
  const arenaVisualTheme = Math.floor(rng() * 4)

  // Team order shuffle (deterministic)
  const teamOrder: TeamId[] = ['GOLD', 'RED', 'CYAN', 'VIOLET', 'EMERALD', 'MAGENTA']
  // Fisher-Yates with seeded rng
  for (let i = teamOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[teamOrder[i], teamOrder[j]] = [teamOrder[j]!, teamOrder[i]!]
  }

  // Plan 60 rounds
  const TOTAL_ROUNDS = 60
  const challengeSequence: ChallengeRecipeId[] = []
  const materialSequence: MaterialProfile[] = []
  const specialRoundSchedule: number[] = []
  const eventIntensityCurve: number[] = []
  const ruleModifierSequence: number[] = []
  const roundPlans: RoundPlan[] = []

  // Session phase boundaries (% of total rounds)
  // EARLY: rounds 1..earlyMidBoundary
  // MID:   rounds earlyMidBoundary+1..midLateBoundary
  // LATE:  rounds midLateBoundary+1..end
  const earlyFrac = 0.30 + rng() * 0.10   // 30-40%
  const midFrac   = 0.65 + rng() * 0.10   // 65-75%
  const earlyMidBoundary = Math.floor(TOTAL_ROUNDS * earlyFrac)
  const midLateBoundary  = Math.floor(TOTAL_ROUNDS * midFrac)

  // Track last used recipe to avoid duplicates in a row
  let lastRecipeId: ChallengeRecipeId | null = null
  // Qualifier block tracking
  let qualifierBlock = 1
  let posInBlock = 0
  let roundsSinceChampionship = 0

  // Sudden death density per session phase
  const suddenDeathEarlyChance = 0.05 + rng() * 0.05   // 5-10%
  const suddenDeathMidChance   = 0.08 + rng() * 0.07   // 8-15%
  const suddenDeathLateChance  = 0.12 + rng() * 0.08   // 12-20%

  // Build recipe pool with exclusion of last recipe
  function pickRecipe(phase: SessionPhase, rng: Rng): ChallengeRecipeId {
    // Sudden death chance based on phase
    const sdChance = phase === 'EARLY' ? suddenDeathEarlyChance
                   : phase === 'MID'   ? suddenDeathMidChance
                   :                     suddenDeathLateChance
    if (rng() < sdChance) return 'SUDDEN_DEATH'

    const pool = NORMAL_RECIPE_POOL.filter(r => r !== lastRecipeId)
    const idx = Math.floor(rng() * pool.length)
    return pool[idx] ?? NORMAL_RECIPE_POOL[0]!
  }

  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    const sessionPhase: SessionPhase =
      round <= earlyMidBoundary ? 'EARLY'
      : round <= midLateBoundary ? 'MID'
      : 'LATE'

    // Determine if this is a championship round
    const isChampionship = roundsSinceChampionship >= championshipInterval

    // Intensity: increases over phases, championship rounds peak
    const baseIntensity = sessionPhase === 'EARLY' ? 0.3 + rng() * 0.2
                        : sessionPhase === 'MID'   ? 0.5 + rng() * 0.25
                        :                            0.7 + rng() * 0.3
    const intensity = isChampionship ? Math.min(1.0, baseIntensity + 0.2) : baseIntensity

    let recipeId: ChallengeRecipeId
    let recipe: ChallengeRecipe
    let isChamp = false

    if (isChampionship) {
      recipeId = 'CLASSIC_SURVIVAL'
      recipe = { ...CHAMPIONSHIP_RECIPE }
      isChamp = true
      specialRoundSchedule.push(round)
      roundsSinceChampionship = 0
      qualifierBlock++
      posInBlock = 0
    } else {
      recipeId = pickRecipe(sessionPhase, rng)
      recipe = { ...ALL_RECIPES[recipeId]! }
      roundsSinceChampionship++
      posInBlock++
    }

    lastRecipeId = recipeId
    challengeSequence.push(recipeId)
    materialSequence.push(MATERIAL_CYCLE[(round - 1) % MATERIAL_CYCLE.length]!)
    eventIntensityCurve.push(intensity)
    ruleModifierSequence.push(Math.floor(rng() * 4))

    roundPlans.push({
      roundNumber: round,
      recipe,
      materialProfile: MATERIAL_CYCLE[(round - 1) % MATERIAL_CYCLE.length]!,
      sessionPhase,
      isChampionship: isChamp,
      qualifier: qualifierBlock,
      positionInQualifier: posInBlock,
    })
  }

  return {
    sessionId,
    sessionSeed: seed,
    materialSequence,
    challengeSequence,
    teamOrder,
    eventIntensityCurve,
    specialRoundSchedule,
    championshipInterval,
    arenaVisualTheme,
    ruleModifierSequence,
    roundPlans,
    earlyMidBoundary,
    midLateBoundary,
  }
}

/**
 * Generate a unique SessionDNA, rejecting ones too similar to recent history.
 * Falls back after maxAttempts with the last generated DNA.
 */
export function generateUniqueSessionDNA(baseSeed: number, maxAttempts = 12): SessionDNA {
  const history = loadSessionHistory()

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Vary seed on each attempt using LCG
    const trySeed = attempt === 0
      ? baseSeed
      : (Math.imul(baseSeed + attempt * 0x9e3779b9, 0x6c62272e) >>> 0)
    const dna = generateSessionDNA(trySeed)
    if (history.length === 0 || isSufficientlyUnique(dna, history)) {
      return dna
    }
  }

  // Fallback: just use a random offset seed
  return generateSessionDNA((baseSeed ^ 0xdeadbeef) >>> 0)
}

// ─── Session Tournament Director ──────────────────────────────────────────────

export interface TournamentState {
  // Session-level standings
  standings: TeamStanding[]
  // Current round plan index (0-based)
  currentRoundIndex: number
  // Have we shown the leaderboard after this round?
  leaderboardShownAfterRound: number
}

export function createTournamentState(): TournamentState {
  const teams: TeamId[] = ['GOLD', 'RED', 'CYAN', 'VIOLET', 'EMERALD', 'MAGENTA']
  return {
    standings: teams.map(team => ({ team, sessionPoints: 0, roundWins: 0 })),
    currentRoundIndex: 0,
    leaderboardShownAfterRound: 0,
  }
}

/**
 * Award points after a round completes.
 * finishOrder: teams ordered by finish position (1st = index 0)
 * Returns points awarded to each team
 */
export function awardRoundPoints(
  state: TournamentState,
  finishOrder: TeamId[],
  pointMultiplier: number
): Partial<Record<TeamId, number>> {
  const awarded: Partial<Record<TeamId, number>> = {}

  for (let pos = 0; pos < finishOrder.length; pos++) {
    const team = finishOrder[pos]
    if (!team) continue
    const basePoints = POSITION_POINTS[pos] ?? 0
    const pts = Math.round(basePoints * pointMultiplier)
    awarded[team] = pts

    const standing = state.standings.find(s => s.team === team)
    if (standing) {
      standing.sessionPoints += pts
      if (pos === 0) standing.roundWins++
    }
  }

  return awarded
}

/**
 * Sort standings by session points descending.
 */
export function sortedStandings(state: TournamentState): TeamStanding[] {
  return [...state.standings].sort((a, b) => b.sessionPoints - a.sessionPoints)
}
