import type { SimState, TeamId } from '../shared/types'

const W = 1920
const H = 1080
const CX = W / 2
const CY = H / 2

const TEAM_COLORS: Record<TeamId, string> = {
  GOLD:    '#FFD700',
  RED:     '#FF2233',
  CYAN:    '#00FFEE',
  VIOLET:  '#CC00FF',
  EMERALD: '#00FF88',
  MAGENTA: '#FF00AA',
}

export function render(ctx: CanvasRenderingContext2D, state: SimState): void {
  // Background
  ctx.fillStyle = '#080808'
  ctx.fillRect(0, 0, W, H)

  // Arena boundary circle
  ctx.beginPath()
  ctx.arc(CX, CY, state.boundaryRadius, 0, Math.PI * 2)
  ctx.strokeStyle = state.phase === 'ESCALATION' ? '#553300' : '#2a2a2a'
  ctx.lineWidth = 3
  ctx.stroke()

  // Draw shrinking ring indicator during escalation
  if (state.phase === 'ESCALATION') {
    ctx.beginPath()
    ctx.arc(CX, CY, state.boundaryRadius, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 80, 0, 0.25)'
    ctx.lineWidth = 8
    ctx.stroke()
  }

  // Contestants
  for (let i = 0; i < state.contestants.length; i++) {
    const c = state.contestants[i]
    if (!c.alive) continue
    ctx.beginPath()
    ctx.arc(CX + c.x, CY + c.y, c.radius, 0, Math.PI * 2)
    ctx.fillStyle = TEAM_COLORS[c.team]
    ctx.fill()
  }

  // Count alive contestants
  let aliveCount = 0
  for (let i = 0; i < state.contestants.length; i++) {
    if (state.contestants[i].alive) aliveCount++
  }

  // HUD — top left
  ctx.fillStyle = '#cccccc'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  ctx.font = 'bold 30px monospace'
  ctx.fillText('ELITE LIVE BATTLE', 28, 22)

  ctx.font = '22px monospace'
  ctx.fillText(`ROUND ${state.round}`, 28, 60)
  ctx.fillText('CIRCLE SURVIVAL', 28, 88)

  const sec = Math.floor(state.tick / 60)
  ctx.fillText(`${sec}s`, 28, 116)
  ctx.fillText(`${aliveCount} remaining`, 28, 144)

  // Phase — top right
  ctx.textAlign = 'right'
  ctx.fillStyle = '#666666'
  ctx.font = '20px monospace'
  ctx.fillText(state.phase, W - 28, 22)

  // Winner banner
  if (state.phase === 'WINNER' && state.winnerTeam !== null) {
    const color = TEAM_COLORS[state.winnerTeam]
    ctx.textAlign = 'center'
    ctx.font = 'bold 90px monospace'
    ctx.fillStyle = color
    ctx.fillText(`${state.winnerTeam} WINS`, CX, CY - 50)
  }
}
