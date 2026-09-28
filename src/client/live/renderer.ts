import type { SimState, TeamId } from '../shared/types'
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

// Pre-parsed RGBA components for hot-loop efficiency
const TEAM_RGBA: Record<TeamId, [number,number,number]> = {
  GOLD:    [255, 215,   0],
  RED:     [255,  34,  51],
  CYAN:    [  0, 255, 238],
  VIOLET:  [204,   0, 255],
  EMERALD: [  0, 255, 136],
  MAGENTA: [255,   0, 170],
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

// ─── Arena ring cache ─────────────────────────────────────────────────────────
//
// We cache the STATIC parts of the arena ring into an offscreen canvas.
// Static means: the layered ring structure, inner detail, tick marks.
// These only change when boundaryRadius or pressure phase changes.
//
// Dynamic parts (danger arc, repulsor, pulse rings, phase color) are drawn live.

interface ArenaRingCache {
  canvas: HTMLCanvasElement
  radius: number
}

let _arenaRingCache: ArenaRingCache | null = null

// Full boundary used for ring baking (the outer radius of the ring zone)
const RING_OUTER_PAD  = 18  // how far outside br the outer rim extends
const RING_BAND_W     = 16  // main ring band width (from br inward)

/**
 * Get or bake the static arena ring offscreen canvas.
 * Invalidated when boundaryRadius changes (shrinking arena).
 */
function getArenaRingCanvas(br: number): HTMLCanvasElement {
  // Quantize radius to avoid constant rebake during smooth shrink
  const brQ = Math.round(br / 2) * 2

  if (_arenaRingCache && _arenaRingCache.radius === brQ) {
    return _arenaRingCache.canvas
  }

  // Create a canvas large enough to hold the ring with outer pad
  // We bake centered at (size/2, size/2)
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

/**
 * Bake the premium arena ring into an offscreen context.
 * Draws all static layers — no dynamic/phase-dependent color here.
 */
function bakeArenaRing(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  br: number
): void {
  // ── Layer 1: deep outer shadow halo ────────────────────────────────────────
  // A wide, very faint diffuse ring outside the boundary — creates depth drop-off
  const shadowGrad = ctx.createRadialGradient(cx, cy, br + 2, cx, cy, br + RING_OUTER_PAD + 4)
  shadowGrad.addColorStop(0.0, 'rgba(0,0,0,0.0)')
  shadowGrad.addColorStop(0.4, 'rgba(0,10,30,0.25)')
  shadowGrad.addColorStop(1.0, 'rgba(0,0,0,0.0)')
  ctx.beginPath()
  ctx.arc(cx, cy, br + RING_OUTER_PAD + 4, 0, Math.PI * 2)
  ctx.fillStyle = shadowGrad
  ctx.fill()

  // ── Layer 2: outer rim dark base ───────────────────────────────────────────
  // Thick outer stroke forms the "outer lip" of the ring
  ctx.beginPath()
  ctx.arc(cx, cy, br + 10, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(15,20,35,0.90)'
  ctx.lineWidth = 14
  ctx.stroke()

  // ── Layer 3: outer rim metallic gradient stroke ────────────────────────────
  // The outer rim itself — cool steel-blue gradient feel
  // Canvas 2D can't do per-stroke gradient natively, so we layer two strokes:
  // a slightly lighter outer edge, a slightly darker inner edge
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

  // ── Layer 4: main ring band fill (dark recessed groove) ───────────────────
  // The interior of the ring itself — darkened groove band
  // We approximate with an annular fill using two arcs (clip trick):
  // Draw outer circle, then cut inner circle with compositing
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

  // ── Layer 5: inner bevel / lip (inside edge of ring) ──────────────────────
  // Bright inner edge stroke — creates the "inner lip" of a machined ring
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

  // ── Layer 6: outer edge bright crease ─────────────────────────────────────
  // Very thin bright outer edge line — creates a sharp highlight crease
  ctx.beginPath()
  ctx.arc(cx, cy, br + 16, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(80,110,155,0.45)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // ── Layer 7: specular highlight arc (top-left quadrant) ───────────────────
  // A subtle bright arc from ~200° to ~340° that simulates overhead/top-left light
  // This creates the illusion that the ring is a physical 3D object
  const hlStart = (-Math.PI * 0.75)  // ~225° from right = upper-left
  const hlEnd   = (-Math.PI * 0.05)  // just past top
  ctx.beginPath()
  ctx.arc(cx, cy, br + 8, hlStart, hlEnd)
  ctx.strokeStyle = 'rgba(160,200,255,0.28)'
  ctx.lineWidth = 6
  ctx.stroke()

  // Thin bright crease within the specular zone
  ctx.beginPath()
  ctx.arc(cx, cy, br + 10, hlStart + 0.1, hlEnd - 0.1)
  ctx.strokeStyle = 'rgba(200,230,255,0.18)'
  ctx.lineWidth = 2
  ctx.stroke()

  // ── Layer 8: opposite rim shadow (lower-right quadrant) ───────────────────
  // Compensating dark arc to reinforce the 3D lighting logic
  const shStart = (Math.PI * 0.10)
  const shEnd   = (Math.PI * 0.90)
  ctx.beginPath()
  ctx.arc(cx, cy, br + 8, shStart, shEnd)
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 7
  ctx.stroke()

  // ── Layer 9: tick marks ───────────────────────────────────────────────────
  // Pre-baked tick marks — static visual detail
  const tickInnerBase = br - 12
  const tickOuterBase = br + 14

  for (let i = 0; i < TICK_COUNT; i++) {
    const a    = TICK_ANGLES[i]!
    const long = i % 5 === 0
    const ca   = Math.cos(a)
    const sa   = Math.sin(a)

    if (long) {
      // Long tick — spans through the ring band
      const inner = tickInnerBase - 4
      const outer = tickOuterBase
      ctx.beginPath()
      ctx.moveTo(cx + ca * inner, cy + sa * inner)
      ctx.lineTo(cx + ca * outer, cy + sa * outer)
      ctx.strokeStyle = 'rgba(140,180,230,0.30)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Small bright accent at the outer tip of long ticks
      ctx.beginPath()
      ctx.arc(cx + ca * (outer + 2), cy + sa * (outer + 2), 2.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(120,170,240,0.40)'
      ctx.fill()
    } else {
      // Short tick — inside the ring only
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

  // ── Layer 10: inner groove ring ──────────────────────────────────────────
  // A thin groove ring just inside the tick inner boundary — structural detail
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
  // Background
  ctx.fillStyle = '#06060a'
  ctx.fillRect(0, 0, W, H)

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

  if (state.phase === 'WINNER') drawWinnerBanner(ctx, state)
}

// ─── Arena ────────────────────────────────────────────────────────────────────

function drawArena(ctx: CanvasRenderingContext2D, state: SimState): void {
  const br    = state.boundaryRadius
  const phase = state.phase
  const isPressure = state.pressureActive

  // ── Interior background fill ───────────────────────────────────────────────
  // Subtle radial gradient — slightly lighter center, darker edges
  const bgGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, br)
  bgGrad.addColorStop(0.00, 'rgba(8,12,24,0.80)')
  bgGrad.addColorStop(0.55, 'rgba(4,8,18,0.65)')
  bgGrad.addColorStop(0.82, 'rgba(2,4,12,0.80)')
  bgGrad.addColorStop(1.00, 'rgba(0,2,8,0.90)')
  ctx.beginPath()
  ctx.arc(CX, CY, br, 0, Math.PI * 2)
  ctx.fillStyle = bgGrad
  ctx.fill()

  // ── Subtle internal detail: faint concentric guide rings ──────────────────
  drawArenaInteriorDetail(ctx, br)

  // ── Safe sector fills (if active) ─────────────────────────────────────────
  if (state.safeSectorsActive && state.safeSectors.length > 0) {
    for (const [start, end] of state.safeSectors) {
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.arc(CX, CY, br, start, end)
      ctx.closePath()
      ctx.fillStyle = 'rgba(0,255,136,0.05)'
      ctx.fill()

      // Safe sector outer arc indicator — thin bright line on ring
      ctx.beginPath()
      ctx.arc(CX, CY, br + 3, start, end)
      ctx.strokeStyle = 'rgba(0,220,100,0.35)'
      ctx.lineWidth = 4
      ctx.stroke()
    }
  }

  // ── Danger arc hazard integration ─────────────────────────────────────────
  if (state.activeEvent === 'DANGER_ARC') {
    drawDangerArc(ctx, state, br)
  }

  // ── Center repulsor device ─────────────────────────────────────────────────
  if (state.repulsorActive) {
    drawRepulsorDevice(ctx, state)
  }

  // ── Blit pre-baked static arena ring ─────────────────────────────────────
  // The ring itself (ticks, bevels, layered strokes) is cached offscreen
  const ringImg = getArenaRingCanvas(br)
  const half = ringImg.width / 2
  ctx.drawImage(ringImg, CX - half, CY - half)

  // ── Phase-dependent main boundary ring overlay ────────────────────────────
  // This is drawn on top of the cached ring to add phase color
  drawPhaseRingOverlay(ctx, br, phase, isPressure)
}

// ─── Interior detail (faint concentric markings) ─────────────────────────────

function drawArenaInteriorDetail(ctx: CanvasRenderingContext2D, br: number): void {
  // Mid guide ring — at 70% radius
  ctx.beginPath()
  ctx.arc(CX, CY, br * 0.70, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(80,110,160,0.08)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Inner guide ring — at 40% radius
  ctx.beginPath()
  ctx.arc(CX, CY, br * 0.40, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(70,100,150,0.06)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Faint radial lines at 12 positions (every 30°)
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

  // Tiny center pip — focal point marker
  ctx.beginPath()
  ctx.arc(CX, CY, 3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(80,120,200,0.12)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(CX, CY, 1.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(120,170,255,0.20)'
  ctx.fill()
}

// ─── Danger arc (integrated into ring visual) ─────────────────────────────────

function drawDangerArc(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  br: number
): void {
  const arcA    = state.dangerArcAngle
  const half    = state.dangerArcSpan
  const lethal  = state.dangerArcLethal

  // Sector fill — wedge from center out beyond ring (fills interior + ring zone)
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(CX, CY)
  ctx.arc(CX, CY, br + RING_OUTER_PAD + 2, arcA - half, arcA + half)
  ctx.closePath()

  // Use a radial gradient for the fill — hot at edge, fades toward center
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

  // Embedded ring arc — the danger highlight sits on the ring itself
  // Outer rim arc (broad, diffuse)
  ctx.beginPath()
  ctx.arc(CX, CY, br + 9, arcA - half, arcA + half)
  ctx.strokeStyle = lethal ? 'rgba(255,40,0,0.65)' : 'rgba(255,130,0,0.40)'
  ctx.lineWidth = lethal ? 14 : 10
  ctx.stroke()

  // Sharp inner crease on ring
  ctx.beginPath()
  ctx.arc(CX, CY, br + 3, arcA - half, arcA + half)
  ctx.strokeStyle = lethal ? 'rgba(255,70,0,0.90)' : 'rgba(255,160,0,0.60)'
  ctx.lineWidth = lethal ? 3.5 : 2
  ctx.stroke()

  // Inner lip arc — echoes on the inner ring boundary
  ctx.beginPath()
  ctx.arc(CX, CY, br - 5, arcA - half, arcA + half)
  ctx.strokeStyle = lethal ? 'rgba(255,50,0,0.35)' : 'rgba(255,140,0,0.18)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Lethal: add bright edge pulse crease
  if (lethal) {
    ctx.beginPath()
    ctx.arc(CX, CY, br + 15, arcA - half + 0.02, arcA + half - 0.02)
    ctx.strokeStyle = 'rgba(255,200,150,0.25)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // Arc tip indicators — small bright dots at the arc endpoints
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
}

// ─── Phase ring overlay (dynamic color per phase) ────────────────────────────

function drawPhaseRingOverlay(
  ctx: CanvasRenderingContext2D,
  br: number,
  phase: string,
  isPressure: boolean
): void {
  const isFinal = phase === 'FINAL'
  const isEsc   = phase === 'ESCALATION'
  const isActive = isFinal || isEsc

  // Main boundary ring — color shifts with phase
  // We draw two overlapping strokes: a base ring + a bright crease on top
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

  // Broad base ring (sits behind tick marks)
  ctx.beginPath()
  ctx.arc(CX, CY, br, 0, Math.PI * 2)
  ctx.strokeStyle = baseColor
  ctx.lineWidth = isFinal ? 4 : isEsc ? 3 : 2.5
  ctx.stroke()

  // Bright inner crease
  ctx.beginPath()
  ctx.arc(CX, CY, br - 1.5, 0, Math.PI * 2)
  ctx.strokeStyle = creaseColor
  ctx.lineWidth = 1
  ctx.stroke()

  // Pressure glow — broad halo outside boundary for ESCALATION/FINAL
  if (isActive) {
    // Outer diffuse glow band
    ctx.beginPath()
    ctx.arc(CX, CY, br + 5, 0, Math.PI * 2)
    ctx.strokeStyle = isFinal
      ? 'rgba(255,20,0,0.22)'
      : 'rgba(255,90,0,0.15)'
    ctx.lineWidth = 22
    ctx.stroke()

    // Inner glow band (inside the arena)
    ctx.beginPath()
    ctx.arc(CX, CY, br - 14, 0, Math.PI * 2)
    ctx.strokeStyle = isFinal
      ? 'rgba(255,30,0,0.12)'
      : 'rgba(255,100,0,0.08)'
    ctx.lineWidth = 20
    ctx.stroke()
  }
}

// ─── Center repulsor device ───────────────────────────────────────────────────

function drawRepulsorDevice(ctx: CanvasRenderingContext2D, state: SimState): void {
  const pulse = 0.5 + 0.5 * Math.sin(state.roundTick * 0.12)

  // ── Outer energy disc / base ──────────────────────────────────────────────
  const discR = 38 + pulse * 6
  const discGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, discR)
  discGrad.addColorStop(0.0, `rgba(0,180,255,${(0.08 + pulse * 0.07).toFixed(3)})`)
  discGrad.addColorStop(0.5, `rgba(0,150,230,${(0.04 + pulse * 0.04).toFixed(3)})`)
  discGrad.addColorStop(1.0, 'rgba(0,120,200,0.00)')
  ctx.beginPath()
  ctx.arc(CX, CY, discR, 0, Math.PI * 2)
  ctx.fillStyle = discGrad
  ctx.fill()

  // ── Device ring (outer) ───────────────────────────────────────────────────
  ctx.beginPath()
  ctx.arc(CX, CY, 26 + pulse * 5, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(0,210,255,${(0.55 + pulse * 0.30).toFixed(3)})`
  ctx.lineWidth = 2.5
  ctx.stroke()

  // ── Inner device ring ─────────────────────────────────────────────────────
  ctx.beginPath()
  ctx.arc(CX, CY, 14 + pulse * 2, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(0,230,255,${(0.40 + pulse * 0.25).toFixed(3)})`
  ctx.lineWidth = 1.5
  ctx.stroke()

  // ── Device geometry — diamond / cross motif ────────────────────────────────
  // Rotating cross (arena device look)
  const rot = state.roundTick * 0.04  // slow rotation for device feel
  const armLen = 18 + pulse * 3
  const armW   = 2.0

  ctx.strokeStyle = `rgba(0,220,255,${(0.55 + pulse * 0.35).toFixed(3)})`
  ctx.lineWidth = armW
  ctx.lineCap = 'square'

  // 4 arms at 0°, 90°, 180°, 270°
  for (let k = 0; k < 4; k++) {
    const a = rot + (k / 4) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(CX + Math.cos(a) * 6, CY + Math.sin(a) * 6)
    ctx.lineTo(CX + Math.cos(a) * armLen, CY + Math.sin(a) * armLen)
    ctx.stroke()
  }

  // 4 diagonal ticks at 45° offset (stationary)
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

  // ── Core bright dot ───────────────────────────────────────────────────────
  ctx.beginPath()
  ctx.arc(CX, CY, 4.5 + pulse * 1.5, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(180,240,255,${(0.70 + pulse * 0.25).toFixed(3)})`
  ctx.fill()

  ctx.beginPath()
  ctx.arc(CX, CY, 2, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.90)'
  ctx.fill()
}

// ─── Pulse rings ──────────────────────────────────────────────────────────────

function drawPulseRings(ctx: CanvasRenderingContext2D, state: SimState): void {
  for (let i = 0; i < state.pulseRings.length; i++) {
    const p = state.pulseRings[i]
    if (!p.active) continue

    const t     = p.age / p.maxAge
    const r     = t * FULL_BOUNDARY * 0.9
    const alpha = (1 - t) * 0.75

    // Primary ring
    ctx.beginPath()
    ctx.arc(CX + p.x, CY + p.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(0,221,255,${alpha.toFixed(3)})`
    ctx.lineWidth = 2.5 * (1 - t * 0.6)
    ctx.stroke()

    // Secondary thinner outer ring (offset in time / size)
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
    const c = state.contestants[i]
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

  const [r, g, b] = TEAM_RGBA[team]
  ctx.lineCap = 'round'

  // Tapered trail: each segment uses decreasing lineWidth toward tail
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

// ─── Contestants — premium pseudo-3D spheres ──────────────────────────────────

function drawContestantSpheres(ctx: CanvasRenderingContext2D, state: SimState): void {
  const material = state.roundMaterial
  for (let i = 0; i < state.contestants.length; i++) {
    const c = state.contestants[i]
    if (!c.alive) continue
    drawSphere(ctx, CX + c.x, CY + c.y, c.radius, material, c.team)
  }
}

// ─── Collision contact effects ────────────────────────────────────────────────

function drawCollisionEffects(ctx: CanvasRenderingContext2D, state: SimState): void {
  for (let i = 0; i < state.collisionEffects.length; i++) {
    const e = state.collisionEffects[i]
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
    const e = state.eliminationEffects[i]
    if (!e.active) continue

    const t  = e.age / e.maxAge
    const color = TEAM_COLORS[e.team]
    const [r, g, b] = TEAM_RGBA[e.team]

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
  ctx.fillText('CIRCLE SURVIVAL', 28, 82)

  const sec = Math.floor(state.roundTick / 60)
  const min = Math.floor(sec / 60)
  const ss  = sec % 60
  const timeStr = `${min}:${ss.toString().padStart(2, '0')}`
  ctx.font = 'bold 22px monospace'
  ctx.fillStyle = '#ccddee'
  ctx.fillText(timeStr, 28, 112)

  ctx.font = '13px monospace'
  ctx.fillStyle = 'rgba(140,160,180,0.65)'
  ctx.fillText(`MATERIAL: ${state.roundMaterial}`, 28, 140)

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
  const counts: Partial<Record<TeamId, number>> = {}
  for (const t of TEAMS_ORDER) counts[t] = 0
  for (let i = 0; i < state.contestants.length; i++) {
    const c = state.contestants[i]
    if (c.alive) counts[c.team] = (counts[c.team] ?? 0) + 1
  }

  const panelH = TEAMS_ORDER.length * ROW_H + 12
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  roundRect(ctx, SCOREBOARD_X - 12, SCOREBOARD_Y - 6, 200, panelH, 6)
  ctx.fill()

  ctx.textBaseline = 'middle'
  for (let i = 0; i < TEAMS_ORDER.length; i++) {
    const team  = TEAMS_ORDER[i]!
    const count = counts[team] ?? 0
    const y     = SCOREBOARD_Y + i * ROW_H + ROW_H / 2

    ctx.fillStyle = count > 0 ? TEAM_COLORS[team] : 'rgba(80,80,80,0.4)'
    ctx.fillRect(SCOREBOARD_X - 8, y - 10, 6, 20)

    ctx.textAlign = 'left'
    ctx.font = 'bold 16px monospace'
    ctx.fillStyle = count > 0 ? '#dddddd' : '#444444'
    ctx.fillText(TEAM_LABEL[team], SCOREBOARD_X + 6, y)

    ctx.textAlign = 'right'
    ctx.font = 'bold 20px monospace'
    ctx.fillStyle = count > 0 ? TEAM_COLORS[team] : '#333333'
    ctx.fillText(count.toString(), SCOREBOARD_X + 184, y)

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
    if (state.eventTicksRemaining > 0 && state.activeEvent !== 'PULSE') {
      const sec = Math.ceil(state.eventTicksRemaining / 60)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.font = '15px monospace'
      ctx.fillStyle = 'rgba(200,200,200,0.5)'
      ctx.fillText(`ends in ${sec}s`, 28, 162)
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
      ctx.fillText(`${baseLabel} ${sec}`, 28, 162)
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
      28, 162
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

// ─── Winner presentation ──────────────────────────────────────────────────────

function drawWinnerBanner(ctx: CanvasRenderingContext2D, state: SimState): void {
  if (!state.winnerTeam) return

  const color = TEAM_COLORS[state.winnerTeam]

  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(CX - 480, CY - 180, 960, 320)

  ctx.fillStyle = color
  ctx.fillRect(CX - 480, CY - 184, 960, 4)
  ctx.fillRect(CX - 480, CY + 140, 960, 4)

  ctx.fillStyle = hexToRgba(color, 0.15)
  ctx.fillRect(CX - 480, CY - 180, 960, 320)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 92px monospace'
  ctx.fillStyle = color
  ctx.fillText(`${state.winnerTeam} WINS`, CX, CY - 68)

  ctx.font = 'bold 34px monospace'
  ctx.fillStyle = '#ccddee'
  ctx.fillText(`ROUND ${state.round}`, CX, CY - 4)

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
