import type { SimState, TeamId, GateArm, HexSide, FunnelDeflector } from '../shared/types'
import { drawSphere } from './material'

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

const TEAM_RGBA: Record<TeamId, [number,number,number]> = {
  GOLD:    [255, 215,   0],
  RED:     [255,  34,  51],
  CYAN:    [  0, 255, 238],
  VIOLET:  [204,   0, 255],
  EMERALD: [  0, 255, 136],
  MAGENTA: [255,   0, 170],
}

const TEAM_LABEL: Record<TeamId, string> = {
  GOLD:    'GOLD',
  RED:     'RED',
  CYAN:    'CYAN',
  VIOLET:  'VIOLET',
  EMERALD: 'EMERALD',
  MAGENTA: 'MAGENTA',
}

const TEAMS_ORDER: TeamId[] = ['GOLD', 'RED', 'CYAN', 'VIOLET', 'EMERALD', 'MAGENTA']
const CONTESTANTS_PER_TEAM = 6
const TRAIL_MAX = 12

// ─── Circumference tick marks (pre-computed) ──────────────────────────────────
const TICK_COUNT = 60
const TICK_ANGLES: number[] = []
for (let i = 0; i < TICK_COUNT; i++) TICK_ANGLES.push((i / TICK_COUNT) * Math.PI * 2)

// ─── Arena ring cache ─────────────────────────────────────────────────────────

interface ArenaRingCache {
  canvas: HTMLCanvasElement
  radius: number
}

let _arenaRingCache: ArenaRingCache | null = null

const RING_OUTER_PAD  = 18
const RING_BAND_W     = 16

function getArenaRingCanvas(br: number): HTMLCanvasElement {
  const brQ = Math.round(br / 2) * 2
  if (_arenaRingCache && _arenaRingCache.radius === brQ) {
    return _arenaRingCache.canvas
  }
  const size = (brQ + RING_OUTER_PAD + 8) * 2
  const oc = document.createElement('canvas')
  oc.width  = size
  oc.height = size
  const octx = oc.getContext('2d')!
  const ocx = size / 2
  const ocy = size / 2
  bakeArenaRing(octx, ocx, ocy, brQ)
  _arenaRingCache = { canvas: oc, radius: brQ }
  return oc
}

function bakeArenaRing(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  br: number
): void {
  const shadowGrad = ctx.createRadialGradient(cx, cy, br + 2, cx, cy, br + RING_OUTER_PAD + 4)
  shadowGrad.addColorStop(0.0, 'rgba(0,0,0,0.0)')
  shadowGrad.addColorStop(0.4, 'rgba(0,10,30,0.25)')
  shadowGrad.addColorStop(1.0, 'rgba(0,0,0,0.0)')
  ctx.beginPath()
  ctx.arc(cx, cy, br + RING_OUTER_PAD + 4, 0, Math.PI * 2)
  ctx.fillStyle = shadowGrad
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx, cy, br + 10, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(15,20,35,0.90)'
  ctx.lineWidth = 14
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, br + 12, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(60,80,110,0.70)'
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, br + 8, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(90,120,160,0.55)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, br + RING_OUTER_PAD, 0, Math.PI * 2)
  ctx.clip()
  const bandGrad = ctx.createRadialGradient(cx, cy, br - RING_BAND_W, cx, cy, br + RING_OUTER_PAD)
  bandGrad.addColorStop(0.00, 'rgba(8,12,22,0.0)')
  bandGrad.addColorStop(0.30, 'rgba(8,14,28,0.55)')
  bandGrad.addColorStop(0.60, 'rgba(12,18,35,0.75)')
  bandGrad.addColorStop(0.80, 'rgba(16,22,42,0.85)')
  bandGrad.addColorStop(1.00, 'rgba(20,28,50,0.90)')
  ctx.beginPath()
  ctx.arc(cx, cy, br + RING_OUTER_PAD, 0, Math.PI * 2)
  ctx.fillStyle = bandGrad
  ctx.fill()
  ctx.restore()

  ctx.beginPath()
  ctx.arc(cx, cy, br - 2, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(100,140,200,0.35)'
  ctx.lineWidth = 2.5
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, br - 5, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(60,90,140,0.20)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, br + 16, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(80,110,155,0.45)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  const hlStart = (-Math.PI * 0.75)
  const hlEnd   = (-Math.PI * 0.05)
  ctx.beginPath()
  ctx.arc(cx, cy, br + 8, hlStart, hlEnd)
  ctx.strokeStyle = 'rgba(160,200,255,0.28)'
  ctx.lineWidth = 6
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, br + 10, hlStart + 0.1, hlEnd - 0.1)
  ctx.strokeStyle = 'rgba(200,230,255,0.18)'
  ctx.lineWidth = 2
  ctx.stroke()

  const shStart = (Math.PI * 0.10)
  const shEnd   = (Math.PI * 0.90)
  ctx.beginPath()
  ctx.arc(cx, cy, br + 8, shStart, shEnd)
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 7
  ctx.stroke()

  const tickInnerBase = br - 12
  const tickOuterBase = br + 14

  for (let i = 0; i < TICK_COUNT; i++) {
    const a    = TICK_ANGLES[i]!
    const long = i % 5 === 0
    const ca   = Math.cos(a)
    const sa   = Math.sin(a)

    if (long) {
      const inner = tickInnerBase - 4
      const outer = tickOuterBase
      ctx.beginPath()
      ctx.moveTo(cx + ca * inner, cy + sa * inner)
      ctx.lineTo(cx + ca * outer, cy + sa * outer)
      ctx.strokeStyle = 'rgba(140,180,230,0.30)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(cx + ca * (outer + 2), cy + sa * (outer + 2), 2.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(120,170,240,0.40)'
      ctx.fill()
    } else {
      const inner = tickInnerBase + 2
      const outer = br + 2
      ctx.beginPath()
      ctx.moveTo(cx + ca * inner, cy + sa * inner)
      ctx.lineTo(cx + ca * outer, cy + sa * outer)
      ctx.strokeStyle = 'rgba(100,140,200,0.18)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  ctx.beginPath()
  ctx.arc(cx, cy, tickInnerBase - 6, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(60,90,140,0.20)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, tickInnerBase - 8, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(80,120,180,0.12)'
  ctx.lineWidth = 1
  ctx.stroke()
}

// ─── Main render ─────────────────────────────────────────────────────────────

export function render(ctx: CanvasRenderingContext2D, state: SimState): void {
  ctx.fillStyle = '#06060a'
  ctx.fillRect(0, 0, W, H)

  // During INTRO phase: show intro screen, don't draw arena/contestants
  if (state.phase === 'INTRO') {
    drawRoundIntro(ctx, state)
    return
  }

  // During LEADERBOARD phase: show leaderboard, no arena
  if (state.phase === 'LEADERBOARD') {
    drawLeaderboardScreen(ctx, state)
    return
  }

  drawArena(ctx, state)
  drawPulseRings(ctx, state)
  drawTrails(ctx, state)
  drawCollisionEffects(ctx, state)
  drawContestantSpheres(ctx, state)
  drawEliminationEffects(ctx, state)
  drawHUD(ctx, state)
  drawScoreboard(ctx, state)
  drawEventIndicator(ctx, state)
  drawMilestone(ctx, state)
  drawTeamEliminatedAnnouncement(ctx, state)

  if (state.phase === 'WINNER') drawWinnerBanner(ctx, state)
}

// ─── Round intro screen ───────────────────────────────────────────────────────

function drawRoundIntro(ctx: CanvasRenderingContext2D, state: SimState): void {
  const intro = state.roundIntro
  const maxT = intro.maxTicks
  const rem  = intro.ticksRemaining
  const t    = maxT > 0 ? 1 - rem / maxT : 0
  // Fade in quick, hold, fade out near end
  const fadeIn  = Math.min(1, t * 8)
  const fadeOut = rem > 20 ? 1.0 : rem / 20
  const alpha   = Math.min(fadeIn, fadeOut)

  // Dark background
  ctx.fillStyle = `rgba(4,6,12,${alpha.toFixed(2)})`
  ctx.fillRect(0, 0, W, H)

  if (alpha < 0.05) return

  // Championship: extra banner
  if (intro.isChampionship) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 42px monospace'
    ctx.fillStyle = `rgba(255,215,0,${alpha.toFixed(2)})`
    ctx.fillText('CHAMPIONSHIP ROUND', CX, CY - 240)
  } else {
    // Qualifier info
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '26px monospace'
    ctx.fillStyle = `rgba(100,130,160,${(alpha * 0.75).toFixed(2)})`
    ctx.fillText(
      `QUALIFIER ${intro.qualifier}  ·  MATCH ${intro.positionInQualifier}`,
      CX, CY - 220
    )
  }

  // ROUND N
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold 36px monospace`
  ctx.fillStyle = `rgba(100,140,180,${alpha.toFixed(2)})`
  ctx.fillText(`ROUND ${intro.roundNumber}`, CX, CY - 160)

  // Arena family name — prominent, shown above challenge
  const arenaColor = getArenaColor(intro.arenaFamilyName, alpha)
  ctx.font = `bold 52px monospace`
  ctx.fillStyle = arenaColor
  ctx.fillText(intro.arenaFamilyName, CX, CY - 90)

  // Challenge name — medium below arena name
  ctx.font = `bold ${intro.isChampionship ? 80 : 60}px monospace`
  const nameColor = intro.isChampionship ? `rgba(255,215,0,${alpha.toFixed(2)})`
                  : `rgba(180,210,255,${alpha.toFixed(2)})`
  ctx.fillStyle = nameColor
  ctx.fillText(intro.recipeName, CX, CY + 14)

  // Teams participating
  const teams = TEAMS_ORDER
  const teamLine = teams.map(t => TEAM_LABEL[t]).join('  ·  ')
  ctx.font = '22px monospace'
  ctx.fillStyle = `rgba(140,160,180,${(alpha * 0.8).toFixed(2)})`
  ctx.fillText(teamLine, CX, CY + 100)

  // Thin separator line
  ctx.strokeStyle = `rgba(80,100,140,${(alpha * 0.5).toFixed(2)})`
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(CX - 400, CY + 130)
  ctx.lineTo(CX + 400, CY + 130)
  ctx.stroke()

  // Session phase hint
  ctx.font = '18px monospace'
  ctx.fillStyle = `rgba(80,110,140,${(alpha * 0.6).toFixed(2)})`
  const phaseLabel = state.sessionPhase === 'LATE' ? 'LATE SESSION'
                   : state.sessionPhase === 'MID'  ? 'MID SESSION'
                   :                                 'EARLY SESSION'
  ctx.fillText(phaseLabel, CX, CY + 165)
}

function getArenaColor(arenaName: string, alpha: number): string {
  if (arenaName === 'CIRCLE SURVIVAL')  return `rgba(80,160,255,${alpha.toFixed(2)})`
  if (arenaName === 'ROTATING GATES')   return `rgba(255,160,40,${alpha.toFixed(2)})`
  if (arenaName === 'HEX PRESSURE')     return `rgba(60,255,180,${alpha.toFixed(2)})`
  if (arenaName === 'FUNNEL DROP')      return `rgba(255,80,200,${alpha.toFixed(2)})`
  return `rgba(200,220,255,${alpha.toFixed(2)})`
}

function getArenaHudColor(family: string): string {
  switch (family) {
    case 'CIRCLE_SURVIVAL': return 'rgba(80,160,255,0.65)'
    case 'ROTATING_GATES':  return 'rgba(255,160,40,0.65)'
    case 'HEX_PRESSURE':    return 'rgba(60,255,180,0.65)'
    case 'FUNNEL_DROP':     return 'rgba(255,80,200,0.65)'
    default:                return 'rgba(140,160,180,0.50)'
  }
}

// ─── Leaderboard screen ───────────────────────────────────────────────────────

function drawLeaderboardScreen(ctx: CanvasRenderingContext2D, state: SimState): void {
  const lb = state.leaderboard
  const rem = lb.ticksRemaining
  const maxT = lb.maxTicks
  const t = maxT > 0 ? 1 - rem / maxT : 0
  const fadeIn = Math.min(1, t * 6)
  const fadeOut = rem > 30 ? 1.0 : rem / 30
  const alpha = Math.min(fadeIn, fadeOut)

  ctx.fillStyle = `rgba(4,6,12,${alpha.toFixed(2)})`
  ctx.fillRect(0, 0, W, H)

  if (alpha < 0.05) return

  // Title
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 48px monospace'
  ctx.fillStyle = `rgba(200,220,255,${alpha.toFixed(2)})`
  ctx.fillText('SESSION STANDINGS', CX, CY - 220)

  // Separator
  ctx.strokeStyle = `rgba(80,100,140,${(alpha * 0.5).toFixed(2)})`
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(CX - 450, CY - 185)
  ctx.lineTo(CX + 450, CY - 185)
  ctx.stroke()

  // Rows — sorted by session points
  const rows = [...lb.rows].sort((a, b) => b.sessionPoints - a.sessionPoints)
  const rowH = 68
  const startY = CY - 150
  const colX = CX - 300

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const y = startY + i * rowH
    const color = TEAM_COLORS[row.team]

    // Position number
    ctx.textAlign = 'right'
    ctx.font = `bold 32px monospace`
    ctx.fillStyle = `rgba(100,130,160,${alpha.toFixed(2)})`
    ctx.fillText(`${i + 1}`, colX - 20, y + rowH / 2)

    // Color swatch
    ctx.fillStyle = hexToRgba(color, alpha * 0.9)
    ctx.fillRect(colX, y + 12, 8, rowH - 24)

    // Team name
    ctx.textAlign = 'left'
    ctx.font = `bold 34px monospace`
    ctx.fillStyle = hexToRgba(color, alpha)
    ctx.fillText(TEAM_LABEL[row.team], colX + 20, y + rowH / 2)

    // Points
    ctx.textAlign = 'right'
    ctx.font = `bold 44px monospace`
    ctx.fillStyle = `rgba(220,240,255,${alpha.toFixed(2)})`
    ctx.fillText(`${row.sessionPoints}`, colX + 560, y + rowH / 2)

    // Wins label
    if (row.roundWins > 0) {
      ctx.font = `16px monospace`
      ctx.fillStyle = `rgba(150,170,190,${(alpha * 0.7).toFixed(2)})`
      ctx.fillText(`${row.roundWins}W`, colX + 590, y + rowH / 2)
    }
  }
}

// ─── Arena ────────────────────────────────────────────────────────────────────

function drawArena(ctx: CanvasRenderingContext2D, state: SimState): void {
  const family = state.arenaFamily ?? 'CIRCLE_SURVIVAL'

  switch (family) {
    case 'CIRCLE_SURVIVAL':
      drawCircleArena(ctx, state)
      break
    case 'ROTATING_GATES':
      drawRotatingGatesArena(ctx, state)
      break
    case 'HEX_PRESSURE':
      drawHexPressureArena(ctx, state)
      break
    case 'FUNNEL_DROP':
      drawFunnelDropArena(ctx, state)
      break
  }
}

// ─── Circle Survival (existing arena) ────────────────────────────────────────

function drawCircleArena(ctx: CanvasRenderingContext2D, state: SimState): void {
  const br    = state.boundaryRadius
  const phase = state.phase
  const isPressure = state.pressureActive

  const bgGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, br)
  bgGrad.addColorStop(0.00, 'rgba(8,12,24,0.80)')
  bgGrad.addColorStop(0.55, 'rgba(4,8,18,0.65)')
  bgGrad.addColorStop(0.82, 'rgba(2,4,12,0.80)')
  bgGrad.addColorStop(1.00, 'rgba(0,2,8,0.90)')
  ctx.beginPath()
  ctx.arc(CX, CY, br, 0, Math.PI * 2)
  ctx.fillStyle = bgGrad
  ctx.fill()

  drawArenaInteriorDetail(ctx, br)

  if (state.safeSectorsActive && state.safeSectors.length > 0) {
    for (const [start, end] of state.safeSectors) {
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.arc(CX, CY, br, start, end)
      ctx.closePath()
      ctx.fillStyle = 'rgba(0,255,136,0.05)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(CX, CY, br + 3, start, end)
      ctx.strokeStyle = 'rgba(0,220,100,0.35)'
      ctx.lineWidth = 4
      ctx.stroke()
    }
  }

  if (state.activeEvent === 'DANGER_ARC') {
    drawDangerArc(ctx, state, br)
  }

  if (state.repulsorActive) {
    drawRepulsorDevice(ctx, state)
  }

  // Gravity core indicator
  if (state.currentRecipeId === 'GRAVITY_CORE' && state.gravityCoreMode !== 'NEUTRAL') {
    drawGravityCoreIndicator(ctx, state)
  }

  const ringImg = getArenaRingCanvas(br)
  const half = ringImg.width / 2
  ctx.drawImage(ringImg, CX - half, CY - half)

  drawPhaseRingOverlay(ctx, br, phase, isPressure)
}

// ─── Rotating Gates Arena ─────────────────────────────────────────────────────

function drawRotatingGatesArena(ctx: CanvasRenderingContext2D, state: SimState): void {
  const br = state.boundaryRadius
  const phase = state.phase

  // Background — same as circle but with mechanical tint
  const bgGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, br)
  bgGrad.addColorStop(0.00, 'rgba(10,8,20,0.85)')
  bgGrad.addColorStop(0.50, 'rgba(6,8,22,0.70)')
  bgGrad.addColorStop(0.85, 'rgba(2,4,14,0.82)')
  bgGrad.addColorStop(1.00, 'rgba(0,2,10,0.92)')
  ctx.beginPath()
  ctx.arc(CX, CY, br, 0, Math.PI * 2)
  ctx.fillStyle = bgGrad
  ctx.fill()

  drawArenaInteriorDetail(ctx, br)

  // Draw gate arms
  const armCount = state.gateArmCount
  for (let i = 0; i < armCount; i++) {
    const arm = state.gateArms[i]
    if (!arm || arm.length === 0) continue
    drawGateArm(ctx, arm, br, state)
  }

  // Danger arc / repulsor events still apply in ROTATING_GATES
  if (state.activeEvent === 'DANGER_ARC') drawDangerArc(ctx, state, br)
  if (state.repulsorActive) drawRepulsorDevice(ctx, state)

  // Ring
  const ringImg = getArenaRingCanvas(br)
  const half = ringImg.width / 2
  ctx.drawImage(ringImg, CX - half, CY - half)
  drawPhaseRingOverlay(ctx, br, phase, state.pressureActive)
}

function drawGateArm(
  ctx: CanvasRenderingContext2D,
  arm: GateArm,
  br: number,
  state: SimState
): void {
  const armLen = arm.length * br
  const ca = Math.cos(arm.angle)
  const sa = Math.sin(arm.angle)

  const phase = state.phase
  const isHot = phase === 'ESCALATION' || phase === 'FINAL'

  // Arm color — mechanical steel with phase tint
  const baseAlpha = isHot ? 0.92 : 0.78
  const armColor = isHot
    ? `rgba(255,80,30,${baseAlpha})`
    : 'rgba(140,160,200,0.75)'
  const edgeColor = isHot
    ? 'rgba(255,150,60,0.60)'
    : 'rgba(200,220,255,0.35)'
  const w = arm.width

  if (arm.hasGap) {
    const gapFrac = arm.gapCenter
    const halfGap = arm.gapSize / 2 / armLen
    const seg1End   = Math.max(0.0, gapFrac - halfGap) * armLen
    const seg2Start = Math.min(1.0, gapFrac + halfGap) * armLen

    // Segment 1: center to gap
    if (seg1End > 6) {
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.lineTo(CX + ca * seg1End, CY + sa * seg1End)
      ctx.strokeStyle = armColor
      ctx.lineWidth = w
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.lineTo(CX + ca * seg1End, CY + sa * seg1End)
      ctx.strokeStyle = edgeColor
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    // Segment 2: gap to arm tip
    if (seg2Start < armLen - 6) {
      ctx.beginPath()
      ctx.moveTo(CX + ca * seg2Start, CY + sa * seg2Start)
      ctx.lineTo(CX + ca * armLen,    CY + sa * armLen)
      ctx.strokeStyle = armColor
      ctx.lineWidth = w
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(CX + ca * seg2Start, CY + sa * seg2Start)
      ctx.lineTo(CX + ca * armLen,    CY + sa * armLen)
      ctx.strokeStyle = edgeColor
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    // Gap indicator — bright dot in gap center
    const gapX = CX + ca * (gapFrac * armLen)
    const gapY = CY + sa * (gapFrac * armLen)
    ctx.beginPath()
    ctx.arc(gapX, gapY, 5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,255,180,0.55)'
    ctx.fill()
  } else {
    // Full solid arm
    ctx.beginPath()
    ctx.moveTo(CX, CY)
    ctx.lineTo(CX + ca * armLen, CY + sa * armLen)
    ctx.strokeStyle = isHot ? 'rgba(255,60,20,0.90)' : 'rgba(160,180,220,0.80)'
    ctx.lineWidth = w
    ctx.stroke()
    // Edge highlight
    ctx.beginPath()
    ctx.moveTo(CX, CY)
    ctx.lineTo(CX + ca * armLen, CY + sa * armLen)
    ctx.strokeStyle = edgeColor
    ctx.lineWidth = 1.5
    ctx.stroke()
    // Tip indicator
    ctx.beginPath()
    ctx.arc(CX + ca * armLen, CY + sa * armLen, 5, 0, Math.PI * 2)
    ctx.fillStyle = isHot ? 'rgba(255,100,0,0.80)' : 'rgba(140,180,240,0.60)'
    ctx.fill()
  }

  // Central hub
  ctx.beginPath()
  ctx.arc(CX, CY, 10, 0, Math.PI * 2)
  ctx.fillStyle = isHot ? 'rgba(255,80,0,0.50)' : 'rgba(60,90,160,0.40)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(CX, CY, 10, 0, Math.PI * 2)
  ctx.strokeStyle = isHot ? 'rgba(255,140,60,0.70)' : 'rgba(100,140,220,0.55)'
  ctx.lineWidth = 2
  ctx.stroke()
}

// ─── Hex Pressure Arena ───────────────────────────────────────────────────────

function drawHexPressureArena(ctx: CanvasRenderingContext2D, state: SimState): void {
  const hexR = state.hexBaseRadius   // inscribed radius (mid-side)
  const vertR = hexR / Math.cos(Math.PI / 6)  // vertex-to-center
  const rot = state.hexRotation

  // Compute current inset vertices
  const hexVerts = computeInsetHexVerts(vertR, rot, state.hexSides)

  // Dark background fill (hexagonal clip)
  ctx.save()
  ctx.beginPath()
  hexPath(ctx, hexVerts)
  const bgGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, vertR)
  bgGrad.addColorStop(0.00, 'rgba(6,12,20,0.82)')
  bgGrad.addColorStop(0.55, 'rgba(4,8,18,0.68)')
  bgGrad.addColorStop(0.85, 'rgba(2,4,14,0.82)')
  bgGrad.addColorStop(1.00, 'rgba(0,2,10,0.92)')
  ctx.fillStyle = bgGrad
  ctx.fill()
  ctx.restore()

  // Interior detail — hex-aligned guide rings
  ctx.save()
  ctx.beginPath()
  hexPath(ctx, hexVerts)
  ctx.clip()
  drawHexInteriorDetail(ctx, hexVerts, state)
  ctx.restore()

  // Draw each side with bevel
  for (let i = 0; i < 6; i++) {
    drawHexSide(ctx, hexVerts, state.hexSides, i, state)
  }

  // Premium hex frame — multi-layer bevel
  drawHexFrame(ctx, hexVerts, state)
}

function computeInsetHexVerts(
  vertR: number,
  rot: number,
  sides: HexSide[]
): Array<{x:number;y:number}> {
  const outer: Array<{x:number;y:number}> = []
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * Math.PI * 2
    outer.push({ x: CX + Math.cos(a) * vertR, y: CY + Math.sin(a) * vertR })
  }

  // Apply per-vertex inset (average of adjacent sides)
  const result: Array<{x:number;y:number}> = []
  for (let i = 0; i < 6; i++) {
    const insetA = sides[(i + 5) % 6]!.inset
    const insetB = sides[i]!.inset
    const avgInset = (insetA + insetB) * 0.5

    const vx = outer[i]!.x - CX
    const vy = outer[i]!.y - CY
    const vLen = Math.sqrt(vx * vx + vy * vy)
    const nx = vLen > 0 ? -vx / vLen : 0
    const ny = vLen > 0 ? -vy / vLen : 0

    result.push({
      x: outer[i]!.x + nx * avgInset,
      y: outer[i]!.y + ny * avgInset,
    })
  }
  return result
}

function hexPath(ctx: CanvasRenderingContext2D, verts: Array<{x:number;y:number}>): void {
  ctx.moveTo(verts[0]!.x, verts[0]!.y)
  for (let i = 1; i < 6; i++) ctx.lineTo(verts[i]!.x, verts[i]!.y)
  ctx.closePath()
}

function drawHexInteriorDetail(
  ctx: CanvasRenderingContext2D,
  verts: Array<{x:number;y:number}>,
  state: SimState
): void {
  // Two inner guide hexagons at 70% and 40% scale
  for (const scale of [0.70, 0.40]) {
    ctx.beginPath()
    ctx.moveTo(CX + (verts[0]!.x - CX) * scale, CY + (verts[0]!.y - CY) * scale)
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(CX + (verts[i]!.x - CX) * scale, CY + (verts[i]!.y - CY) * scale)
    }
    ctx.closePath()
    ctx.strokeStyle = 'rgba(80,110,170,0.07)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Radial spokes
  for (let i = 0; i < 6; i++) {
    ctx.beginPath()
    const vx = (verts[i]!.x - CX) * 0.15
    const vy = (verts[i]!.y - CY) * 0.15
    ctx.moveTo(CX + vx, CY + vy)
    ctx.lineTo(CX + (verts[i]!.x - CX) * 0.62, CY + (verts[i]!.y - CY) * 0.62)
    ctx.strokeStyle = 'rgba(60,90,150,0.035)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Center pip
  ctx.beginPath()
  ctx.arc(CX, CY, 3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(80,120,200,0.12)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(CX, CY, 1.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(120,170,255,0.20)'
  ctx.fill()

  void state
}

function drawHexSide(
  ctx: CanvasRenderingContext2D,
  verts: Array<{x:number;y:number}>,
  sides: HexSide[],
  i: number,
  state: SimState
): void {
  const a = verts[i]!
  const b = verts[(i + 1) % 6]!
  const side = sides[i]!

  const phase = state.phase
  const isEsc  = phase === 'ESCALATION'
  const isFinal = phase === 'FINAL'
  const hasInset = side.inset > 2

  // Danger side glow
  if (side.isDanger) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = 'rgba(255,20,0,0.55)'
    ctx.lineWidth = 28
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = 'rgba(255,80,0,0.80)'
    ctx.lineWidth = 6
    ctx.stroke()
    ctx.restore()
  }

  // Show inset pressure marker
  if (hasInset && (isEsc || isFinal)) {
    const midX = (a.x + b.x) * 0.5
    const midY = (a.y + b.y) * 0.5
    const inAlpha = Math.min(0.50, side.inset / 200)
    ctx.beginPath()
    ctx.arc(midX, midY, 6, 0, Math.PI * 2)
    ctx.fillStyle = isFinal
      ? `rgba(255,40,0,${inAlpha})`
      : `rgba(255,120,0,${inAlpha * 0.7})`
    ctx.fill()
  }
}

function drawHexFrame(
  ctx: CanvasRenderingContext2D,
  verts: Array<{x:number;y:number}>,
  state: SimState
): void {
  const phase = state.phase
  const isFinal = phase === 'FINAL'
  const isEsc   = phase === 'ESCALATION'

  // Outer shadow halo (a slightly larger hex)
  const scale = 1.055
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const vx = CX + (verts[i]!.x - CX) * scale
    const vy = CY + (verts[i]!.y - CY) * scale
    if (i === 0) ctx.moveTo(vx, vy)
    else ctx.lineTo(vx, vy)
  }
  ctx.closePath()
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 18
  ctx.stroke()

  // Outer metallic frame
  ctx.beginPath()
  hexPath(ctx, verts)
  ctx.strokeStyle = isFinal ? 'rgba(255,40,0,0.85)'
                 : isEsc   ? 'rgba(255,100,0,0.75)'
                 :            'rgba(70,100,155,0.80)'
  ctx.lineWidth = isFinal ? 5 : isEsc ? 4 : 3.5
  ctx.stroke()

  // Inner bevel highlight
  const innerScale = 0.982
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const vx = CX + (verts[i]!.x - CX) * innerScale
    const vy = CY + (verts[i]!.y - CY) * innerScale
    if (i === 0) ctx.moveTo(vx, vy)
    else ctx.lineTo(vx, vy)
  }
  ctx.closePath()
  ctx.strokeStyle = isFinal ? 'rgba(255,120,60,0.55)'
                 : isEsc   ? 'rgba(255,160,60,0.40)'
                 :            'rgba(120,160,230,0.30)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // UL specular arc highlight on one face
  // Choose side 0 (top-right) for specular
  const s0 = verts[0]!
  const s1 = verts[1]!
  ctx.beginPath()
  ctx.moveTo(s0.x, s0.y)
  ctx.lineTo(
    s0.x + (s1.x - s0.x) * 0.45,
    s0.y + (s1.y - s0.y) * 0.45
  )
  ctx.strokeStyle = 'rgba(180,210,255,0.25)'
  ctx.lineWidth = 4
  ctx.stroke()

  // Corner tick marks on each vertex
  for (let i = 0; i < 6; i++) {
    const v = verts[i]!
    const inx = CX + (v.x - CX) * 0.94
    const iny = CY + (v.y - CY) * 0.94
    ctx.beginPath()
    ctx.arc(inx, iny, 3, 0, Math.PI * 2)
    ctx.fillStyle = isFinal ? 'rgba(255,80,0,0.70)' : 'rgba(120,160,220,0.45)'
    ctx.fill()
  }

  // Phase pressure glow outside frame
  if (isFinal || isEsc) {
    ctx.beginPath()
    hexPath(ctx, verts)
    ctx.strokeStyle = isFinal ? 'rgba(255,20,0,0.18)' : 'rgba(255,90,0,0.12)'
    ctx.lineWidth = 24
    ctx.stroke()
  }
}

// ─── Funnel Drop Arena ────────────────────────────────────────────────────────

function drawFunnelDropArena(ctx: CanvasRenderingContext2D, state: SimState): void {
  const topY    = state.funnelTopY
  const bottomY = state.funnelBottomY
  const leftTopX  = state.funnelLeftTopX
  const rightTopX = state.funnelRightTopX
  const neckW   = state.funnelNeckWidth
  const neckY   = state.funnelNeckY
  const slopeY1 = -100

  const phase = state.phase
  const isEsc   = phase === 'ESCALATION'
  const isFinal = phase === 'FINAL'

  // ─── Build funnel path ────────────────────────────────────────────────────
  // The funnel outline in canvas coordinates (add CX/CY offset)
  const path = new Path2D()
  path.moveTo(CX + leftTopX,       CY + topY)       // TL
  path.lineTo(CX + rightTopX,      CY + topY)       // TR
  path.lineTo(CX + rightTopX,      CY + slopeY1)    // upper-right vertical
  path.lineTo(CX + neckW/2,        CY + neckY)      // right slope to neck
  path.lineTo(CX + neckW/2,        CY + bottomY)    // right chute
  path.lineTo(CX - neckW/2,        CY + bottomY)    // bottom
  path.lineTo(CX - neckW/2,        CY + neckY)      // left chute
  path.lineTo(CX + leftTopX + (rightTopX - leftTopX) + (state.funnelLeftSlope * (neckY - slopeY1)),  // left slope
              CY + neckY)   // just use -neckW/2 approximation
  // Rebuild properly
  const path2 = new Path2D()
  const lx1 = CX + leftTopX
  const lx2 = CX + state.funnelLeftSlope * (neckY - slopeY1) + leftTopX
  const rx1 = CX + rightTopX
  const rx2 = CX + state.funnelRightSlope * (neckY - slopeY1) + rightTopX
  path2.moveTo(lx1,         CY + topY)
  path2.lineTo(rx1,         CY + topY)
  path2.lineTo(rx1,         CY + slopeY1)
  path2.lineTo(rx2,         CY + neckY)
  path2.lineTo(CX + neckW/2,  CY + neckY)
  path2.lineTo(CX + neckW/2,  CY + bottomY)
  path2.lineTo(CX - neckW/2,  CY + bottomY)
  path2.lineTo(CX - neckW/2,  CY + neckY)
  path2.lineTo(lx2,         CY + neckY)
  path2.lineTo(lx1,         CY + slopeY1)
  path2.closePath()
  void path

  // Fill interior
  ctx.save()
  ctx.beginPath()
  ctx.rect(CX + leftTopX - 5, CY + topY - 5, rightTopX - leftTopX + 10, bottomY - topY + 10)
  ctx.clip()
  const bgGrad = ctx.createLinearGradient(CX, CY + topY, CX, CY + bottomY)
  bgGrad.addColorStop(0.00, 'rgba(8,10,22,0.88)')
  bgGrad.addColorStop(0.40, 'rgba(5,8,20,0.70)')
  bgGrad.addColorStop(0.70, 'rgba(4,6,18,0.80)')
  bgGrad.addColorStop(1.00, isFinal ? 'rgba(40,4,4,0.90)' : 'rgba(2,4,16,0.92)')
  ctx.fillStyle = bgGrad
  ctx.fill(path2)
  ctx.restore()

  // Interior detail — horizontal guide lines
  drawFunnelInteriorDetail(ctx, state)

  // Draw deflectors
  for (let i = 0; i < state.funnelDeflectors.length; i++) {
    const d = state.funnelDeflectors[i]
    if (!d || !d.active) continue
    drawFunnelDeflector(ctx, d, state)
  }

  // Funnel structural walls
  drawFunnelWalls(ctx, state, lx1, rx1, lx2, rx2, slopeY1, path2)

  // Bottom chute danger flash
  if ((isEsc || isFinal) && state.funnelChuteDanger) {
    const flash = 0.5 + 0.5 * Math.sin(state.roundTick * 0.20)
    ctx.fillStyle = `rgba(255,20,0,${(0.08 + flash * 0.12).toFixed(3)})`
    ctx.fillRect(CX - neckW/2, CY + neckY, neckW, bottomY - neckY)
    ctx.strokeStyle = `rgba(255,40,0,${(0.60 + flash * 0.35).toFixed(3)})`
    ctx.lineWidth = 3
    ctx.strokeRect(CX - neckW/2, CY + neckY, neckW, bottomY - neckY)
  }
}

function drawFunnelInteriorDetail(ctx: CanvasRenderingContext2D, state: SimState): void {
  // Horizontal guide lines in upper chamber
  const topY   = state.funnelTopY
  const slopeY1 = -100
  for (let y = topY + 80; y < slopeY1; y += 80) {
    ctx.beginPath()
    ctx.moveTo(CX + state.funnelLeftTopX + 10, CY + y)
    ctx.lineTo(CX + state.funnelRightTopX - 10, CY + y)
    ctx.strokeStyle = 'rgba(60,90,150,0.06)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  // Center line
  ctx.beginPath()
  ctx.moveTo(CX, CY + state.funnelTopY + 20)
  ctx.lineTo(CX, CY + state.funnelNeckY - 20)
  ctx.strokeStyle = 'rgba(60,90,150,0.04)'
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawFunnelDeflector(
  ctx: CanvasRenderingContext2D,
  d: FunnelDeflector,
  state: SimState
): void {
  const phase = state.phase
  const isHot = phase === 'ESCALATION' || phase === 'FINAL'
  const ca = Math.cos(d.angle)
  const sa = Math.sin(d.angle)
  const ax = CX + d.x - ca * d.length
  const ay = CY + d.y - sa * d.length
  const bx = CX + d.x + ca * d.length
  const by = CY + d.y + sa * d.length

  // Deflector body
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  ctx.strokeStyle = isHot ? 'rgba(255,100,20,0.85)' : 'rgba(80,160,240,0.80)'
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.stroke()

  // Edge highlight
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  ctx.strokeStyle = isHot ? 'rgba(255,180,80,0.45)' : 'rgba(160,210,255,0.35)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.lineCap = 'butt'

  // Center pivot dot
  ctx.beginPath()
  ctx.arc(CX + d.x, CY + d.y, 4, 0, Math.PI * 2)
  ctx.fillStyle = isHot ? 'rgba(255,140,0,0.70)' : 'rgba(100,180,255,0.60)'
  ctx.fill()
}

function drawFunnelWalls(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  lx1: number, rx1: number, lx2: number, rx2: number,
  slopeY1: number,
  path2: Path2D
): void {
  const phase = state.phase
  const isFinal = phase === 'FINAL'
  const isEsc   = phase === 'ESCALATION'

  const baseColor = isFinal ? 'rgba(255,40,0,0.85)'
                 : isEsc   ? 'rgba(255,100,0,0.75)'
                 :            'rgba(80,110,170,0.75)'
  const creaseColor = isFinal ? 'rgba(255,120,60,0.55)'
                   : isEsc   ? 'rgba(255,160,80,0.40)'
                   :            'rgba(130,165,235,0.30)'

  ctx.strokeStyle = baseColor
  ctx.lineWidth = 3.5
  ctx.stroke(path2)

  ctx.strokeStyle = creaseColor
  ctx.lineWidth = 1.5
  ctx.stroke(path2)

  // Outer shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 14

  // Manually stroke outer wall segments for shadow
  const topY    = state.funnelTopY
  const neckY   = state.funnelNeckY
  const bottomY = state.funnelBottomY
  const neckW   = state.funnelNeckWidth

  // Outer shadow only on exterior walls
  ctx.beginPath()
  ctx.moveTo(lx1 - 7, CY + topY)
  ctx.lineTo(lx1 - 7, CY + slopeY1)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(rx1 + 7, CY + topY)
  ctx.lineTo(rx1 + 7, CY + slopeY1)
  ctx.stroke()

  // Phase pressure glow
  if (isFinal || isEsc) {
    ctx.strokeStyle = isFinal ? 'rgba(255,20,0,0.18)' : 'rgba(255,90,0,0.12)'
    ctx.lineWidth = 22
    ctx.stroke(path2)
  }

  // Side tick marks on left and right walls
  const tickColor = 'rgba(100,140,200,0.20)'
  for (let y = topY + 40; y < slopeY1 - 20; y += 40) {
    ctx.beginPath()
    ctx.moveTo(lx1 + 2, CY + y)
    ctx.lineTo(lx1 + 10, CY + y)
    ctx.strokeStyle = tickColor
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(rx1 - 2, CY + y)
    ctx.lineTo(rx1 - 10, CY + y)
    ctx.strokeStyle = tickColor
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Chute tick marks
  for (let y = neckY + 30; y < bottomY - 20; y += 30) {
    ctx.beginPath()
    ctx.moveTo(CX - neckW/2 + 2, CY + y)
    ctx.lineTo(CX - neckW/2 + 8, CY + y)
    ctx.strokeStyle = tickColor
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(CX + neckW/2 - 2, CY + y)
    ctx.lineTo(CX + neckW/2 - 8, CY + y)
    ctx.strokeStyle = tickColor
    ctx.lineWidth = 1
    ctx.stroke()
  }

  void lx2; void rx2
}

function drawArenaInteriorDetail(ctx: CanvasRenderingContext2D, br: number): void {
  ctx.beginPath()
  ctx.arc(CX, CY, br * 0.70, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(80,110,160,0.08)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(CX, CY, br * 0.40, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(70,100,150,0.06)'
  ctx.lineWidth = 1
  ctx.stroke()

  for (let i = 0; i < 12; i++) {
    const a  = (i / 12) * Math.PI * 2
    const r1 = br * 0.15
    const r2 = br * 0.65
    ctx.beginPath()
    ctx.moveTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1)
    ctx.lineTo(CX + Math.cos(a) * r2, CY + Math.sin(a) * r2)
    ctx.strokeStyle = 'rgba(60,90,140,0.035)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.arc(CX, CY, 3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(80,120,200,0.12)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(CX, CY, 1.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(120,170,255,0.20)'
  ctx.fill()
}

function drawDangerArc(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  br: number
): void {
  const arcA    = state.dangerArcAngle
  const half    = state.dangerArcSpan
  const lethal  = state.dangerArcLethal

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(CX, CY)
  ctx.arc(CX, CY, br + RING_OUTER_PAD + 2, arcA - half, arcA + half)
  ctx.closePath()
  const fillGrad = ctx.createRadialGradient(CX, CY, br * 0.3, CX, CY, br + RING_OUTER_PAD + 2)
  if (lethal) {
    fillGrad.addColorStop(0.0, 'rgba(255,30,0,0.00)')
    fillGrad.addColorStop(0.6, 'rgba(255,30,0,0.08)')
    fillGrad.addColorStop(0.9, 'rgba(255,50,0,0.28)')
    fillGrad.addColorStop(1.0, 'rgba(255,80,0,0.40)')
  } else {
    fillGrad.addColorStop(0.0, 'rgba(255,100,0,0.00)')
    fillGrad.addColorStop(0.6, 'rgba(255,100,0,0.04)')
    fillGrad.addColorStop(0.9, 'rgba(255,140,0,0.14)')
    fillGrad.addColorStop(1.0, 'rgba(255,180,0,0.22)')
  }
  ctx.fillStyle = fillGrad
  ctx.fill()
  ctx.restore()

  ctx.beginPath()
  ctx.arc(CX, CY, br + 9, arcA - half, arcA + half)
  ctx.strokeStyle = lethal ? 'rgba(255,40,0,0.65)' : 'rgba(255,130,0,0.40)'
  ctx.lineWidth = lethal ? 14 : 10
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(CX, CY, br + 3, arcA - half, arcA + half)
  ctx.strokeStyle = lethal ? 'rgba(255,70,0,0.90)' : 'rgba(255,160,0,0.60)'
  ctx.lineWidth = lethal ? 3.5 : 2
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(CX, CY, br - 5, arcA - half, arcA + half)
  ctx.strokeStyle = lethal ? 'rgba(255,50,0,0.35)' : 'rgba(255,140,0,0.18)'
  ctx.lineWidth = 2
  ctx.stroke()

  if (lethal) {
    ctx.beginPath()
    ctx.arc(CX, CY, br + 15, arcA - half + 0.02, arcA + half - 0.02)
    ctx.strokeStyle = 'rgba(255,200,150,0.25)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  const tipR = br + 9
  for (const angle of [arcA - half, arcA + half]) {
    ctx.beginPath()
    ctx.arc(
      CX + Math.cos(angle) * tipR,
      CY + Math.sin(angle) * tipR,
      lethal ? 4.5 : 3.5,
      0, Math.PI * 2
    )
    ctx.fillStyle = lethal ? 'rgba(255,80,0,0.90)' : 'rgba(255,160,0,0.70)'
    ctx.fill()
  }

  // Second arc for GAUNTLET (visually shown when odd gauntlet pattern)
  // Note: we can't easily check gauntletPattern here, but we can check recipe
  if (state.currentRecipeId === 'DANGER_ARC_GAUNTLET' && lethal) {
    const arcA2 = arcA + Math.PI
    ctx.beginPath()
    ctx.arc(CX, CY, br + 9, arcA2 - half, arcA2 + half)
    ctx.strokeStyle = 'rgba(255,40,0,0.50)'
    ctx.lineWidth = 10
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(CX, CY, br + 3, arcA2 - half, arcA2 + half)
    ctx.strokeStyle = 'rgba(255,100,0,0.70)'
    ctx.lineWidth = 2.5
    ctx.stroke()
  }
}

function drawPhaseRingOverlay(
  ctx: CanvasRenderingContext2D,
  br: number,
  phase: string,
  isPressure: boolean
): void {
  const isFinal = phase === 'FINAL'
  const isEsc   = phase === 'ESCALATION'
  const isActive = isFinal || isEsc

  const baseColor = isFinal
    ? 'rgba(255,40,0,0.85)'
    : isEsc
    ? 'rgba(255,100,0,0.75)'
    : isPressure
    ? 'rgba(255,80,20,0.60)'
    : 'rgba(70,100,150,0.70)'

  const creaseColor = isFinal
    ? 'rgba(255,120,60,0.70)'
    : isEsc
    ? 'rgba(255,160,60,0.50)'
    : 'rgba(110,150,200,0.45)'

  ctx.beginPath()
  ctx.arc(CX, CY, br, 0, Math.PI * 2)
  ctx.strokeStyle = baseColor
  ctx.lineWidth = isFinal ? 4 : isEsc ? 3 : 2.5
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(CX, CY, br - 1.5, 0, Math.PI * 2)
  ctx.strokeStyle = creaseColor
  ctx.lineWidth = 1
  ctx.stroke()

  if (isActive) {
    ctx.beginPath()
    ctx.arc(CX, CY, br + 5, 0, Math.PI * 2)
    ctx.strokeStyle = isFinal
      ? 'rgba(255,20,0,0.22)'
      : 'rgba(255,90,0,0.15)'
    ctx.lineWidth = 22
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(CX, CY, br - 14, 0, Math.PI * 2)
    ctx.strokeStyle = isFinal
      ? 'rgba(255,30,0,0.12)'
      : 'rgba(255,100,0,0.08)'
    ctx.lineWidth = 20
    ctx.stroke()
  }
}

function drawRepulsorDevice(ctx: CanvasRenderingContext2D, state: SimState): void {
  const pulse = 0.5 + 0.5 * Math.sin(state.roundTick * 0.12)

  const discR = 38 + pulse * 6
  const discGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, discR)
  discGrad.addColorStop(0.0, `rgba(0,180,255,${(0.08 + pulse * 0.07).toFixed(3)})`)
  discGrad.addColorStop(0.5, `rgba(0,150,230,${(0.04 + pulse * 0.04).toFixed(3)})`)
  discGrad.addColorStop(1.0, 'rgba(0,120,200,0.00)')
  ctx.beginPath()
  ctx.arc(CX, CY, discR, 0, Math.PI * 2)
  ctx.fillStyle = discGrad
  ctx.fill()

  ctx.beginPath()
  ctx.arc(CX, CY, 26 + pulse * 5, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(0,210,255,${(0.55 + pulse * 0.30).toFixed(3)})`
  ctx.lineWidth = 2.5
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(CX, CY, 14 + pulse * 2, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(0,230,255,${(0.40 + pulse * 0.25).toFixed(3)})`
  ctx.lineWidth = 1.5
  ctx.stroke()

  const rot = state.roundTick * 0.04
  const armLen = 18 + pulse * 3
  const armW   = 2.0

  ctx.strokeStyle = `rgba(0,220,255,${(0.55 + pulse * 0.35).toFixed(3)})`
  ctx.lineWidth = armW
  ctx.lineCap = 'square'

  for (let k = 0; k < 4; k++) {
    const a = rot + (k / 4) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(CX + Math.cos(a) * 6, CY + Math.sin(a) * 6)
    ctx.lineTo(CX + Math.cos(a) * armLen, CY + Math.sin(a) * armLen)
    ctx.stroke()
  }

  ctx.strokeStyle = `rgba(0,200,255,${(0.30 + pulse * 0.20).toFixed(3)})`
  ctx.lineWidth = 1
  for (let k = 0; k < 4; k++) {
    const a = Math.PI * 0.25 + (k / 4) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(CX + Math.cos(a) * 10, CY + Math.sin(a) * 10)
    ctx.lineTo(CX + Math.cos(a) * 20, CY + Math.sin(a) * 20)
    ctx.stroke()
  }

  ctx.lineCap = 'butt'

  ctx.beginPath()
  ctx.arc(CX, CY, 4.5 + pulse * 1.5, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(180,240,255,${(0.70 + pulse * 0.25).toFixed(3)})`
  ctx.fill()

  ctx.beginPath()
  ctx.arc(CX, CY, 2, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.90)'
  ctx.fill()
}

// ─── Gravity core indicator ───────────────────────────────────────────────────

function drawGravityCoreIndicator(ctx: CanvasRenderingContext2D, state: SimState): void {
  const mode = state.gravityCoreMode
  if (mode === 'NEUTRAL') return

  const pulse = 0.5 + 0.5 * Math.sin(state.roundTick * 0.08)
  const isPull = mode === 'PULL'

  // Core circle
  const coreR = 20 + pulse * 4
  const coreColor = isPull ? `rgba(255,80,200,${(0.15 + pulse * 0.10).toFixed(3)})`
                           : `rgba(80,200,255,${(0.15 + pulse * 0.10).toFixed(3)})`
  ctx.beginPath()
  ctx.arc(CX, CY, coreR, 0, Math.PI * 2)
  ctx.fillStyle = coreColor
  ctx.fill()

  // Ring
  const ringColor = isPull ? `rgba(255,80,200,${(0.60 + pulse * 0.30).toFixed(3)})`
                           : `rgba(80,200,255,${(0.60 + pulse * 0.30).toFixed(3)})`
  ctx.beginPath()
  ctx.arc(CX, CY, 30 + pulse * 6, 0, Math.PI * 2)
  ctx.strokeStyle = ringColor
  ctx.lineWidth = 2
  ctx.stroke()

  // Arrows indicating direction
  const arrowR = 44 + pulse * 4
  const arrowCount = 4
  ctx.strokeStyle = ringColor
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  for (let k = 0; k < arrowCount; k++) {
    const a = (k / arrowCount) * Math.PI * 2 + state.roundTick * 0.03
    const dir = isPull ? -1 : 1
    const r1 = arrowR
    const r2 = arrowR + dir * 12
    ctx.beginPath()
    ctx.moveTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1)
    ctx.lineTo(CX + Math.cos(a) * r2, CY + Math.sin(a) * r2)
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
}

// ─── Pulse rings ──────────────────────────────────────────────────────────────

function drawPulseRings(ctx: CanvasRenderingContext2D, state: SimState): void {
  for (let i = 0; i < state.pulseRings.length; i++) {
    const p = state.pulseRings[i]!
    if (!p.active) continue

    const t     = p.age / p.maxAge
    const r     = t * FULL_BOUNDARY * 0.9
    const alpha = (1 - t) * 0.75

    ctx.beginPath()
    ctx.arc(CX + p.x, CY + p.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(0,221,255,${alpha.toFixed(3)})`
    ctx.lineWidth = 2.5 * (1 - t * 0.6)
    ctx.stroke()

    if (r > 20) {
      const r2 = r * 0.88
      const a2 = (1 - t) * 0.35
      ctx.beginPath()
      ctx.arc(CX + p.x, CY + p.y, r2, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(0,200,255,${a2.toFixed(3)})`
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
}

// ─── Motion trails ────────────────────────────────────────────────────────────

function drawTrails(ctx: CanvasRenderingContext2D, state: SimState): void {
  for (let i = 0; i < state.contestants.length; i++) {
    const c = state.contestants[i]!
    if (!c.alive || c.trailLen < 2) continue
    drawTrail(ctx, c, c.team)
  }
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  c: { trail: Array<{ x: number; y: number }>; trailHead: number; trailLen: number; radius: number },
  team: TeamId
): void {
  const len = c.trailLen
  if (len < 2) return

  const [r, g, b] = TEAM_RGBA[team]!
  ctx.lineCap = 'round'

  for (let k = 0; k < len - 1; k++) {
    const idx0 = (c.trailHead - len + k + TRAIL_MAX * 100) % TRAIL_MAX
    const idx1 = (idx0 + 1) % TRAIL_MAX
    const pt0 = c.trail[idx0]
    const pt1 = c.trail[idx1]
    if (!pt0 || !pt1) continue

    const ageFrac = k / (len - 1)
    const alpha = ageFrac * 0.42
    const width = 1.5 + ageFrac * (c.radius * 0.55)

    ctx.beginPath()
    ctx.moveTo(CX + pt0.x, CY + pt0.y)
    ctx.lineTo(CX + pt1.x, CY + pt1.y)
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`
    ctx.lineWidth = width
    ctx.stroke()
  }
}

// ─── Contestants ──────────────────────────────────────────────────────────────

function drawContestantSpheres(ctx: CanvasRenderingContext2D, state: SimState): void {
  const material = state.roundMaterial
  for (let i = 0; i < state.contestants.length; i++) {
    const c = state.contestants[i]!
    if (!c.alive) continue
    drawSphere(ctx, CX + c.x, CY + c.y, c.radius, material, c.team)
  }
}

// ─── Collision effects ────────────────────────────────────────────────────────

function drawCollisionEffects(ctx: CanvasRenderingContext2D, state: SimState): void {
  for (let i = 0; i < state.collisionEffects.length; i++) {
    const e = state.collisionEffects[i]!
    if (!e.active) continue

    const t = e.age / e.maxAge
    const r = 4 + t * 14
    const alpha = (1 - t) * 0.75

    ctx.beginPath()
    ctx.arc(CX + e.x, CY + e.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(255,240,180,${alpha.toFixed(3)})`
    ctx.lineWidth = 1.5 * (1 - t * 0.5)
    ctx.stroke()

    if (t < 0.25) {
      const innerAlpha = (1 - t / 0.25) * 0.50
      ctx.beginPath()
      ctx.arc(CX + e.x, CY + e.y, r * 0.4, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${innerAlpha.toFixed(3)})`
      ctx.fill()
    }
  }
}

// ─── Elimination effects ──────────────────────────────────────────────────────

function drawEliminationEffects(ctx: CanvasRenderingContext2D, state: SimState): void {
  for (let i = 0; i < state.eliminationEffects.length; i++) {
    const e = state.eliminationEffects[i]!
    if (!e.active) continue

    const t  = e.age / e.maxAge
    const color = TEAM_COLORS[e.team]!
    const [r, g, b] = TEAM_RGBA[e.team]!

    if (t < 0.15) {
      const flashScale = 1 + (t / 0.15) * 0.4
      const flashAlpha = (1 - t / 0.15) * 0.55
      const flashR = 16 * flashScale
      ctx.beginPath()
      ctx.arc(CX + e.x, CY + e.y, flashR, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${r},${g},${b},${flashAlpha.toFixed(3)})`
      ctx.fill()
    }

    const ringR  = 6 + t * 42
    const ringAlpha = (1 - t) * 0.95
    ctx.beginPath()
    ctx.arc(CX + e.x, CY + e.y, ringR, 0, Math.PI * 2)
    ctx.strokeStyle = hexToRgba(color, ringAlpha)
    ctx.lineWidth = 2.5 * (1 - t * 0.6)
    ctx.stroke()

    const ring2R = 4 + t * 28
    const ring2Alpha = Math.max(0, (0.6 - t) * 0.60)
    ctx.beginPath()
    ctx.arc(CX + e.x, CY + e.y, ring2R, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(255,255,255,${ring2Alpha.toFixed(3)})`
    ctx.lineWidth = 1.0
    ctx.stroke()

    const streakCount = 5
    const streakAlpha = (1 - t) * 0.85
    for (let k = 0; k < streakCount; k++) {
      const a   = (k / streakCount) * Math.PI * 2 + t * 1.2
      const r1  = ringR * 0.30
      const r2  = ringR * 0.85 + t * 10
      const sx1 = CX + e.x + Math.cos(a) * r1
      const sy1 = CY + e.y + Math.sin(a) * r1
      const sx2 = CX + e.x + Math.cos(a) * r2
      const sy2 = CY + e.y + Math.sin(a) * r2
      ctx.beginPath()
      ctx.moveTo(sx1, sy1)
      ctx.lineTo(sx2, sy2)
      ctx.strokeStyle = hexToRgba(color, streakAlpha)
      ctx.lineWidth = 1.8 * (1 - t * 0.7)
      ctx.stroke()
    }
  }
}

// ─── HUD ─────────────────────────────────────────────────────────────────────

function drawHUD(ctx: CanvasRenderingContext2D, state: SimState): void {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  ctx.font = 'bold 28px monospace'
  ctx.fillStyle = '#aabbcc'
  ctx.fillText('ELITE LIVE BATTLE', 28, 22)

  ctx.font = '20px monospace'
  ctx.fillStyle = '#778899'
  ctx.fillText(`ROUND ${state.round}`, 28, 58)
  ctx.fillText(state.currentRecipeName, 28, 82)

  // Arena family name in HUD
  ctx.font = '14px monospace'
  ctx.fillStyle = getArenaHudColor(state.arenaFamily ?? 'CIRCLE_SURVIVAL')
  ctx.fillText(state.arenaFamilyName ?? '', 28, 102)

  const sec = Math.floor(state.roundTick / 60)
  const min = Math.floor(sec / 60)
  const ss  = sec % 60
  const timeStr = `${min}:${ss.toString().padStart(2, '0')}`
  ctx.font = 'bold 22px monospace'
  ctx.fillStyle = '#ccddee'
  ctx.fillText(timeStr, 28, 122)

  ctx.font = '13px monospace'
  ctx.fillStyle = 'rgba(140,160,180,0.65)'
  ctx.fillText(`MATERIAL: ${state.roundMaterial}`, 28, 152)

  // Championship badge
  if (state.isChampionshipRound) {
    ctx.font = 'bold 14px monospace'
    ctx.fillStyle = 'rgba(255,215,0,0.80)'
    ctx.fillText('CHAMPIONSHIP', 28, 170)
  }

  // Recipe-specific HUD info
  if (state.currentRecipeId === 'GRAVITY_CORE' && state.gravityCoreMode !== 'NEUTRAL') {
    const modeColor = state.gravityCoreMode === 'PULL' ? '#ff55cc' : '#55ccff'
    ctx.font = 'bold 16px monospace'
    ctx.fillStyle = modeColor
    const changeInSec = Math.ceil(state.gravityCoreNextChangeIn / 60)
    ctx.fillText(`CORE: ${state.gravityCoreMode}  (${changeInSec}s)`, 28, 192)
  }

  ctx.textAlign = 'right'
  ctx.font = '18px monospace'
  const phaseColor = phaseHudColor(state.phase)
  ctx.fillStyle = phaseColor
  ctx.fillText(state.phase, W - 28, 22)

  if (state.activeEvent !== 'NONE') {
    ctx.font = 'bold 16px monospace'
    ctx.fillStyle = eventHudColor(state.activeEvent)
    ctx.fillText(eventLabel(state.activeEvent), W - 28, 46)
  }

  // LAST_COLOR_STANDING: show teams remaining count
  if (state.currentRecipeId === 'LAST_COLOR_STANDING') {
    const teamsAlive = state.scoreboardRows.filter(r => !r.isEliminated).length
    ctx.textAlign = 'right'
    ctx.font = 'bold 20px monospace'
    ctx.fillStyle = '#ffdd44'
    ctx.fillText(`TEAMS REMAINING: ${teamsAlive}`, W - 28, 70)
  }

  // Qualifier indicator (top right subtle)
  ctx.textAlign = 'right'
  ctx.font = '14px monospace'
  ctx.fillStyle = 'rgba(80,110,140,0.60)'
  if (!state.isChampionshipRound) {
    ctx.fillText(`QUALIFIER ${state.currentQualifier}`, W - 28, W > 400 ? H - 40 : 90)
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
    case 'GRAVITY_PULL':    return '#ff55cc'
    case 'GRAVITY_PUSH':    return '#55ccff'
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

const SCOREBOARD_X = W - 240
const SCOREBOARD_Y = 90
const ROW_H = 44

function drawScoreboard(ctx: CanvasRenderingContext2D, state: SimState): void {
  const panelH = TEAMS_ORDER.length * ROW_H + 16
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  roundRect(ctx, SCOREBOARD_X - 14, SCOREBOARD_Y - 6, 228, panelH, 6)
  ctx.fill()

  ctx.textBaseline = 'middle'
  for (let i = 0; i < TEAMS_ORDER.length; i++) {
    const team  = TEAMS_ORDER[i]!
    // Find row from state.scoreboardRows (preserves session data)
    const row = state.scoreboardRows.find(r => r.team === team)
    const count = row?.aliveCount ?? 0
    const eliminated = row?.isEliminated ?? false
    const sessionPts = row?.sessionPoints ?? 0
    const y = SCOREBOARD_Y + i * ROW_H + ROW_H / 2

    // Color swatch
    ctx.fillStyle = !eliminated ? TEAM_COLORS[team]! : 'rgba(80,80,80,0.3)'
    ctx.fillRect(SCOREBOARD_X - 10, y - 13, 5, 26)

    // Team label
    ctx.textAlign = 'left'
    ctx.font = 'bold 14px monospace'
    ctx.fillStyle = eliminated ? '#333333' : count > 0 ? '#dddddd' : '#888888'
    ctx.fillText(TEAM_LABEL[team]!, SCOREBOARD_X + 4, y - 6)

    // Session points (small, below name)
    ctx.font = '12px monospace'
    ctx.fillStyle = eliminated ? '#333333' : 'rgba(150,170,200,0.70)'
    ctx.fillText(`${sessionPts}pts`, SCOREBOARD_X + 4, y + 10)

    // Contestant pips
    for (let p = 0; p < CONTESTANTS_PER_TEAM; p++) {
      const px = SCOREBOARD_X + 90 + p * 17
      const alive = !eliminated && p < count
      ctx.beginPath()
      ctx.arc(px, y, 5, 0, Math.PI * 2)
      ctx.fillStyle = alive ? TEAM_COLORS[team]! : eliminated ? 'rgba(40,40,40,0.4)' : 'rgba(80,80,80,0.3)'
      ctx.fill()
    }

    // Alive count
    ctx.textAlign = 'right'
    ctx.font = 'bold 18px monospace'
    ctx.fillStyle = eliminated ? '#333333' : count > 0 ? TEAM_COLORS[team]! : '#333333'
    ctx.fillText(eliminated ? 'OUT' : count.toString(), SCOREBOARD_X + 210, y)
  }
}

// ─── Event indicator ─────────────────────────────────────────────────────────

function drawEventIndicator(ctx: CanvasRenderingContext2D, state: SimState): void {
  const baseY = state.isChampionshipRound ? 175 : 162

  // PULSE_PANIC: show countdown to next pulse
  if (state.currentRecipeId === 'PULSE_PANIC' && state.nextPulseCountdown > 0) {
    const sec = Math.ceil(state.nextPulseCountdown / 60)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const alpha = sec <= 3 ? 1.0 : sec <= 5 ? 0.85 : 0.60
    ctx.font = sec <= 3 ? 'bold 24px monospace' : 'bold 18px monospace'
    ctx.fillStyle = `rgba(0,255,180,${alpha})`
    ctx.fillText(`PULSE IN  ${sec}`, 28, baseY)
    return
  }

  if (state.activeEvent !== 'NONE') {
    if (state.eventTicksRemaining > 0 && state.activeEvent !== 'PULSE') {
      const sec = Math.ceil(state.eventTicksRemaining / 60)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.font = '15px monospace'
      ctx.fillStyle = 'rgba(200,200,200,0.5)'
      ctx.fillText(`ends in ${sec}s`, 28, baseY)
    }
    return
  }

  if (state.nextEventLabel && state.nextEventTicksRemaining > 0) {
    const sec = Math.ceil(state.nextEventTicksRemaining / 60)
    if (sec <= 15) {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      const alpha = sec <= 5 ? 0.9 : 0.55
      ctx.font = sec <= 5 ? 'bold 18px monospace' : '15px monospace'
      const baseLabel = state.nextEventLabel.replace(/ \d+$/, '')
      ctx.fillStyle = `rgba(255,200,80,${alpha})`
      ctx.fillText(`${baseLabel} ${sec}`, 28, baseY)
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
      28, baseY
    )
  }
}

// ─── Milestone ───────────────────────────────────────────────────────────────

function drawMilestone(ctx: CanvasRenderingContext2D, state: SimState): void {
  if (!state.milestoneLabel || state.milestoneTicksRemaining <= 0) return

  const t = state.milestoneTicksRemaining / MILESTONE_DURATION
  const alpha = Math.min(1, t * 4)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold ${Math.floor(56 + (1 - t) * 8)}px monospace`
  ctx.fillStyle = `rgba(255,220,50,${alpha.toFixed(2)})`
  ctx.fillText(state.milestoneLabel, CX, CY - 200)
}

// ─── Team eliminated announcement ────────────────────────────────────────────

function drawTeamEliminatedAnnouncement(ctx: CanvasRenderingContext2D, state: SimState): void {
  if (!state.teamEliminatedLabel || state.teamEliminatedTicksRemaining <= 0) return

  const t = state.teamEliminatedTicksRemaining / TEAM_ELIM_DURATION
  const alpha = Math.min(1, t * 4)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 44px monospace'
  ctx.fillStyle = `rgba(255,80,50,${alpha.toFixed(2)})`
  ctx.fillText(state.teamEliminatedLabel, CX, CY + 250)
}

// ─── Winner presentation ──────────────────────────────────────────────────────

function drawWinnerBanner(ctx: CanvasRenderingContext2D, state: SimState): void {
  if (!state.winnerTeam) return

  const color = TEAM_COLORS[state.winnerTeam]!
  const isChamp = state.isChampionshipRound

  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(CX - 480, CY - 180, 960, 320)

  ctx.fillStyle = isChamp ? 'rgba(255,215,0,0.80)' : color
  ctx.fillRect(CX - 480, CY - 184, 960, 4)
  ctx.fillRect(CX - 480, CY + 140, 960, 4)

  ctx.fillStyle = hexToRgba(color, 0.15)
  ctx.fillRect(CX - 480, CY - 180, 960, 320)

  if (isChamp) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 32px monospace'
    ctx.fillStyle = 'rgba(255,215,0,0.85)'
    ctx.fillText('CHAMPIONSHIP', CX, CY - 140)
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold ${isChamp ? 80 : 92}px monospace`
  ctx.fillStyle = color
  ctx.fillText(`${state.winnerTeam}`, CX, CY - 60)

  ctx.font = 'bold 34px monospace'
  ctx.fillStyle = isChamp ? 'rgba(255,215,0,0.80)' : '#ccddee'
  ctx.fillText(isChamp ? 'CHAMPION' : `ROUND ${state.round}`, CX, CY - 4)

  if (isChamp) {
    ctx.font = 'bold 28px monospace'
    ctx.fillStyle = 'rgba(255,215,0,0.70)'
    ctx.fillText(`+${state.championshipWin.pointsGained} POINTS`, CX, CY + 42)
  }

  ctx.font = '22px monospace'
  ctx.fillStyle = '#778899'
  const dur = state.roundDurationSec
  const durStr = `${Math.floor(dur / 60)}:${(dur % 60).toString().padStart(2, '0')}`
  ctx.fillText(
    `${durStr}  ·  ${state.survivorCount} survived  ·  ${state.eliminationCount} eliminated`,
    CX, isChamp ? CY + 85 : CY + 60
  )

  // Points multiplier info
  if (state.pointMultiplier > 1) {
    ctx.font = '18px monospace'
    ctx.fillStyle = 'rgba(255,200,50,0.60)'
    ctx.fillText(`${state.pointMultiplier}× POINTS`, CX, CY + 115)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FULL_BOUNDARY = 460
const MILESTONE_DURATION = 180
const TEAM_ELIM_DURATION = 180

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`
}

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
