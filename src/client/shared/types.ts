export interface SimState {
  tick: number
}

export interface HealthResponse {
  status: 'ok' | 'error'
  timestamp: number
  uptime: number
}
