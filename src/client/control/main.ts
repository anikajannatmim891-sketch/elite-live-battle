import type { MaterialProfile } from '../shared/types'

// BroadcastChannel for communicating with /live page
const bc = new BroadcastChannel('elite-live-battle')

function init(): void {
  const el = document.getElementById('status-output')
  if (el) el.textContent = `ready — ${new Date().toISOString()}`

  // Wire up material buttons
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-material]')
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset['material'] as MaterialProfile | 'AUTO'
      bc.postMessage({ type: 'material', value: m === 'AUTO' ? null : m })
      // Visual feedback
      buttons.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })
}

document.addEventListener('DOMContentLoaded', init)
