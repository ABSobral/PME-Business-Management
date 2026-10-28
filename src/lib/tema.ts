import { CONFIG } from '../config'

export type Marca = { nome: string; cor: string; logo_url: string | null }
const CHAVE = 'gestao-marca'

const hexValido = (c: string | null | undefined) => !!c && /^#[0-9a-f]{6}$/i.test(c)

// texto branco ou escuro por cima da cor principal, conforme o contraste
export function textoSobre(cor: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(cor.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return l > 0.45 ? '#1c1917' : '#ffffff'
}

// aplica a cor e o nome do negócio à página toda
export function aplicarMarca(m: Partial<Marca>, guardar = true) {
  const cor = hexValido(m.cor) ? m.cor! : CONFIG.corPadrao
  const raiz = document.documentElement
  raiz.style.setProperty('--marca', cor)
  raiz.style.setProperty('--marca-texto', textoSobre(cor))
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cor)
  if (m.nome) document.title = m.nome
  if (guardar) { try { localStorage.setItem(CHAVE, JSON.stringify({ nome: m.nome, cor, logo_url: m.logo_url ?? null })) } catch { /* sem armazenamento */ } }
}

// a última marca vista neste browser, para o ecrã de entrada já ter as cores certas
export function marcaGuardada(): Marca {
  try {
    const m = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Partial<Marca> | null
    if (m) return { nome: m.nome || CONFIG.nomeApp, cor: hexValido(m.cor) ? m.cor! : CONFIG.corPadrao, logo_url: m.logo_url ?? null }
  } catch { /* sem armazenamento */ }
  return { nome: CONFIG.nomeApp, cor: CONFIG.corPadrao, logo_url: null }
}
