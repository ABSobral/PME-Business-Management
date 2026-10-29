// Cliente da API do Enable Banking (open banking PSD2): JWT assinado com a chave privada da aplicação (RS256).
// O fetch é injetável para os testes (tests/funcoes/banco_test.ts usa um servidor simulado).
import * as jose from "npm:jose@5.10.0";

export const API_EB = "https://api.enablebanking.com";
type Fetch = typeof fetch;

export type Banco = { nome: string; pais: string; logo: string | null; psu_types: string[]; dias: number | null }
export type Conta = { uid: string; iban: string | null; nome: string | null; moeda: string | null }
export type Transacao = {
  entry_reference?: string; transaction_id?: string; status?: string; credit_debit_indicator?: "CRDT" | "DBIT"
  transaction_amount?: { amount: string; currency?: string }; booking_date?: string; value_date?: string
  remittance_information?: string[]; creditor?: { name?: string }; debtor?: { name?: string }; bank_transaction_code?: { description?: string }
  balance_after_transaction?: { balance_amount?: { amount: string } }
}

export class ErroBanco extends Error {
  constructor(public estado: number, mensagem: string) { super(mensagem) }
  /** o consentimento acabou ou foi retirado: é preciso voltar a ligar */
  get expirou() { return this.estado === 401 || this.estado === 403 || /expired|revoked|invalid session|session.*(not|no longer)/i.test(this.message) }
  /** limite de leituras automáticas do banco (4 por dia, por PSD2) */
  get limite() { return this.estado === 429 || /multiplicity|exceed|too many/i.test(this.message) }
}

export function criarCliente(o: { appId: string; pem: string; fetch?: Fetch; base?: string }) {
  const f = o.fetch ?? fetch
  const base = o.base ?? API_EB
  let cache: { token: string; exp: number } | null = null

  async function jwt() {
    if (cache && cache.exp - Date.now() / 1000 > 300) return cache.token
    let chave: CryptoKey
    try { chave = await jose.importPKCS8(o.pem.trim(), "RS256") as CryptoKey }
    catch { throw new ErroBanco(400, "A chave privada do Enable Banking não é válida. Carregue o ficheiro .pem da aplicação (começa por -----BEGIN PRIVATE KEY-----).") }
    const iat = Math.floor(Date.now() / 1000), exp = iat + 3600
    const token = await new jose.SignJWT({}).setProtectedHeader({ alg: "RS256", typ: "JWT", kid: o.appId })
      .setIssuer("enablebanking.com").setAudience("api.enablebanking.com").setIssuedAt(iat).setExpirationTime(exp).sign(chave)
    cache = { token, exp }
    return token
  }

  async function pedir<T = Record<string, unknown>>(caminho: string, init: RequestInit = {}): Promise<T> {
    const r = await f(base + caminho, { ...init, headers: { Authorization: "Bearer " + await jwt(), "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) } })
    const corpo = await r.json().catch(() => ({})) as Record<string, unknown>
    if (!r.ok) throw new ErroBanco(r.status, String(corpo.message ?? corpo.error ?? corpo.detail ?? `Enable Banking respondeu ${r.status}`))
    return corpo as T
  }

  return {
    jwt,
    async bancos(pais: string): Promise<Banco[]> {
      const r = await pedir<{ aspsps?: { name: string; country: string; logo?: string; psu_types?: string[]; maximum_consent_validity?: number }[] }>(`/aspsps?country=${encodeURIComponent(pais)}`)
      return (r.aspsps ?? []).map(a => ({ nome: a.name, pais: a.country, logo: a.logo ?? null, psu_types: a.psu_types ?? ["personal"], dias: a.maximum_consent_validity ? Math.floor(a.maximum_consent_validity / 86400) : null }))
    },
    async iniciar(p: { banco: string; pais: string; psu_type: string; state: string; redirect: string; dias: number }) {
      const r = await pedir<{ url: string }>("/auth", { method: "POST", body: JSON.stringify({
        access: { valid_until: new Date(Date.now() + p.dias * 86400_000).toISOString() },
        aspsp: { name: p.banco, country: p.pais }, state: p.state, redirect_url: p.redirect, psu_type: p.psu_type, language: "pt",
      }) })
      if (!r.url) throw new ErroBanco(502, "O Enable Banking não devolveu o endereço do banco.")
      return r.url
    },
    async sessao(code: string): Promise<{ session_id: string; valido_ate: string | null; contas: Conta[] }> {
      const s = await pedir<{ session_id: string; access?: { valid_until?: string }; accounts?: { uid: string; account_id?: { iban?: string }; name?: string; product?: string; currency?: string }[] }>("/sessions", { method: "POST", body: JSON.stringify({ code }) })
      return { session_id: s.session_id, valido_ate: s.access?.valid_until ?? null, contas: (s.accounts ?? []).map(a => ({ uid: a.uid, iban: a.account_id?.iban ?? null, nome: a.name ?? a.product ?? null, moeda: a.currency ?? null })) }
    },
    async saldo(conta: string, cab: Record<string, string> = {}): Promise<number | null> {
      const b = await pedir<{ balances?: { balance_type: string; balance_amount: { amount: string } }[] }>(`/accounts/${encodeURIComponent(conta)}/balances`, { headers: cab })
      const pref = (b.balances ?? []).find(x => ["CLBD", "ITAV", "XPCD", "ITBD", "CLAV"].includes(x.balance_type)) ?? b.balances?.[0]
      return pref ? Number(pref.balance_amount.amount) : null
    },
    /** todas as transações desde a data (segue as páginas com continuation_key) */
    async transacoes(conta: string, desde: string, cab: Record<string, string> = {}): Promise<Transacao[]> {
      const todas: Transacao[] = []; let chave: string | undefined; let paginas = 0
      do {
        const r = await pedir<{ transactions?: Transacao[]; continuation_key?: string }>(`/accounts/${encodeURIComponent(conta)}/transactions?date_from=${desde}${chave ? `&continuation_key=${encodeURIComponent(chave)}` : ""}`, { headers: cab })
        todas.push(...(r.transactions ?? []))
        chave = r.continuation_key || undefined
      } while (chave && ++paginas < 50)
      return todas
    },
    async terminar(sessao: string) { await pedir(`/sessions/${encodeURIComponent(sessao)}`, { method: "DELETE" }) },
  }
}
export type ClienteEB = ReturnType<typeof criarCliente>

export async function sha(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))
  return Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, "0")).join("").slice(0, 32)
}

/** descritivo legível: referência, quem pagou ou recebeu, tipo de operação */
export function descritivo(t: Transacao): string {
  const partes = [...(t.remittance_information ?? []), t.creditor?.name, t.debtor?.name, t.bank_transaction_code?.description]
    .filter((x): x is string => typeof x === "string" && !!x.trim()).map(s => s.trim())
  return [...new Set(partes)].join(" · ").slice(0, 240) || "Movimento"
}

/** transação do banco para a linha de app.movimentos (só as contabilizadas, "BOOK") */
export async function paraMovimento(t: Transacao, contaUid: string) {
  if (t.status && t.status !== "BOOK") return null
  const data = t.booking_date ?? t.value_date
  if (!data) return null
  const sinal = t.credit_debit_indicator === "DBIT" ? -1 : 1
  const valor = Math.round(sinal * Math.abs(Number(t.transaction_amount?.amount ?? 0)) * 100) / 100
  const desc = descritivo(t)
  const saldo = t.balance_after_transaction?.balance_amount?.amount
  return {
    data, valor, descritivo: desc, contraparte: (sinal < 0 ? t.creditor?.name : t.debtor?.name) ?? null,
    saldo: saldo != null ? Number(saldo) : null,
    hash: await sha(`${contaUid}|${t.entry_reference ?? t.transaction_id ?? ""}|${data}|${valor}|${desc}`),
  }
}
