import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Copy, ExternalLink, FileText, Mail, Plus, Printer, Trash2, Eye, PencilLine } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useDados } from '../lib/dados'
import { ESTADOS_PROPOSTA, type LinhaProposta, type Proposta } from '../lib/tipos'
import { dataCurta, dinheiro, dinheiro2, hoje, somaDias } from '../lib/util'
import PropostaDoc, { totais } from '../components/PropostaDoc'
import { useDialogo } from '../components/Dialogo'
import { Campo, Erro, InputNumero, Vazio } from '../components/ui'
import Escrever, { type Rascunho } from '../components/Escrever'

export function ListaPropostas() {
  const [lista, setLista] = useState<Proposta[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const navegar = useNavigate()
  useEffect(() => { supabase.from('propostas').select('*').order('criado_em', { ascending: false }).then(({ data, error }) => { if (error) setErro(error.message); setLista((data ?? []) as Proposta[]) }) }, [])
  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Propostas</h1>
        <button className="btn-primary" onClick={() => navegar('/propostas/nova')}><Plus size={16} /> Nova proposta</button>
      </div>
      <Erro texto={erro} />
      {lista === null ? null : lista.length === 0 ? <Vazio>Ainda não há propostas. Crie uma aqui ou a partir de um negócio no Pipeline.</Vazio> : (
        <div className="card divide-y divide-stone-100 overflow-hidden">
          {lista.map(p => (
            <Link key={p.id} to={`/propostas/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50">
              <FileText size={18} className="shrink-0 text-stone-400" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.titulo}</span><span className="block truncate text-xs text-stone-500">nº {p.numero}{p.cliente_nome || p.cliente_empresa ? ` · ${[p.cliente_nome, p.cliente_empresa].filter(Boolean).join(', ')}` : ''} · {dataCurta(p.criado_em)}</span></span>
              <span className="numero hidden text-sm font-semibold sm:block">{dinheiro(totais(p).base, p.moeda)}</span>
              <span className={`badge shrink-0 ${ESTADOS_PROPOSTA[p.estado].cor}`}>{ESTADOS_PROPOSTA[p.estado].nome}{p.vistas > 0 && ['enviada', 'vista'].includes(p.estado) ? ` ${p.vistas}×` : ''}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function EditorProposta() {
  const { id } = useParams(); const [params] = useSearchParams()
  const navegar = useNavigate()
  const { negocioDe, contactoDe, empresaDe, eu, negocios, definicoes, emCurso, gravar, pode, recarregar } = useDados()
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [enviadaPorEmail, setEnviadaPorEmail] = useState<string | null>(null)
  const { confirmar } = useDialogo()
  const [p, setP] = useState<Partial<Proposta> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [mudou, setMudou] = useState(false)
  const [aGuardar, setAGuardar] = useState(false)
  const [ver, setVer] = useState(false)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (id && id !== 'nova') { supabase.from('propostas').select('*').eq('id', id).single().then(({ data, error }) => { if (error) setErro(error.message); else { setP(data as Proposta); setMudou(false) } }); return }
    const n = negocioDe(params.get('negocio')); const c = contactoDe(n?.contacto_id)
    setP({
      negocio_id: n?.id ?? null, titulo: n?.titulo ?? '', cliente_nome: c?.nome ?? '', cliente_empresa: empresaDe(n?.empresa_id ?? c?.empresa_id)?.nome ?? '', cliente_email: c?.email ?? '',
      introducao: definicoes.proposta_intro, linhas: [{ descricao: n?.titulo ?? '', quantidade: 1, preco: n?.valor ?? 0 }], desconto: 0, iva_pct: Number(definicoes.iva_pct),
      moeda: definicoes.moeda, condicoes: definicoes.proposta_condicoes, validade: somaDias(hoje(), definicoes.proposta_validade_dias || 30), estado: 'rascunho', criado_em: new Date().toISOString(),
    }); setMudou(true)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Proposta>(k: K, v: Proposta[K] | null) => { setP(x => ({ ...x!, [k]: v })); setMudou(true) }
  const setLinha = (i: number, campos: Partial<LinhaProposta>) => set('linhas', (p?.linhas ?? []).map((l, j) => (j === i ? { ...l, ...campos } : l)))
  const t = useMemo(() => totais({ linhas: p?.linhas ?? [], desconto: p?.desconto ?? 0, iva_pct: p?.iva_pct ?? 0 }), [p])

  async function guardar(): Promise<Proposta | null> {
    if (!p) return null
    if (!p.titulo?.trim()) { setErro('Falta o título da proposta.'); return null }
    setAGuardar(true); setErro(null)
    try {
      const { id: pid, token: _t, numero: _n, criado_em: _c, atualizado_em: _a, vistas: _v, ...resto } = p as Proposta
      const linha = { ...resto, titulo: p.titulo.trim(), linhas: (p.linhas ?? []).filter(l => l.descricao.trim() || l.preco), criado_por: p.criado_por ?? eu?.nome ?? null }
      const r = pid ? await supabase.from('propostas').update(linha).eq('id', pid).select().single() : await supabase.from('propostas').insert(linha).select().single()
      if (r.error) throw new Error(r.error.message)
      const g = r.data as Proposta
      setP(g); setMudou(false)
      // o valor do negócio em curso acompanha a proposta (sem IVA)
      const n = negocioDe(g.negocio_id); const base = totais(g).base
      if (n && emCurso(n) && base > 0 && Number(n.valor) !== base) await gravar('negocios', { id: n.id, valor: base })
      if (!pid) navegar(`/propostas/${g.id}`, { replace: true })
      return g
    } catch (e) { setErro((e as Error).message); return null } finally { setAGuardar(false) }
  }
  // o link só funciona fora da equipa depois de "enviada": copiar o link marca-a como enviada
  async function marcarEnviada(g: Proposta) {
    if (g.estado !== 'rascunho') return g
    const { data, error } = await supabase.from('propostas').update({ estado: 'enviada', enviada_em: new Date().toISOString() }).eq('id', g.id).select().single()
    if (error) { setErro(error.message); return g }
    setP(data as Proposta); return data as Proposta
  }
  const link = (g: Pick<Proposta, 'token'>) => `${location.origin}/p/${g.token}`
  async function copiarLink() {
    let g = mudou || !p?.id ? await guardar() : (p as Proposta); if (!g) return
    g = await marcarEnviada(g)
    try { await navigator.clipboard.writeText(link(g)) } catch { window.prompt('Copie o link:', link(g)) }
    setCopiado(true); setTimeout(() => setCopiado(false), 2500)
  }
  const textoEmail = (g: Proposta) => {
    const primeiro = (g.cliente_nome ?? '').split(/\s+/)[0]
    return `Olá${primeiro ? ' ' + primeiro : ''},\n\nSegue a nossa proposta "${g.titulo}" (${dinheiro2(totais(g).base, g.moeda)} sem IVA).\nPode ver todos os detalhes e aceitar diretamente neste link:\n${link(g)}\n\nObrigado,\n${eu?.nome ?? ''}`
  }
  // com o módulo Email ligado, envia pela caixa do negócio (fica no histórico do contacto); sem ele, abre o programa de email
  async function enviarPelaApp() {
    const g = mudou || !p?.id ? await guardar() : (p as Proposta); if (!g) return
    setRascunho({ titulo: 'Enviar proposta por email', para: g.cliente_email ? [g.cliente_email.trim().toLowerCase()] : [], cc: [], assunto: `Proposta: ${g.titulo}`, texto: textoEmail(g), negocio_id: g.negocio_id })
  }
  async function enviarEmail() {
    let g = mudou || !p?.id ? await guardar() : (p as Proposta); if (!g) return
    g = await marcarEnviada(g)
    const corpo = textoEmail(g)
    window.location.href = `mailto:${encodeURIComponent(g.cliente_email ?? '')}?subject=${encodeURIComponent(`Proposta: ${g.titulo}`)}&body=${encodeURIComponent(corpo)}`
  }
  async function apagarProposta() {
    if (!p?.id || !(await confirmar('Apagar esta proposta?', { texto: 'O link deixa de funcionar.', ok: 'Apagar', perigo: true }))) return
    await supabase.from('propostas').delete().eq('id', p.id); navegar('/propostas')
  }

  if (!p) return <div><Erro texto={erro} /></div>
  const doc = { ...p, linhas: p.linhas ?? [], desconto: p.desconto ?? 0, iva_pct: p.iva_pct ?? 0, titulo: p.titulo ?? '', moeda: p.moeda ?? definicoes.moeda }
  const marca = { nome: definicoes.nome_negocio, logo_url: definicoes.logo_url, cor: definicoes.cor, email: definicoes.email, telefone: definicoes.telefone, site: definicoes.site, morada: definicoes.morada, nif: definicoes.nif }
  const respondida = p.estado === 'aceite' || p.estado === 'recusada'
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <button className="btn-ghost px-2" aria-label="Voltar" onClick={() => navegar('/propostas')}><ArrowLeft size={18} /></button>
        <h1 className="mr-auto text-xl font-semibold sm:text-2xl">{p.id ? `Proposta nº ${p.numero}` : 'Nova proposta'}</h1>
        {p.estado && <span className={`badge ${ESTADOS_PROPOSTA[p.estado].cor}`}>{ESTADOS_PROPOSTA[p.estado].nome}{p.vistas ? ` · vista ${p.vistas}×` : ''}</span>}
      </div>
      {p.estado === 'aceite' && <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 print:hidden">Aceite por {p.respondida_por} a {dataCurta(p.respondida_em)}.{p.resposta && <> "{p.resposta}"</>}</div>}
      {p.estado === 'recusada' && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden">Recusada{p.respondida_por && ` por ${p.respondida_por}`}.{p.resposta && <> "{p.resposta}"</>}</div>}
      <div className="mb-3"><Erro texto={erro} /></div>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <button className="btn-primary" onClick={guardar} disabled={aGuardar || !mudou}>{aGuardar ? 'A guardar' : mudou ? 'Guardar' : 'Guardado'}</button>
        <button className="btn-outline" onClick={copiarLink}><Copy size={16} />{copiado ? 'Link copiado' : 'Copiar link'}</button>
        {pode('email')
          ? <button className="btn-outline" onClick={enviarPelaApp}><Mail size={16} /> Enviar proposta por email</button>
          : <button className="btn-outline" onClick={enviarEmail}><Mail size={16} /> Email</button>}
        <button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> PDF</button>
        {p.token && p.estado !== 'rascunho' && <a className="btn-outline" href={`/p/${p.token}`} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Ver como o cliente</a>}
        <button className="btn-outline lg:hidden" onClick={() => setVer(v => !v)}>{ver ? <PencilLine size={16} /> : <Eye size={16} />}{ver ? 'Editar' : 'Pré-visualizar'}</button>
        {p.id && <button className="btn text-stone-500 hover:bg-red-50 hover:text-red-700" aria-label="Apagar proposta" onClick={apagarProposta}><Trash2 size={16} /></button>}
      </div>
      {enviadaPorEmail && <div role="status" className="mb-3 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800 print:hidden">{enviadaPorEmail}</div>}
      <Escrever rascunho={rascunho} onFechar={() => setRascunho(null)} onEnviado={async r => { if (p?.id) await marcarEnviada(p as Proposta); setEnviadaPorEmail(`Proposta enviada por email.${r.atividades ? ' Ficou no histórico do contacto.' : ''}`); if (r.atividades) recarregar() }} />
      {respondida && mudou && <p className="mb-3 text-xs text-amber-800 print:hidden">Esta proposta já tem resposta do cliente; as mudanças não alteram o que ele aceitou ou recusou.</p>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <div className={`min-w-0 space-y-4 print:hidden ${ver ? 'hidden lg:block' : ''}`}>
          <div className="card space-y-3 p-4">
            <Campo label="Negócio">
              <select className="input" value={p.negocio_id ?? ''} onChange={e => set('negocio_id', e.target.value || null)}>
                <option value="">Sem negócio</option>{negocios.filter(n => emCurso(n) || n.id === p.negocio_id).map(n => <option key={n.id} value={n.id}>{n.titulo}</option>)}
              </select>
            </Campo>
            <Campo label="Título"><input className="input" value={p.titulo ?? ''} onChange={e => set('titulo', e.target.value)} placeholder="Ex.: Renovação do site" /></Campo>
            <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
              <Campo label="Cliente"><input className="input" value={p.cliente_nome ?? ''} onChange={e => set('cliente_nome', e.target.value)} /></Campo>
              <Campo label="Empresa"><input className="input" value={p.cliente_empresa ?? ''} onChange={e => set('cliente_empresa', e.target.value)} /></Campo>
            </div>
            <Campo label="Email do cliente"><input className="input" type="email" value={p.cliente_email ?? ''} onChange={e => set('cliente_email', e.target.value)} /></Campo>
            <Campo label="Introdução"><textarea className="input min-h-24" value={p.introducao ?? ''} onChange={e => set('introducao', e.target.value)} /></Campo>
          </div>

          <div className="card space-y-3 p-4">
            <div className="flex items-center justify-between"><h3 className="font-semibold">Linhas</h3><span className="numero text-sm text-stone-500">{dinheiro2(t.base, doc.moeda)} sem IVA</span></div>
            {(p.linhas ?? []).map((l, i) => (
              <div key={i} className="space-y-1.5 rounded-xl bg-stone-50 p-2.5 ring-1 ring-stone-200" data-linha={i}>
                <div className="flex gap-1.5"><input className="input" aria-label={`Descrição da linha ${i + 1}`} placeholder="Descrição" value={l.descricao} onChange={e => setLinha(i, { descricao: e.target.value })} /><button className="rounded-lg px-2 text-stone-400 hover:text-red-600" aria-label={`Tirar a linha ${i + 1}`} onClick={() => set('linhas', (p.linhas ?? []).filter((_, j) => j !== i))}><Trash2 size={15} /></button></div>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="flex items-center gap-1.5 text-xs text-stone-500">Qtd.<InputNumero rotulo={`Quantidade da linha ${i + 1}`} valor={l.quantidade} onValor={v => setLinha(i, { quantidade: v })} /></label>
                  <label className="flex items-center gap-1.5 text-xs text-stone-500">Preço<InputNumero rotulo={`Preço da linha ${i + 1}`} valor={l.preco} onValor={v => setLinha(i, { preco: v })} /></label>
                </div>
              </div>
            ))}
            <button className="btn-ghost w-full ring-1 ring-dashed ring-stone-300" onClick={() => set('linhas', [...(p.linhas ?? []), { descricao: '', quantidade: 1, preco: 0 }])}><Plus size={15} /> Acrescentar linha</button>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Desconto"><InputNumero valor={p.desconto ?? 0} onValor={v => set('desconto', v)} /></Campo>
              <Campo label="IVA (%)"><InputNumero valor={p.iva_pct ?? 0} onValor={v => set('iva_pct', Math.min(100, v))} /></Campo>
            </div>
            <dl className="space-y-1 rounded-xl bg-stone-50 p-3 text-sm">
              <div className="flex justify-between"><dt className="text-stone-500">Sem IVA</dt><dd className="numero">{dinheiro2(t.base, doc.moeda)}</dd></div>
              <div className="flex justify-between"><dt className="text-stone-500">IVA</dt><dd className="numero">{dinheiro2(t.iva, doc.moeda)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Total</dt><dd className="numero" data-teste="total-editor">{dinheiro2(t.total, doc.moeda)}</dd></div>
            </dl>
          </div>

          <div className="card space-y-3 p-4">
            <Campo label="Condições"><textarea className="input min-h-24" value={p.condicoes ?? ''} onChange={e => set('condicoes', e.target.value)} /></Campo>
            <Campo label="Válida até"><input className="input" type="date" value={p.validade ?? ''} onChange={e => set('validade', e.target.value || null)} /></Campo>
          </div>
        </div>
        <div className={`min-w-0 ${ver ? '' : 'hidden lg:block'} print:block`}><div className="lg:sticky lg:top-6"><PropostaDoc p={doc} marca={marca} /></div></div>
      </div>
    </div>
  )
}
