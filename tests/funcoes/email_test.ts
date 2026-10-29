// Testes da função "email" contra um servidor de correio verdadeiro, local (GreenMail): IMAP na 3143, SMTP na 3025.
// Arrancar o GreenMail:  tests/funcoes/greenmail.sh   (precisa de Java 17+; descarrega o .jar da Maven Central)
// Correr:                deno test -A tests/funcoes/email_test.ts
// Nunca usa servidores de correio reais.
import { assert, assertEquals, assertMatch, assertRejects } from "jsr:@std/assert@1";
import { Buffer } from "node:buffer";
import { simpleParser } from "npm:mailparser@3.12.4";
import * as correio from "../../supabase/functions/email/correio.ts";
import { executar } from "../../supabase/functions/email/acoes.ts";
import type { Membro } from "../../supabase/functions/_shared/comum.ts";
import { RepoEmail } from "./repo_memoria.ts";

const HOST = Deno.env.get("GREENMAIL_HOST") ?? "127.0.0.1";
const API = Deno.env.get("GREENMAIL_API") ?? `http://${HOST}:8080`;
const base = { imap_host: HOST, imap_porta: 3143, imap_cifra: "nenhuma", smtp_host: HOST, smtp_porta: 3025, smtp_cifra: "nenhuma" } as const
const cfgAna = { ...base, utilizador: "ana", endereco: "ana@exemplo.pt", nome_remetente: "Ana Silva", guardar_enviados: true }
const cfgRita: correio.ConfigCorreio = { ...base, utilizador: "rita", endereco: "rita@padaria.pt", nome_remetente: "Rita Gonçalves", password: "segredo" }
const admin: Membro = { email: "ana@exemplo.pt", nome: "Ana Silva", papel: "admin", acessos: [], ativo: true }
const semAcesso: Membro = { email: "rui@exemplo.pt", nome: "Rui", papel: "membro", acessos: ["banco"], ativo: true }
const comAcesso: Membro = { email: "bruno@exemplo.pt", nome: "Bruno Costa", papel: "membro", acessos: ["email"], ativo: true }

const opcoes = { sanitizeOps: false, sanitizeResources: false }

async function limpar() {
  const r = await fetch(`${API}/api/mail/purge`, { method: "POST" }); await r.body?.cancel()
  // o GreenMail apaga as mensagens mas não as pastas: as que ficarem de testes anteriores são reaproveitadas
}
function novoRepo() {
  const r = new RepoEmail()
  r.defs.email_config = { ...cfgAna }
  r.pw = "segredo"
  r.contactos = [{ id: "c-rita", email: "rita@padaria.pt", nome: "Rita Gonçalves" }]
  r.negocios = [{ id: "n-bolos", contacto_id: "c-rita" }]
  return r
}
const pdf = "%PDF-1.4 orçamento de teste"

Deno.test("email: ligação, sincronização incremental, leitura, anexos, marcas, envio com resposta, mover e apagar", opcoes, async () => {
  await limpar()
  // a Rita escreve à Ana: um email com anexo e outro em HTML com texto citado
  await correio.enviar(cfgRita, { para: ["ana@exemplo.pt"], assunto: "Pedido de orçamento", texto: "Olá Ana,\nqueria um orçamento para 3 bolos.\n\nObrigada", anexos: [{ nome: "lista.pdf", tipo: "application/pdf", base64: btoa(unescape(encodeURIComponent(pdf))) }] })
  await correio.enviar(cfgRita, { para: ["ana@exemplo.pt"], cc: ["rita@padaria.pt"], assunto: "Re: Datas", texto: "Pode ser sábado.\n\n> Que dia prefere?", html: "<p>Pode ser <b>sábado</b>.</p><blockquote>Que dia prefere?</blockquote>" })

  const repo = novoRepo()

  // permissões: sem acesso ao email não faz nada; membro com acesso não testa a configuração
  await assertRejects(() => executar("sincronizar", {}, { repo, membro: semAcesso }), Error, "Não tem acesso")
  await assertRejects(() => executar("testar", {}, { repo, membro: comAcesso }), Error, "administradores")

  // testar: password errada e password certa (a do formulário, ainda não guardada)
  const mau = await executar("testar", { config: cfgAna, password: "errada" }, { repo, membro: admin }) as { imap: string | null }
  assertMatch(mau.imap ?? "", /recusou o utilizador ou a password/)
  const bom = await executar("testar", { config: cfgAna }, { repo, membro: admin }) as { imap: string | null; smtp: string | null }
  assertEquals([bom.imap, bom.smtp], [null, null])

  // módulo desligado
  repo.defs.modulo_email = false
  await assertRejects(() => executar("sincronizar", {}, { repo, membro: admin }), Error, "desligado")
  repo.defs.modulo_email = true

  // 1.ª sincronização: as duas mensagens, ligadas à Rita, com resumo e anexos
  const s1 = await executar("sincronizar", {}, { repo, membro: comAcesso }) as { novos: number }
  assertEquals(s1.novos, 2)
  const pedido = repo.es.find(e => e.assunto === "Pedido de orçamento")!
  const datas = repo.es.find(e => e.assunto === "Re: Datas")!
  assertEquals(pedido.contacto_id, "c-rita")
  assertEquals(pedido.de_nome, "Rita Gonçalves")
  assertMatch(pedido.resumo, /queria um orçamento para 3 bolos/)
  assertEquals(pedido.anexos.map(a => a.nome), ["lista.pdf"])
  assertEquals(datas.anexos.length, 0)
  assertEquals(datas.cc.map(x => x.email), ["rita@padaria.pt"])
  assert(!datas.resumo.includes("Que dia prefere"), "o resumo não leva o texto citado")
  assert(!pedido.lido)
  const entrada = (await repo.pastas()).find(p => p.especial === "entrada")!
  assertEquals([entrada.total, entrada.nao_lidos, entrada.ultimo_uid > 0], [2, 2, true])

  // 2.ª sincronização: nada novo (incremental, por UID)
  assertEquals((await executar("sincronizar", {}, { repo, membro: comAcesso }) as { novos: number }).novos, 0)
  assertEquals(repo.es.length, 2)

  // ler: corpo completo, fica lido no servidor
  const lido = await executar("ler", { id: datas.id }, { repo, membro: comAcesso }) as { html: string; texto: string; lido: boolean }
  assertMatch(lido.html, /<blockquote>/)
  assertMatch(lido.texto, /Pode ser sábado/)
  assert(lido.lido)
  const c = await correio.ligarImap({ ...cfgAna, password: "segredo" } as correio.ConfigCorreio)
  assertEquals((await correio.lerMarcas(c, "INBOX", [datas.uid])).get(datas.uid)?.lido, true)

  // anexo descarregado e descodificado
  const a = await executar("anexo", { id: pedido.id, parte: pedido.anexos[0].parte }, { repo, membro: comAcesso }) as { nome: string; base64: string }
  assertEquals(a.nome, "lista.pdf")
  assertEquals(Buffer.from(a.base64, "base64").toString("utf8"), pdf)
  await assertRejects(() => executar("anexo", { id: pedido.id, parte: "../x" }, { repo, membro: comAcesso }), Error, "inválido")

  // marcar como não lido (no servidor também)
  await executar("marcar", { ids: [datas.id], lido: false }, { repo, membro: comAcesso })
  assertEquals((await correio.lerMarcas(c, "INBOX", [datas.uid])).get(datas.uid)?.lido, false)
  // e o que se lê noutro programa aparece na app na sincronização seguinte
  await correio.marcar(c, "INBOX", [pedido.uid], "\\Seen", true)
  await executar("sincronizar", {}, { repo, membro: comAcesso })
  assert(repo.es.find(e => e.id === pedido.id)!.lido)

  // responder: endereço inválido é recusado antes de enviar
  await assertRejects(() => executar("enviar", { para: ["rita@padaria.pt"], cc: ["rita@padaria"], assunto: "Re: Pedido de orçamento", texto: "x", responder_a: pedido.id }, { repo, membro: comAcesso }), Error, "Endereços inválidos: rita@padaria")
  // anexos acima de 15 MB recusados
  const grande = Buffer.alloc(16 * 1024 * 1024, 1).toString("base64")
  await assertRejects(() => executar("enviar", { para: ["rita@padaria.pt"], assunto: "Grande", texto: "x", anexos: [{ nome: "g.bin", base64: grande }] }, { repo, membro: comAcesso }), Error, "15 MB")

  const env = await executar("enviar", {
    para: ["rita@padaria.pt"], assunto: "Re: Pedido de orçamento", texto: "Olá Rita,\nsegue o orçamento.\n\nAna",
    anexos: [{ nome: "orçamento.txt", tipo: "text/plain", base64: Buffer.from("3 bolos: 90 €").toString("base64") }], responder_a: pedido.id,
  }, { repo, membro: comAcesso }) as { ok: boolean; message_id: string; atividades: number; avisos: string[] }
  assert(env.ok); assertEquals(env.avisos, [])
  // histórico: atividade no contacto e no negócio aberto
  assertEquals(repo.atividades, [{ tipo: "email", resumo: "Email enviado: Re: Pedido de orçamento", contacto_id: "c-rita", negocio_id: "n-bolos", autor: "Bruno Costa" }])
  // o original fica respondido (na app e no servidor)
  assert(repo.es.find(e => e.id === pedido.id)!.respondido)
  assertEquals((await correio.lerMarcas(c, "INBOX", [pedido.uid])).get(pedido.uid)?.respondido, true)
  // a cópia está na pasta Enviados (criada, porque o GreenMail não a tem) e já aparece na app
  const enviados = (await repo.pastas()).find(p => p.especial === "enviados")!
  assertEquals(enviados.caminho, "Sent")
  const copia = repo.es.find(e => e.pasta === "Sent")!
  assertEquals([copia.assunto, copia.message_id, copia.contacto_id, copia.lido], ["Re: Pedido de orçamento", env.message_id, "c-rita", true])

  // do lado da Rita: chegou com In-Reply-To e References, texto, HTML e anexo
  const cr = await correio.ligarImap(cfgRita)
  const pastasRita = await correio.buscarNovas(cr, "INBOX", {})
  const resposta = pastasRita.mensagens.find(m => m.assunto === "Re: Pedido de orçamento")!
  assertEquals(resposta.in_reply_to, pedido.message_id)
  assertMatch(resposta.referencias ?? "", new RegExp(pedido.message_id!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assertEquals(resposta.anexos.map(x => x.nome), ["orçamento.txt"])
  const bruto = await correio.fonte(cr, "INBOX", resposta.uid)
  const p = await simpleParser(Buffer.from(bruto))
  assertMatch(String(p.html), /Olá Rita,<br>segue o orçamento/)
  assertEquals(p.from?.value[0], { address: "ana@exemplo.pt", name: "Ana Silva" })

  // reencaminhar com os anexos do original
  await executar("enviar", { para: ["rita@padaria.pt"], assunto: "Fw: Pedido de orçamento", texto: "Para guardar.", reencaminhar_de: pedido.id }, { repo, membro: comAcesso })
  const fw = (await correio.buscarNovas(cr, "INBOX", { ultimoUid: resposta.uid })).mensagens[0]
  assertEquals([fw.assunto, fw.anexos.map(x => x.nome).join()], ["Fw: Pedido de orçamento", "lista.pdf"])
  await correio.fechar(cr)

  // mover para uma pasta nova, criada noutro programa
  if (!(await c.list()).some(x => x.path === "Clientes")) await c.mailboxCreate("Clientes")
  await executar("pastas", {}, { repo, membro: comAcesso })
  await executar("mover", { ids: [datas.id], destino: "Clientes" }, { repo, membro: comAcesso })
  await executar("sincronizar", { pastas: ["Clientes"] }, { repo, membro: comAcesso })
  const movido = repo.es.filter(e => e.assunto === "Re: Datas")
  assertEquals(movido.map(e => e.pasta), ["Clientes"])
  await assertRejects(() => executar("mover", { ids: [pedido.id], destino: "Não existe" }, { repo, membro: comAcesso }), Error, "desconhecida")

  // apagar: vai para o Lixo; no Lixo, apaga de vez
  await executar("apagar", { ids: [pedido.id] }, { repo, membro: comAcesso })
  const lixo = (await repo.pastas()).find(p => p.especial === "lixo")!
  assertEquals(lixo.caminho, "Trash")
  await executar("sincronizar", { pastas: ["Trash"] }, { repo, membro: comAcesso })
  const noLixo = repo.es.find(e => e.pasta === "Trash" && e.assunto === "Pedido de orçamento")!
  assert(noLixo, "o email apagado aparece no Lixo")
  const r = await executar("apagar", { ids: [noLixo.id] }, { repo, membro: comAcesso }) as { apagados_de_vez: number }
  assertEquals(r.apagados_de_vez, 1)
  await executar("sincronizar", { pastas: ["Trash"] }, { repo, membro: comAcesso })
  assertEquals(repo.es.filter(e => e.pasta === "Trash").length, 0)

  // apagado noutro programa: desaparece da app na sincronização seguinte
  const [copiaUid] = [copia.uid]
  const lk = await c.getMailboxLock("Sent"); await c.messageDelete(String(copiaUid), { uid: true }); lk.release()
  await executar("sincronizar", {}, { repo, membro: comAcesso })
  assertEquals(repo.es.filter(e => e.pasta === "Sent" && e.uid === copiaUid).length, 0)
  await correio.fechar(c)
})

Deno.test("email: utilidades (resumo, descodificação, endereços)", () => {
  assertEquals(correio.fazerResumo("Olá\n> citado\n  mais   texto "), "Olá mais texto")
  assertEquals(correio.descodificar(new TextEncoder().encode("Ol=C3=A1 or=C3=A7a=\r\nmento"), "quoted-printable", "utf-8"), "Olá orçamento")
  assertEquals(correio.descodificar(new TextEncoder().encode("T2zDoQ=="), "base64", "utf-8"), "Olá")
  assertEquals(correio.descodificar(new Uint8Array([0x4f, 0x6c, 0xe1]), "8bit", "iso-8859-1"), "Olá")
  for (const e of ["rita@padaria.pt", "a.b+c@sub.dominio.com"]) assert(correio.emailValido(e), e)
  for (const e of ["rita@padaria", "rita padaria@x.pt", "@x.pt", "a@b.c", "a<b>@x.pt"]) assert(!correio.emailValido(e), e)
  assertEquals(correio.textoParaHtml("a<b>\nc").includes("a&lt;b&gt;<br>c"), true)
})
