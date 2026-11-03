// O que a app pede à função "email": sincronizar, ler, enviar, mover... Guarda o resultado na base de dados
// através de um "Repo" (no Supabase, ver index.ts; nos testes, um repositório em memória).
import type { ImapFlow } from "npm:imapflow@1.7.8";
import { Buffer } from "node:buffer";
import * as correio from "./correio.ts";
import { ErroHttp, pode, type Membro } from "../_shared/comum.ts";

export type PastaLinha = { caminho: string; nome: string; especial: correio.Especial | null; separador: string | null; uidvalidity: number | null; ultimo_uid: number; total: number; nao_lidos: number; sincronizada_em: string | null }
export type EmailLinha = correio.Resumo & {
  id: string; pasta: string; uidvalidity: number | null; texto: string | null; html: string | null; corpo_em: string | null; contacto_id: string | null
}
export type NovaLinha = Omit<EmailLinha, "id" | "texto" | "html" | "corpo_em">

export interface Repo {
  definicoes(): Promise<{ modulo_email: boolean; email_config: Record<string, unknown> }>
  password(): Promise<string | null>
  pastas(): Promise<PastaLinha[]>
  guardarPasta(p: Partial<PastaLinha> & { caminho: string }): Promise<void>
  apagarPastas(caminhos: string[]): Promise<void>
  /** UID, lido e respondido de tudo o que a app tem da pasta */
  marcasDaPasta(pasta: string): Promise<{ id: string; uid: number; lido: boolean; respondido: boolean }[]>
  /** acrescenta; se já existir (mesma pasta e UID) não faz nada */
  inserirEmails(linhas: NovaLinha[]): Promise<void>
  atualizarEmail(id: string, campos: Partial<EmailLinha>): Promise<void>
  apagarEmails(ids: string[]): Promise<void>
  apagarEmailsDaPasta(pasta: string): Promise<void>
  emails(ids: string[]): Promise<EmailLinha[]>
  contactosPorEmail(enderecos: string[]): Promise<{ id: string; email: string; nome: string }[]>
  negocioAberto(contactoId: string): Promise<string | null>
  registarAtividade(a: { tipo: "email"; resumo: string; contacto_id: string; negocio_id: string | null; autor: string }): Promise<void>
}
export type Contexto = { repo: Repo; membro: Membro }

const texto = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const numero = (v: unknown, padrao: number) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 65536 ? n : padrao }
const cifra = (v: unknown, padrao: correio.Cifra): correio.Cifra => (v === "ssl" || v === "starttls" || v === "nenhuma" ? v : padrao)
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => String(x)) : [])

/** a configuração guardada em Definições (ou a que vem do formulário, para testar antes de guardar) */
export function lerConfig(c: Record<string, unknown>, password: string | null): correio.ConfigCorreio {
  const cfg: correio.ConfigCorreio = {
    imap_host: texto(c.imap_host, 200), imap_porta: numero(c.imap_porta, 993), imap_cifra: cifra(c.imap_cifra, "ssl"),
    smtp_host: texto(c.smtp_host, 200), smtp_porta: numero(c.smtp_porta, 465), smtp_cifra: cifra(c.smtp_cifra, "ssl"),
    utilizador: texto(c.utilizador, 200), endereco: texto(c.endereco, 200).toLowerCase() || texto(c.utilizador, 200).toLowerCase(),
    nome_remetente: texto(c.nome_remetente, 120), guardar_enviados: c.guardar_enviados !== false, password: password ?? "",
  }
  if (!cfg.imap_host || !cfg.smtp_host || !cfg.utilizador) throw new ErroHttp(400, "A configuração do email está incompleta. Um administrador tem de a preencher em Definições.")
  if (!correio.emailValido(cfg.endereco)) throw new ErroHttp(400, "O endereço de email da configuração não é válido.")
  if (!cfg.password) throw new ErroHttp(400, "Falta a password do email. Um administrador tem de a guardar em Definições.")
  return cfg
}

export async function executar(acao: string, corpo: Record<string, unknown>, ctx: Contexto): Promise<unknown> {
  const { repo, membro } = ctx
  if (!pode(membro, "email")) throw new ErroHttp(403, "Não tem acesso ao email. Peça a um administrador.")
  const defs = await repo.definicoes()

  if (acao === "testar") {
    if (membro.papel !== "admin") throw new ErroHttp(403, "Só os administradores testam a configuração.")
    const pw = texto(corpo.password, 1000) || (await repo.password())
    const cfg = lerConfig((corpo.config as Record<string, unknown>) ?? defs.email_config, pw)
    const r = await correio.testar(cfg)
    if (!r.imap) await guardarPastas(repo, r.pastas)
    return { imap: r.imap, smtp: r.smtp, pastas: r.pastas.length }
  }
  if (!defs.modulo_email) throw new ErroHttp(400, "O módulo de email está desligado em Definições.")
  if (acao === "estado") return { configurado: !!(defs.email_config?.imap_host && (await repo.password())), endereco: defs.email_config?.endereco ?? null }

  const cfg = lerConfig(defs.email_config, await repo.password())
  let c: ImapFlow | null = null
  const imap = async () => (c ??= await correio.ligarImap(cfg))
  try {
    switch (acao) {
      case "pastas": {
        await guardarPastas(repo, await correio.listarPastas(await imap()))
        return { pastas: await repo.pastas() }
      }
      case "sincronizar": {
        const cli = await imap()
        let pastas = await repo.pastas()
        if (!pastas.length || corpo.atualizar_pastas) { await guardarPastas(repo, await correio.listarPastas(cli)); pastas = await repo.pastas() }
        const pedidas = new Set([...lista(corpo.pastas), ...pastas.filter(p => p.especial === "entrada" || p.especial === "enviados").map(p => p.caminho)])
        let novos = 0
        for (const p of pastas.filter(x => pedidas.has(x.caminho))) novos += await sincronizarPasta(repo, cli, p)
        return { novos, pastas: await repo.pastas() }
      }
      case "ler": {
        const [e] = await repo.emails([texto(corpo.id, 60)])
        if (!e) throw new ErroHttp(404, "Email não encontrado.")
        if (e.corpo_em && !corpo.recarregar) {
          if (!e.lido) { await correio.marcar(await imap(), e.pasta, [e.uid], "\\Seen", true); await repo.atualizarEmail(e.id, { lido: true }) }
          return { ...e, lido: true }
        }
        const b = await correio.lerMensagem(await imap(), e.pasta, e.uid, true)
        const campos = { texto: b.texto, html: b.html, anexos: b.anexos, corpo_em: new Date().toISOString(), lido: true, referencias: b.referencias ?? e.referencias }
        await repo.atualizarEmail(e.id, campos)
        return { ...e, ...campos }
      }
      case "anexo": {
        const [e] = await repo.emails([texto(corpo.id, 60)])
        if (!e) throw new ErroHttp(404, "Email não encontrado.")
        const parte = texto(corpo.parte, 40)
        if (!/^[0-9.]+$/.test(parte)) throw new ErroHttp(400, "Anexo inválido.")
        const a = await correio.lerAnexo(await imap(), e.pasta, e.uid, parte)
        const meta = e.anexos.find(x => x.parte === parte)
        return { nome: meta?.nome ?? a.nome, tipo: meta?.tipo ?? a.tipo, base64: Buffer.from(a.dados).toString("base64") }
      }
      case "marcar": {
        const lido = corpo.lido !== false
        const es = await repo.emails(lista(corpo.ids))
        for (const [pasta, grupo] of agrupar(es)) await correio.marcar(await imap(), pasta, grupo.map(e => e.uid), "\\Seen", lido)
        for (const e of es) await repo.atualizarEmail(e.id, { lido })
        return { ok: true, n: es.length }
      }
      case "mover": {
        const destino = texto(corpo.destino, 300)
        if (!(await repo.pastas()).some(p => p.caminho === destino)) throw new ErroHttp(400, "Pasta de destino desconhecida.")
        return { ok: true, n: await moverEmails(repo, await imap(), await repo.emails(lista(corpo.ids)), destino) }
      }
      case "apagar": {
        const cli = await imap()
        const es = await repo.emails(lista(corpo.ids))
        const lixo = await correio.garantirPasta(cli, "lixo")
        if (!(await repo.pastas()).some(p => p.caminho === lixo)) await guardarPastas(repo, await correio.listarPastas(cli))
        const noLixo = es.filter(e => e.pasta === lixo)
        for (const [pasta, grupo] of agrupar(noLixo)) await correio.apagarDeVez(cli, pasta, grupo.map(e => e.uid))
        if (noLixo.length) await repo.apagarEmails(noLixo.map(e => e.id))
        const n = await moverEmails(repo, cli, es.filter(e => e.pasta !== lixo), lixo)
        return { ok: true, n: n + noLixo.length, apagados_de_vez: noLixo.length }
      }
      case "enviar":
        return await enviar(repo, membro, cfg, corpo, imap)
      default:
        throw new ErroHttp(400, "Ação desconhecida.")
    }
  } finally { await correio.fechar(c) }
}

function agrupar(es: EmailLinha[]) {
  const m = new Map<string, EmailLinha[]>()
  for (const e of es) m.set(e.pasta, [...(m.get(e.pasta) ?? []), e])
  return m
}

async function guardarPastas(repo: Repo, lista: correio.Pasta[]) {
  const atuais = await repo.pastas()
  for (const p of lista) await repo.guardarPasta({ caminho: p.caminho, nome: p.nome, especial: p.especial, separador: p.separador })
  const sumiram = atuais.filter(a => !lista.some(p => p.caminho === a.caminho)).map(a => a.caminho)
  if (sumiram.length) await repo.apagarPastas(sumiram)
}

async function moverEmails(repo: Repo, c: ImapFlow, es: EmailLinha[], destino: string) {
  let n = 0
  for (const [pasta, grupo] of agrupar(es)) {
    if (pasta === destino) continue
    const mapa = await correio.mover(c, pasta, grupo.map(e => e.uid), destino)
    for (const e of grupo) {
      const novo = mapa.get(e.uid)
      // com UIDPLUS o servidor diz o UID novo e o email muda de pasta na app; sem isso aparece na próxima sincronização
      if (novo) await repo.atualizarEmail(e.id, { pasta: destino, uid: novo })
      else await repo.apagarEmails([e.id])
      n++
    }
  }
  return n
}

/** o endereço "do outro lado": quem enviou (entrada) ou o primeiro destinatário (enviados) */
const outroLado = (m: correio.Resumo, especial: string | null) => (especial === "enviados" ? m.para[0]?.email : m.de_email) ?? null

/** traz as mensagens novas de uma pasta e acerta as marcas e os apagados; devolve quantas entraram */
export async function sincronizarPasta(repo: Repo, c: ImapFlow, p: PastaLinha): Promise<number> {
  const r = await correio.buscarNovas(c, p.caminho, { uidvalidity: p.uidvalidity, ultimoUid: p.ultimo_uid })
  if (r.reiniciada) await repo.apagarEmailsDaPasta(p.caminho)
  if (r.mensagens.length) {
    const contactos = await repo.contactosPorEmail([...new Set(r.mensagens.map(m => outroLado(m, p.especial)).filter((x): x is string => !!x))])
    const porEmail = new Map(contactos.map(x => [x.email.toLowerCase(), x.id]))
    for (let i = 0; i < r.mensagens.length; i += 100) {
      await repo.inserirEmails(r.mensagens.slice(i, i + 100).map(m => ({ ...m, pasta: p.caminho, uidvalidity: r.uidvalidity, contacto_id: porEmail.get(outroLado(m, p.especial) ?? "") ?? null })))
    }
  }
  // o que já estava na app: tira o que foi apagado no servidor e acerta lido e respondido (últimas 300)
  const existem = new Set(r.uids)
  const guardados = r.reiniciada ? [] : await repo.marcasDaPasta(p.caminho)
  const sumiram = guardados.filter(g => !existem.has(g.uid))
  if (sumiram.length) await repo.apagarEmails(sumiram.map(g => g.id))
  const ver = guardados.filter(g => existem.has(g.uid) && !r.mensagens.some(m => m.uid === g.uid)).sort((a, b) => b.uid - a.uid).slice(0, 300)
  const marcas = await correio.lerMarcas(c, p.caminho, ver.map(g => g.uid))
  for (const g of ver) {
    const m = marcas.get(g.uid)
    if (m && (m.lido !== g.lido || m.respondido !== g.respondido)) await repo.atualizarEmail(g.id, m)
  }
  await repo.guardarPasta({ caminho: p.caminho, uidvalidity: r.uidvalidity, ultimo_uid: Math.max(r.ultimo_uid, r.reiniciada ? 0 : p.ultimo_uid), total: r.total, nao_lidos: r.nao_lidos, sincronizada_em: new Date().toISOString() })
  return r.mensagens.length
}

async function enviar(repo: Repo, membro: Membro, cfg: correio.ConfigCorreio, corpo: Record<string, unknown>, imap: () => Promise<ImapFlow>) {
  const anexos = (Array.isArray(corpo.anexos) ? corpo.anexos : []).slice(0, 20).map(a => ({ nome: texto((a as Record<string, unknown>).nome, 200), tipo: texto((a as Record<string, unknown>).tipo, 120), base64: String((a as Record<string, unknown>).base64 ?? "") }))
  const msg: correio.Mensagem = { para: lista(corpo.para), cc: lista(corpo.cc), assunto: texto(corpo.assunto, 400), texto: texto(corpo.texto, 200_000), html: typeof corpo.html === "string" ? corpo.html.slice(0, 400_000) : undefined, anexos }
  const extra: { anexos?: { filename: string; content: Uint8Array; contentType?: string }[] } = {}
  let original: EmailLinha | null = null
  if (corpo.responder_a) {
    ;[original] = await repo.emails([texto(corpo.responder_a, 60)])
    if (original) { msg.in_reply_to = original.message_id; msg.referencias = [original.referencias, original.message_id].filter(Boolean).join(" ") }
  }
  if (corpo.reencaminhar_de && corpo.incluir_anexos !== false) {
    const [f] = await repo.emails([texto(corpo.reencaminhar_de, 60)])
    if (f?.anexos.length) extra.anexos = await correio.anexosDe(await correio.fonte(await imap(), f.pasta, f.uid))
  }
  const invalidos = [...msg.para, ...(msg.cc ?? [])].filter(e => !correio.emailValido(e))
  if (invalidos.length) throw new ErroHttp(400, `Endereços inválidos: ${invalidos.join(", ")}`)
  const r = await correio.enviar(cfg, msg, extra)

  // depois de enviado, o resto não pode fazer falhar o pedido (o email já saiu)
  const avisos: string[] = []
  // o original fica logo marcado como respondido na app
  if (original) { try { await repo.atualizarEmail(original.id, { respondido: true }) } catch (e) { console.error("respondido", e) } }

  // histórico: uma atividade em cada contacto que recebeu o email
  let atividades = 0
  try {
    const contactos = await repo.contactosPorEmail([...msg.para, ...(msg.cc ?? [])].map(e => e.toLowerCase()))
    for (const ct of contactos) {
      const negocio = texto(corpo.negocio_id, 60) || (await repo.negocioAberto(ct.id))
      await repo.registarAtividade({ tipo: "email", resumo: `Email enviado: ${msg.assunto || "(sem assunto)"}`.slice(0, 4000), contacto_id: ct.id, negocio_id: negocio || null, autor: membro.nome })
      atividades++
    }
  } catch (e) { avisos.push("O email foi enviado, mas não ficou no histórico do contacto: " + (e as Error).message) }

  // guardar em Enviados e sincronizar é o mais lento: continua depois de responder, para a app não ficar à espera
  // usa uma ligação própria: a do pedido fecha quando a resposta sai
  const depois = (async () => {
    let cli: ImapFlow | null = null
    try {
      cli = await correio.ligarImap(cfg)
      if (cfg.guardar_enviados !== false) await correio.guardarEnviado(cli, r.bruto)
      if (original) await correio.marcar(cli, original.pasta, [original.uid], "\\Answered", true)
      await guardarPastas(repo, await correio.listarPastas(cli))
      const enviados = (await repo.pastas()).find(p => p.especial === "enviados")
      if (enviados) await sincronizarPasta(repo, cli, enviados)
    } catch (e) { console.error("O email foi enviado, mas não ficou na pasta Enviados:", (e as Error).message) } finally { await correio.fechar(cli) }
  })()
  const er = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (er?.waitUntil) er.waitUntil(depois); else await depois
  return { ok: true, message_id: r.message_id, aceites: r.aceites, atividades, avisos }
}
