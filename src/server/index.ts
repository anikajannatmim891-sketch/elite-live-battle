import http from 'http'
import fs from 'fs'
import path from 'path'

const PORT = 9210
// dist/server/index.js at runtime → resolve '..' to reach dist/
const DIST = path.resolve(__dirname, '..')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
}

function resolveSafePath(urlPath: string): string {
  const segments = urlPath
    .split('/')
    .filter(s => s.length > 0 && s !== '..' && s !== '.')
  return segments.length > 0 ? path.join(DIST, ...segments) : DIST
}

function serveFile(res: http.ServerResponse, filePath: string): void {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
      return
    }
    const mime = MIME[path.extname(filePath)] ?? 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': mime })
    res.end(data)
  })
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    res.end('Method not allowed')
    return
  }

  const urlPath = (req.url ?? '/').split('?')[0]

  if (urlPath === '/api/health') {
    const body = JSON.stringify({
      status: 'ok',
      timestamp: Date.now(),
      uptime: Math.floor(process.uptime()),
    })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(body)
    return
  }

  if (urlPath === '/' || urlPath === '/live' || urlPath === '/live/') {
    serveFile(res, path.join(DIST, 'live.html'))
    return
  }

  if (urlPath === '/control' || urlPath === '/control/') {
    serveFile(res, path.join(DIST, 'control.html'))
    return
  }

  serveFile(res, resolveSafePath(urlPath))
})

server.listen(PORT, () => {
  console.log(`[elb] http://localhost:${PORT}`)
  console.log(`[elb] routes: /live  /control  /api/health`)
})

process.on('uncaughtException', (err: Error) => {
  console.error('[elb] uncaughtException:', err.message)
})
