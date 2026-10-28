import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// a app é pequena e sem rotas pesadas: um só ficheiro JS (cerca de 145 kB com gzip) chega
export default defineConfig({ plugins: [react(), tailwindcss()], build: { chunkSizeWarningLimit: 700 } })
