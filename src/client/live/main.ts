import { SimEngine } from '../shared/sim'
import { render } from './renderer'

const LOGICAL_W = 1920
const LOGICAL_H = 1080
const TICK_MS = 1000 / 60   // ~16.667ms

function resize(canvas: HTMLCanvasElement): void {
  const scale = Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H)
  canvas.style.width  = `${Math.floor(LOGICAL_W * scale)}px`
  canvas.style.height = `${Math.floor(LOGICAL_H * scale)}px`
}

function init(): void {
  const canvas = document.getElementById('battle') as HTMLCanvasElement
  const ctxMaybe = canvas.getContext('2d')
  if (!ctxMaybe) throw new Error('Canvas 2D context unavailable')
  const ctx = ctxMaybe

  canvas.width  = LOGICAL_W
  canvas.height = LOGICAL_H

  window.addEventListener('resize', () => resize(canvas))
  resize(canvas)

  const testMode = new URLSearchParams(location.search).get('test') === '1'
  const initialSeed = Date.now() >>> 0

  const sim = new SimEngine(initialSeed, { testMode })

  let lastTs = 0
  let accumMs = 0

  function loop(ts: number): void {
    if (lastTs === 0) lastTs = ts
    const delta = ts - lastTs
    lastTs = ts

    // Cap accumulation to avoid spiral-of-death on tab focus restore
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
