// O que a app pede à função "banco": listar bancos, ligar (e voltar a ligar), trazer saldo e movimentos, desligar.
import { ErroHttp, pode, type Membro } from "../_shared/comum.ts";
import { criarCliente, ErroBanco, paraMovimento, type ClienteEB } from "./enable.ts";

export type Ligacao = {
  id: string; banco: string; pais: string; psu_type: string; estado: "pendente" | "escolher" | "ativa" | "expirada"
  session_id: string | null; conta_uid: string | null; iban: string | null; nome_conta: string | null; moeda: string | null
  valido_ate: string | null; saldo_atual: number | null; saldo_em: string | null; ultima_sinc: string | null; ultimo_erro: string | null; criado_por: string | null
}
export type NovoMovimento = { ligacao_id: string; data: string; valor: number; descritivo: string; contraparte: string | null; saldo: number | null; hash: string; origem: "enablebanking" }

export interface RepoBanco {
  definicoes(): Promise<{ modulo_banco: boolean; banco_config: Record<string, unknown> }>
  chave(): Promise<string | null>
  ligacoes(): Promise<Ligacao[]>
  criarLigacao(l: Partial<Ligacao>): Promise<Ligacao>
  atualizarLigacao(id: string, campos: Partial<Ligacao>): Promise<void>
  apagarLigacoes(ids: string[]): Promise<void>
  /** data do movimento mais recente desta ligação */
  ultimaData(ligacaoId: string): Promise<string | null>
  /** movimentos importados de extratos desde a data (para não repetir o que o banco também traz) */
  importadosDesde(desde: string): Promise<{ id: string; data: string; valor: number }[]>
  hashesExistentes(hashes: string[]): Promise<Set<string>>
  inserirMovimentos(ms: NovoMovimento[]): Promise<number>
}
export type ContextoBanco = { repo: RepoBanco; membro: Membro | null; fetch?: typeof fetch; base?: string; psu?: { ip: string; ua: string } | null }

const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const MSG_LIMITE = "O banco só deixa ler a conta sozinho algumas vezes por dia (regra PSD2). Tente mais tarde."

async function cliente(ctx: ContextoBanco, cfg: Record<string, unknown>): Promise<ClienteEB> {
  const appId = texto(cfg.app_id, 80)
  if (!appId) throw new ErroHttp(400, "Falta o ID da aplicação do Enable Banking em Definições.")
  const pem = await ctx.repo.chave()
  if (!pem) throw new ErroHttp(400, "Falta a chave privada do Enable Banking em Definições.")
  return criarCliente({ appId, pem, fetch: ctx.fetch, base: ctx.base })
}

/** traz saldo e movimentos novos de uma conta ligada */
export async function sincronizar(ctx: ContextoBanco, eb: ClienteEB, l: Ligacao): Promise<{ novos: number; saldo: number | null }> {
  const { repo } = ctx
  const cab: Record<string, string> = ctx.psu ? { "Psu-Ip-Address": ctx.psu.ip, "Psu-User-Agent": ctx.psu.ua } : {}
  let saldo: number | null = null
  try { saldo = await eb.saldo(l.conta_uid!, cab) } catch (e) { if (e instanceof ErroBanco && (e.expirou || e.limite)) throw e }
  // desde o último movimento (o banco pode acrescentar movimentos desse dia), ou 89 dias na primeira vez
  const ult = await repo.ultimaData(l.id)
  const desde = ult ?? new Date(Date.now() - 89 * 86400_000).toISOString().slice(0, 10)
  const trans = await eb.transacoes(l.conta_uid!, desde, cab)
  const candidatos = (await Promise.all(trans.map(t => paraMovimento(t, l.conta_uid!)))).filter(x => !!x)
  const ja = await repo.hashesExistentes(candidatos.map(m => m.hash))
  // um movimento importado de um extrato com a mesma data e valor é o mesmo: não entra outra vez
  const livres = (await repo.importadosDesde(desde)).map(m => ({ ...m, usado: false }))
  const novos: NovoMovimento[] = []
  for (const m of candidatos) {
    if (ja.has(m.hash) || novos.some(n => n.hash === m.hash)) continue
    const igual = livres.find(x => !x.usado && x.data === m.data && Math.abs(Number(x.valor) - m.valor) < 0.005)
    if (igual) { igual.usado = true; continue }
    novos.push({ ...m, ligacao_id: l.id, origem: "enablebanking" })
  }
  const n = novos.length ? await repo.inserirMovimentos(novos) : 0
  await repo.atualizarLigacao(l.id, { ...(saldo != null ? { saldo_atual: saldo, saldo_em: new Date().toISOString() } : {}), ultima_sinc: new Date().toISOString(), ultimo_erro: null })
  return { novos: n, saldo }
}

/** sincroniza todas as ligações ativas; regista erros por ligação sem parar as outras */
async function sincronizarTodas(ctx: ContextoBanco, eb: ClienteEB) {
  const res: { ligacao: string; novos?: number; erro?: string }[] = []
  for (const l of (await ctx.repo.ligacoes()).filter(x => x.estado === "ativa")) {
    try { res.push({ ligacao: l.id, ...(await sincronizar(ctx, eb, l)) }) }
    catch (e) {
      const eb = e instanceof ErroBanco ? e : null
      const msg = eb?.limite ? MSG_LIMITE : eb?.expirou ? "A autorização do banco terminou. Um administrador tem de voltar a ligar o banco em Definições." : (e as Error).message
      await ctx.repo.atualizarLigacao(l.id, { ultimo_erro: msg, ...(eb?.expirou && !eb.limite ? { estado: "expirada" } : {}) })
      res.push({ ligacao: l.id, erro: msg })
    }
  }
  return res
}

export async function executar(acao: string, corpo: Record<string, unknown>, ctx: ContextoBanco): Promise<unknown> {
  const { repo, membro } = ctx
  const defs = await repo.definicoes()
  const cfg = defs.banco_config ?? {}

  // pedido agendado (pg_cron): sem pessoa, já validado pelo segredo em index.ts
  if (acao === "cron") {
    if (!defs.modulo_banco) return { res: [] }
    return { res: await sincronizarTodas(ctx, await cliente(ctx, cfg)) }
  }
  if (!pode(membro, "banco")) throw new ErroHttp(403, "Não tem acesso ao banco. Peça a um administrador.")
  const admin = membro!.papel === "admin"
  if (!defs.modulo_banco && acao !== "configurado" && acao !== "bancos") throw new ErroHttp(400, "O módulo Banco está desligado em Definições.")
  const soAdmin = () => { if (!admin) throw new ErroHttp(403, "Só os administradores ligam e desligam o banco.") }

  try {
    switch (acao) {
      case "configurado":
        return { app_id: !!texto(cfg.app_id), chave: !!(await repo.chave()) }
      case "bancos": {
        soAdmin()
        const pais = /^[A-Z]{2}$/.test(texto(corpo.pais) || texto(cfg.pais)) ? (texto(corpo.pais) || texto(cfg.pais)) : "PT"
        return { bancos: await (await cliente(ctx, cfg)).bancos(pais) }
      }
      case "iniciar": {
        soAdmin()
        const banco = texto(corpo.banco)
        if (!banco) throw new ErroHttp(400, "Escolha o banco.")
        const redirect = texto(cfg.redirect_url, 300)
        if (!/^https?:\/\/[^\s]+$/.test(redirect)) throw new ErroHttp(400, "Falta o endereço de regresso (o mesmo registado na aplicação do Enable Banking) em Definições.")
        const pais = /^[A-Z]{2}$/.test(texto(corpo.pais)) ? texto(corpo.pais) : (texto(cfg.pais) || "PT")
        const psu = corpo.psu_type === "personal" ? "personal" : "business"
        const dias = Math.max(1, Math.min(180, Number(corpo.dias) || 180))
        const eb = await cliente(ctx, cfg)
        await repo.apagarLigacoes((await repo.ligacoes()).filter(l => l.estado === "pendente").map(l => l.id))
        const lig = await repo.criarLigacao({ banco, pais, psu_type: psu, estado: "pendente", criado_por: membro!.nome })
        return { url: await eb.iniciar({ banco, pais, psu_type: psu, state: lig.id, redirect, dias }) }
      }
      case "concluir": {
        soAdmin()
        const state = texto(corpo.state, 60), code = texto(corpo.code, 2000)
        const todas = await repo.ligacoes()
        const lig = todas.find(l => l.id === state && l.estado === "pendente")
        if (!lig || !code) throw new ErroHttp(400, "Esta autorização já não é válida. Volte a ligar o banco.")
        const eb = await cliente(ctx, cfg)
        const s = await eb.sessao(code)
        if (!s.contas.length) throw new ErroHttp(400, "O banco autorizou mas não partilhou nenhuma conta. Se a aplicação do Enable Banking ainda estiver em modo restrito, ative a conta no painel deles (Link accounts) e volte a ligar.")
        const campos = (c: typeof s.contas[number]) => ({ banco: lig.banco, pais: lig.pais, psu_type: lig.psu_type, session_id: s.session_id, conta_uid: c.uid, iban: c.iban, nome_conta: c.nome, moeda: c.moeda, valido_ate: s.valido_ate, ultimo_erro: null, criado_por: lig.criado_por })
        // voltar a ligar: a mesma conta (mesmo IBAN ou UID) continua a mesma ligação e mantém os movimentos
        const mesma = (c: typeof s.contas[number]) => todas.find(l => l.id !== lig.id && l.estado !== "pendente" && ((c.iban && l.iban === c.iban) || l.conta_uid === c.uid))
        if (s.contas.length === 1) {
          const antiga = mesma(s.contas[0])
          let alvo: Ligacao
          if (antiga) { await repo.atualizarLigacao(antiga.id, { ...campos(s.contas[0]), estado: "ativa" }); await repo.apagarLigacoes([lig.id]); alvo = { ...antiga, ...campos(s.contas[0]), estado: "ativa" } }
          else { await repo.atualizarLigacao(lig.id, { ...campos(s.contas[0]), estado: "ativa" }); alvo = { ...lig, ...campos(s.contas[0]), estado: "ativa" } }
          return { escolher: false, ...(await sincronizar(ctx, eb, alvo)), valido_ate: s.valido_ate }
        }
        // várias contas: a pessoa escolhe quais quer (ficam em "escolher")
        await repo.atualizarLigacao(lig.id, { ...campos(s.contas[0]), estado: "escolher" })
        for (const c of s.contas.slice(1)) await repo.criarLigacao({ ...campos(c), estado: "escolher" })
        return { escolher: true, contas: s.contas.length, valido_ate: s.valido_ate }
      }
      case "escolher": {
        soAdmin()
        const todas = await repo.ligacoes()
        const lig = todas.find(l => l.id === texto(corpo.ligacao_id, 60) && l.estado === "escolher")
        if (!lig) throw new ErroHttp(404, "Conta não encontrada.")
        const antiga = todas.find(l => l.id !== lig.id && (l.estado === "ativa" || l.estado === "expirada") && ((lig.iban && l.iban === lig.iban) || l.conta_uid === lig.conta_uid))
        let alvo: Ligacao = { ...lig, estado: "ativa" }
        if (antiga) {
          const { id: _i, ...resto } = lig
          await repo.atualizarLigacao(antiga.id, { ...resto, estado: "ativa" }); await repo.apagarLigacoes([lig.id]); alvo = { ...antiga, ...resto, estado: "ativa" }
        } else await repo.atualizarLigacao(lig.id, { estado: "ativa" })
        // as outras contas da mesma sessão que não foram escolhidas saem
        if (corpo.so_esta !== false) await repo.apagarLigacoes(todas.filter(l => l.estado === "escolher" && l.session_id === lig.session_id && l.id !== lig.id).map(l => l.id))
        return { res: [await sincronizar(ctx, await cliente(ctx, cfg), alvo)] }
      }
      case "sincronizar":
        return { res: await sincronizarTodas(ctx, await cliente(ctx, cfg)) }
      case "desligar": {
        soAdmin()
        const l = (await repo.ligacoes()).find(x => x.id === texto(corpo.ligacao_id, 60))
        if (!l) throw new ErroHttp(404, "Ligação não encontrada.")
        // termina a autorização no banco; os movimentos já trazidos ficam
        const outras = (await repo.ligacoes()).filter(x => x.id !== l.id && x.session_id === l.session_id && x.estado !== "pendente")
        if (l.session_id && !outras.length) { try { await (await cliente(ctx, cfg)).terminar(l.session_id) } catch (e) { console.error("terminar sessão", (e as Error).message) } }
        await repo.apagarLigacoes([l.id])
        return { ok: true }
      }
      default:
        throw new ErroHttp(400, "Ação desconhecida.")
    }
  } catch (e) {
    if (e instanceof ErroBanco) throw new ErroHttp(e.estado >= 500 ? 502 : 400, e.limite ? MSG_LIMITE : `Enable Banking: ${e.message}`)
    throw e
  }
}
