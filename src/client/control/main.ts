function init(): void {
  const el = document.getElementById('status-output')
  if (!el) return
  el.textContent = `ready — ${new Date().toISOString()}`
}

document.addEventListener('DOMContentLoaded', init)
