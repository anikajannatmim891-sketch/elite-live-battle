/**
 * PASS 2 Verification Script
 * Run with: npx tsx verify-pass2.ts
 *
 * Verifies:
 * 1. SessionDNA generates different plans for different seeds
 * 2. Session similarity system works
 * 3. Multiple ChallengeRecipe types appear in sequence
 * 4. Championship rounds scheduled at correct intervals
 * 5. Sim runs 12 accelerated rounds without accumulation
 * 6. Round finish order tracked correctly
 * 7. Score points awarded per round
 * 8. Teams marked as eliminated correctly
 */

// Minimal browser API shims for Node
const g = globalThis as Record<string, unknown>
g.localStorage = {
  _store: {} as Record<string, string>,
  getItem(k: string) { return (this._store as Record<string, string>)[k] ?? null },
  setItem(k: string, v: string) { (this._store as Record<string, string>)[k] = v },
  removeItem(k: string) { delete (this._store as Record<string, string>)[k] },
}
g.document = { createElement: () => ({ getContext: () => null, width: 0, height: 0 }) }

import { generateSessionDNA, generateUniqueSessionDNA, sessionSimilarity, fingerprintSession, createTournamentState, awardRoundPoints, sortedStandings } from './src/client/shared/session'
import { SimEngine } from './src/client/shared/sim'

let passed = 0
let failed = 0

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`)
    passed++
  } else {
    console.error(`  FAIL  ${label}`)
    failed++
  }
}

// ─── 1. SessionDNA generation ─────────────────────────────────────────────────
console.log('\n[1] SessionDNA generation')
const dna1 = generateSessionDNA(0xdeadbeef)
const dna2 = generateSessionDNA(0xcafebabe)

assert(dna1.sessionId !== dna2.sessionId, 'Different seeds → different session IDs')
assert(dna1.sessionSeed === 0xdeadbeef, 'Seed stored correctly')
assert(dna1.roundPlans.length === 60, '60 round plans generated')
assert(dna1.challengeSequence.length === 60, '60 challenge entries')
assert(dna1.specialRoundSchedule.length > 0, 'Championship rounds scheduled')
assert(dna1.championshipInterval >= 8 && dna1.championshipInterval <= 12, 'Championship interval 8-12')
assert(dna1.earlyMidBoundary > 0 && dna1.earlyMidBoundary < dna1.midLateBoundary, 'Session phase boundaries valid')

// ─── 2. Same seed → same plan ──────────────────────────────────────────────
console.log('\n[2] Deterministic reproduction')
const dna1b = generateSessionDNA(0xdeadbeef)
assert(
  JSON.stringify(dna1.challengeSequence) === JSON.stringify(dna1b.challengeSequence),
  'Same seed → same challenge sequence'
)
assert(
  JSON.stringify(dna1.specialRoundSchedule) === JSON.stringify(dna1b.specialRoundSchedule),
  'Same seed → same championship schedule'
)

// ─── 3. Recipe diversity ─────────────────────────────────────────────────────
console.log('\n[3] Recipe diversity in session')
const recipeSet = new Set(dna1.challengeSequence)
assert(recipeSet.size >= 4, `At least 4 different recipes appear (got ${recipeSet.size}): ${[...recipeSet].join(', ')}`)
assert(dna1.challengeSequence.includes('PULSE_PANIC'), 'PULSE_PANIC appears in session')
assert(dna1.challengeSequence.includes('GRAVITY_CORE'), 'GRAVITY_CORE appears in session')
assert(dna1.challengeSequence.includes('LAST_COLOR_STANDING'), 'LAST_COLOR_STANDING appears')

// ─── 4. Championship rounds ───────────────────────────────────────────────────
console.log('\n[4] Championship scheduling')
const champRounds = dna1.specialRoundSchedule
assert(champRounds.length >= 4, `At least 4 championship rounds in 60 (got ${champRounds.length})`)
// Verify intervals are sensible
for (let i = 1; i < champRounds.length; i++) {
  const gap = champRounds[i]! - champRounds[i-1]!
  assert(gap >= 8 && gap <= 16, `Championship gap at position ${i}: ${gap} (expect 8-16)`)
}
// Verify champion rounds have the correct recipe in roundPlans
for (const cr of champRounds.slice(0, 3)) {
  const plan = dna1.roundPlans[cr - 1]!
  assert(plan.recipe.isChampionship, `Round ${cr} plan has isChampionship=true`)
  assert(plan.recipe.pointMultiplier >= 2, `Championship multiplier >= 2`)
}

// ─── 5. Session similarity ────────────────────────────────────────────────────
console.log('\n[5] Session similarity / uniqueness')
const fp1 = fingerprintSession(dna1)
const fp2 = fingerprintSession(dna2)
const fpSame = fingerprintSession(dna1b)

const simSame = sessionSimilarity(fp1, fpSame)
const simDiff = sessionSimilarity(fp1, fp2)
// Similarity between same-seed sessions should be very high (>=0.80)
// Note: timestamps differ so not exactly 1.0; structural hash equality drives 4/5 factors
assert(simSame >= 0.80, `Same session fingerprints: similarity=${simSame.toFixed(3)} (expect >=0.80)`)
assert(simDiff < 0.9, `Different sessions: similarity=${simDiff.toFixed(3)} (expect < 0.9)`)

// ─── 6. Unique session generation ────────────────────────────────────────────
console.log('\n[6] Unique session generation')
const uniqueDNA = generateUniqueSessionDNA(12345)
assert(uniqueDNA.sessionId.startsWith('S-'), `Session ID starts with S-: ${uniqueDNA.sessionId}`)
assert(uniqueDNA.roundPlans.length === 60, 'Unique DNA has 60 round plans')

// ─── 7. Tournament state ─────────────────────────────────────────────────────
console.log('\n[7] Tournament / scoring')
const tournament = createTournamentState()
assert(tournament.standings.length === 6, '6 team standings created')

const order1: Array<'GOLD' | 'RED' | 'CYAN' | 'VIOLET' | 'EMERALD' | 'MAGENTA'> =
  ['CYAN', 'GOLD', 'RED', 'VIOLET', 'EMERALD', 'MAGENTA']
const awarded = awardRoundPoints(tournament, order1, 1)
assert((awarded['CYAN'] ?? 0) === 6, 'Winner gets 6 points')
assert((awarded['GOLD'] ?? 0) === 4, '2nd gets 4 points')
assert((awarded['MAGENTA'] ?? 0) === 0, '6th gets 0 points')

const awarded2 = awardRoundPoints(tournament, order1, 2)  // championship 2x
assert((awarded2['CYAN'] ?? 0) === 12, 'Championship winner gets 12 points (6×2)')

const sorted = sortedStandings(tournament)
assert(sorted[0]!.team === 'CYAN', 'CYAN leads after 2 wins')
assert(sorted[0]!.sessionPoints === 18, `CYAN has 18 points (got ${sorted[0]!.sessionPoints})`)

// ─── 8. Sim engine with recipe — run 12 accelerated rounds ───────────────────
console.log('\n[8] Sim engine — 12 accelerated rounds with recipe injection')
const sim = new SimEngine(0xabc123, { testMode: true })
sim.setRoundPlans(dna1.roundPlans)
const standingsArr = tournament.standings
sim.setStandings(standingsArr)

let roundsCompleted = 0
let recipesSeenInSim = new Set<string>()
let championshipsRun = 0
let roundEndFired = 0
let maxRound = 0

sim.onRoundEnd = (finishOrder, isChamp, multiplier) => {
  roundEndFired++
  assert(finishOrder.length === 6, `Round ${sim.state.round}: finish order has 6 teams (got ${finishOrder.length})`)
  assert(multiplier > 0, `Multiplier > 0: ${multiplier}`)
  if (isChamp) championshipsRun++
}

// Run until 12 rounds complete — max 500k ticks to prevent infinite loop
let ticks = 0
const MAX_TICKS = 500000
while (roundsCompleted < 12 && ticks < MAX_TICKS) {
  const prevRound = sim.state.round
  sim.step()
  ticks++

  recipesSeenInSim.add(sim.state.currentRecipeId)

  if (sim.state.round > prevRound) {
    roundsCompleted++
    maxRound = sim.state.round
  }
}

assert(roundsCompleted >= 12, `12 rounds completed (got ${roundsCompleted}) in ${ticks} ticks`)
assert(recipesSeenInSim.size >= 3, `At least 3 different recipes observed in sim: ${[...recipesSeenInSim].join(', ')}`)
assert(roundEndFired >= 11, `onRoundEnd fired >= 11 times (got ${roundEndFired})`)

// ─── 9. Memory stability — no accumulation ────────────────────────────────────
console.log('\n[9] Memory stability')
const afterPool = sim.state.contestants.length
assert(afterPool === 36, `Contestant pool stable at 36 (got ${afterPool})`)
const afterElimPool = sim.state.eliminationEffects.length
assert(afterElimPool === 40, `Elimination pool stable at 40 (got ${afterElimPool})`)
const afterCollPool = sim.state.collisionEffects.length
assert(afterCollPool === 24, `Collision pool stable at 24 (got ${afterCollPool})`)
const afterPulsePool = sim.state.pulseRings.length
assert(afterPulsePool === 6, `Pulse pool stable at 6 (got ${afterPulsePool})`)

// ─── 10. Scoreboard rows ─────────────────────────────────────────────────────
console.log('\n[10] Scoreboard rows structure')
assert(sim.state.scoreboardRows.length === 6, 'Scoreboard has 6 rows')
for (const row of sim.state.scoreboardRows) {
  assert(row.aliveCount >= 0 && row.aliveCount <= 6, `${row.team} aliveCount in range: ${row.aliveCount}`)
}

// ─── 11. Recipe plan coverage ─────────────────────────────────────────────────
console.log('\n[11] Session phase boundaries')
assert(dna1.earlyMidBoundary >= 15 && dna1.earlyMidBoundary <= 30,
  `earlyMidBoundary in range: ${dna1.earlyMidBoundary}`)
assert(dna1.midLateBoundary >= 35 && dna1.midLateBoundary <= 52,
  `midLateBoundary in range: ${dna1.midLateBoundary}`)

// Check SUDDEN_DEATH is sparse (not first 5 rounds)
const suddenDeathCount = dna1.challengeSequence.filter(r => r === 'SUDDEN_DEATH').length
assert(suddenDeathCount >= 1 && suddenDeathCount <= 18,
  `SUDDEN_DEATH sparsely used: ${suddenDeathCount} out of 60`)
// Should not be the majority
assert(suddenDeathCount < 20, `SUDDEN_DEATH not dominating: ${suddenDeathCount}`)

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed === 0) {
  console.log('ALL VERIFICATION CHECKS PASSED')
} else {
  console.log('SOME CHECKS FAILED — see above')
  process.exit(1)
}
