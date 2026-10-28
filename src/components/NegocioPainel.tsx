import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, Pencil, Trash2, Mail, Phone, MessageCircle, StickyNote, Users, FileText, ArrowRightLeft, Archive, ArchiveRestore, Check, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useDados } from '../lib/dados'
import { ORIGENS } from '../config'
import { ESTADOS_PROPOSTA, TIPOS_ATIVIDADE, corFase, type Negocio, type Proposta, type TipoAtividade } from '../lib/tipos'
import { dataCurta, diasAte, dinheiro, hora, hoje, numOuNulo, relativo, somaDias, valorInvalido } from '../lib/util'
import { Campo, Erro, Painel } from './ui'
import { EscolherContacto, EscolherEmpresa, OpcoesEquipa, useGarantirEmpresa } from './Escolher'
import { BotoesContacto } from './Telefone'
import { useDialogo } from './Dialogo'
import AgendaForm from './AgendaForm'

export const ICONE_ATIVIDADE: Record<TipoAtividade, typeof Mail> = {
  nota: StickyNote, email: Mail, chamada: Phone, whatsapp: MessageCircle, reuniao: Users, proposta: FileText, estado: ArrowRightLeft,
}

// mudar de fase (botões do painel e arrastar no pipeline): as mesmas regras nos dois sítios.
// Numa fase de "perdido" pergunta o motivo; cancelar a pergunta cancela a mudança.
export function useMudarFase() {
  const { faseDe, gravar } = useDados()
  const { pedirTexto } = useDialogo()
  return async (n: Negocio, estado: string): Promise<boolean> => {
    if (n.estado === estado) return false
    const campos: Record<string, unknown> = { estado }
    if (faseDe(estado).tipo === 'perdido') {
      const motivo = await pedirTexto('Porque se perdeu?', { texto: n.titulo, valor: n.motivo_perda ?? '', placeholder: 'Preço, prazo, escolheu outra opção...', ok: 'Marcar como perdido' })
      if (motivo === null) return false
      campos.motivo_perda = motivo.trim() || null
    } else if (n.motivo_perda) campos.motivo_perda = null
    await gravar('negocios', { id: n.id, ...campos, ordem: Date.now() / 1e10 })
    return true
  }
}

type Form = {
  titulo: string; estado: string; contacto: { id: string | null; nomeNovo: string }; contactoEmail: string; empresa: string
  valor: string; data: string; origem: string; responsavel: string; proximo_passo: string; proximo_passo_em: string; notas: string; motivo_perda: string
}
export type NovoNegocio = Partial<Negocio>

export default function NegocioPainel({ id, novo, onFechar }: { id?: string | null; novo?: NovoNegocio | null; onFechar: () => void }) {
  const { negocioDe, contactoDe, empresaDe, eu, gravar, apagar, atividades, agenda, registar, fases, faseDe } = useDados()
  const { confirmar } = useDialogo()
  const mudarFase = useMudarFase()
  const navegar = useNavigate()
  const aberto = !!id || !!novo
  const n = negocioDe(id)
  const garantirEmpresa = useGarantirEmpresa()

  const inicial = (): Form => {
    const b: NovoNegocio = n ?? novo ?? {}
    const c = contactoDe(b.contacto_id)
    return {
      titulo: b.titulo ?? '', estado: b.estado ?? fases[0]?.id ?? 'lead',
      contacto: { id: b.contacto_id ?? null, nomeNovo: '' }, contactoEmail: '',
      empresa: empresaDe(b.empresa_id ?? c?.empresa_id)?.nome ?? '',
      valor: b.valor != null ? String(b.valor).replace('.', ',') : '', data: b.data ?? '', origem: b.origem ?? '',
      responsavel: b.responsavel ?? eu?.nome ?? '', proximo_passo: b.proximo_passo ?? '', proximo_passo_em: b.proximo_passo_em ?? '',
      notas: b.notas ?? '', motivo_perda: b.motivo_perda ?? '',
    }
  }
  const [f, setF] = useState<Form>(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [aGuardar, setAGuardar] = useState(false)
  const [mudou, setMudou] = useState(false)
  const [editar, setEditar] = useState(!id)
  const [novaNota, setNovaNota] = useState('')
  const [tipoNota, setTipoNota] = useState<TipoAtividade>('nota')
  const [agendar, setAgendar] = useState(false)
  const [propostas, setPropostas] = useState<Proposta[]>([])
  useEffect(() => { setF(inicial()); setMudou(false); setErro(null); setAgendar(false); setEditar(!id) }, [id, novo]) // eslint-disable-line react-hooks/exhaustive-deps
  // se o negócio mudar fora daqui e não houver nada por guardar, mostra o novo
  useEffect(() => { if (n && !mudou) setF(inicial()) }, [n?.atualizado_em, n?.estado]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!n) { setPropostas([]); return }
    supabase.from('propostas').select('*').eq('negocio_id', n.id).order('criado_em', { ascending: false }).then(({ data }) => setPropostas((data ?? []) as Proposta[]))
  }, [n?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF(p => ({ ...p, [k]: v })); setMudou(true) }
  const historico = useMemo(() => (n ? atividades.filter(a => a.negocio_id === n.id) : []), [atividades, n])
  const marcados = useMemo(() => (n ? agenda.filter(a => a.negocio_id === n.id) : []), [agenda, n])
  const contacto = contactoDe(f.contacto.id)
  const perdido = faseDe(f.estado).tipo === 'perdido'

  async function guardar() {
    setErro(null)
    if (!f.titulo.trim()) { setErro('Falta o título.'); return }
    if (valorInvalido(numOuNulo(f.valor))) { setErro('O valor tem de ser um número (por exemplo 1250 ou 1.250,50).'); return }
    if (f.contactoEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactoEmail.trim())) { setErro('O email da pessoa nova não parece válido.'); return }
    setAGuardar(true)
    try {
      const empresa_id = await garantirEmpresa(f.empresa)
      let contacto_id = f.contacto.id
      if (!contacto_id && f.contacto.nomeNovo.trim()) {
        const c = await gravar<{ id: string }>('contactos', { nome: f.contacto.nomeNovo.trim(), email: f.contactoEmail.trim() || null, empresa_id, origem: f.origem || null, responsavel: f.responsavel || null, categoria: 'potencial' })
        contacto_id = c.id
      }
      const linha: Record<string, unknown> = {
        titulo: f.titulo.trim(), estado: f.estado, contacto_id, empresa_id, valor: numOuNulo(f.valor), data: f.data || null,
        origem: f.origem || null, responsavel: f.responsavel || null, proximo_passo: f.proximo_passo.trim() || null, proximo_passo_em: f.proximo_passo_em || null,
        notas: f.notas || null, motivo_perda: perdido ? f.motivo_perda || null : null,
      }
      if (n) await gravar('negocios', { id: n.id, ...linha })
      else {
        const g = await gravar<Negocio>('negocios', { ...linha, ordem: Date.now() / 1e10 })
        await registar({ negocio_id: g.id, contacto_id, tipo: 'nota', resumo: 'Entrou no pipeline' })
      }
      setMudou(false); setEditar(false)
      if (!n) onFechar()
    } catch (e) { setErro((e as Error).message) } finally { setAGuardar(false) }
  }

  async function mudar(campos: Record<string, unknown>) {
    if (!n) return
    try { await gravar('negocios', { id: n.id, ...campos }) } catch (e) { setErro((e as Error).message) }
  }
  async function escolherFase(estado: string) {
    if (!n) { set('estado', estado); return }
    try { await mudarFase(n, estado) } catch (e) { setErro((e as Error).message) }
  }
  async function adicionarNota() {
    if (!n || !novaNota.trim()) return
    try { await registar({ negocio_id: n.id, contacto_id: n.contacto_id, tipo: tipoNota, resumo: novaNota.trim() }); setNovaNota('') }
    catch (e) { setErro((e as Error).message) }
  }
  async function remover() {
    if (!n || !(await confirmar(`Apagar "${n.titulo}"?`, { texto: 'O histórico deste negócio também desaparece. Se só já não está ativo, arquiva em vez de apagar.', ok: 'Apagar', perigo: true }))) return
    await apagar('negocios', n.id); onFechar()
  }

  return (
    <Painel aberto={aberto} onFechar={onFechar} largura="max-w-2xl"
      titulo={<div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Negócio{n && <> · criado {dataCurta(n.criado_em)}</>}{n?.arquivado && <> · arquivado</>}</div>
        <h2 className="truncate text-lg font-semibold">{n ? n.titulo : 'Novo negócio'}</h2>
      </div>}
      rodape={<div className="flex items-center gap-2">
        {n && <button className="btn text-stone-500 hover:bg-red-50 hover:text-red-700" onClick={remover} aria-label="Apagar negócio"><Trash2 size={16} /></button>}
        {n && (n.arquivado
          ? <button className="btn-outline" onClick={() => mudar({ arquivado: false })}><ArchiveRestore size={16} /><span className="hidden sm:inline">Desarquivar</span></button>
          : <button className="btn-outline" onClick={async () => { await mudar({ arquivado: true }); onFechar() }}><Archive size={16} /><span className="hidden min-[400px]:inline">Arquivar</span></button>)}
        <div className="flex-1" />
        {n && !editar ? <>
          <button className="btn-outline" onClick={onFechar}>Fechar</button>
          <button className="btn-primary" onClick={() => setEditar(true)}><Pencil size={15} /> Editar</button>
        </> : <>
          <button className="btn-outline" onClick={() => { if (n) { setF(inicial()); setMudou(false); setEditar(false) } else onFechar() }}>Cancelar</button>
          <button className="btn-primary" onClick={guardar} disabled={aGuardar || (!!n && !mudou)}>{n ? 'Guardar' : 'Criar'}</button>
        </>}
      </div>}>
      <div className="space-y-5">
        <Erro texto={erro} />
        <div>
          <span className="label">Fase</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Fase">
            {fases.map(e => (
              <button key={e.id} type="button" onClick={() => escolherFase(e.id)} aria-pressed={f.estado === e.id}
                className={`badge px-3 py-1.5 text-xs transition ${f.estado === e.id ? corFase(e.cor).badge + ' ring-2 ring-current/30' : 'bg-white text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50'}`}>{e.nome}</button>
            ))}
          </div>
          {n && <p className="mt-1.5 text-xs text-stone-400">Em "{faseDe(n.estado).nome}" desde {dataCurta(n.estado_desde)}</p>}
        </div>

        {n && (
          <div className="flex flex-wrap gap-2">
            <BotoesContacto telefone={contacto?.telefone} email={contacto?.email} />
            <button className="btn-outline py-1.5" onClick={() => navegar(`/propostas/nova?negocio=${n.id}`)}><FileText size={15} /> Nova proposta</button>
          </div>
        )}

        {n && !editar ? <Detalhes n={n} onEditar={() => setEditar(true)} onPassoFeito={async () => { await registar({ negocio_id: n.id, contacto_id: n.contacto_id, tipo: 'nota', resumo: `Feito: ${n.proximo_passo}` }); await mudar({ proximo_passo: null, proximo_passo_em: null }); setEditar(true) }} /> : <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Título" className="sm:col-span-2"><input className="input" value={f.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ex.: Renovação do site da empresa X" /></Campo>
            <Campo label="Pessoa"><EscolherContacto valor={f.contacto} onEscolher={v => { set('contacto', v); const c = contactoDe(v.id); if (c?.empresa_id && !f.empresa) set('empresa', empresaDe(c.empresa_id)?.nome ?? '') }} /></Campo>
            <Campo label="Empresa"><EscolherEmpresa valor={f.empresa} onEscolher={v => set('empresa', v)} /></Campo>
            {!f.contacto.id && f.contacto.nomeNovo && <Campo label="Email da pessoa nova" className="sm:col-span-2"><input className="input" type="email" value={f.contactoEmail} onChange={e => set('contactoEmail', e.target.value)} /></Campo>}
            <Campo label="Valor (sem IVA)"><input className="input" inputMode="decimal" value={f.valor} onChange={e => set('valor', e.target.value)} placeholder="1250" /></Campo>
            <Campo label="Data prevista"><input className="input" type="date" value={f.data} onChange={e => set('data', e.target.value)} /></Campo>
            <Campo label="Origem"><select className="input" value={f.origem} onChange={e => set('origem', e.target.value)}><option value="">Sem origem</option>{ORIGENS.map(o => <option key={o}>{o}</option>)}</select></Campo>
            <Campo label="Responsável"><select className="input" value={f.responsavel} onChange={e => set('responsavel', e.target.value)}><OpcoesEquipa /></select></Campo>
          </div>

          <div className="rounded-2xl bg-amber-50/70 p-3 ring-1 ring-amber-200">
            <span className="label text-amber-800">Próximo passo</span>
            <div className="grid gap-2 sm:grid-cols-[1fr_170px]">
              <input className="input" aria-label="Próximo passo" value={f.proximo_passo} onChange={e => set('proximo_passo', e.target.value)} placeholder="Ex.: Ligar para fechar a data" />
              <input className="input" aria-label="Data do próximo passo" type="date" value={f.proximo_passo_em} onChange={e => set('proximo_passo_em', e.target.value)} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {([['Hoje', 0], ['Amanhã', 1], ['3 dias', 3], ['1 semana', 7]] as const).map(([l, d]) => (
                <button key={l} type="button" className="badge bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50" onClick={() => set('proximo_passo_em', somaDias(hoje(), d))}>{l}</button>
              ))}
              {f.proximo_passo_em && <span className="ml-auto text-xs text-stone-500">{relativo(f.proximo_passo_em)}</span>}
            </div>
          </div>
          {perdido && <Campo label="Porque se perdeu?"><input className="input" value={f.motivo_perda} onChange={e => set('motivo_perda', e.target.value)} placeholder="Preço, prazo, escolheu outra opção..." /></Campo>}
          <Campo label="Notas"><textarea className="input min-h-20" value={f.notas} onChange={e => set('notas', e.target.value)} /></Campo>
        </>}

        {n && <>
          <section className="border-t border-stone-200 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Propostas</h3>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => navegar(`/propostas/nova?negocio=${n.id}`)}><Plus size={14} /> Nova</button>
            </div>
            {propostas.length === 0 ? <p className="text-sm text-stone-400">Ainda nenhuma.</p> : (
              <ul className="space-y-1.5">
                {propostas.map(p => (
                  <li key={p.id}><button onClick={() => navegar(`/propostas/${p.id}`)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ring-1 ring-stone-200 hover:bg-stone-50">
                    <span className="mono text-xs text-stone-400">nº {p.numero}</span><span className="min-w-0 flex-1 truncate text-sm">{p.titulo}</span>
                    <span className={`badge ${ESTADOS_PROPOSTA[p.estado].cor}`}>{ESTADOS_PROPOSTA[p.estado].nome}</span>
                  </button></li>
                ))}
              </ul>
            )}
          </section>

          <section className="border-t border-stone-200 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Agenda</h3>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setAgendar(v => !v)}><CalendarPlus size={15} /> Marcar</button>
            </div>
            {agendar && <div className="mb-3 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200"><AgendaForm base={{ negocio_id: n.id, contacto_id: n.contacto_id, titulo: n.titulo, tipo: 'reuniao', inicio: (n.data ?? hoje()) + 'T10:00' }} onFeito={() => setAgendar(false)} /></div>}
            {marcados.length === 0 && !agendar && <p className="text-sm text-stone-400">Nada marcado.</p>}
            <ul className="space-y-1">
              {marcados.map(a => <li key={a.id} className="flex items-center gap-2 text-sm"><span className="mono w-28 shrink-0 text-xs text-stone-500">{dataCurta(a.inicio)} {a.dia_inteiro ? '' : hora(a.inicio)}</span><span className="min-w-0 truncate">{a.titulo}</span></li>)}
            </ul>
          </section>

          <section className="border-t border-stone-200 pt-4">
            <h3 className="mb-2 font-semibold">Histórico</h3>
            <div className="mb-3 rounded-2xl bg-stone-50 p-2.5 ring-1 ring-stone-200">
              <div className="mb-2 flex flex-wrap gap-1">
                {TIPOS_ATIVIDADE.map(t => {
                  const I = ICONE_ATIVIDADE[t.id]
                  return <button key={t.id} type="button" onClick={() => setTipoNota(t.id)} aria-pressed={tipoNota === t.id} className={`badge gap-1 px-2.5 py-1 ${tipoNota === t.id ? 'bg-marca-700 text-sobre-marca' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}><I size={12} />{t.nome}</button>
                })}
              </div>
              <div className="flex gap-2">
                <input className="input" aria-label="O que se passou" value={novaNota} onChange={e => setNovaNota(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') adicionarNota() }} placeholder="O que se passou?" />
                <button className="btn-primary" onClick={adicionarNota} disabled={!novaNota.trim()}>Registar</button>
              </div>
            </div>
            <ol className="relative space-y-3 border-l border-stone-200 pl-4">
              {historico.map(a => {
                const I = ICONE_ATIVIDADE[a.tipo] ?? StickyNote
                return (
                  <li key={a.id} className="relative">
                    <span className={`absolute -left-[25px] top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full ${a.tipo === 'estado' ? 'bg-stone-100 text-stone-400' : 'bg-marca-50 text-marca-700'}`}><I size={11} /></span>
                    <p className={`break-words text-sm ${a.tipo === 'estado' ? 'text-stone-500' : ''}`}>{a.tipo === 'estado' ? traduzFase(a.resumo, id => faseDe(id).nome) : a.resumo}</p>
                    <p className="text-xs text-stone-400">{dataCurta(a.data)} {hora(a.data)}{a.autor && <> · {a.autor}</>}</p>
                  </li>
                )
              })}
              {historico.length === 0 && <li className="text-sm text-stone-400">Sem registos.</li>}
            </ol>
          </section>
        </>}
      </div>
    </Painel>
  )
}

// os detalhes só para ler (o que estiver vazio não aparece); editar é um botão
function Detalhes({ n, onEditar, onPassoFeito }: { n: Negocio; onEditar: () => void; onPassoFeito: () => void }) {
  const { contactoDe, empresaDe, faseDe } = useDados()
  const c = contactoDe(n.contacto_id); const e = empresaDe(n.empresa_id)
  const dias = n.proximo_passo_em ? diasAte(n.proximo_passo_em) : null
  const linhas: [string, React.ReactNode][] = []
  if (c) linhas.push(['Pessoa', <span key="p">{c.nome}{c.cargo ? <span className="text-stone-500"> · {c.cargo}</span> : ''}{(c.email || c.telefone) && <span className="block text-xs">{c.email && <a className="text-marca-700 hover:underline" href={`mailto:${c.email}`}>{c.email}</a>}{c.email && c.telefone && ' · '}{c.telefone && <a className="text-marca-700 hover:underline" href={`tel:${c.telefone.replace(/\s+/g, '')}`}>{c.telefone}</a>}</span>}</span>])
  if (e) linhas.push(['Empresa', e.nome + (e.setor ? ` · ${e.setor}` : '')])
  if (n.valor) linhas.push(['Valor', <b key="v" className="numero">{dinheiro(n.valor)} <span className="text-xs font-normal text-stone-500">sem IVA</span></b>])
  if (n.data) linhas.push(['Data prevista', dataCurta(n.data)])
  if (n.origem) linhas.push(['Origem', n.origem])
  if (n.responsavel) linhas.push(['Responsável', n.responsavel])
  const faltam = [!n.valor && 'valor', !c && 'pessoa'].filter(Boolean)
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-stone-100 rounded-2xl text-sm ring-1 ring-stone-200">
        {linhas.map(([k, v]) => <div key={k} className="flex gap-3 px-3.5 py-2.5"><dt className="w-24 shrink-0 text-stone-500">{k}</dt><dd className="min-w-0 flex-1 break-words">{v}</dd></div>)}
        {!linhas.length && <p className="px-3.5 py-3 text-stone-400">Ainda sem detalhes.</p>}
      </dl>
      {faltam.length > 0 && <button className="text-xs text-stone-500 underline" onClick={onEditar}>Falta {faltam.join(' e ')}: completar</button>}
      <div className={`rounded-2xl p-3 ring-1 ${n.proximo_passo ? (dias !== null && dias < 0 ? 'bg-red-50 ring-red-200' : 'bg-amber-50/70 ring-amber-200') : 'bg-stone-50 ring-stone-200'}`}>
        <span className="label text-amber-800">Próximo passo</span>
        {n.proximo_passo ? <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 break-words text-sm font-medium">{n.proximo_passo}{n.proximo_passo_em && <span className={`block text-xs font-normal ${dias !== null && dias < 0 ? 'text-red-700' : 'text-stone-500'}`}>{dias === 0 ? 'hoje' : dias !== null && dias < 0 ? `atrasado ${-dias} dia${dias === -1 ? '' : 's'}` : relativo(n.proximo_passo_em)} · {dataCurta(n.proximo_passo_em)}</span>}</p>
          <button className="btn-outline shrink-0 bg-white px-2.5 py-1 text-xs" onClick={onPassoFeito}><Check size={13} /> Feito</button>
        </div> : <button className="text-sm text-stone-500 underline" onClick={onEditar}>Sem próximo passo. Definir</button>}
      </div>
      {faseDe(n.estado).tipo === 'perdido' && n.motivo_perda && <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm"><span className="text-stone-500">Porque se perdeu:</span> {n.motivo_perda}</p>}
      {n.notas && <div><span className="label">Notas</span><p className="whitespace-pre-wrap break-words rounded-xl bg-stone-50 p-3 text-sm text-stone-700">{n.notas}</p></div>}
    </div>
  )
}

// "proposta → ganho" fica "Mudou de fase: Proposta enviada para Ganho"
export function traduzFase(resumo: string, nome: (id: string) => string) {
  const [a, b] = resumo.split(' → ')
  return b ? `Mudou de fase: ${nome(a)} para ${nome(b)}` : resumo
}
