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
