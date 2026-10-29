import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Versão desta construção: data e hora (UTC) e o commit do git (ou 6 caracteres ao acaso, fora do git).
// Vai para dentro da app (__VERSAO__) e para dist/versao.json; a app compara as duas para avisar quando há uma nova.
function commit() {
  try { return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return randomBytes(3).toString('hex') }
}
const VERSAO = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}-${commit()}`

function versao(): Plugin {
  const corpo = JSON.stringify({ versao: VERSAO }) + '\n'
  return {
    name: 'versao',
    // em npm run dev também responde a /versao.json
    configureServer(s) { s.middlewares.use('/versao.json', (_req, res) => { res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(corpo) }) },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'versao.json', source: corpo }) },
  }
}

// a app é pequena e sem rotas pesadas: um só ficheiro JS chega (o leitor de Excel só carrega quando é preciso)
export default defineConfig({
  plugins: [react(), tailwindcss(), versao()],
  define: { __VERSAO__: JSON.stringify(VERSAO) },
  build: { chunkSizeWarningLimit: 700 },
})
