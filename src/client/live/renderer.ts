import type { SimState, TeamId } from '../shared/types'

const W  = 1920
const H  = 1080
const CX = W / 2
const CY = H / 2

// ─── Team colors ─────────────────────────────────────────────────────────────

const TEAM_COLORS: Record<TeamId, string> = {
  GOLD:    '#FFD700',
  RED:     '#FF2233',
  CYAN:    '#00FFEE',
  VIOLET:  '#CC00FF',
  EMERALD: '#00FF88',
  MAGENTA: '#FF00AA',
}

// Short team labels for scoreboard
const TEAM_LABEL: Record<TeamId, string> = {
  GOLD:    'GLD',
  RED:     'RED',
  CYAN:    'CYN',
  VIOLET:  'VIO',
  EMERALD: 'EMR',
  MAGENTA: 'MGT',
}

const TEAMS_ORDER: TeamId[] = ['GOLD', 'RED', 'CYAN', 'VIOLET', 'EMERALD', 'MAGENTA']
const CONTESTANTS_PER_TEAM = 6
const TRAIL_MAX = 12

// ─── Circumference tick marks (pre-computed) ──────────────────────────────────
const TICK_COUNT = 60
const TICK_ANGLES: number[] = []
for (let i = 0; i < TICK_COUNT; i++) TICK_ANGLES.push((i / TICK_COUNT) * Math.PI * 2)

// ─── Main render ─────────────────────────────────────────────────────────────

export function render(ctx: CanvasRenderingContext2D, state: SimState): void {
  // Background
  ctx.fillStyle = '#06060a'
  ctx.fillRect(0, 0, W, H)

  drawArena(ctx, state)
  drawPulseRings(ctx, state)
  drawContestants(ctx, state)
  drawEliminationEffects(ctx, state)
  drawHUD(ctx, state)
  drawScoreboard(ctx, state)
  drawEventIndicator(ctx, state)
  drawMilestone(ctx, state)

  if (state.phase === 'WINNER') drawWinnerBanner(ctx, state)
}

// ─── Arena ────────────────────────────────────────────────────────────────────

function drawArena(ctx: CanvasRenderingContext2D, state: SimState): void {
  const br = state.boundaryRadius
  const phase = state.phase
  const isPressure = state.pressureActive

  // Outer dark fill inside arena
  ctx.beginPath()
  ctx.arc(CX, CY, br, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,20,0.4)'
  ctx.fill()

  // Safe sector fills (if active)
  if (state.safeSectorsActive && state.safeSectors.length > 0) {
    for (const [start, end] of state.safeSectors) {
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.arc(CX, CY, br, start, end)
      ctx.closePath()
      ctx.fillStyle = 'rgba(0,255,136,0.04)'
      ctx.fill()
    }
  }

  // Danger arc highlight
  if (state.activeEvent === 'DANGER_ARC') {
    const arcA = state.dangerArcAngle
    const half = state.dangerArcSpan
    ctx.beginPath()
    ctx.moveTo(CX, CY)
    ctx.arc(CX, CY, br + 18, arcA - half, arcA + half)
    ctx.closePath()
    const alpha = state.dangerArcLethal ? 0.35 : 0.15
    ctx.fillStyle = `rgba(255,40,0,${alpha})`
    ctx.fill()

    // Danger arc outer glow band
    ctx.beginPath()
    ctx.arc(CX, CY, br + 6, arcA - half, arcA + half)
    ctx.strokeStyle = state.dangerArcLethal ? 'rgba(255,60,0,0.9)' : 'rgba(255,120,0,0.5)'
    ctx.lineWidth = 10
    ctx.stroke()
  }

  // Center repulsor visual
  if (state.repulsorActive) {
    const pulse = 0.5 + 0.5 * Math.sin(state.roundTick * 0.12)
    ctx.beginPath()
    ctx.arc(CX, CY, 22 + pulse * 8, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(0,200,255,${0.12 + pulse * 0.10})`
    ctx.fill()
    ctx.beginPath()
    ctx.arc(CX, CY, 22 + pulse * 8, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(0,220,255,${0.6 + pulse * 0.3})`
    ctx.lineWidth = 3
    ctx.stroke()
    // Cross geometry
    ctx.strokeStyle = `rgba(0,220,255,${0.5 + pulse * 0.4})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(CX - 14, CY); ctx.lineTo(CX + 14, CY)
    ctx.moveTo(CX, CY - 14); ctx.lineTo(CX, CY + 14)
    ctx.stroke()
  }

  // Subtle inner ring
  ctx.beginPath()
  ctx.arc(CX, CY, br * 0.85, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Circumference tick marks
  const tickColor = isPressure ? 'rgba(255,80,0,0.5)' : 'rgba(255,255,255,0.18)'
  ctx.strokeStyle = tickColor
  for (let i = 0; i < TICK_COUNT; i++) {
    const a = TICK_ANGLES[i]!
    const long = i % 5 === 0
    const inner = br - (long ? 14 : 7)
    const outer = br + (long ? 4 : 2)
    ctx.lineWidth = long ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(CX + Math.cos(a) * inner, CY + Math.sin(a) * inner)
    ctx.lineTo(CX + Math.cos(a) * outer, CY + Math.sin(a) * outer)
    ctx.stroke()
  }

  // Main boundary ring
  const ringColor = phase === 'FINAL'
    ? '#ff3300'
    : phase === 'ESCALATION'
    ? '#ff6600'
    : '#3a4a5a'
  ctx.beginPath()
  ctx.arc(CX, CY, br, 0, Math.PI * 2)
  ctx.strokeStyle = ringColor
  ctx.lineWidth = phase === 'FINAL' ? 5 : phase === 'ESCALATION' ? 4 : 3
  ctx.stroke()

  // Outer glow ring
  if (phase === 'ESCALATION' || phase === 'FINAL') {
    ctx.beginPath()
    ctx.arc(CX, CY, br, 0, Math.PI * 2)
    ctx.strokeStyle = phase === 'FINAL'
      ? 'rgba(255,30,0,0.30)'
      : 'rgba(255,100,0,0.20)'
    ctx.lineWidth = 20
    ctx.stroke()
  }
}

// ─── Pulse rings ──────────────────────────────────────────────────────────────

function drawPulseRings(ctx: CanvasRenderingContext2D, state: SimState): void {
  for (let i = 0; i < state.pulseRings.length; i++) {
    const p = state.pulseRings[i]
    if (!p.active) continue
    const t = p.age / p.maxAge
    const r = t * FULL_BOUNDARY * 0.9
    const alpha = (1 - t) * 0.7
    ctx.beginPath()
    ctx.arc(CX + p.x, CY + p.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = p.color.replace(')', `,${alpha.toFixed(2)})`).replace('rgb(', 'rgba(')
      .replace('#00ddff', `rgba(0,221,255,${alpha.toFixed(2)})`)
    ctx.strokeStyle = `rgba(0,221,255,${alpha.toFixed(2)})`
    ctx.lineWidth = 3 * (1 - t * 0.5)
    ctx.stroke()
  }
}

// ─── Contestants ─────────────────────────────────────────────────────────────

function drawContestants(ctx: CanvasRenderingContext2D, state: SimState): void {
  // Draw trails first (behind bodies)
  for (let i = 0; i < state.contestants.length; i++) {
    const c = state.contestants[i]
    if (!c.alive || c.trailLen < 2) continue
    drawTrail(ctx, c, TEAM_COLORS[c.team])
  }

  // Draw bodies
  for (let i = 0; i < state.contestants.length; i++) {
    const c = state.contestants[i]
    if (!c.alive) continue
    drawContestantBody(ctx, c, TEAM_COLORS[c.team])
  }
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  c: { trail: Array<{ x: number; y: number }>; trailHead: number; trailLen: number },
  color: string
): void {
  const len = c.trailLen
  if (len < 2) return

  ctx.lineWidth = 2
  ctx.lineCap = 'round'

  for (let k = 0; k < len - 1; k++) {
    const idx0 = (c.trailHead - len + k + TRAIL_MAX * 100) % TRAIL_MAX
    const idx1 = (idx0 + 1) % TRAIL_MAX
    const pt0 = c.trail[idx0]
    const pt1 = c.trail[idx1]
    if (!pt0 || !pt1) continue
    const alpha = ((k / len) * 0.35).toFixed(2)
    ctx.beginPath()
    ctx.moveTo(CX + pt0.x, CY + pt0.y)
    ctx.lineTo(CX + pt1.x, CY + pt1.y)
    // Inline color parsing: convert hex to rgba
    ctx.strokeStyle = hexToRgba(color, parseFloat(alpha))
    ctx.stroke()
  }
}

function drawContestantBody(
  ctx: CanvasRenderingContext2D,
  c: { x: number; y: number; radius: number },
  color: string
): void {
  const r = c.radius
  const cx = CX + c.x
  const cy = CY + c.y

  // Outer crisp outline
  ctx.beginPath()
  ctx.arc(cx, cy, r + 2, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fill()

  // Team-color body
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()

  // Crisp white outline
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Inner highlight (top-left arc)
  ctx.beginPath()
  ctx.arc(cx - r * 0.22, cy - r * 0.22, r * 0.38, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fill()
}

// ─── Elimination effects ──────────────────────────────────────────────────────

function drawEliminationEffects(ctx: CanvasRenderingContext2D, state: SimState): void {
  for (let i = 0; i < state.eliminationEffects.length; i++) {
    const e = state.eliminationEffects[i]
    if (!e.active) continue

    const t  = e.age / e.maxAge         // 0→1
    const r  = 8 + t * 32               // expanding ring
    const color = TEAM_COLORS[e.team]

    // Expanding ring
    ctx.beginPath()
    ctx.arc(CX + e.x, CY + e.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = hexToRgba(color, 1 - t)
    ctx.lineWidth = 3 * (1 - t * 0.5)
    ctx.stroke()

    // Short outward streaks
    const streakCount = 5
    for (let k = 0; k < streakCount; k++) {
      const a  = (k / streakCount) * Math.PI * 2 + t * 0.8
      const r1 = r * 0.4
      const r2 = r * 0.9 + t * 12
      ctx.beginPath()
      ctx.moveTo(CX + e.x + Math.cos(a) * r1, CY + e.y + Math.sin(a) * r1)
      ctx.lineTo(CX + e.x + Math.cos(a) * r2, CY + e.y + Math.sin(a) * r2)
      ctx.strokeStyle = hexToRgba(color, (1 - t) * 0.8)
      ctx.lineWidth = 2
      ctx.stroke()
    }

  }
}

// ─── HUD ─────────────────────────────────────────────────────────────────────

function drawHUD(ctx: CanvasRenderingContext2D, state: SimState): void {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  // Title
  ctx.font = 'bold 28px monospace'
  ctx.fillStyle = '#aabbcc'
  ctx.fillText('ELITE LIVE BATTLE', 28, 22)

  // Round info
  ctx.font = '20px monospace'
  ctx.fillStyle = '#778899'
  ctx.fillText(`ROUND ${state.round}`, 28, 58)
  ctx.fillText('CIRCLE SURVIVAL', 28, 82)

  // Timer
  const sec = Math.floor(state.roundTick / 60)
  const min = Math.floor(sec / 60)
  const ss  = sec % 60
  const timeStr = `${min}:${ss.toString().padStart(2, '0')}`
  ctx.font = 'bold 22px monospace'
  ctx.fillStyle = '#ccddee'
  ctx.fillText(timeStr, 28, 112)

  // Phase indicator — top right
  ctx.textAlign = 'right'
  ctx.font = '18px monospace'
  const phaseColor = phaseHudColor(state.phase)
  ctx.fillStyle = phaseColor
  ctx.fillText(state.phase, W - 28, 22)

  // Active event label
  if (state.activeEvent !== 'NONE') {
    ctx.font = 'bold 16px monospace'
    ctx.fillStyle = eventHudColor(state.activeEvent)
    ctx.fillText(eventLabel(state.activeEvent), W - 28, 46)
  }
}

function phaseHudColor(phase: string): string {
  switch (phase) {
    case 'PREPARE':    return '#556677'
    case 'OPENING':    return '#4499cc'
    case 'DANGER':     return '#ffaa00'
    case 'ESCALATION': return '#ff6600'
    case 'FINAL':      return '#ff2200'
    case 'WINNER':     return '#ffdd00'
    default:           return '#445566'
  }
}

function eventHudColor(event: string): string {
  switch (event) {
    case 'DANGER_ARC':      return '#ff4400'
    case 'CENTER_REPULSOR': return '#00ccff'
    case 'PULSE':           return '#00ffaa'
    default:                return '#aaaaaa'
  }
}

function eventLabel(event: string): string {
  switch (event) {
    case 'DANGER_ARC':      return 'DANGER ARC'
    case 'CENTER_REPULSOR': return 'REPULSOR ACTIVE'
    case 'PULSE':           return 'PULSE'
    default:                return ''
  }
}

// ─── Scoreboard ──────────────────────────────────────────────────────────────

const SCOREBOARD_X = W - 220
const SCOREBOARD_Y = 90
const ROW_H = 38

function drawScoreboard(ctx: CanvasRenderingContext2D, state: SimState): void {
  // Count alive per team
  const counts: Partial<Record<TeamId, number>> = {}
  for (const t of TEAMS_ORDER) counts[t] = 0
  for (let i = 0; i < state.contestants.length; i++) {
    const c = state.contestants[i]
    if (c.alive) counts[c.team] = (counts[c.team] ?? 0) + 1
  }

  // Background panel
  const panelH = TEAMS_ORDER.length * ROW_H + 12
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  roundRect(ctx, SCOREBOARD_X - 12, SCOREBOARD_Y - 6, 200, panelH, 6)
  ctx.fill()

  ctx.textBaseline = 'middle'
  for (let i = 0; i < TEAMS_ORDER.length; i++) {
    const team  = TEAMS_ORDER[i]!
    const count = counts[team] ?? 0
    const y     = SCOREBOARD_Y + i * ROW_H + ROW_H / 2

    // Color swatch
    ctx.fillStyle = count > 0 ? TEAM_COLORS[team] : 'rgba(80,80,80,0.4)'
    ctx.fillRect(SCOREBOARD_X - 8, y - 10, 6, 20)

    // Team label
    ctx.textAlign = 'left'
    ctx.font = 'bold 16px monospace'
    ctx.fillStyle = count > 0 ? '#dddddd' : '#444444'
    ctx.fillText(TEAM_LABEL[team], SCOREBOARD_X + 6, y)

    // Count — right aligned
    ctx.textAlign = 'right'
    ctx.font = 'bold 20px monospace'
    ctx.fillStyle = count > 0 ? TEAM_COLORS[team] : '#333333'
    ctx.fillText(count.toString(), SCOREBOARD_X + 184, y)

    // Mini pips
    for (let p = 0; p < CONTESTANTS_PER_TEAM; p++) {
      const px = SCOREBOARD_X + 60 + p * 18
      const alive = p < count
      ctx.beginPath()
      ctx.arc(px, y, 5, 0, Math.PI * 2)
      ctx.fillStyle = alive ? TEAM_COLORS[team] : 'rgba(80,80,80,0.3)'
      ctx.fill()
    }
  }
}

// ─── Event indicator ─────────────────────────────────────────────────────────

function drawEventIndicator(ctx: CanvasRenderingContext2D, state: SimState): void {
  if (state.activeEvent !== 'NONE') {
    // Show remaining ticks for current event
    if (state.eventTicksRemaining > 0 && state.activeEvent !== 'PULSE') {
      const sec = Math.ceil(state.eventTicksRemaining / 60)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.font = '15px monospace'
      ctx.fillStyle = 'rgba(200,200,200,0.5)'
      ctx.fillText(`ends in ${sec}s`, 28, 142)
    }
    return
  }

  if (state.nextEventLabel && state.nextEventTicksRemaining > 0) {
    const sec = Math.ceil(state.nextEventTicksRemaining / 60)
    if (sec <= 15) {
      // Show countdown when close
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      const alpha = sec <= 5 ? 0.9 : 0.55
      ctx.font = sec <= 5 ? 'bold 18px monospace' : '15px monospace'
      const baseLabel = state.nextEventLabel.replace(/ \d+$/, '')
      ctx.fillStyle = `rgba(255,200,80,${alpha})`
      ctx.fillText(`${baseLabel} ${sec}`, 28, 142)
    }
  }

  if (state.phase === 'ESCALATION' || state.phase === 'FINAL') {
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = '14px monospace'
    ctx.fillStyle = state.phase === 'FINAL'
      ? 'rgba(255,50,0,0.8)'
      : 'rgba(255,120,0,0.6)'
    ctx.fillText(
      state.phase === 'FINAL' ? 'PRESSURE CRITICAL' : 'PRESSURE RISING',
      28, 142
    )
  }
}

// ─── Milestone ───────────────────────────────────────────────────────────────

function drawMilestone(ctx: CanvasRenderingContext2D, state: SimState): void {
  if (!state.milestoneLabel || state.milestoneTicksRemaining <= 0) return

  const t = state.milestoneTicksRemaining / MILESTONE_DURATION
  const alpha = Math.min(1, t * 4)   // fade in fast, fade out

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold ${Math.floor(56 + (1 - t) * 8)}px monospace`
  ctx.fillStyle = `rgba(255,220,50,${alpha.toFixed(2)})`
  ctx.fillText(state.milestoneLabel, CX, CY - 200)
}

// ─── Winner presentation ──────────────────────────────────────────────────────

function drawWinnerBanner(ctx: CanvasRenderingContext2D, state: SimState): void {
  if (!state.winnerTeam) return

  const color = TEAM_COLORS[state.winnerTeam]

  // Dark overlay behind banner (not full-screen)
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(CX - 480, CY - 180, 960, 320)

  // Thin colored border lines
  ctx.fillStyle = color
  ctx.fillRect(CX - 480, CY - 184, 960, 4)
  ctx.fillRect(CX - 480, CY + 140, 960, 4)

  // Team color swatch strip
  ctx.fillStyle = hexToRgba(color, 0.15)
  ctx.fillRect(CX - 480, CY - 180, 960, 320)

  // Team name
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 92px monospace'
  ctx.fillStyle = color
  ctx.fillText(`${state.winnerTeam} WINS`, CX, CY - 68)

  // Subtitle
  ctx.font = 'bold 34px monospace'
  ctx.fillStyle = '#ccddee'
  ctx.fillText(`ROUND ${state.round}`, CX, CY - 4)

  // Stats row
  ctx.font = '22px monospace'
  ctx.fillStyle = '#778899'
  const dur = state.roundDurationSec
  const durStr = `${Math.floor(dur / 60)}:${(dur % 60).toString().padStart(2, '0')}`
  ctx.fillText(
    `${durStr}  ·  ${state.survivorCount} survived  ·  ${state.eliminationCount} eliminated`,
    CX, CY + 60
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FULL_BOUNDARY = 460
const MILESTONE_DURATION = 180

// Simple hex → rgba converter (only for our known 7-char hex colors)
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`
}

// Simple rounded rect path helper
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
