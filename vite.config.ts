import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        live: path.resolve(__dirname, 'live.html'),
        control: path.resolve(__dirname, 'control.html'),
      },
    },
  },
  server: {
    port: 9210,
  },
  preview: {
    port: 9210,
  },
  plugins: [
    {
      name: 'route-rewrite',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url) {
            const [urlPath, qs] = req.url.split('?') as [string, string | undefined]
            const suffix = qs !== undefined ? `?${qs}` : ''
            if (urlPath === '/live') req.url = `/live.html${suffix}`
            else if (urlPath === '/control') req.url = `/control.html${suffix}`
          }
          next()
        })
      },
    },
  ],
})
