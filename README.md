# Elite Live Battle Engine

Autonomous procedural battle simulator for YouTube livestreaming via Chromium + FFmpeg.

## Requirements

- Node.js 20+

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:9210/live or http://localhost:9210/control

## Routes

| Route | Description |
|---|---|
| `/live` | Broadcast canvas (1920×1080) |
| `/control` | Administration panel |
| `/api/health` | Runtime health JSON |

## Scripts

```bash
npm run dev        # Vite dev server
npm run build      # Build frontend + compile server
npm run typecheck  # TypeScript check (no emit)
npm run test       # (no tests yet)
npm start          # Production server (requires build first)
```

## Production

```bash
npm run build
npm start
```

Server runs at http://localhost:9210
