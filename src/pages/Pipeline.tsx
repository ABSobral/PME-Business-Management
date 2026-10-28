import { useEffect, useMemo, useState } from 'react'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Plus, Search, CalendarDays, AlertCircle, Archive, Clock, ChevronRight } from 'lucide-react'
import { useDados } from '../lib/dados'
import { corFase, type Negocio } from '../lib/tipos'
import { dataCurta, diasAte, dinheiro, normaliza, relativo } from '../lib/util'
import NegocioPainel, { useMudarFase, type NovoNegocio } from '../components/NegocioPainel'
import { Erro } from '../components/ui'

export default function Pipeline() {
  const { negocios, contactoDe, empresaDe, membros, fases } = useDados()
  const mudarFase = useMudarFase()
  const [arquivados, setArquivados] = useState(false)
  const [busca, setBusca] = useState('')
  const [quem, setQuem] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [novo, setNovo] = useState<NovoNegocio | null>(null)
  const [arrastado, setArrastado] = useState<string | null>(null)
  const [faseMovel, setFaseMovel] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // telemóvel: rato não arrasta (é só para o computador); no ecrã pequeno usam-se os botões de fase
  const sensores = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }))

  const lista = useMemo(() => {
    const q = normaliza(busca)
    return negocios.filter(n => n.arquivado === arquivados && (!quem || n.responsavel === quem) && (!q ||
      normaliza(n.titulo).includes(q) || normaliza(contactoDe(n.contacto_id)?.nome ?? '').includes(q) || normaliza(empresaDe(n.empresa_id)?.nome ?? '').includes(q)))
  }, [negocios, quem, busca, contactoDe, empresaDe, arquivados])
  useEffect(() => { if (faseMovel && !fases.some(f => f.id === faseMovel)) setFaseMovel(null) }, [fases, faseMovel])

  async function mover(id: string, estado: string) {
    const n = negocios.find(x => x.id === id)
    if (!n) return
    try { setErro(null); await mudarFase(n, estado) } catch (e) { setErro((e as Error).message) }
  }
  function largar(e: DragEndEvent) {
    setArrastado(null)
    if (e.over?.id) mover(String(e.active.id), String(e.over.id))
  }

  const aArrastar = negocios.find(n => n.id === arrastado)
  const atual = faseMovel ?? (fases.find(c => lista.some(n => n.estado === c.id)) ?? fases[0])?.id
  const doMovel = lista.filter(n => n.estado === atual).sort((a, b) => b.ordem - a.ordem)
  const proxima = (n: Negocio) => { const i = fases.findIndex(f => f.id === n.estado); return fases.slice(i + 1).find(f => f.tipo !== 'perdido') }
  const novoNegocio = () => setNovo({ estado: fases[0]?.id })

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Pipeline</h1>
        <button className="btn-primary" onClick={novoNegocio}><Plus size={16} /> Novo negócio</button>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-48 sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="input pl-9" placeholder="Procurar" aria-label="Procurar negócios" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        {membros.length > 1 && <select className="input w-auto" aria-label="Responsável" value={quem} onChange={e => setQuem(e.target.value)}><option value="">Toda a equipa</option>{membros.map(m => <option key={m.email} value={m.nome}>{m.nome}</option>)}</select>}
        <button onClick={() => setArquivados(a => !a)} className={`btn ${arquivados ? 'bg-stone-800 text-white' : 'btn-outline'}`}><Archive size={15} />{arquivados ? 'A ver arquivados' : 'Arquivados'}</button>
      </div>
      <Erro texto={erro} />

      {/* telemóvel: escolhe-se a fase em cima e mexe-se com botões (sem arrastar nem deslizar para os lados) */}
      <div className="lg:hidden">
        <div className="mb-3 grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-3" role="tablist" aria-label="Fases">
          {fases.map(c => { const n = lista.filter(x => x.estado === c.id).length; return (
            <button key={c.id} role="tab" aria-selected={atual === c.id} onClick={() => setFaseMovel(c.id)} className={`flex min-w-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium ${atual === c.id ? 'bg-marca-700 text-sobre-marca' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${corFase(c.cor).ponto}`} /><span className="min-w-0 flex-1 truncate">{c.nome}</span><span className="opacity-70">{n}</span>
            </button>
          ) })}
        </div>
        <div className="flex flex-col gap-2">
          {doMovel.map(n => { const seg = proxima(n); return (
            <div key={n.id} className="space-y-1.5">
              <Cartao n={n} onAbrir={() => setAberto(n.id)} fixo />
              {seg && !n.arquivado && <button className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-marca-700 hover:bg-marca-50" onClick={() => mover(n.id, seg.id)}>Passar a {seg.nome} <ChevronRight size={13} /></button>}
            </div>
          ) })}
          {doMovel.length === 0 && <p className="rounded-xl border border-dashed border-stone-300 py-6 text-center text-sm text-stone-400">Nada em {fases.find(c => c.id === atual)?.nome}.</p>}
        </div>
        <p className="mt-3 text-xs text-stone-500">Para mudar de fase, abra o negócio e escolha a fase, ou use o botão por baixo do cartão.</p>
      </div>

      {/* computador: arrastar os cartões entre colunas */}
      <DndContext sensors={sensores} onDragStart={e => setArrastado(String(e.active.id))} onDragEnd={largar} onDragCancel={() => setArrastado(null)}>
        <div className="hidden overflow-x-auto pb-4 lg:block">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${fases.length}, minmax(${fases.length > 6 ? '210px' : '0'}, 1fr))` }}>
            {fases.map(c => {
              const itens = lista.filter(n => n.estado === c.id).sort((a, b) => b.ordem - a.ordem)
              const total = itens.reduce((s, n) => s + (n.valor ?? 0), 0)
              return (
                <Coluna key={c.id} id={c.id} nome={c.nome} fechado={c.tipo !== 'aberto'}>
                  <div className="mb-2 flex flex-wrap items-center gap-x-2 px-1">
                    <span className={`h-2 w-2 rounded-full ${corFase(c.cor).ponto}`} />
                    <span className="text-sm font-semibold">{c.nome}</span>
                    <span className="text-xs text-stone-400">{itens.length}</span>
                    {total > 0 && <span className="numero ml-auto text-xs text-stone-500">{dinheiro(total)}</span>}
                  </div>
                  <div className="flex min-h-24 flex-col gap-2">
                    {itens.map(n => <Cartao key={n.id} n={n} onAbrir={() => setAberto(n.id)} aArrastar={arrastado === n.id} />)}
                    {c.id === fases[0]?.id && !arquivados && <button onClick={novoNegocio} className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-stone-300 py-2 text-xs text-stone-500 hover:bg-white"><Plus size={13} /> Acrescentar</button>}
                  </div>
                </Coluna>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-stone-500">Arraste os cartões entre colunas para mudar de fase.</p>
        </div>
        <DragOverlay>{aArrastar && <Cartao n={aArrastar} onAbrir={() => {}} flutuante />}</DragOverlay>
      </DndContext>

      <NegocioPainel id={aberto} novo={novo} onFechar={() => { setAberto(null); setNovo(null) }} />
    </div>
  )
}

function Coluna({ id, nome, fechado, children }: { id: string; nome: string; fechado?: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <div ref={setNodeRef} data-fase={id} aria-label={`Fase ${nome}`} className={`min-w-0 rounded-2xl p-1.5 transition ${isOver ? 'bg-marca-50 ring-2 ring-marca-200' : fechado ? 'bg-stone-100/60' : 'bg-stone-100'}`}>{children}</div>
}

function Cartao({ n, onAbrir, aArrastar, flutuante, fixo }: { n: Negocio; onAbrir: () => void; aArrastar?: boolean; flutuante?: boolean; fixo?: boolean }) {
  const { contactoDe, empresaDe, ultimoContacto, faseDe } = useDados()
  const { attributes, listeners, setNodeRef } = useDraggable({ id: n.id, disabled: flutuante || fixo })
  const c = contactoDe(n.contacto_id); const e = empresaDe(n.empresa_id)
  const dias = n.proximo_passo_em ? diasAte(n.proximo_passo_em) : null
  const atrasado = dias !== null && dias < 0
  const perdido = faseDe(n.estado).tipo === 'perdido'
  return (
    <div ref={fixo ? undefined : setNodeRef} {...(fixo ? {} : listeners)} {...(fixo ? {} : attributes)} role="button" tabIndex={0} onClick={onAbrir} onKeyDown={k => { if (k.key === 'Enter') onAbrir() }} data-negocio={n.titulo}
      className={`cursor-pointer select-none rounded-xl bg-white p-3 text-left ring-1 ring-stone-200 transition hover:ring-stone-300 ${aArrastar ? 'opacity-30' : ''} ${flutuante ? 'rotate-2 shadow-xl' : 'shadow-sm'}`}>
      <p className="break-words text-sm font-medium leading-snug [overflow-wrap:anywhere]">{n.titulo}</p>
      {(c || e) && <p className="mt-0.5 truncate text-xs text-stone-500">{[c?.nome, e?.nome].filter(Boolean).join(' · ')}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
        {n.valor != null && n.valor > 0 && <span className="numero font-semibold text-stone-800">{dinheiro(n.valor)}</span>}
        {n.data && <span className="inline-flex items-center gap-1"><CalendarDays size={12} />{dataCurta(n.data)}</span>}
        {n.contacto_id && <span className="inline-flex items-center gap-1" title="Último contacto"><Clock size={11} />{relativo(ultimoContacto(n.contacto_id))}</span>}
        {n.responsavel && <span className="truncate">{n.responsavel}</span>}
      </div>
      {perdido && n.motivo_perda && <p className="mt-2 rounded-lg bg-stone-50 px-2 py-1 text-xs text-stone-600">Perdido: {n.motivo_perda}</p>}
      {n.proximo_passo && !perdido && (
        <p className={`mt-2 flex items-start gap-1 rounded-lg px-2 py-1 text-xs ${atrasado ? 'bg-red-50 text-red-700' : dias === 0 ? 'bg-amber-50 text-amber-800' : 'bg-stone-50 text-stone-600'}`}>
          {atrasado && <AlertCircle size={12} className="mt-0.5 shrink-0" />}
          <span className="line-clamp-2">{n.proximo_passo}{n.proximo_passo_em && <b className="font-semibold"> · {dias === 0 ? 'hoje' : dataCurta(n.proximo_passo_em)}</b>}</span>
        </p>
      )}
    </div>
  )
}
