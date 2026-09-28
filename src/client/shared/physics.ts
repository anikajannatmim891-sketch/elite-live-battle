import type { Contestant } from './types'

const MAX_SPEED = 8

function clampSpeed(c: Contestant): void {
  const speed = Math.sqrt(c.vx * c.vx + c.vy * c.vy)
  if (speed > MAX_SPEED) {
    const inv = MAX_SPEED / speed
    c.vx *= inv
    c.vy *= inv
  }
}

function guardFinite(c: Contestant): void {
  if (!isFinite(c.vx) || !isFinite(c.vy)) { c.vx = 0; c.vy = 0 }
  if (!isFinite(c.x) || !isFinite(c.y)) { c.x = 0; c.y = 0 }
}

// Reflect contestant off circular boundary. Call during PREPARE and ACTIVE.
export function reflectCircleBoundary(c: Contestant, boundaryRadius: number): void {
  const dx = c.x
  const dy = c.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const maxDist = boundaryRadius - c.radius
  if (dist <= maxDist || dist === 0) return

  const nx = dx / dist
  const ny = dy / dist

  // Position correction — push back inside
  c.x = nx * maxDist
  c.y = ny * maxDist

  // Reflect velocity component along outward normal
  const dot = c.vx * nx + c.vy * ny
  if (dot > 0) {
    c.vx -= 2 * dot * nx
    c.vy -= 2 * dot * ny
  }

  guardFinite(c)
  clampSpeed(c)
}

// Elastic collision between two circles with penetration correction.
export function resolveCircleCircle(a: Contestant, b: Contestant): void {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const distSq = dx * dx + dy * dy
  const minDist = a.radius + b.radius

  if (distSq >= minDist * minDist || distSq === 0) return

  const dist = Math.sqrt(distSq)
  const nx = dx / dist
  const ny = dy / dist

  // Penetration correction — push apart proportional to mass
  const penetration = minDist - dist
  const totalMass = a.mass + b.mass
  a.x -= nx * penetration * (b.mass / totalMass)
  a.y -= ny * penetration * (b.mass / totalMass)
  b.x += nx * penetration * (a.mass / totalMass)
  b.y += ny * penetration * (a.mass / totalMass)

  // Relative velocity of b w.r.t. a along normal
  const relVDotN = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
  if (relVDotN <= 0) return // already separating

  const j = (2 * relVDotN * a.mass * b.mass) / totalMass

  a.vx += (j / a.mass) * nx
  a.vy += (j / a.mass) * ny
  b.vx -= (j / b.mass) * nx
  b.vy -= (j / b.mass) * ny

  guardFinite(a)
  guardFinite(b)
  clampSpeed(a)
  clampSpeed(b)
}

// ─── Line-segment collision ───────────────────────────────────────────────────
//
// Reflects a circle off a line segment (infinite-mass wall).
// Segment from (ax,ay) to (bx,by). Normal points to the "safe" side.
// Returns true if a collision occurred.

export function reflectCircleSegment(
  c: Contestant,
  ax: number, ay: number,
  bx: number, by: number,
): boolean {
  const r = c.radius

  // Vector along segment
  const segDx = bx - ax
  const segDy = by - ay
  const segLenSq = segDx * segDx + segDy * segDy
  if (segLenSq < 0.001) return false

  // Project circle center onto segment
  const t = Math.max(0, Math.min(1, ((c.x - ax) * segDx + (c.y - ay) * segDy) / segLenSq))
  const closestX = ax + t * segDx
  const closestY = ay + t * segDy

  const dx = c.x - closestX
  const dy = c.y - closestY
  const distSq = dx * dx + dy * dy

  if (distSq >= r * r || distSq < 0.0001) return false

  const dist = Math.sqrt(distSq)
  const nx = dx / dist
  const ny = dy / dist

  // Push circle out
  const overlap = r - dist
  c.x += nx * overlap
  c.y += ny * overlap

  // Reflect velocity
  const dot = c.vx * nx + c.vy * ny
  if (dot < 0) {
    c.vx -= 2 * dot * nx
    c.vy -= 2 * dot * ny
  }

  guardFinite(c)
  clampSpeed(c)
  return true
}

// ─── Convex polygon boundary reflection ──────────────────────────────────────
//
// Keeps a circle inside a convex polygon defined by vertices (counter-clockwise).
// For each edge, the inward normal points to the right of (edge direction).
// Returns true if any edge was hit.

export function reflectConvexPolygon(
  c: Contestant,
  verts: Array<{ x: number; y: number }>
): boolean {
  const n = verts.length
  let hit = false

  for (let i = 0; i < n; i++) {
    const a = verts[i]!
    const b = verts[(i + 1) % n]!

    // Edge vector
    const edgeDx = b.x - a.x
    const edgeDy = b.y - a.y

    // Inward normal (for CCW polygon, right-normal = inward)
    const inNx = edgeDy
    const inNy = -edgeDx
    const inNLen = Math.sqrt(inNx * inNx + inNy * inNy)
    if (inNLen < 0.001) continue
    const nnx = inNx / inNLen
    const nny = inNy / inNLen

    // Signed distance from circle center to edge (positive = inside / on good side)
    // Edge line: (p - a) · inNormal / |inNormal| (already normalized)
    const signedDist = (c.x - a.x) * nnx + (c.y - a.y) * nny

    if (signedDist < c.radius) {
      // Penetration
      const pen = c.radius - signedDist
      c.x += nnx * pen
      c.y += nny * pen

      // Reflect velocity along outward normal
      const dot = c.vx * nnx + c.vy * nny
      if (dot < 0) {
        c.vx -= 2 * dot * nnx
        c.vy -= 2 * dot * nny
      }
      guardFinite(c)
      clampSpeed(c)
      hit = true
    }
  }
  return hit
}

// ─── Funnel wall reflection ───────────────────────────────────────────────────
//
// Reflects a circle off one side of a funnel (angled wall given as segment).
// Eliminates the contestant if they exit through a lethal zone.

export function reflectFunnelWall(
  c: Contestant,
  ax: number, ay: number,
  bx: number, by: number,
  inwardNx: number, inwardNy: number  // pre-normalized inward normal
): boolean {
  const r = c.radius

  const segDx = bx - ax
  const segDy = by - ay
  const segLenSq = segDx * segDx + segDy * segDy
  if (segLenSq < 0.001) return false

  const t = Math.max(0, Math.min(1, ((c.x - ax) * segDx + (c.y - ay) * segDy) / segLenSq))
  const closestX = ax + t * segDx
  const closestY = ay + t * segDy

  // Signed distance along inward normal
  const signedDist = (c.x - closestX) * inwardNx + (c.y - closestY) * inwardNy

  if (signedDist >= r) return false   // well inside, no collision

  const pen = r - signedDist
  c.x += inwardNx * pen
  c.y += inwardNy * pen

  // Reflect component along inward normal
  const dot = c.vx * inwardNx + c.vy * inwardNy
  if (dot < 0) {
    c.vx -= 2 * dot * inwardNx
    c.vy -= 2 * dot * inwardNy
  }

  guardFinite(c)
  clampSpeed(c)
  return true
}

