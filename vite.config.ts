import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws':  { target: 'http://localhost:8080', ws: true },
      '/rezka': { target: 'http://localhost:8081', rewrite: (p) => p.replace(/^\/rezka/, '') },
    },
  },
})
