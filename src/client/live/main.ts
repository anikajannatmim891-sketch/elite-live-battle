const LOGICAL_W = 1920
const LOGICAL_H = 1080

function resize(canvas: HTMLCanvasElement): void {
  const scale = Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H)
  canvas.style.width = `${Math.floor(LOGICAL_W * scale)}px`
  canvas.style.height = `${Math.floor(LOGICAL_H * scale)}px`
}

function render(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)

  ctx.fillStyle = '#39ff14'
  ctx.font = 'bold 56px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('ELITE LIVE BATTLE ENGINE', LOGICAL_W / 2, LOGICAL_H / 2 - 30)

  ctx.fillStyle = '#444'
  ctx.font = '24px monospace'
  ctx.fillText('1920 × 1080 — simulation not yet initialized', LOGICAL_W / 2, LOGICAL_H / 2 + 30)
}

function init(): void {
  const canvas = document.getElementById('battle') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  canvas.width = LOGICAL_W
  canvas.height = LOGICAL_H

  window.addEventListener('resize', () => resize(canvas))
  resize(canvas)
  render(ctx)
}

document.addEventListener('DOMContentLoaded', init)
