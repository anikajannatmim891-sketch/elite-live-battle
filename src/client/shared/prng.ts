export type Rng = () => number

// Mulberry32 — fast 32-bit seeded PRNG. Do not use Math.random() for gameplay.
export function mulberry32(seed: number): Rng {
  let s = seed >>> 0
  return function (): number {
    s = (s + 0x6D2B79F5) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000
  }
}

// Returns float in [min, max)
export function rngRange(rng: Rng, min: number, max: number): number {
  return rng() * (max - min) + min
}
