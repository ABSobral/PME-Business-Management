// Repositório em memória para testar as ações das Edge Functions sem Supabase.
import type { EmailLinha, NovaLinha, PastaLinha, Repo } from "../../supabase/functions/email/acoes.ts";

export type Atividade = { tipo: string; resumo: string; contacto_id: string; negocio_id: string | null; autor: string }

export class RepoEmail implements Repo {
  defs = { modulo_email: true, email_config: {} as Record<string, unknown> }
  pw: string | null = null
  ps = new Map<string, PastaLinha>()
  es: EmailLinha[] = []
  contactos: { id: string; email: string; nome: string }[] = []
  negocios: { id: string; contacto_id: string }[] = []
  atividades: Atividade[] = []

  async definicoes() { return this.defs }
  async password() { return this.pw }
  async pastas() { return [...this.ps.values()].sort((a, b) => a.caminho.localeCompare(b.caminho)) }
  async guardarPasta(p: Partial<PastaLinha> & { caminho: string }) {
    const a = this.ps.get(p.caminho) ?? { caminho: p.caminho, nome: p.caminho, especial: null, separador: null, uidvalidity: null, ultimo_uid: 0, total: 0, nao_lidos: 0, sincronizada_em: null }
    this.ps.set(p.caminho, { ...a, ...p })
  }
  async apagarPastas(cs: string[]) { for (const c of cs) this.ps.delete(c); this.es = this.es.filter(e => !cs.includes(e.pasta)) }
  async marcasDaPasta(pasta: string) { return this.es.filter(e => e.pasta === pasta).map(e => ({ id: e.id, uid: e.uid, lido: e.lido, respondido: e.respondido })) }
  async inserirEmails(linhas: NovaLinha[]) {
    for (const l of linhas) if (!this.es.some(e => e.pasta === l.pasta && e.uid === l.uid)) this.es.push({ ...l, id: crypto.randomUUID(), texto: null, html: null, corpo_em: null })
  }
  async atualizarEmail(id: string, campos: Partial<EmailLinha>) { const e = this.es.find(x => x.id === id); if (e) Object.assign(e, campos) }
  async apagarEmails(ids: string[]) { this.es = this.es.filter(e => !ids.includes(e.id)) }
  async apagarEmailsDaPasta(pasta: string) { this.es = this.es.filter(e => e.pasta !== pasta) }
  async emails(ids: string[]) { return this.es.filter(e => ids.includes(e.id)).map(e => ({ ...e })) }
  async contactosPorEmail(enderecos: string[]) { return this.contactos.filter(c => enderecos.includes(c.email)) }
  async negocioAberto(contactoId: string) { return this.negocios.find(n => n.contacto_id === contactoId)?.id ?? null }
  async registarAtividade(a: Atividade) { this.atividades.push(a) }
}
