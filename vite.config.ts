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
          if (req.url === '/live') req.url = '/live.html'
          else if (req.url === '/control') req.url = '/control.html'
          next()
        })
      },
    },
  ],
})
