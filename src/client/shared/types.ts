export type TeamId = 'GOLD' | 'RED' | 'CYAN' | 'VIOLET' | 'EMERALD' | 'MAGENTA'

export type Phase = 'PREPARE' | 'ACTIVE' | 'ESCALATION' | 'WINNER' | 'RESET'

export interface Contestant {
  id: number
  team: TeamId
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  mass: number
  alive: boolean
}

export interface SimState {
  tick: number
  phase: Phase
  round: number
  boundaryRadius: number
  fullBoundaryRadius: number
  phaseTicksRemaining: number
  contestants: Contestant[]
  winnerTeam: TeamId | null
}

export interface HealthResponse {
  status: 'ok' | 'error'
  timestamp: number
  uptime: number
}
