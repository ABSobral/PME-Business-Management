// Ligação a qualquer caixa de correio por IMAP (ler) e SMTP (enviar).
// Não toca na base de dados: recebe a configuração e devolve dados simples, para se poder testar
// contra um servidor de correio local (tests/funcoes/email_test.ts, com o GreenMail).
import { ImapFlow } from "npm:imapflow@1.7.8";
import nodemailer from "npm:nodemailer@6.10.1";
import MailComposer from "npm:nodemailer@6.10.1/lib/mail-composer/index.js";
import { simpleParser } from "npm:mailparser@3.12.4";
import { Buffer } from "node:buffer";

export type Cifra = "ssl" | "starttls" | "nenhuma";
export type ConfigCorreio = {
  imap_host: string; imap_porta: number; imap_cifra: Cifra
  smtp_host: string; smtp_porta: number; smtp_cifra: Cifra
  utilizador: string; endereco: string; nome_remetente?: string
  /** guardar uma cópia na pasta Enviados por IMAP (o Gmail já o faz sozinho: false) */
  guardar_enviados?: boolean
  password: string
}
export type Endereco = { nome: string | null; email: string }
export type Especial = "entrada" | "enviados" | "lixo" | "rascunhos" | "spam" | "arquivo"
export type Pasta = { caminho: string; nome: string; especial: Especial | null; separador: string | null }
export type AnexoMeta = { parte: string; nome: string; tipo: string; tamanho: number }
export type Resumo = {
  uid: number; message_id: string | null; in_reply_to: string | null; referencias: string | null
  de_nome: string | null; de_email: string | null; para: Endereco[]; cc: Endereco[]
  assunto: string; data: string; lido: boolean; respondido: boolean; anexos: AnexoMeta[]; resumo: string
}
export type Corpo = { texto: string | null; html: string | null; anexos: AnexoMeta[]; referencias: string | null; message_id: string | null }
export type AnexoEnvio = { nome: string; tipo?: string; base64: string }
export type Mensagem = {
  para: string[]; cc?: string[]; assunto: string; texto: string; html?: string
  anexos?: AnexoEnvio[]; in_reply_to?: string | null; referencias?: string | null
}

export const LIMITE_ANEXOS = 15 * 1024 * 1024
export const emailValido = (e: string) => /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]{2,}$/.test(e.trim())

// --------------------------------------------------------------------------------------------
// IMAP
// --------------------------------------------------------------------------------------------

export async function ligarImap(cfg: ConfigCorreio): Promise<ImapFlow> {
  const c = new ImapFlow({
    host: cfg.imap_host, port: Number(cfg.imap_porta), secure: cfg.imap_cifra === "ssl",
    doSTARTTLS: cfg.imap_cifra === "starttls" ? true : cfg.imap_cifra === "nenhuma" ? false : undefined,
    auth: { user: cfg.utilizador, pass: cfg.password },
    logger: false, emitLogs: false, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000,
  })
  // sem isto, um erro de rede depois de ligado rebentava o processo
  c.on("error", (e: Error) => console.error("imap", e.message))
  try { await c.connect() } catch (e) { throw new Error(erroClaro(e as Error, "IMAP")) }
  return c
}
export async function fechar(c: ImapFlow | null) {
  if (!c) return
  try { await c.logout() } catch { try { c.close() } catch { /* já fechada */ } }
}

/** mensagens de erro que o dono do negócio percebe */
export function erroClaro(e: Error & { authenticationFailed?: boolean; code?: string; responseText?: string }, onde: string) {
  const m = `${e.message ?? ""} ${e.responseText ?? ""} ${e.code ?? ""}`
  if (e.authenticationFailed || /auth|login|credentials|535|534|invalid user|password/i.test(m)) return `${onde}: o servidor recusou o utilizador ou a password. Confirme a password de aplicação.`
  if (/ENOTFOUND|getaddrinfo|dns|name resolution/i.test(m)) return `${onde}: não encontrei o servidor. Confirme o endereço.`
  if (/ECONNREFUSED|refused/i.test(m)) return `${onde}: o servidor recusou a ligação. Confirme a porta.`
  if (/timeout|ETIMEDOUT|timed out/i.test(m)) return `${onde}: o servidor não respondeu a tempo. Confirme o endereço e a porta.`
  if (/certificate|SSL|TLS|wrong version/i.test(m)) return `${onde}: problema na ligação cifrada. Confirme a porta e o tipo de cifra.`
  return `${onde}: ${e.message || "erro desconhecido"}`
}

const NOMES_ESPECIAIS: [Especial, RegExp][] = [
  ["enviados", /^(inbox[./])?(sent|sent items|sent messages|sent mail|enviados|itens enviados|mensagens enviadas|correio enviado|\[gmail\][./]sent mail|\[gmail\][./]enviados)$/i],
  ["lixo", /^(inbox[./])?(trash|deleted|deleted items|deleted messages|lixo|reciclagem|itens eliminados|\[gmail\][./]trash|\[gmail\][./]lixo)$/i],
  ["rascunhos", /^(inbox[./])?(drafts|rascunhos|\[gmail\][./]drafts|\[gmail\][./]rascunhos)$/i],
  ["spam", /^(inbox[./])?(junk|spam|junk e-?mail|lixo eletr[oó]nico|\[gmail\][./]spam)$/i],
  ["arquivo", /^(inbox[./])?(archive|arquivo|\[gmail\][./]all mail|\[gmail\][./]todo o correio)$/i],
]
const USO: Record<string, Especial> = { "\\Inbox": "entrada", "\\Sent": "enviados", "\\Trash": "lixo", "\\Drafts": "rascunhos", "\\Junk": "spam", "\\Archive": "arquivo", "\\All": "arquivo" }

export async function listarPastas(c: ImapFlow): Promise<Pasta[]> {
  const lista = await c.list()
  const pastas = lista
    .filter((p: { flags?: Set<string> }) => !p.flags?.has("\\Noselect") && !p.flags?.has("\\NonExistent"))
    .map((p: { path: string; name: string; delimiter: string; specialUse?: string }) => {
      let especial: Especial | null = p.path.toUpperCase() === "INBOX" ? "entrada" : (p.specialUse ? USO[p.specialUse] ?? null : null)
      if (!especial) especial = NOMES_ESPECIAIS.find(([, r]) => r.test(p.path))?.[0] ?? null
      return { caminho: p.path, nome: p.path.toUpperCase() === "INBOX" ? "Entrada" : p.name, especial, separador: p.delimiter ?? null }
    })
  // só uma pasta de cada tipo especial (a primeira); a Entrada primeiro
  const vistos = new Set<string>()
  for (const p of pastas) { if (p.especial) { if (vistos.has(p.especial)) p.especial = null; else vistos.add(p.especial) } }
  const ordem = ["entrada", "enviados", "rascunhos", "arquivo", "spam", "lixo"]
  return pastas.sort((a: Pasta, b: Pasta) => (a.especial ? ordem.indexOf(a.especial) : 99) - (b.especial ? ordem.indexOf(b.especial) : 99) || a.caminho.localeCompare(b.caminho))
}

/** encontra a pasta Enviados ou Lixo; se a caixa não a tiver, cria-a */
export async function garantirPasta(c: ImapFlow, especial: "enviados" | "lixo"): Promise<string> {
  const pastas = await listarPastas(c)
  const ja = pastas.find(p => p.especial === especial)
  if (ja) return ja.caminho
  const entrada = pastas.find(p => p.especial === "entrada")
  // algumas caixas (Courier, Dovecot antigo) só aceitam pastas dentro da INBOX
  const prefixo = pastas.some(p => p.caminho.toUpperCase().startsWith("INBOX" + (entrada?.separador ?? ".")) ) ? "INBOX" + (entrada?.separador ?? ".") : ""
  const nome = prefixo + (especial === "enviados" ? "Sent" : "Trash")
  try { await c.mailboxCreate(nome) } catch (e) {
    // alguns servidores respondem só "Command failed" quando a pasta já existe: confirma pela lista
    if (!(await c.list()).some((p: { path: string }) => p.path === nome)) throw e
  }
  return nome
}

function enderecos(lista?: { name?: string; address?: string }[]): Endereco[] {
  return (lista ?? []).filter(a => a?.address).map(a => ({ nome: a.name?.trim() || null, email: String(a.address).toLowerCase() }))
}

type No = { part?: string; type: string; parameters?: Record<string, string>; encoding?: string; size?: number; disposition?: string; dispositionParameters?: Record<string, string>; childNodes?: No[] }

/** anexos e a parte de texto, a partir da estrutura MIME (sem descarregar a mensagem) */
export function analisarEstrutura(raiz: No | undefined): { anexos: AnexoMeta[]; texto: No | null; html: No | null } {
  const anexos: AnexoMeta[] = []; let texto: No | null = null; let html: No | null = null
  const andar = (n: No, dentroDeMensagem = false) => {
    if (n.childNodes?.length) { for (const f of n.childNodes) andar(f, dentroDeMensagem || n.type === "message/rfc822"); return }
    const nome = n.dispositionParameters?.filename ?? n.parameters?.name
    const parte = n.part ?? "1"
    const eAnexo = n.disposition === "attachment" || (!!nome && !/^text\/(plain|html)$/.test(n.type)) || n.type === "message/rfc822"
    if (eAnexo) { anexos.push({ parte, nome: nome ?? "anexo", tipo: n.type, tamanho: Number(n.size ?? 0) }); return }
    if (dentroDeMensagem) return
    if (n.type === "text/plain" && !texto) texto = { ...n, part: parte }
    else if (n.type === "text/html" && !html) html = { ...n, part: parte }
  }
  if (raiz) andar(raiz)
  return { anexos, texto, html }
}

/** descodifica um bocado de uma parte (base64 ou quoted-printable) para texto */
export function descodificar(bytes: Uint8Array, codificacao: string | undefined, charset: string | undefined): string {
  let dados = bytes
  const cod = (codificacao ?? "").toLowerCase()
  const latin = new TextDecoder("latin1").decode(bytes)
  if (cod === "base64") {
    const limpo = latin.replace(/[^A-Za-z0-9+/=]/g, "")
    dados = new Uint8Array(Buffer.from(limpo.slice(0, limpo.length - (limpo.length % 4)), "base64"))
  } else if (cod === "quoted-printable") {
    const s = latin.replace(/=\r?\n/g, "").replace(/=[0-9A-F]?$/i, "")
    const out: number[] = []
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) { out.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2 }
      else out.push(s.charCodeAt(i) & 0xff)
    }
    dados = new Uint8Array(out)
  }
  try { return new TextDecoder(charset || "utf-8").decode(dados) } catch { return new TextDecoder("utf-8").decode(dados) }
}

export const semHtml = (h: string) => h.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")

/** primeiras linhas do email, sem citações nem espaços a mais */
export function fazerResumo(texto: string): string {
  return texto.split(/\r?\n/).filter(l => !/^\s*>/.test(l)).join(" ").replace(/\s+/g, " ").trim().slice(0, 240)
}

/** "References: <a> <b>\r\nIn-Reply-To: <c>" (com linhas dobradas) → mapa por nome em minúsculas */
export function cabecalhos(b?: Uint8Array | null): Map<string, string> {
  const m = new Map<string, string>()
  if (!b) return m
  for (const l of new TextDecoder().decode(b).replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = l.indexOf(":"); if (i > 0) m.set(l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim())
  }
  return m
}

export type ResultadoNovas = { uidvalidity: number; reiniciada: boolean; mensagens: Resumo[]; uids: number[]; total: number; nao_lidos: number; ultimo_uid: number }

/**
 * Lê as mensagens novas de uma pasta, por UID: só as que têm UID maior do que o último guardado.
 * Se o servidor mudou o UIDVALIDITY (pasta recriada), recomeça do zero ("reiniciada").
 * Devolve também a lista de UIDs que existem (para tirar da app os que foram apagados noutro lado).
 */
export async function buscarNovas(c: ImapFlow, pasta: string, o: { uidvalidity?: number | null; ultimoUid?: number; limiteInicial?: number }): Promise<ResultadoNovas> {
  const lock = await c.getMailboxLock(pasta, { readOnly: true })
  try {
    const caixa = c.mailbox as { uidValidity: bigint | number; exists: number; uidNext: number }
    const uidvalidity = Number(caixa.uidValidity)
    const reiniciada = !!o.uidvalidity && o.uidvalidity !== uidvalidity
    let desde = reiniciada ? 0 : (o.ultimoUid ?? 0)
    const uids = caixa.exists ? ((await c.search({ all: true }, { uid: true })) || []).map(Number).sort((a: number, b: number) => a - b) : []
    // primeira vez: só as últimas (por omissão 200), para não demorar numa caixa grande
    if (desde === 0 && uids.length > (o.limiteInicial ?? 200)) desde = uids[uids.length - (o.limiteInicial ?? 200) - 1]
    const novos = uids.filter((u: number) => u > desde)
    const mensagens: Resumo[] = []
    if (novos.length) {
      const estruturas = new Map<number, ReturnType<typeof analisarEstrutura>>()
      const base: Map<number, Omit<Resumo, "resumo">> = new Map()
      for await (const m of c.fetch(novos.join(","), { uid: true, envelope: true, flags: true, bodyStructure: true, internalDate: true, headers: ["references", "in-reply-to"] }, { uid: true })) {
        const est = analisarEstrutura(m.bodyStructure as No)
        estruturas.set(m.uid, est)
        const env = m.envelope ?? {}
        const de = enderecos(env.from)[0]
        const cab = cabecalhos(m.headers)
        const refs = cab.get("references") ?? ""
        base.set(m.uid, {
          uid: m.uid, message_id: env.messageId ?? null, in_reply_to: env.inReplyTo || cab.get("in-reply-to") || null, referencias: refs || null,
          de_nome: de?.nome ?? null, de_email: de?.email ?? null, para: enderecos(env.to), cc: enderecos(env.cc),
          assunto: env.subject ?? "", data: new Date(env.date ?? m.internalDate ?? Date.now()).toISOString(),
          lido: m.flags?.has("\\Seen") ?? false, respondido: m.flags?.has("\\Answered") ?? false, anexos: est.anexos,
        })
      }
      // o resumo: os primeiros 4 KB da parte de texto (sem marcar como lido)
      const porParte = new Map<string, number[]>()
      for (const [uid, est] of estruturas) { const p = (est.texto ?? est.html)?.part; if (p) porParte.set(p, [...(porParte.get(p) ?? []), uid]) }
      const resumos = new Map<number, string>()
      for (const [parte, lista] of porParte) {
        for await (const m of c.fetch(lista.join(","), { uid: true, bodyParts: [{ key: parte, start: 0, maxLength: 4096 }] }, { uid: true })) {
          const est = estruturas.get(m.uid)!; const no = (est.texto ?? est.html)!
          const bruto = [...(m.bodyParts?.values() ?? [])][0] as Uint8Array | undefined
          if (!bruto) continue
          let t = descodificar(new Uint8Array(bruto), no.encoding, no.parameters?.charset)
          if (!est.texto) t = semHtml(t)
          resumos.set(m.uid, fazerResumo(t))
        }
      }
      for (const [uid, b] of base) mensagens.push({ ...b, resumo: resumos.get(uid) ?? "" })
    }
    const st = await c.status(pasta, { messages: true, unseen: true })
    return { uidvalidity, reiniciada, mensagens: mensagens.sort((a, b) => a.uid - b.uid), uids, total: Number(st.messages ?? uids.length), nao_lidos: Number(st.unseen ?? 0), ultimo_uid: uids[uids.length - 1] ?? 0 }
  } finally { lock.release() }
}

/** lido e respondido das mensagens que a app já tem (alguém pode ter lido no telemóvel) */
export async function lerMarcas(c: ImapFlow, pasta: string, uids: number[]): Promise<Map<number, { lido: boolean; respondido: boolean }>> {
  const r = new Map<number, { lido: boolean; respondido: boolean }>()
  if (!uids.length) return r
  const lock = await c.getMailboxLock(pasta, { readOnly: true })
  try {
    for await (const m of c.fetch(uids.join(","), { uid: true, flags: true }, { uid: true })) r.set(m.uid, { lido: m.flags?.has("\\Seen") ?? false, respondido: m.flags?.has("\\Answered") ?? false })
  } finally { lock.release() }
  return r
}

/** a mensagem completa: texto, HTML (com as imagens embutidas) e anexos */
export async function lerMensagem(c: ImapFlow, pasta: string, uid: number, marcarLido = true): Promise<Corpo> {
  const lock = await c.getMailboxLock(pasta)
  try {
    const m = await c.fetchOne(String(uid), { uid: true, source: true, bodyStructure: true }, { uid: true })
    if (!m || !m.source) throw new Error("Este email já não está no servidor.")
    const p = await simpleParser(Buffer.from(m.source as Uint8Array), { skipTextToHtml: true })
    let html = typeof p.html === "string" ? p.html : null
    // imagens embutidas (cid:) passam a data: para aparecerem sem pedidos para fora
    for (const a of p.attachments ?? []) {
      if (a.cid && html && a.size < 2_000_000) html = html.split(`cid:${a.cid}`).join(`data:${a.contentType};base64,${Buffer.from(a.content).toString("base64")}`)
    }
    if (marcarLido) await c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true })
    const refs = p.references ? (Array.isArray(p.references) ? p.references.join(" ") : String(p.references)) : null
    return { texto: p.text ?? (html ? semHtml(html).replace(/\n\s*\n\s*\n+/g, "\n\n").trim() : null), html, anexos: analisarEstrutura(m.bodyStructure as No).anexos, referencias: refs, message_id: p.messageId ?? null }
  } finally { lock.release() }
}

/** um anexo, já descodificado */
export async function lerAnexo(c: ImapFlow, pasta: string, uid: number, parte: string): Promise<{ nome: string; tipo: string; dados: Uint8Array }> {
  const lock = await c.getMailboxLock(pasta, { readOnly: true })
  try {
    const d = await c.download(String(uid), parte, { uid: true })
    if (!d?.content) throw new Error("Anexo não encontrado.")
    const partes: Uint8Array[] = []; let total = 0
    for await (const b of d.content as AsyncIterable<Uint8Array>) { partes.push(b); total += b.length; if (total > 30 * 1024 * 1024) throw new Error("Anexo demasiado grande para abrir aqui.") }
    const dados = new Uint8Array(total); let i = 0
    for (const b of partes) { dados.set(b, i); i += b.length }
    return { nome: d.meta?.filename ?? "anexo", tipo: d.meta?.contentType ?? "application/octet-stream", dados }
  } finally { lock.release() }
}

/** mensagem original em bruto (para reencaminhar com os anexos) */
export async function fonte(c: ImapFlow, pasta: string, uid: number): Promise<Uint8Array> {
  const lock = await c.getMailboxLock(pasta, { readOnly: true })
  try {
    const m = await c.fetchOne(String(uid), { uid: true, source: true }, { uid: true })
    if (!m || !m.source) throw new Error("Este email já não está no servidor.")
    return new Uint8Array(m.source)
  } finally { lock.release() }
}

export async function marcar(c: ImapFlow, pasta: string, uids: number[], marca: "\\Seen" | "\\Answered", ligar: boolean) {
  if (!uids.length) return
  const lock = await c.getMailboxLock(pasta)
  try { ligar ? await c.messageFlagsAdd(uids.join(","), [marca], { uid: true }) : await c.messageFlagsRemove(uids.join(","), [marca], { uid: true }) }
  finally { lock.release() }
}

/** move para outra pasta; devolve o UID novo de cada mensagem (se o servidor o disser) */
export async function mover(c: ImapFlow, pasta: string, uids: number[], destino: string): Promise<Map<number, number>> {
  const lock = await c.getMailboxLock(pasta)
  try {
    const r = await c.messageMove(uids.join(","), destino, { uid: true })
    return new Map([...((r && r.uidMap) ? r.uidMap : new Map())].map(([a, b]) => [Number(a), Number(b)]))
  } finally { lock.release() }
}

/** apaga de vez (só usado dentro do Lixo) */
export async function apagarDeVez(c: ImapFlow, pasta: string, uids: number[]) {
  const lock = await c.getMailboxLock(pasta)
  try { await c.messageDelete(uids.join(","), { uid: true }) } finally { lock.release() }
}

// --------------------------------------------------------------------------------------------
// SMTP
// --------------------------------------------------------------------------------------------

function transporte(cfg: ConfigCorreio) {
  return nodemailer.createTransport({
    host: cfg.smtp_host, port: Number(cfg.smtp_porta), secure: cfg.smtp_cifra === "ssl",
    requireTLS: cfg.smtp_cifra === "starttls", ignoreTLS: cfg.smtp_cifra === "nenhuma",
    auth: { user: cfg.utilizador, pass: cfg.password },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000,
  })
}

/** confirma IMAP e SMTP; devolve as pastas encontradas */
export async function testar(cfg: ConfigCorreio): Promise<{ imap: string | null; smtp: string | null; pastas: Pasta[] }> {
  let imap: string | null = null, smtp: string | null = null, pastas: Pasta[] = []
  let c: ImapFlow | null = null
  try { c = await ligarImap(cfg); pastas = await listarPastas(c) } catch (e) { imap = (e as Error).message } finally { await fechar(c) }
  try { await transporte(cfg).verify() } catch (e) { smtp = erroClaro(e as Error, "SMTP") }
  return { imap, smtp, pastas }
}

const nomeFicheiro = (n: string) => n.replace(/[\\/\r\n"]+/g, "_").slice(0, 180) || "anexo"
export const textoParaHtml = (t: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, "<br>")}</div>`
export const tamanhoBase64 = (b: string) => Math.floor(b.replace(/[^A-Za-z0-9+/]/g, "").length * 3 / 4)

/** valida, monta a mensagem (texto e HTML), envia por SMTP e devolve o RFC 822 para guardar em Enviados */
export async function enviar(cfg: ConfigCorreio, msg: Mensagem, extra: { anexos?: { filename: string; content: Uint8Array; contentType?: string }[] } = {}): Promise<{ message_id: string; bruto: Uint8Array; aceites: string[] }> {
  const para = (msg.para ?? []).map(s => s.trim()).filter(Boolean), cc = (msg.cc ?? []).map(s => s.trim()).filter(Boolean)
  const invalidos = [...para, ...cc].filter(e => !emailValido(e))
  if (!para.length) throw new Error("Falta pelo menos um destinatário.")
  if (invalidos.length) throw new Error(`Endereços inválidos: ${invalidos.join(", ")}`)
  if (para.length + cc.length > 50) throw new Error("No máximo 50 destinatários.")
  const anexos = (msg.anexos ?? []).map(a => ({ filename: nomeFicheiro(a.nome), content: a.base64, encoding: "base64", contentType: a.tipo || undefined }))
  const total = (msg.anexos ?? []).reduce((s, a) => s + tamanhoBase64(a.base64), 0) + (extra.anexos ?? []).reduce((s, a) => s + a.content.length, 0)
  if (total > LIMITE_ANEXOS) throw new Error("Os anexos passam de 15 MB.")
  const dominio = cfg.endereco.split("@")[1] || "localhost"
  const messageId = `<${crypto.randomUUID()}@${dominio}>`
  const refs = [msg.referencias, msg.in_reply_to].filter(Boolean).join(" ").split(/\s+/).filter((x, i, l) => x && l.indexOf(x) === i).join(" ")
  const composto = new MailComposer({
    from: { name: cfg.nome_remetente || "", address: cfg.endereco }, to: para, cc: cc.length ? cc : undefined,
    subject: msg.assunto || "(sem assunto)", text: msg.texto, html: msg.html || textoParaHtml(msg.texto),
    attachments: [...anexos, ...(extra.anexos ?? []).map(a => ({ ...a, filename: nomeFicheiro(a.filename) }))],
    messageId, date: new Date(), inReplyTo: msg.in_reply_to || undefined, references: refs || undefined,
    headers: { "X-Mailer": "Gestao" },
  })
  const bruto: Uint8Array = await new Promise((ok, falha) => composto.compile().build((e: Error | null, b: Uint8Array) => e ? falha(e) : ok(new Uint8Array(b))))
  try {
    const r = await transporte(cfg).sendMail({ envelope: { from: cfg.endereco, to: [...para, ...cc] }, raw: Buffer.from(bruto) })
    return { message_id: messageId, bruto, aceites: (r.accepted ?? []).map(String) }
  } catch (e) { throw new Error(erroClaro(e as Error, "SMTP")) }
}

/** guarda a cópia do email enviado na pasta Enviados (para aparecer na caixa, como num programa de email) */
export async function guardarEnviado(c: ImapFlow, bruto: Uint8Array): Promise<{ pasta: string; uid: number | null }> {
  const pasta = await garantirPasta(c, "enviados")
  const r = await c.append(pasta, Buffer.from(bruto), ["\\Seen"])
  return { pasta, uid: r && typeof r === "object" && r.uid ? Number(r.uid) : null }
}

/** anexos de uma mensagem em bruto (para reencaminhar) */
export async function anexosDe(bruto: Uint8Array) {
  const p = await simpleParser(Buffer.from(bruto))
  return (p.attachments ?? []).filter(a => !a.related).map(a => ({ filename: a.filename ?? "anexo", content: new Uint8Array(a.content), contentType: a.contentType }))
}
