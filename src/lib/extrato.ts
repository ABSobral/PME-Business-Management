// Leitura de extratos bancários exportados pelos bancos (CSV, TSV, texto copiado do Excel; o XLSX passa
// primeiro a CSV na página Banco). Cada banco exporta à sua maneira: aqui descobre-se o separador, a linha de
// cabeçalho e que coluna é a data, o descritivo, o valor (ou débito e crédito separados) e o saldo.
// Uma linha com data ou valor impossível (31/02/2026, "abc") é posta de parte com o motivo; as outras entram.

export type LinhaExtrato = { data: string; valor: number; descritivo: string; saldo: number | null }

const semAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** "1.234,56", "-1 234,56", "1234.56", "(12,30)", "12,30 €", "12,30-" → número; null se não for um número */
export function numeroPT(v: unknown): number | null {
  let s = String(v ?? '').trim().replace(/[€\s ]/g, '').replace(/[\u2212\u2013]/g, '-')
  if (!s || /^[-+.,]*$/.test(s)) return null
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1) }
  if (/^[-+]/.test(s)) { neg = s[0] === '-'; s = s.slice(1) }
  if (!/^[\d.,]+$/.test(s)) return null
  const ultVirg = s.lastIndexOf(','), ultPonto = s.lastIndexOf('.')
  if (ultVirg >= 0 && ultPonto >= 0) s = ultVirg > ultPonto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  // só vírgulas: uma vírgula com 1 ou 2 casas é decimal (12,5 / 12,50); o resto são milhares (1,234 / 1,234,567)
  else if (ultVirg >= 0) s = (s.split(',').length === 2 && /,\d{1,2}$/.test(s)) ? s.replace(',', '.') : s.replace(/,/g, '')
  // só pontos: um ponto com 1 ou 2 casas é decimal (12.50); com 3 casas ou vários pontos são milhares à portuguesa (1.234)
  else if (ultPonto >= 0 && !(s.split('.').length === 2 && /\.\d{1,2}$/.test(s))) s = s.replace(/\./g, '')
  const n = Number(s); if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

/** "31-12-2025", "31/12/2025", "2025-12-31", "31.12.25", "20251231" → "2025-12-31"; null se não for uma data */
export function dataPT(v: unknown): string | null {
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/)
  if (m) return valida(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T].*)?$/)
  if (m) { const a = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return valida(a, +m[2], +m[1]) }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return valida(+m[1], +m[2], +m[3])
  return null
}
function valida(a: number, me: number, d: number): string | null {
  if (a < 1990 || a > 2100 || me < 1 || me > 12 || d < 1 || d > 31) return null
  if (new Date(a, me - 1, d).getDate() !== d) return null // 31/02 e afins
  return `${a}-${String(me).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Divide uma linha CSV respeitando aspas */
export function dividir(linha: string, sep: string): string[] {
  const out: string[] = []; let cur = ''; let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (c === '"') { if (aspas && linha[i + 1] === '"') { cur += '"'; i++ } else aspas = !aspas }
    else if (c === sep && !aspas) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur); return out.map(x => x.trim())
}

function separador(linhas: string[]): string {
  const cands = ['\t', ';', ',', '|']
  let melhor = ';', score = -1
  for (const s of cands) {
    const contagens = linhas.map(l => dividir(l, s).length).filter(n => n > 1)
    if (contagens.length < 2) continue
    const moda = contagens.sort((a, b) => a - b)[Math.floor(contagens.length / 2)]
    const sc = contagens.filter(n => n === moda).length * moda
    if (sc > score) { score = sc; melhor = s }
  }
  return melhor
}

type Mapa = { data: number; desc: number[]; valor?: number; debito?: number; credito?: number; saldo?: number; dataValor?: number }

const eData = (c: string) => /^(data|date|dt)\b/.test(c) || /^data/.test(c) || /data (mov|lan|oper|valor|contab)/.test(c)
const eDesc = (c: string) => /descri|descritivo|description|detalhe|historico|movimento|narrativa|designacao|memo|conceito|operacao|transacao|comunicacao/.test(c)
const eDebito = (c: string) => /^(debito|debit|debitos|saida|saidas|a debito|montante debito|valor debito)/.test(c) || /debito/.test(c) && !/credito/.test(c)
const eCredito = (c: string) => /^(credito|credit|creditos|entrada|entradas|a credito|montante credito|valor credito)/.test(c) || /credito/.test(c) && !/debito/.test(c)
const eValor = (c: string) => /^(valor|montante|importancia|amount|quantia|valor \(eur\)|montante \(eur\)|valor eur|montante eur)/.test(c) && !/saldo|debito|credito|data/.test(c)
const eSaldo = (c: string) => /saldo|balance/.test(c) && !/data/.test(c)

function mapear(cab: string[]): Mapa | null {
  const cs = cab.map(semAcentos)
  const datas = cs.map((c, i) => eData(c) ? i : -1).filter(i => i >= 0)
  if (!datas.length) return null
  // data do movimento primeiro; a data valor fica como alternativa
  const dataValor = datas.find(i => /valor/.test(cs[i]))
  const data = datas.find(i => !/valor/.test(cs[i])) ?? datas[0]
  const valor = cs.findIndex(eValor); const debito = cs.findIndex(eDebito); const credito = cs.findIndex(eCredito); const saldo = cs.findIndex(eSaldo)
  if (valor < 0 && (debito < 0 || credito < 0)) return null
  const usados = new Set([data, dataValor, valor, debito, credito, saldo].filter(i => i != null && i >= 0) as number[])
  let desc = cs.map((c, i) => eDesc(c) && !usados.has(i) ? i : -1).filter(i => i >= 0)
  if (!desc.length) desc = cs.map((_, i) => usados.has(i) ? -1 : i).filter(i => i >= 0)
  return { data, dataValor: dataValor != null && dataValor !== data ? dataValor : undefined, desc, valor: valor >= 0 ? valor : undefined, debito: debito >= 0 ? debito : undefined, credito: credito >= 0 ? credito : undefined, saldo: saldo >= 0 ? saldo : undefined }
}

/** Sem cabeçalho reconhecível: descobre as colunas pelo conteúdo (datas, números) */
function adivinhar(linhas: string[][]): Mapa | null {
  const n = Math.max(...linhas.map(l => l.length)); if (n < 3) return null
  const amostra = linhas.slice(0, 40)
  const pct = (f: (c: string) => boolean, i: number) => amostra.filter(l => f(l[i] ?? '')).length / amostra.length
  const datas = [...Array(n).keys()].filter(i => pct(c => !!dataPT(c), i) > 0.7)
  if (!datas.length) return null
  // coluna numérica: quase tudo o que lá está preenchido é número (débito e crédito têm muitos vazios)
  const nums = [...Array(n).keys()].filter(i => { if (datas.includes(i)) return false; const cheias = amostra.map(l => (l[i] ?? '').trim()).filter(Boolean); return cheias.length >= Math.max(1, amostra.length * 0.15) && cheias.filter(c => numeroPT(c) != null).length / cheias.length >= 0.9 })
  if (!nums.length) return null
  const texto = [...Array(n).keys()].filter(i => !datas.includes(i) && !nums.includes(i) && pct(c => c.trim().length > 2 && numeroPT(c) == null, i) > 0.5)
  if (!texto.length) return null
  // dois números com muitos vazios: débito e crédito; o último número preenchido em todas as linhas: saldo
  const cheios = nums.filter(i => pct(c => numeroPT(c) != null, i) > 0.95)
  const parciais = nums.filter(i => !cheios.includes(i))
  if (parciais.length >= 2) {
    // a coluna com mais valores negativos ou que aparece primeiro é o débito
    const [a, b] = parciais
    return { data: datas[0], dataValor: datas[1], desc: texto, debito: a, credito: b, saldo: cheios[cheios.length - 1] }
  }
  if (cheios.length >= 1) return { data: datas[0], dataValor: datas[1], desc: texto, valor: cheios[0], saldo: cheios.length > 1 ? cheios[cheios.length - 1] : undefined }
  return null
}

export type Rejeitada = { linha: number; texto: string; motivo: string }
export type ResultadoExtrato = { linhas: LinhaExtrato[]; ignoradas: number; rejeitadas: Rejeitada[]; aviso: string | null }

/** Lê o texto de um extrato (CSV, TSV ou colado do Excel). Devolve as linhas que percebeu. */
export function lerExtrato(texto: string): ResultadoExtrato {
  const brutas = texto.replace(/\r/g, '').split('\n').map(l => l.replace(/ /g, ' ')).filter(l => l.trim())
  if (brutas.length < 2) return { linhas: [], ignoradas: brutas.length, rejeitadas: [], aviso: 'O ficheiro não tem linhas suficientes.' }
  const sep = separador(brutas)
  const tabela = brutas.map(l => dividir(l, sep))
  // cabeçalho: a primeira linha com uma coluna de data e uma de valor; os bancos põem metadados antes
  let mapa: Mapa | null = null; let inicio = 0
  for (let i = 0; i < Math.min(tabela.length - 1, 30); i++) { const m = mapear(tabela[i]); if (m) { mapa = m; inicio = i + 1; break } }
  if (!mapa) { mapa = adivinhar(tabela.filter(l => l.length >= 3)); inicio = 0 }
  if (!mapa) return { linhas: [], ignoradas: brutas.length, rejeitadas: [], aviso: 'Não reconheci as colunas do ficheiro (data, descritivo e valor).' }
  const linhas: LinhaExtrato[] = []; let ignoradas = 0
  const rejeitadas: Rejeitada[] = []
  const pareceMovimento = (l: string[]) => l.filter(c => c.trim()).length >= 2 && l.some(c => /\d/.test(c))
  tabela.slice(inicio).forEach((l, i) => {
    const n = inicio + i + 1
    const texto = l.join(' | ').slice(0, 160)
    const bruta = (l[mapa!.data] ?? '').trim()
    const data = dataPT(l[mapa!.data]) ?? (mapa!.dataValor != null ? dataPT(l[mapa!.dataValor]) : null)
    if (!data) {
      // linhas de totais, saldos ou rodapé (sem data nenhuma) ignoram-se; uma data que existe mas é impossível é rejeitada
      if (bruta && /\d/.test(bruta) && pareceMovimento(l)) rejeitadas.push({ linha: n, texto, motivo: `Data inválida: "${bruta}"` })
      else ignoradas++
      return
    }
    let valor: number | null = null
    if (mapa!.valor != null) valor = numeroPT(l[mapa!.valor])
    if (valor == null && mapa!.debito != null && mapa!.credito != null) {
      const d = numeroPT(l[mapa!.debito]), c = numeroPT(l[mapa!.credito])
      if (d != null && d !== 0) valor = -Math.abs(d); else if (c != null && c !== 0) valor = Math.abs(c); else if (d === 0 || c === 0) valor = 0
    }
    if (valor == null) {
      const v = [mapa!.valor, mapa!.debito, mapa!.credito].filter(x => x != null).map(x => (l[x!] ?? '').trim()).filter(Boolean).join(' / ')
      rejeitadas.push({ linha: n, texto, motivo: v ? `Valor inválido: "${v}"` : 'Sem valor' })
      return
    }
    const descritivo = mapa!.desc.map(i => l[i] ?? '').filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim().slice(0, 500)
    const saldo = mapa!.saldo != null ? numeroPT(l[mapa!.saldo]) : null
    linhas.push({ data, valor: Math.round(valor * 100) / 100, descritivo, saldo })
  })
  // alguns bancos exportam do mais recente para o mais antigo: fica por ordem cronológica
  if (linhas.length > 1 && linhas[0].data > linhas[linhas.length - 1].data) linhas.reverse()
  const aviso = linhas.length && !linhas.some(x => x.valor < 0) && !linhas.some(x => x.valor > 0) ? 'Todos os valores vieram a zero: confirme as colunas.' : null
  return { linhas, ignoradas, rejeitadas, aviso }
}

/** impressão digital de uma linha importada: a mesma linha no mesmo ficheiro ou noutro não entra duas vezes
 *  (n conta linhas iguais no mesmo extrato, por exemplo duas compras iguais no mesmo dia) */
export async function hashLinha(l: LinhaExtrato, n: number) {
  const k = `extrato|${l.data}|${l.valor.toFixed(2)}|${l.descritivo.toLowerCase().replace(/\s+/g, ' ')}|${n}`
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k))
  return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

/** marca cada linha com a sua impressão digital (repetidas no mesmo ficheiro contam 1, 2, 3...) */
export async function comHash(linhas: LinhaExtrato[]) {
  const vistos = new Map<string, number>()
  const out: (LinhaExtrato & { hash: string })[] = []
  for (const l of linhas) {
    const k = `${l.data}|${l.valor}|${l.descritivo}`; const n = (vistos.get(k) ?? 0) + 1; vistos.set(k, n)
    out.push({ ...l, hash: await hashLinha(l, n) })
  }
  return out
}

/** CSV à portuguesa (separador ";", vírgula decimal, com BOM para o Excel abrir bem os acentos) */
export function paraCSV(cabecalho: string[], linhas: (string | number | null)[][]) {
  const cel = (v: string | number | null) => {
    if (v == null) return ''
    const s = typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v)
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '\ufeff' + [cabecalho, ...linhas].map(l => l.map(cel).join(';')).join('\r\n') + '\r\n'
}

/** Folha de cálculo (XLSX ou XLS) para texto com ";" que o lerExtrato percebe. Recebe o módulo xlsx (SheetJS),
 *  carregado só quando é preciso. As datas do Excel saem como dia/mês/ano. */
type ModuloXlsx = {
  read: (d: ArrayBuffer | Uint8Array, o: Record<string, unknown>) => { SheetNames: string[]; Sheets: Record<string, unknown> }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  utils: { sheet_to_csv: (s: any, o: Record<string, unknown>) => string }
}
export function xlsxParaTexto(XLSX: ModuloXlsx, dados: ArrayBuffer | Uint8Array) {
  const wb = XLSX.read(dados, { type: 'array', cellDates: true, dateNF: 'dd/mm/yyyy' })
  // a primeira folha com conteúdo
  for (const nome of wb.SheetNames) {
    const t = XLSX.utils.sheet_to_csv(wb.Sheets[nome], { FS: ';', blankrows: false, dateNF: 'dd/mm/yyyy' })
    if (t.trim()) return t
  }
  return ''
}
