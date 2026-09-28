import type { MaterialProfile } from '../shared/types'

// BroadcastChannel for communicating with /live page
const bc = new BroadcastChannel('elite-live-battle')

interface StandingsRow {
  team: string
  sessionPoints: number
  roundWins: number
}

function init(): void {
  const statusEl = document.getElementById('status-output')
  if (statusEl) statusEl.textContent = `ready — ${new Date().toISOString()}`

  const sessionIdEl   = document.getElementById('session-id')
  const sessionSeedEl = document.getElementById('session-seed')
  const standingsEl   = document.getElementById('standings-output')

  // Wire up material buttons
  const matButtons = document.querySelectorAll<HTMLButtonElement>('[data-material]')
  matButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset['material'] as MaterialProfile | 'AUTO'
      bc.postMessage({ type: 'material', value: m === 'AUTO' ? null : m })
      matButtons.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })

  // Generate new session button
  const newSessionBtn = document.getElementById('btn-new-session')
  if (newSessionBtn) {
    newSessionBtn.addEventListener('click', () => {
      bc.postMessage({ type: 'newSession' })
      if (statusEl) statusEl.textContent = `new session requested — ${new Date().toISOString()}`
    })
  }

  // Copy seed button
  const copySeedBtn = document.getElementById('btn-copy-seed')
  if (copySeedBtn) {
    copySeedBtn.addEventListener('click', () => {
      const seed = sessionSeedEl?.textContent ?? ''
      if (seed && navigator.clipboard) {
        navigator.clipboard.writeText(seed).catch(() => {/* ignore */})
      }
      if (statusEl) statusEl.textContent = `seed text shown above — select to copy`
    })
  }

  // Listen for messages from /live
  bc.addEventListener('message', (ev) => {
    const data = ev.data as { type: string; [k: string]: unknown }
    if (data.type === 'session') {
      if (sessionIdEl)   sessionIdEl.textContent   = String(data['sessionId'] ?? '')
      if (sessionSeedEl) sessionSeedEl.textContent = String(data['sessionSeed'] ?? '')
    }
    if (data.type === 'standings') {
      if (sessionIdEl)   sessionIdEl.textContent   = String(data['sessionId'] ?? '')
      if (sessionSeedEl) sessionSeedEl.textContent = String(data['sessionSeed'] ?? '')
      if (standingsEl) {
        const rows = data['standings'] as StandingsRow[]
        standingsEl.innerHTML = rows.map((r, i) =>
          `<div class="standing-row"><span class="pos">${i + 1}</span><span class="team ${r.team.toLowerCase()}">${r.team}</span><span class="pts">${r.sessionPoints}</span><span class="wins">${r.roundWins}W</span></div>`
        ).join('')
      }
    }
  })
}

document.addEventListener('DOMContentLoaded', init)
