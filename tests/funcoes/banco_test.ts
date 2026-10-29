// Testes da função "banco" com o Enable Banking simulado (fetch substituído): nunca contacta o serviço real.
// Correr:  deno test -A --config supabase/functions/deno.json tests/funcoes/banco_test.ts
import { assert, assertEquals, assertMatch, assertRejects } from "jsr:@std/assert@1";
import * as jose from "npm:jose@5.10.0";
import { executar, type Ligacao, type NovoMovimento, type RepoBanco } from "../../supabase/functions/banco/acoes.ts";
import { paraMovimento } from "../../supabase/functions/banco/enable.ts";
import type { Membro } from "../../supabase/functions/_shared/comum.ts";

const APP = "11111111-2222-3333-4444-555555555555"
const admin: Membro = { email: "ana@exemplo.pt", nome: "Ana Silva", papel: "admin", acessos: [], ativo: true }
const comBanco: Membro = { email: "bruno@exemplo.pt", nome: "Bruno", papel: "membro", acessos: ["banco"], ativo: true }
const semBanco: Membro = { email: "rui@exemplo.pt", nome: "Rui", papel: "membro", acessos: ["email"], ativo: true }

class RepoMem implements RepoBanco {
  defs = { modulo_banco: true, banco_config: { app_id: APP, pais: "PT", redirect_url: "https://gestao.exemplo.pt/banco" } as Record<string, unknown> }
  pem: string | null = null
  ls: Ligacao[] = []
  ms: (NovoMovimento & { id: string } | { id: string; data: string; valor: number; descritivo: string; hash: string; origem: string; ligacao_id: string | null })[] = []
  async definicoes() { return this.defs }
  async chave() { return this.pem }
  async ligacoes() { return this.ls.map(l => ({ ...l })) }
  async criarLigacao(l: Partial<Ligacao>) {
    const n = { id: crypto.randomUUID(), banco: "", pais: "PT", psu_type: "business", estado: "pendente", session_id: null, conta_uid: null, iban: null, nome_conta: null, moeda: null, valido_ate: null, saldo_atual: null, saldo_em: null, ultima_sinc: null, ultimo_erro: null, criado_por: null, ...l } as Ligacao
    this.ls.push(n); return { ...n }
  }
  async atualizarLigacao(id: string, c: Partial<Ligacao>) { const l = this.ls.find(x => x.id === id); if (l) Object.assign(l, c) }
  async apagarLigacoes(ids: string[]) { this.ls = this.ls.filter(l => !ids.includes(l.id)); for (const m of this.ms) if (m.ligacao_id && ids.includes(m.ligacao_id)) m.ligacao_id = null }
  async ultimaData(id: string) { return this.ms.filter(m => m.ligacao_id === id).map(m => m.data).sort().pop() ?? null }
  async importadosDesde(d: string) { return this.ms.filter(m => m.origem !== "enablebanking" && m.data >= d).map(m => ({ id: m.id, data: m.data, valor: m.valor })) }
  async hashesExistentes(h: string[]) { return new Set(this.ms.filter(m => h.includes(m.hash)).map(m => m.hash)) }
  async inserirMovimentos(ms: NovoMovimento[]) { let n = 0; for (const m of ms) if (!this.ms.some(x => x.hash === m.hash)) { this.ms.push({ ...m, id: crypto.randomUUID() }); n++ } return n }
}

// ---- Enable Banking simulado ----
type Pedido = { metodo: string; caminho: string; corpo: unknown; jwt: jose.JWTPayload & { kid?: string } }
async function simulador(publica: CryptoKey) {
  const pedidos: Pedido[] = []
  const estado = {
    contas: [{ uid: "conta-1", account_id: { iban: "PT50000100000000000000001" }, name: "Conta à ordem", currency: "EUR" }] as Record<string, unknown>[],
    paginas: [] as Record<string, unknown>[][],
    falha: null as null | { status: number; corpo: Record<string, unknown> },
    validade: "2027-04-27T10:00:00Z",
    sessao: 0,
  }
  const f: typeof fetch = async (entrada, init) => {
    const url = new URL(String(entrada))
    assertEquals(url.origin, "https://api.enablebanking.com")
    const token = String((init?.headers as Record<string, string>).Authorization).replace("Bearer ", "")
    const { payload, protectedHeader } = await jose.jwtVerify(token, publica, { issuer: "enablebanking.com", audience: "api.enablebanking.com" })
    assertEquals([protectedHeader.alg, protectedHeader.kid], ["RS256", APP])
    const corpo = init?.body ? JSON.parse(String(init.body)) : null
    pedidos.push({ metodo: init?.method ?? "GET", caminho: url.pathname + url.search, corpo, jwt: { ...payload, kid: protectedHeader.kid } })
    const r = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } })
    if (estado.falha && url.pathname.startsWith("/accounts")) return r(estado.falha.corpo, estado.falha.status)
    if (url.pathname === "/aspsps") return r({ aspsps: [{ name: "Banco Exemplo", country: url.searchParams.get("country"), logo: "https://x/logo.png", psu_types: ["business", "personal"], maximum_consent_validity: 15552000 }, { name: "Outro Banco", country: "PT", psu_types: ["personal"] }] })
    if (url.pathname === "/auth") return r({ url: `https://banco.exemplo/autorizar?state=${corpo.state}`, authorization_id: "auth-1" })
    if (url.pathname === "/sessions" && init?.method === "POST") return r({ session_id: `sessao-${++estado.sessao}`, accounts: estado.contas, access: { valid_until: estado.validade } })
    if (url.pathname.startsWith("/sessions/") && init?.method === "DELETE") return r({})
    if (/\/accounts\/[^/]+\/balances$/.test(url.pathname)) return r({ balances: [{ balance_type: "CLBD", balance_amount: { amount: "1500.25", currency: "EUR" } }] })
    if (/\/accounts\/[^/]+\/transactions$/.test(url.pathname)) {
      const k = Number(url.searchParams.get("continuation_key") ?? 0)
      return r({ transactions: estado.paginas[k] ?? [], continuation_key: k + 1 < estado.paginas.length ? String(k + 1) : null })
    }
    return r({ message: "não encontrado" }, 404)
  }
  return { f, pedidos, estado }
}

async function chaves() {
  const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey))
  const b64 = btoa(String.fromCharCode(...pkcs8)).match(/.{1,64}/g)!.join("\n")
  return { pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`, publicKey }
}
const t = (ref: string, data: string, valor: string, ind: "CRDT" | "DBIT", extra: Record<string, unknown> = {}) =>
  ({ entry_reference: ref, booking_date: data, credit_debit_indicator: ind, status: "BOOK", transaction_amount: { amount: valor, currency: "EUR" }, remittance_information: [`Ref ${ref}`], ...extra })

Deno.test("banco: ligar, trazer movimentos por páginas, não repetir, erros, voltar a ligar, várias contas e desligar", async () => {
  const { pem, publicKey } = await chaves()
  const sim = await simulador(publicKey)
  const repo = new RepoMem()
  const ctx = (membro: Membro | null) => ({ repo, membro, fetch: sim.f })

  // sem chave: mensagem clara; chave inválida: mensagem clara
  await assertRejects(() => executar("bancos", {}, ctx(admin)), Error, "Falta a chave privada")
  repo.pem = "isto não é uma chave"
  await assertRejects(() => executar("bancos", {}, ctx(admin)), Error, "não é válida")
  repo.pem = pem

  // permissões
  await assertRejects(() => executar("sincronizar", {}, ctx(semBanco)), Error, "Não tem acesso ao banco")
  await assertRejects(() => executar("iniciar", { banco: "Banco Exemplo" }, ctx(comBanco)), Error, "administradores")
  assertEquals(await executar("configurado", {}, ctx(comBanco)), { app_id: true, chave: true })

  // lista de bancos do país
  const b = await executar("bancos", { pais: "ES" }, ctx(admin)) as { bancos: Record<string, unknown>[] }
  assertEquals(b.bancos[0], { nome: "Banco Exemplo", pais: "ES", logo: "https://x/logo.png", psu_types: ["business", "personal"], dias: 180 })
  assertEquals(sim.pedidos[0].caminho, "/aspsps?country=ES")

  // iniciar: cria a ligação pendente e devolve o endereço do banco; o state é o id da ligação
  const ini = await executar("iniciar", { banco: "Banco Exemplo", psu_type: "business", dias: 400 }, ctx(admin)) as { url: string }
  const pend = repo.ls[0]
  assertEquals(pend.estado, "pendente")
  assertMatch(ini.url, new RegExp(`state=${pend.id}`))
  const auth = sim.pedidos.find(p => p.caminho === "/auth")!.corpo as Record<string, any>
  assertEquals([auth.aspsp, auth.redirect_url, auth.psu_type, auth.state], [{ name: "Banco Exemplo", country: "PT" }, "https://gestao.exemplo.pt/banco", "business", pend.id])
  assert(new Date(auth.access.valid_until).getTime() - Date.now() < 181 * 86400_000, "consentimento no máximo 180 dias")

  // um movimento já importado de um extrato (mesma data e valor) não pode entrar repetido
  repo.ms.push({ id: "ext-1", data: "2026-10-02", valor: -12.5, descritivo: "PAPELARIA", hash: "e".repeat(32), origem: "extrato", ligacao_id: null })
  sim.estado.paginas = [
    [t("A1", "2026-10-01", "1234.56", "CRDT", { debtor: { name: "Cliente Lda" } }), t("A2", "2026-10-02", "12.50", "DBIT", { creditor: { name: "Papelaria" } })],
    [t("A3", "2026-10-03", "40.00", "DBIT", { creditor: { name: "Telecom" } }), { ...t("A4", "2026-10-04", "99.00", "DBIT"), status: "PDNG" }],
  ]
  await assertRejects(() => executar("concluir", { code: "abc", state: "outro" }, ctx(admin)), Error, "já não é válida")
  const c1 = await executar("concluir", { code: "abc", state: pend.id }, ctx(admin)) as { escolher: boolean; novos: number; saldo: number; valido_ate: string }
  assertEquals([c1.escolher, c1.novos, c1.saldo, c1.valido_ate], [false, 2, 1500.25, "2027-04-27T10:00:00Z"])
  const lig = repo.ls[0]
  assertEquals([lig.estado, lig.iban, lig.session_id, lig.saldo_atual, lig.valido_ate], ["ativa", "PT50000100000000000000001", "sessao-1", 1500.25, "2027-04-27T10:00:00Z"])
  const doBanco = repo.ms.filter(m => m.origem === "enablebanking").sort((a, b) => a.data.localeCompare(b.data))
  assertEquals(doBanco.map(m => [m.data, m.valor]), [["2026-10-01", 1234.56], ["2026-10-03", -40]])
  assertEquals((doBanco[0] as NovoMovimento).contraparte, "Cliente Lda")
  assert(sim.pedidos.some(p => p.caminho.includes("continuation_key=1")), "seguiu a segunda página")

  // sincronizar outra vez: só entra o que é novo
  sim.estado.paginas = [[t("A3", "2026-10-03", "40.00", "DBIT", { creditor: { name: "Telecom" } }), t("A5", "2026-10-05", "300.00", "CRDT")]]
  const s2 = await executar("sincronizar", {}, ctx(comBanco)) as { res: { novos: number }[] }
  assertEquals(s2.res[0].novos, 1)
  assertMatch(sim.pedidos.at(-1)!.caminho, /date_from=2026-10-03/)

  // limite diário do banco: fica o aviso, a ligação continua ativa
  sim.estado.falha = { status: 429, corpo: { message: "ASPSP_RATE_LIMIT_EXCEEDED" } }
  const s3 = await executar("sincronizar", {}, ctx(comBanco)) as { res: { erro: string }[] }
  assertMatch(s3.res[0].erro, /algumas vezes por dia/)
  assertEquals(repo.ls[0].estado, "ativa")
  // consentimento expirado: a ligação passa a "expirada" (Definições mostra "Voltar a ligar")
  sim.estado.falha = { status: 401, corpo: { message: "Session expired" } }
  await executar("sincronizar", {}, ctx(comBanco))
  assertEquals(repo.ls[0].estado, "expirada")
  sim.estado.falha = null

  // voltar a ligar a mesma conta: a mesma ligação, com a nova validade, e os movimentos mantêm-se
  sim.estado.validade = "2027-05-30T10:00:00Z"; sim.estado.paginas = [[]]
  await executar("iniciar", { banco: "Banco Exemplo" }, ctx(admin))
  const pend2 = repo.ls.find(l => l.estado === "pendente")!
  await executar("concluir", { code: "def", state: pend2.id }, ctx(admin))
  assertEquals(repo.ls.length, 1)
  assertEquals([repo.ls[0].id, repo.ls[0].estado, repo.ls[0].valido_ate, repo.ls[0].session_id], [lig.id, "ativa", "2027-05-30T10:00:00Z", "sessao-2"])
  assertEquals(repo.ms.filter(m => m.ligacao_id === lig.id).length, 3)

  // um banco que devolve duas contas: escolhe-se uma
  sim.estado.contas = [{ uid: "conta-9", account_id: { iban: "PT50000200000000000000009" }, name: "Conta poupança" }, { uid: "conta-8", account_id: { iban: "PT50000200000000000000008" }, product: "Conta empresa" }]
  await executar("iniciar", { banco: "Outro Banco", psu_type: "personal" }, ctx(admin))
  const r3 = await executar("concluir", { code: "ghi", state: repo.ls.find(l => l.estado === "pendente")!.id }, ctx(admin)) as { escolher: boolean; contas: number }
  assertEquals([r3.escolher, r3.contas], [true, 2])
  const escolha = repo.ls.find(l => l.nome_conta === "Conta empresa")!
  await executar("escolher", { ligacao_id: escolha.id }, ctx(admin))
  assertEquals(repo.ls.map(l => [l.nome_conta, l.estado]), [["Conta à ordem", "ativa"], ["Conta empresa", "ativa"]])

  // desligar: termina a sessão no Enable Banking e tira a ligação; os movimentos ficam
  await executar("desligar", { ligacao_id: escolha.id }, ctx(admin))
  assert(sim.pedidos.some(p => p.metodo === "DELETE" && p.caminho === "/sessions/sessao-3"))
  assertEquals(repo.ls.length, 1)
  await assertRejects(() => executar("desligar", { ligacao_id: lig.id }, ctx(comBanco)), Error, "administradores")

  // módulo desligado
  repo.defs.modulo_banco = false
  await assertRejects(() => executar("sincronizar", {}, ctx(admin)), Error, "desligado")
  // sem endereço de regresso
  repo.defs.modulo_banco = true; repo.defs.banco_config.redirect_url = ""
  await assertRejects(() => executar("iniciar", { banco: "Banco Exemplo" }, ctx(admin)), Error, "endereço de regresso")
  // pedido agendado (cron) sincroniza sem pessoa
  assert(Array.isArray((await executar("cron", {}, { repo, membro: null, fetch: sim.f }) as { res: unknown[] }).res))
})

Deno.test("banco: transação para movimento (sinal, data, hash estável)", async () => {
  const a = await paraMovimento(t("X", "2026-01-31", "12.5", "DBIT", { creditor: { name: "Loja" } }) as never, "c")
  const b = await paraMovimento(t("X", "2026-01-31", "12.5", "DBIT", { creditor: { name: "Loja" } }) as never, "c")
  assertEquals([a!.valor, a!.data, a!.contraparte, a!.descritivo], [-12.5, "2026-01-31", "Loja", "Ref X · Loja"])
  assertEquals(a!.hash, b!.hash)
  assertMatch(a!.hash, /^[0-9a-f]{32}$/)
  assertEquals(await paraMovimento({ ...t("Y", "2026-01-31", "1", "CRDT"), status: "PDNG" } as never, "c"), null)
})
