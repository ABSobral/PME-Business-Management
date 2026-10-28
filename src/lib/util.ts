import { CONFIG } from '../config'

// moeda atual (vem das Definições); as funções de formatação usam-na por omissão
let moedaAtual = CONFIG.moedaPadrao
export const definirMoeda = (m: string) => { moedaAtual = /^[A-Z]{3}$/.test(m) ? m : CONFIG.moedaPadrao }

const formatos = new Map<string, Intl.NumberFormat>()
function formato(moeda: string, casas: number) {
  const k = moeda + casas
  if (!formatos.has(k)) {
    try { formatos.set(k, new Intl.NumberFormat(CONFIG.idioma, { style: 'currency', currency: moeda, minimumFractionDigits: casas, maximumFractionDigits: casas })) }
    catch { formatos.set(k, new Intl.NumberFormat(CONFIG.idioma, { minimumFractionDigits: casas, maximumFractionDigits: casas })) }
  }
  return formatos.get(k)!
}
// valor arredondado à unidade (listas e totais rápidos)
export const dinheiro = (v: number | null | undefined, moeda = moedaAtual) => formato(moeda, 0).format(v ?? 0)
// com cêntimos quando os há (propostas)
export const dinheiro2 = (v: number | null | undefined, moeda = moedaAtual) => formato(moeda, (v ?? 0) % 1 ? 2 : 0).format(v ?? 0)

/** "1.234,56", "1 234,56", "1234.56", "12,30 €", "-5" → número; null se não for um número */
export function numeroPT(v: unknown): number | null {
  let s = String(v ?? '').trim().replace(/[€$£\s ]/g, '').replace(/[−–]/g, '-')
  if (!s || /^[-+.,]*$/.test(s)) return null
  let neg = false
  if (/^[-+]/.test(s)) { neg = s[0] === '-'; s = s.slice(1) }
  if (!/^[\d.,]+$/.test(s)) return null
  const ultVirg = s.lastIndexOf(','), ultPonto = s.lastIndexOf('.')
  if (ultVirg >= 0 && ultPonto >= 0) s = ultVirg > ultPonto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  // só vírgulas: uma vírgula com 1 ou 2 casas é decimal (12,5); o resto são milhares (1,234)
  else if (ultVirg >= 0) s = s.split(',').length === 2 && /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '')
  // só pontos: um ponto com 1 ou 2 casas é decimal (12.50); com 3 casas são milhares (1.234)
  else if (ultPonto >= 0 && !(s.split('.').length === 2 && /\.\d{1,2}$/.test(s))) s = s.replace(/\./g, '')
  const n = Number(s); if (!Number.isFinite(n)) return null
  return neg ? -n : n
}
// vazio dá null; texto que não é número dá NaN (usa valorInvalido para avisar)
export const numOuNulo = (s: string | null | undefined) => (!s || String(s).trim() === '' ? null : numeroPT(s) ?? NaN)
export const valorInvalido = (...vs: (number | null)[]) => vs.some(v => v != null && (!Number.isFinite(v) || v < 0))

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export function isoDia(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const hoje = () => isoDia(new Date())
export function somaDias(iso: string, n: number) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDia(d) }
export function diasAte(iso: string) { return Math.round((new Date(iso.slice(0, 10) + 'T12:00:00').getTime() - new Date(hoje() + 'T12:00:00').getTime()) / 864e5) }
const paraData = (iso: string) => new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso)

export function dataCurta(iso: string | null | undefined) {
  if (!iso) return ''
  const d = paraData(iso)
  const ano = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''
  return `${d.getDate()} ${MES[d.getMonth()]}${ano}`
}
export const dataComDia = (iso: string) => `${DIA_SEMANA[paraData(iso).getDay()]}, ${dataCurta(iso)}`
export const dataLonga = (iso: string) => new Intl.DateTimeFormat(CONFIG.idioma, { day: 'numeric', month: 'long', year: 'numeric' }).format(paraData(iso))
export function hora(iso: string) { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

export function relativo(iso: string | null | undefined) {
  if (!iso) return 'nunca'
  const n = diasAte(isoDia(paraData(iso)))
  if (n === 0) return 'hoje'
  if (n === -1) return 'ontem'
  if (n === 1) return 'amanhã'
  return n < 0 ? `há ${-n} dias` : `daqui a ${n} dias`
}
// "2026-10-29T17:00" na hora local, para inputs datetime-local
export function paraInputHora(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${isoDia(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')
// para procurar sem ligar a acentos, maiúsculas ou pontuação ("José-Maria" encontra "jose maria")
export const normaliza = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`´.,;:\-_/()]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
export const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
export const numeroLimpo = (t: string) => t.replace(/[^\d+]/g, '')
// números portugueses de 9 dígitos ganham o indicativo 351 para o WhatsApp
export const numeroWhatsapp = (t: string) => numeroLimpo(t).replace(/^\+/, '').replace(/^00/, '').replace(/^([29]\d{8})$/, '351$1')
