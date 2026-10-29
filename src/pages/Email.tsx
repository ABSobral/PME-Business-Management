import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Archive, Download, FolderInput, Folder, Inbox, Mail, MailOpen, Paperclip, PenSquare, RefreshCw, Reply, ReplyAll, Search, Send, Trash2, Forward, AlertOctagon, FileText, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { funcao, useDados } from '../lib/dados'
import type { Email as EmailT, EspecialPasta, PastaEmail } from '../lib/tipos'
import { dataCurta, dataLonga, hora, hoje, isoDia, normaliza, tamanhoLegivel } from '../lib/util'
import { Erro, Vazio } from '../components/ui'
import { useDialogo } from '../components/Dialogo'
import Escrever, { type Rascunho } from '../components/Escrever'

const ICONE: Record<EspecialPasta, typeof Inbox> = { entrada: Inbox, enviados: Send, lixo: Trash2, rascunhos: FileText, spam: AlertOctagon, arquivo: Archive }
const NOME: Record<EspecialPasta, string> = { entrada: 'Entrada', enviados: 'Enviados', lixo: 'Lixo', rascunhos: 'Rascunhos', spam: 'Spam', arquivo: 'Arquivo' }
const nomePasta = (p: PastaEmail) => (p.especial ? NOME[p.especial] : p.nome)
const quando = (iso: string) => (isoDia(new Date(iso)) === hoje() ? hora(iso) : dataCurta(iso))
const assuntoBase = (s: string) => s.replace(/^(\s*(re|res|fw|fwd|enc|reenc)\s*:\s*)+/i, '').trim()

// o texto antes da primeira citação ("> ..." ou "Em ..., ... escreveu:") e o resto
export function separarCitacao(t: string): [string, string] {
  const linhas = t.split(/\r?\n/)
  const i = linhas.findIndex((l, k) => /^\s*>/.test(l) || /^(Em|On|No dia|Le) .{4,200}(escreveu|wrote|a écrit)\s*:?\s*$/i.test(l) || (/^-{2,}\s*(Mensagem original|Original Message|Forwarded message)/i.test(l) && k > 0))
  if (i <= 0) return [t, '']
  return [linhas.slice(0, i).join('\n').trimEnd(), linhas.slice(i).join('\n')]
}

// HTML do email numa moldura isolada: sem scripts, sem formulários, sem imagens de fora (a não ser que se peça)
function htmlSeguro(html: string, imagens: boolean, citado: boolean) {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data: cid:${imagens ? ' https: http:' : ''}; font-src data:`
  const css = `body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1c1917;margin:0;word-wrap:break-word;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}a{color:#2563eb}${citado ? '' : 'blockquote,.gmail_quote,.yahoo_quoted,#divRplyFwdMsg,#divRplyFwdMsg~*,.moz-cite-prefix{display:none!important}'}`
  // os scripts saem logo (a moldura também os bloquearia); formulários e molduras dentro do email também
  const limpo = html.replace(/<(script|iframe|object|embed|form)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/<(script|iframe|object|embed|meta|base|link)\b[^>]*>/gi, '')
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>${css}</style></head><body>${limpo}</body></html>`
}

function MolduraHtml({ html, imagens, citado }: { html: string; imagens: boolean; citado: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [altura, setAltura] = useState(200)
  const medir = () => { const d = ref.current?.contentDocument; if (d?.body) setAltura(Math.min(20000, Math.max(80, d.documentElement.scrollHeight + 8))) }
  useEffect(() => { const t = setTimeout(medir, 300); return () => clearTimeout(t) }, [html, imagens, citado])
  // allow-same-origin sem allow-scripts: a app mede a altura, mas nada no email corre
  return <iframe ref={ref} title="Conteúdo do email" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={htmlSeguro(html, imagens, citado)} onLoad={medir} className="block w-full border-0" style={{ height: altura }} />
}

function Corpo({ e }: { e: EmailT }) {
  const [citado, setCitado] = useState(false)
  const [imagens, setImagens] = useState(false)
  const temImagensFora = !!e.html && /<img[^>]+src=["']?https?:/i.test(e.html)
  const temCitacaoHtml = !!e.html && /<blockquote|gmail_quote|divRplyFwdMsg/i.test(e.html)
  if (e.html) return (
    <div className="space-y-2">
      {temImagensFora && !imagens && <p className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 px-3 py-1.5 text-xs text-stone-600">As imagens de fora estão escondidas (protegem a sua privacidade).<button className="font-medium text-marca-700 underline" onClick={() => setImagens(true)}>Mostrar imagens</button></p>}
      <MolduraHtml html={e.html} imagens={imagens} citado={citado} />
      {temCitacaoHtml && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setCitado(c => !c)}>{citado ? 'Esconder texto citado' : 'Mostrar texto citado'}</button>}
    </div>
  )
  const [novo, antigo] = separarCitacao(e.texto ?? '')
  return (
    <div className="space-y-2">
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{novo || <span className="text-stone-400">(sem texto)</span>}</div>
      {antigo && <>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setCitado(c => !c)} aria-expanded={citado}>{citado ? 'Esconder texto citado' : 'Mostrar texto citado'}</button>
        {citado && <div className="whitespace-pre-wrap break-words border-l-2 border-stone-200 pl-3 text-sm text-stone-500">{antigo}</div>}
      </>}
    </div>
  )
}

export default function Email() {
  const { definicoes, contactoDe, eAdmin, recarregar: recarregarDados } = useDados()
  const { confirmar } = useDialogo()
  const [pastas, setPastas] = useState<PastaEmail[]>([])
  const [pasta, setPasta] = useState<string>('INBOX')
  const [lista, setLista] = useState<EmailT[]>([])
  const [busca, setBusca] = useState('')
  const [soNaoLidos, setSoNaoLidos] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)
  const [conversa, setConversa] = useState<EmailT[]>([])
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [aSinc, setASinc] = useState(false)
  const [aLer, setALer] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [gaveta, setGaveta] = useState(false)
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const configurado = !!definicoes.email_config?.imap_host

  const lerPastas = useCallback(async () => {
    const { data, error } = await supabase.from('email_pastas').select('*').order('caminho')
    if (error) { setErro(error.message); return [] }
    const ps = (data ?? []) as PastaEmail[]
    const ordem: (EspecialPasta | null)[] = ['entrada', 'enviados', 'rascunhos', 'arquivo', 'spam', 'lixo']
    ps.sort((a, b) => (a.especial ? ordem.indexOf(a.especial) : 99) - (b.especial ? ordem.indexOf(b.especial) : 99) || a.nome.localeCompare(b.nome))
    setPastas(ps); return ps
  }, [])
  const lerLista = useCallback(async (p: string) => {
    const { data, error } = await supabase.from('emails').select('id, pasta, uid, message_id, in_reply_to, referencias, de_nome, de_email, para, cc, assunto, data, lido, respondido, anexos, resumo, contacto_id, corpo_em').eq('pasta', p).order('data', { ascending: false }).limit(500)
    if (error) setErro(error.message)
    setLista(((data ?? []) as EmailT[]))
  }, [])

  const sincronizar = useCallback(async (extra?: string) => {
    setASinc(true); setErro(null)
    try {
      const r = await funcao<{ novos: number }>('email', { acao: 'sincronizar', pastas: extra ? [extra] : [] })
      const ps = await lerPastas()
      if (!ps.some(x => x.caminho === pasta) && ps[0]) setPasta(ps[0].caminho)
      await lerLista(ps.some(x => x.caminho === pasta) ? pasta : ps[0]?.caminho ?? pasta)
      if (r.novos) setAviso(r.novos === 1 ? '1 email novo.' : `${r.novos} emails novos.`)
    } catch (e) { setErro((e as Error).message) } finally { setASinc(false) }
  }, [lerPastas, lerLista, pasta])

  // ao abrir: mostra o que já está guardado e vai buscar o que é novo
  useEffect(() => { if (!configurado) return; (async () => { const ps = await lerPastas(); const ini = ps.find(p => p.especial === 'entrada')?.caminho ?? ps[0]?.caminho; if (ini) { setPasta(ini); await lerLista(ini) } sincronizar() })() }, [configurado]) // eslint-disable-line react-hooks/exhaustive-deps

  async function mudarPasta(p: string) {
    setPasta(p); setAberto(null); setGaveta(false); setBusca('')
    await lerLista(p)
    const pp = pastas.find(x => x.caminho === p)
    if (pp && pp.especial !== 'entrada' && pp.especial !== 'enviados') sincronizar(p)
  }

  async function abrir(id: string) {
    setAberto(id); setErro(null); setALer(true); setExpandidos(new Set([id]))
    try {
      const e = await funcao<EmailT>('email', { acao: 'ler', id })
      setLista(l => l.map(x => (x.id === id ? { ...x, lido: true } : x)))
      setPastas(ps => ps.map(p => (p.caminho === e.pasta && !lista.find(x => x.id === id)?.lido ? { ...p, nao_lidos: Math.max(0, p.nao_lidos - 1) } : p)))
      // a conversa: as mensagens ligadas por Message-ID, In-Reply-To e References, em qualquer pasta
      const ids = [...new Set([...(e.referencias ?? '').split(/\s+/), e.in_reply_to ?? ''].filter(Boolean))]
      const [a, b] = await Promise.all([
        ids.length ? supabase.from('emails').select('*').in('message_id', ids) : Promise.resolve({ data: [] }),
        e.message_id ? supabase.from('emails').select('*').eq('in_reply_to', e.message_id) : Promise.resolve({ data: [] }),
      ])
      const outros = [...((a.data ?? []) as EmailT[]), ...((b.data ?? []) as EmailT[])].filter((x, i, l) => x.id !== e.id && l.findIndex(y => y.id === x.id) === i)
      setConversa([...outros, e].sort((x, y) => x.data.localeCompare(y.data)))
    } catch (err) { setErro((err as Error).message) } finally { setALer(false) }
  }
  async function expandir(x: EmailT) {
    setExpandidos(s => new Set([...s, x.id]))
    if (x.corpo_em) return
    try { const e = await funcao<EmailT>('email', { acao: 'ler', id: x.id }); setConversa(c => c.map(y => (y.id === x.id ? e : y))) } catch (err) { setErro((err as Error).message) }
  }

  async function acao(nome: 'marcar' | 'mover' | 'apagar', ids: string[], extra: Record<string, unknown> = {}) {
    setErro(null)
    try {
      await funcao('email', { acao: nome, ids, ...extra })
      if (nome === 'marcar') setLista(l => l.map(x => (ids.includes(x.id) ? { ...x, lido: extra.lido !== false } : x)))
      else { setLista(l => l.filter(x => !ids.includes(x.id))); setAberto(null) }
      lerPastas()
      if (nome === 'apagar') setAviso('Email apagado.')
      if (nome === 'mover') setAviso('Email movido.')
    } catch (e) { setErro((e as Error).message) }
  }
  async function descarregar(e: EmailT, parte: string) {
    try {
      const a = await funcao<{ nome: string; tipo: string; base64: string }>('email', { acao: 'anexo', id: e.id, parte })
      const bytes = Uint8Array.from(atob(a.base64), c => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: a.tipo }))
      const l = document.createElement('a'); l.href = url; l.download = a.nome; document.body.appendChild(l); l.click(); l.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (err) { setErro((err as Error).message) }
  }

  const eu = (definicoes.email_config?.endereco ?? '').toLowerCase()
  function responder(e: EmailT, modo: 'um' | 'todos' | 'reencaminhar') {
    const enviado = (e.de_email ?? '') === eu
    const de = e.de_nome ? `${e.de_nome} <${e.de_email}>` : e.de_email ?? ''
    const corpo = (e.texto ?? '').trim()
    if (modo === 'reencaminhar') {
      setRascunho({ titulo: 'Reencaminhar', para: [], cc: [], assunto: /^(fw|fwd|enc)\s*:/i.test(e.assunto) ? e.assunto : `Fw: ${assuntoBase(e.assunto)}`, reencaminhar_de: e.id, anexosOriginais: e.anexos,
        texto: `\n\nMensagem reencaminhada:\nDe: ${de}\nData: ${dataLonga(e.data)}, ${hora(e.data)}\nAssunto: ${e.assunto}\nPara: ${e.para.map(x => x.email).join(', ')}\n\n${corpo}` })
      return
    }
    const para = enviado ? e.para.map(x => x.email) : [e.de_email ?? ''].filter(Boolean)
    const cc = modo === 'todos' ? [...e.para, ...e.cc].map(x => x.email).filter(x => x !== eu && !para.includes(x)) : []
    const citado = corpo.split(/\r?\n/).map(l => `> ${l}`).join('\n')
    setRascunho({ titulo: 'Responder', para, cc, assunto: /^(re|res)\s*:/i.test(e.assunto) ? e.assunto : `Re: ${assuntoBase(e.assunto)}`, responder_a: e.id,
      texto: `\n\nEm ${dataLonga(e.data)}, às ${hora(e.data)}, ${e.de_nome || e.de_email} escreveu:\n${citado}` })
  }

  const filtrada = useMemo(() => {
    const q = normaliza(busca.trim())
    return lista.filter(e => (!soNaoLidos || !e.lido) && (!q || normaliza(`${e.assunto} ${e.de_nome ?? ''} ${e.de_email ?? ''} ${e.para.map(x => `${x.nome ?? ''} ${x.email}`).join(' ')} ${e.resumo ?? ''}`).includes(q)))
  }, [lista, busca, soNaoLidos])
  const atual = pastas.find(p => p.caminho === pasta)
  const enviados = atual?.especial === 'enviados'
  const e = conversa.find(x => x.id === aberto) ?? null

  if (!configurado) return (
    <div className="mx-auto max-w-lg space-y-3 pt-6 text-center">
      <Mail size={36} className="mx-auto text-stone-400" />
      <h1 className="text-xl font-semibold">Email por configurar</h1>
      <p className="text-sm text-stone-600">{eAdmin ? 'Configure a caixa de correio (servidores, utilizador e password de aplicação) em Definições.' : 'Um administrador tem de configurar a caixa de correio em Definições.'}</p>
      {eAdmin && <Link to="/definicoes#email" className="btn-primary">Ir para Definições</Link>}
    </div>
  )

  const listaPastas = (
    <nav aria-label="Pastas" className="space-y-0.5">
      {pastas.map(p => { const I = p.especial ? ICONE[p.especial] : Folder; return (
        <button key={p.caminho} onClick={() => mudarPasta(p.caminho)} aria-current={p.caminho === pasta ? 'true' : undefined}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${p.caminho === pasta ? 'bg-marca-50 font-medium text-marca-800' : 'text-stone-600 hover:bg-stone-50'}`}>
          <I size={16} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{nomePasta(p)}</span>
          {p.nao_lidos > 0 && p.especial !== 'enviados' && <span className="numero text-xs font-semibold">{p.nao_lidos}</span>}
        </button>
      ) })}
    </nav>
  )

  return (
    <div className="-mx-4 -mt-5 sm:-mx-6 lg:-mx-8 lg:-mt-8">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <button className="btn-outline px-2.5 lg:hidden" onClick={() => setGaveta(true)} aria-label="Pastas"><Folder size={16} /><span className="max-w-28 truncate">{atual ? nomePasta(atual) : 'Pastas'}</span></button>
        <h1 className="mr-auto hidden text-2xl font-semibold lg:block">Email</h1>
        <span className="hidden text-xs text-stone-500 xl:inline">{definicoes.email_config.endereco}</span>
        <button className="btn-outline" onClick={() => sincronizar(atual && !['entrada', 'enviados'].includes(atual.especial ?? '') ? pasta : undefined)} disabled={aSinc} aria-label="Sincronizar"><RefreshCw size={16} className={aSinc ? 'animate-spin' : ''} /><span className="max-sm:hidden">Sincronizar</span></button>
        <button className="btn-primary max-lg:ml-auto" onClick={() => setRascunho({ para: [], cc: [], assunto: '', texto: '' })}><PenSquare size={16} /> Escrever</button>
      </div>
      {(erro || aviso) && <div className="space-y-2 px-4 pt-3 sm:px-6 lg:px-8"><Erro texto={erro} />{aviso && <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}<button className="ml-auto" aria-label="Fechar aviso" onClick={() => setAviso(null)}><X size={14} /></button></div>}</div>}

      <div className="grid min-h-[calc(100dvh-10rem)] lg:h-[calc(100dvh-4.5rem)] lg:grid-cols-[13rem_minmax(18rem,24rem)_minmax(0,1fr)]">
        <aside className="hidden overflow-y-auto border-r border-stone-200 bg-white p-3 lg:block">{listaPastas}</aside>

        <section aria-label="Lista de emails" className={`min-w-0 overflow-y-auto border-r border-stone-200 bg-white ${aberto ? 'max-lg:hidden' : ''}`}>
          <div className="sticky top-0 z-10 space-y-2 border-b border-stone-100 bg-white p-3">
            <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="input pl-9" placeholder="Procurar" aria-label="Procurar emails" value={busca} onChange={ev => setBusca(ev.target.value)} /></div>
            <div className="flex gap-1.5">
              <button className={`badge px-3 py-1.5 text-xs ${!soNaoLidos ? 'bg-marca-700 text-sobre-marca' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`} onClick={() => setSoNaoLidos(false)}>Todos</button>
              <button className={`badge px-3 py-1.5 text-xs ${soNaoLidos ? 'bg-marca-700 text-sobre-marca' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`} onClick={() => setSoNaoLidos(true)}>Não lidos{atual?.nao_lidos ? ` (${atual.nao_lidos})` : ''}</button>
            </div>
          </div>
          {filtrada.length === 0 ? <div className="p-4"><Vazio>{aSinc ? 'A sincronizar' : busca || soNaoLidos ? 'Nada encontrado.' : 'Esta pasta está vazia.'}</Vazio></div> : (
            <ul className="divide-y divide-stone-100">
              {filtrada.map(m => {
                const quem = enviados ? `Para: ${m.para.map(x => x.nome || x.email).join(', ')}` : m.de_nome || m.de_email || '(sem remetente)'
                return (
                  <li key={m.id}>
                    <button onClick={() => abrir(m.id)} data-email={m.assunto} className={`relative block w-full px-4 py-3 text-left hover:bg-stone-50 ${aberto === m.id ? 'bg-marca-50' : ''}`}>
                      {!m.lido && <span className="absolute left-1.5 top-4 h-2 w-2 rounded-full bg-marca-700" aria-label="Não lido" />}
                      <span className="flex items-baseline gap-2"><span className={`min-w-0 flex-1 truncate text-sm ${m.lido ? '' : 'font-semibold'}`}>{quem}</span><span className="shrink-0 text-xs text-stone-500">{quando(m.data)}</span></span>
                      <span className={`flex items-center gap-1 truncate text-sm ${m.lido ? 'text-stone-700' : 'font-semibold'}`}>{m.respondido && <Reply size={12} className="shrink-0 text-stone-400" aria-label="Respondido" />}{m.anexos.length > 0 && <Paperclip size={12} className="shrink-0 text-stone-400" aria-label="Com anexos" />}<span className="truncate">{m.assunto || '(sem assunto)'}</span></span>
                      <span className="block truncate text-xs text-stone-500">{m.resumo}</span>
                      {m.contacto_id && contactoDe(m.contacto_id) && <span className="badge mt-1 bg-stone-100 text-stone-600">{contactoDe(m.contacto_id)!.nome}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section aria-label="Email aberto" className={`min-w-0 overflow-y-auto bg-stone-50 ${aberto ? '' : 'max-lg:hidden'}`}>
          {!aberto ? <div className="hidden h-full items-center justify-center text-sm text-stone-400 lg:flex">Escolha um email para o ler.</div> : !e ? <div className="p-6 text-sm text-stone-500">{aLer ? 'A abrir' : ''}</div> : (
            <article className="mx-auto max-w-3xl space-y-3 p-4 sm:p-6">
              <div className="flex items-start gap-2">
                <button className="btn-ghost -ml-2 px-2 lg:hidden" aria-label="Voltar à lista" onClick={() => setAberto(null)}><ArrowLeft size={18} /></button>
                <h2 className="min-w-0 flex-1 break-words text-lg font-semibold sm:text-xl">{e.assunto || '(sem assunto)'}</h2>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button className="btn-outline px-2.5 py-1.5" onClick={() => responder(e, 'um')}><Reply size={15} /> Responder</button>
                {e.para.length + e.cc.length > 1 && <button className="btn-outline px-2.5 py-1.5" onClick={() => responder(e, 'todos')}><ReplyAll size={15} /> A todos</button>}
                <button className="btn-outline px-2.5 py-1.5" onClick={() => responder(e, 'reencaminhar')}><Forward size={15} /> Reencaminhar</button>
                <button className="btn-outline px-2.5 py-1.5" onClick={() => acao('marcar', [e.id], { lido: false })} aria-label="Marcar como não lido"><MailOpen size={15} /><span className="max-sm:hidden">Não lido</span></button>
                <label className="btn-outline relative px-2.5 py-1.5" title="Mover para"><FolderInput size={15} /><span className="max-sm:hidden">Mover</span>
                  <select className="absolute inset-0 cursor-pointer opacity-0" aria-label="Mover para a pasta" value="" onChange={ev => ev.target.value && acao('mover', [e.id], { destino: ev.target.value })}>
                    <option value="">Mover para</option>{pastas.filter(p => p.caminho !== e.pasta).map(p => <option key={p.caminho} value={p.caminho}>{nomePasta(p)}</option>)}
                  </select>
                </label>
                <button className="btn-outline px-2.5 py-1.5 text-red-700" aria-label="Apagar" onClick={async () => { const noLixo = pastas.find(p => p.caminho === e.pasta)?.especial === 'lixo'; if (!noLixo || await confirmar('Apagar de vez?', { texto: 'Este email já está no Lixo e deixa de existir.', ok: 'Apagar', perigo: true })) acao('apagar', [e.id]) }}><Trash2 size={15} /></button>
              </div>
              {conversa.map(x => {
                const abertoX = expandidos.has(x.id)
                const c = contactoDe(x.contacto_id)
                return (
                  <div key={x.id} className="card overflow-hidden" data-mensagem={x.id === e.id ? 'aberta' : 'conversa'}>
                    <button className="flex w-full items-start gap-3 px-4 py-3 text-left" onClick={() => (abertoX ? x.id !== e.id && setExpandidos(s => { const n = new Set(s); n.delete(x.id); return n }) : expandir(x))} aria-expanded={abertoX}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{x.de_nome || x.de_email}{x.de_nome && <span className="font-normal text-stone-500"> &lt;{x.de_email}&gt;</span>}</span>
                        {abertoX ? <span className="block truncate text-xs text-stone-500">Para: {x.para.map(p => p.nome || p.email).join(', ')}{x.cc.length ? ` · Cc: ${x.cc.map(p => p.nome || p.email).join(', ')}` : ''}</span> : <span className="block truncate text-xs text-stone-500">{x.resumo}</span>}
                      </span>
                      <span className="shrink-0 text-right text-xs text-stone-500">{dataCurta(x.data)}<br />{hora(x.data)}</span>
                    </button>
                    {abertoX && <div className="space-y-3 border-t border-stone-100 px-4 py-3">
                      {c && <span className="badge bg-marca-50 text-marca-800">Contacto: {c.nome}</span>}
                      {x.corpo_em || x.texto || x.html ? <Corpo e={x} /> : <p className="text-sm text-stone-400">A abrir</p>}
                      {x.anexos.length > 0 && <ul className="flex flex-wrap gap-2" aria-label="Anexos">{x.anexos.map(a => <li key={a.parte} className="max-w-full"><button className="btn-outline max-w-full px-2.5 py-1.5 text-xs" onClick={() => descarregar(x, a.parte)}><Download size={14} className="shrink-0" /><span className="truncate">{a.nome}</span><span className="shrink-0 text-stone-400">{tamanhoLegivel(a.tamanho)}</span></button></li>)}</ul>}
                    </div>}
                  </div>
                )
              })}
            </article>
          )}
        </section>
      </div>

      {gaveta && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Pastas">
          <div className="absolute inset-0 bg-stone-900/30" onClick={() => setGaveta(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-white p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between px-1"><h2 className="font-semibold">Pastas</h2><button className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Fechar" onClick={() => setGaveta(false)}><X size={18} /></button></div>
            {listaPastas}
          </div>
        </div>
      )}
      <Escrever rascunho={rascunho} onFechar={() => setRascunho(null)} onEnviado={r => { setAviso(`Email enviado.${r.atividades ? ' Ficou no histórico do contacto.' : ''}${r.avisos?.length ? ' ' + r.avisos.join(' ') : ''}`); lerPastas(); if (enviados) lerLista(pasta); if (r.atividades) recarregarDados() }} />
    </div>
  )
}
