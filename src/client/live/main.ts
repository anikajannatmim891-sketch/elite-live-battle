import { SimEngine } from '../shared/sim'
import { render } from './renderer'
import type { MaterialProfile } from '../shared/types'
import {
  generateUniqueSessionDNA,
  createTournamentState,
  awardRoundPoints,
  sortedStandings,
  fingerprintSession,
  saveSessionToHistory,
  type SessionDNA,
  type TournamentState,
} from '../shared/session'

const LOGICAL_W = 1920
const LOGICAL_H = 1080
const TICK_MS = 1000 / 60

function resize(canvas: HTMLCanvasElement): void {
  const scale = Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H)
  canvas.style.width  = `${Math.floor(LOGICAL_W * scale)}px`
  canvas.style.height = `${Math.floor(LOGICAL_H * scale)}px`
}

// ─── Session management ───────────────────────────────────────────────────────

let currentDNA: SessionDNA | null = null
let tournament: TournamentState = createTournamentState()
let sim: SimEngine | null = null

// BroadcastChannel for /control communication
const bc = new BroadcastChannel('elite-live-battle')

function startSession(seed: number, dna: SessionDNA, testMode: boolean): void {
  currentDNA = dna
  tournament = createTournamentState()

  // Create new sim (replaces previous if any)
  sim = new SimEngine(seed, { testMode })

  // Inject round plans
  sim.setRoundPlans(dna.roundPlans)
  sim.setStandings(tournament.standings)

  // Hook round end: award points, update scoreboard
  sim.onRoundEnd = (finishOrder, _isChampionship, multiplier) => {
    if (!currentDNA) return
    awardRoundPoints(tournament, finishOrder, multiplier)
    // Update sim with latest standings (used for leaderboard display and scoreboard)
    const sorted = sortedStandings(tournament)
    sim!.setStandings(tournament.standings)
    // Prepare leaderboard rows in state — sim will display them when it transitions
    sim!.state.leaderboard.rows = [...sorted]

    // Save session fingerprint to history occasionally (every 10 rounds)
    if (sim!.state.round % 10 === 0) {
      const fp = fingerprintSession(currentDNA)
      saveSessionToHistory(fp)
    }

    // Broadcast current standings to /control
    bc.postMessage({
      type: 'standings',
      standings: sorted,
      sessionId: currentDNA.sessionId,
      sessionSeed: currentDNA.sessionSeed,
    })
  }

  // Broadcast session info to /control
  bc.postMessage({
    type: 'session',
    sessionId: dna.sessionId,
    sessionSeed: dna.sessionSeed,
  })
}

// ─── Control message handler ──────────────────────────────────────────────────

function handleControlMessage(data: Record<string, unknown>): void {
  if (!sim) return
  const type = data['type'] as string

  if (type === 'material') {
    sim.setMaterialOverride(data['value'] as MaterialProfile | null)
  }

  if (type === 'newSession') {
    const seed = (Date.now() >>> 0) ^ (Math.floor(performance.now() * 1000) & 0xffffffff)
    const testMode = new URLSearchParams(location.search).get('test') === '1'
    const dna = generateUniqueSessionDNA(seed >>> 0)
    startSession(seed >>> 0, dna, testMode)
    // Replay session info
    bc.postMessage({
      type: 'session',
      sessionId: dna.sessionId,
      sessionSeed: dna.sessionSeed,
    })
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init(): void {
  const canvas = document.getElementById('battle') as HTMLCanvasElement
  const ctxMaybe = canvas.getContext('2d')
  if (!ctxMaybe) throw new Error('Canvas 2D context unavailable')
  const ctx = ctxMaybe

  canvas.width  = LOGICAL_W
  canvas.height = LOGICAL_H

  const resizeHandler = (): void => resize(canvas)
  window.addEventListener('resize', resizeHandler)
  resize(canvas)

  const testMode = new URLSearchParams(location.search).get('test') === '1'

  // Generate session seed (seeded from time, not Math.random for gameplay)
  const initialSeed = (Date.now() >>> 0)
  const dna = generateUniqueSessionDNA(initialSeed)

  startSession(initialSeed, dna, testMode)

  // BroadcastChannel
  bc.addEventListener('message', (ev) => {
    handleControlMessage(ev.data as Record<string, unknown>)
  })

  let lastTs = 0
  let accumMs = 0

  function loop(ts: number): void {
    if (!sim) { requestAnimationFrame(loop); return }
    if (lastTs === 0) lastTs = ts
    const delta = ts - lastTs
    lastTs = ts

    accumMs += Math.min(delta, 200)

    while (accumMs >= TICK_MS) {
      sim.step()
      accumMs -= TICK_MS
    }

    render(ctx, sim.state)
    requestAnimationFrame(loop)
  }

  requestAnimationFrame(loop)
}

document.addEventListener('DOMContentLoaded', init)
