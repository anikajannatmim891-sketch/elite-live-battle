/**
 * PASS 1C — Material Profile System
 *
 * Lightweight pseudo-3D sphere rendering using Canvas 2D gradients.
 * No blur, no shadowBlur, no image textures, no raster assets.
 *
 * Gradient objects are cached by (material + teamColor + radius bucket)
 * to avoid per-frame allocation in hot loops.
 */

import type { TeamId } from '../shared/types'

// ─── Material types ───────────────────────────────────────────────────────────

export type MaterialProfile = 'POLISHED' | 'METALLIC' | 'PEARL' | 'ENERGY'

export const MATERIAL_PROFILES: MaterialProfile[] = ['POLISHED', 'METALLIC', 'PEARL', 'ENERGY']

// Select material deterministically from round number
export function materialForRound(round: number): MaterialProfile {
  return MATERIAL_PROFILES[(round - 1) % MATERIAL_PROFILES.length]!
}

// ─── Team base colors (RGB components for blending) ───────────────────────────

interface RGB { r: number; g: number; b: number }

const TEAM_RGB: Record<TeamId, RGB> = {
  GOLD:    { r: 255, g: 215, b:   0 },
  RED:     { r: 255, g:  34, b:  51 },
  CYAN:    { r:   0, g: 255, b: 238 },
  VIOLET:  { r: 204, g:   0, b: 255 },
  EMERALD: { r:   0, g: 255, b: 136 },
  MAGENTA: { r: 255, g:   0, b: 170 },
}

function rgb(c: RGB, alpha = 1): string {
  return `rgba(${c.r},${c.g},${c.b},${alpha.toFixed(3)})`
}

function blend(c: RGB, r2: number, g2: number, b2: number, t: number): RGB {
  return {
    r: Math.round(c.r + (r2 - c.r) * t),
    g: Math.round(c.g + (g2 - c.g) * t),
    b: Math.round(c.b + (b2 - c.b) * t),
  }
}

// ─── Gradient cache ───────────────────────────────────────────────────────────

// Key: `${material}:${team}:${radiusBucket}`
// RadiusBucket = Math.round(radius / 2) * 2  (quantize to even integers)
const _gradCache = new Map<string, CanvasGradient>()

function cacheKey(material: MaterialProfile, team: TeamId, rBucket: number): string {
  return `${material}:${team}:${rBucket}`
}

/**
 * Get (or create and cache) the main sphere body radial gradient.
 * The gradient is centered at the sphere's position at render time —
 * so we can't truly cache position-dependent gradients.
 *
 * Instead, we cache the COLOR STOP definitions and re-create the
 * gradient each frame AT the correct position, but using cached stop data.
 * This is cheaper than building the stop array every frame.
 *
 * For real caching, we use an OffscreenCanvas approach:
 * render into a pre-baked offscreen canvas per (material+team+radius).
 * Then blit with drawImage. This is the most performant approach.
 */

// ─── Offscreen sphere cache ───────────────────────────────────────────────────

// Cache of pre-rendered sphere images, keyed by material+team+radius
const _sphereCache = new Map<string, HTMLCanvasElement>()

function getOrBakeSphere(
  material: MaterialProfile,
  team: TeamId,
  radius: number
): HTMLCanvasElement {
  const rBucket = Math.round(radius / 2) * 2
  const key = cacheKey(material, team, rBucket)
  let cached = _sphereCache.get(key)
  if (cached) return cached

  const size = (rBucket + 4) * 2  // padding of 4px each side
  const oc = document.createElement('canvas')
  oc.width  = size
  oc.height = size
  const ctx = oc.getContext('2d')!
  const cx  = size / 2
  const cy  = size / 2
  const r   = rBucket

  bakeSphere(ctx, cx, cy, r, material, team)

  _sphereCache.set(key, oc)
  return oc
}

/**
 * Bake a sphere into the provided context at (cx,cy) with given radius.
 * Called only on first use per (material+team+radius) combination.
 */
function bakeSphere(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  material: MaterialProfile,
  team: TeamId
): void {
  const c = TEAM_RGB[team]

  switch (material) {
    case 'POLISHED':  bakePolished(ctx, cx, cy, r, c);  break
    case 'METALLIC':  bakeMetallic(ctx, cx, cy, r, c);  break
    case 'PEARL':     bakePearl(ctx, cx, cy, r, c);     break
    case 'ENERGY':    bakeEnergy(ctx, cx, cy, r, c);    break
  }
}

// ─── POLISHED ────────────────────────────────────────────────────────────────

function bakePolished(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  c: RGB
): void {
  // Outer silhouette shadow ring
  ctx.beginPath()
  ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fill()

  // Main body — radial gradient from upper-left bright to lower-right dark
  const gx = cx - r * 0.28
  const gy = cy - r * 0.28
  const grad = ctx.createRadialGradient(gx, gy, r * 0.05, cx, cy, r)
  const bright  = blend(c, 255, 255, 255, 0.55)
  const mid     = c
  const dark    = blend(c,   0,   0,   0, 0.50)
  const darkEdge= blend(c,   0,   0,   0, 0.72)
  grad.addColorStop(0.00, rgb(bright))
  grad.addColorStop(0.30, rgb(mid))
  grad.addColorStop(0.70, rgb(dark))
  grad.addColorStop(1.00, rgb(darkEdge))
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()

  // Rim lighting — subtle bright ring around sphere edge
  const rimGrad = ctx.createRadialGradient(cx, cy, r * 0.80, cx, cy, r * 1.0)
  rimGrad.addColorStop(0.0, 'rgba(255,255,255,0.00)')
  rimGrad.addColorStop(0.7, 'rgba(255,255,255,0.06)')
  rimGrad.addColorStop(1.0, 'rgba(255,255,255,0.22)')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = rimGrad
  ctx.fill()

  // Crisp specular highlight — small off-center oval upper-left
  const hx = cx - r * 0.30
  const hy = cy - r * 0.30
  const hGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.30)
  hGrad.addColorStop(0.0, 'rgba(255,255,255,0.88)')
  hGrad.addColorStop(0.5, 'rgba(255,255,255,0.30)')
  hGrad.addColorStop(1.0, 'rgba(255,255,255,0.00)')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = hGrad
  ctx.fill()

  // Secondary micro-reflection — tiny lower-right glint
  const sx = cx + r * 0.40
  const sy = cy + r * 0.38
  const sGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.14)
  sGrad.addColorStop(0.0, 'rgba(255,255,255,0.28)')
  sGrad.addColorStop(1.0, 'rgba(255,255,255,0.00)')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = sGrad
  ctx.fill()

  // Crisp outer stroke
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 1.2
  ctx.stroke()
}

// ─── METALLIC ────────────────────────────────────────────────────────────────

function bakeMetallic(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  c: RGB
): void {
  // Outer shadow
  ctx.beginPath()
  ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.fill()

  // Metallic body — high contrast, sharper falloff
  const gx = cx - r * 0.25
  const gy = cy - r * 0.32
  const grad = ctx.createRadialGradient(gx, gy, r * 0.02, cx, cy, r)
  const light   = blend(c, 255, 255, 255, 0.70)
  const mid     = blend(c,  60,  60,  60, 0.35)
  const dark    = blend(c,   0,   0,   0, 0.65)
  const darkEdge= blend(c,   0,   0,   0, 0.82)
  grad.addColorStop(0.00, rgb(light))
  grad.addColorStop(0.18, rgb(c))
  grad.addColorStop(0.45, rgb(mid))
  grad.addColorStop(0.78, rgb(dark))
  grad.addColorStop(1.00, rgb(darkEdge))
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()

  // Metallic rim — slightly colored tint on edge
  const rimGrad = ctx.createRadialGradient(cx, cy, r * 0.78, cx, cy, r)
  rimGrad.addColorStop(0.0, 'rgba(255,255,255,0.00)')
  rimGrad.addColorStop(0.6, rgb(c, 0.08))
  rimGrad.addColorStop(1.0, rgb(blend(c, 255, 255, 255, 0.3), 0.28))
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = rimGrad
  ctx.fill()

  // Sharp specular — narrow bright streak upper-left
  const hx = cx - r * 0.28
  const hy = cy - r * 0.35
  const hGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.22)
  hGrad.addColorStop(0.0, 'rgba(255,255,255,0.95)')
  hGrad.addColorStop(0.35, 'rgba(255,255,255,0.40)')
  hGrad.addColorStop(1.0, 'rgba(255,255,255,0.00)')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = hGrad
  ctx.fill()

  // Secondary sharp glint — lower-right
  const sx = cx + r * 0.38
  const sy = cy + r * 0.35
  const sGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.10)
  sGrad.addColorStop(0.0, 'rgba(255,255,255,0.35)')
  sGrad.addColorStop(1.0, 'rgba(255,255,255,0.00)')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = sGrad
  ctx.fill()

  // Crisp metallic outline
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = rgb(blend(c, 255, 255, 255, 0.5), 0.7)
  ctx.lineWidth = 1.5
  ctx.stroke()
}

// ─── PEARL ────────────────────────────────────────────────────────────────────

function bakePearl(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  c: RGB
): void {
  // Outer shadow
  ctx.beginPath()
  ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fill()

  // Pearl body — soft internal color transition, center is near-white
  const grad = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.15, 0, cx, cy, r)
  const inner  = blend(c, 255, 255, 255, 0.72)  // near-white center
  const midIn  = blend(c, 255, 255, 255, 0.45)
  const midOut = c
  const edge   = blend(c,   0,   0,   0, 0.38)
  grad.addColorStop(0.00, rgb(inner))
  grad.addColorStop(0.25, rgb(midIn))
  grad.addColorStop(0.60, rgb(midOut))
  grad.addColorStop(1.00, rgb(edge))
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()

  // Pearlescent iridescent sheen — subtle second color layer
  const sheen = blend(c, 255, 255, 255, 0.30)
  const sheenGrad = ctx.createRadialGradient(cx + r * 0.10, cy - r * 0.10, r * 0.20, cx, cy, r)
  sheenGrad.addColorStop(0.0, rgb(sheen, 0.00))
  sheenGrad.addColorStop(0.4, rgb(sheen, 0.18))
  sheenGrad.addColorStop(0.7, rgb({ r: 255, g: 255, b: 255 }, 0.12))
  sheenGrad.addColorStop(1.0, rgb(c, 0.00))
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = sheenGrad
  ctx.fill()

  // Rim lighting — soft warm glow at edge
  const rimGrad = ctx.createRadialGradient(cx, cy, r * 0.82, cx, cy, r)
  rimGrad.addColorStop(0.0, 'rgba(255,255,255,0.00)')
  rimGrad.addColorStop(1.0, 'rgba(255,255,255,0.30)')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = rimGrad
  ctx.fill()

  // Soft specular — larger, more diffuse than POLISHED
  const hx = cx - r * 0.22
  const hy = cy - r * 0.25
  const hGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.42)
  hGrad.addColorStop(0.0, 'rgba(255,255,255,0.75)')
  hGrad.addColorStop(0.45, 'rgba(255,255,255,0.18)')
  hGrad.addColorStop(1.0, 'rgba(255,255,255,0.00)')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = hGrad
  ctx.fill()

  // Soft outline
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.lineWidth = 1.0
  ctx.stroke()
}

// ─── ENERGY ───────────────────────────────────────────────────────────────────

function bakeEnergy(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  c: RGB
): void {
  // Outer shadow ring
  ctx.beginPath()
  ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fill()

  // Dark outer fill — energy orb is dark on outside
  const baseGrad = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r)
  const core   = blend(c, 255, 255, 255, 0.55)   // bright core
  const midC   = blend(c, 255, 255, 255, 0.15)
  const outer  = blend(c,   0,   0,   0, 0.45)
  const edge   = blend(c,   0,   0,   0, 0.75)
  baseGrad.addColorStop(0.00, rgb(core))
  baseGrad.addColorStop(0.30, rgb(midC))
  baseGrad.addColorStop(0.60, rgb(c))
  baseGrad.addColorStop(0.82, rgb(outer))
  baseGrad.addColorStop(1.00, rgb(edge))
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = baseGrad
  ctx.fill()

  // Concentric energy ring 1 — inner bright ring
  const r1 = r * 0.55
  ctx.beginPath()
  ctx.arc(cx, cy, r1, 0, Math.PI * 2)
  ctx.strokeStyle = rgb(blend(c, 255, 255, 255, 0.6), 0.55)
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Concentric energy ring 2 — outer ring
  const r2 = r * 0.82
  ctx.beginPath()
  ctx.arc(cx, cy, r2, 0, Math.PI * 2)
  ctx.strokeStyle = rgb(c, 0.45)
  ctx.lineWidth = 1.0
  ctx.stroke()

  // Crisp rim — bright colored rim characteristic of energy orb
  const rimGrad = ctx.createRadialGradient(cx, cy, r * 0.80, cx, cy, r)
  rimGrad.addColorStop(0.0, 'rgba(255,255,255,0.00)')
  rimGrad.addColorStop(0.5, rgb(c, 0.12))
  rimGrad.addColorStop(1.0, rgb(blend(c, 255, 255, 255, 0.4), 0.50))
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = rimGrad
  ctx.fill()

  // Specular spot — off-center, crisp
  const hx = cx - r * 0.28
  const hy = cy - r * 0.28
  const hGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.25)
  hGrad.addColorStop(0.0, 'rgba(255,255,255,0.90)')
  hGrad.addColorStop(0.4, 'rgba(255,255,255,0.25)')
  hGrad.addColorStop(1.0, 'rgba(255,255,255,0.00)')
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = hGrad
  ctx.fill()

  // Crisp colored stroke — energy orb has visible colored border
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = rgb(blend(c, 255, 255, 255, 0.35), 0.85)
  ctx.lineWidth = 1.8
  ctx.stroke()
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Draw a sphere at canvas coordinates (canvasX, canvasY) with given radius,
 * using the specified material profile and team color.
 *
 * Uses cached offscreen canvas — O(1) per frame after first render per combo.
 */
export function drawSphere(
  ctx: CanvasRenderingContext2D,
  canvasX: number, canvasY: number,
  radius: number,
  material: MaterialProfile,
  team: TeamId
): void {
  const img = getOrBakeSphere(material, team, radius)
  const half = img.width / 2
  ctx.drawImage(img, canvasX - half, canvasY - half)
}

/**
 * Invalidate cache — call if material/radius changes require fresh baking.
 * Not needed for normal round transitions (profiles differ but teams persist).
 */
export function clearSphereCache(): void {
  _sphereCache.clear()
  _gradCache.clear()
}
