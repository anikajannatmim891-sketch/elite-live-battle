# ELITE LIVE BATTLE ENGINE — Engineering Rules

## Project

**ELITE LIVE BATTLE ENGINE — Neon Color / Material Elimination**

An autonomous procedural battle simulator capable of running continuously for 12+ hours, broadcast directly from Linux through Chromium + FFmpeg to YouTube.

## Core Rules

- No prerecorded video
- No image backgrounds
- No copyrighted characters, logos, or brands
- Procedural graphics only — Canvas 2D first
- Fixed-step deterministic simulation
- Seeded PRNG; `Math.random` must not control gameplay
- Simulation runs at 60 TPS; render target 30 FPS
- Logical broadcast canvas: 1920 × 1080
- `/live` (broadcast view) and `/control` (admin) must remain separate pages
- Lightweight enough for ~2 vCPU / 4 GB RAM Linux EC2
- Avoid allocations in hot loops
- No unnecessary dependencies
- No page reload between rounds
- No accumulating timers or event listeners — long-session stability over visual complexity
- Do not rewrite working architecture without a demonstrated need
- Never claim something is working without running relevant validation

## Port

9210

## Tech Stack

- Vite + TypeScript
- HTML5 Canvas 2D
- Minimal Node `http` server (no Express)
- No React, Three.js, Remotion, Blender, game engines, video assets, or image backgrounds

## Directory Layout

```
src/client/live/       — /live page entry
src/client/control/    — /control page entry
src/client/shared/     — types shared between client pages
src/server/            — production Node http server
live.html              — Vite multi-page entry for /live
control.html           — Vite multi-page entry for /control
```

## Scripts

```bash
npm run dev         # Vite dev server, port 91210
npm run build       # vite build + tsc server compile
npm run typecheck   # tsc --noEmit both client and server
npm run test        # (placeholder until tests are added)
npm start           # production: node dist/server/index.js
```

## Out of Scope Until Later

YouTube API, RTMP, FFmpeg, Xvfb, systemd, YouTube chat, EC2 deployment, OBS, country flags.
