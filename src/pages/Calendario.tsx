import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useDados } from '../lib/dados'
import { TIPOS_AGENDA, type Agenda } from '../lib/tipos'
import { DIA_SEMANA, MES_LONGO, dataComDia, hoje, hora, isoDia, maiuscula } from '../lib/util'
import AgendaForm from '../components/AgendaForm'
import NegocioPainel from '../components/NegocioPainel'
import { Painel } from '../components/ui'
import { LinhaTarefa, NovaTarefa, TarefaPainel } from '../components/Tarefas'

type Item = { chave: string; dia: string; titulo: string; hora?: string; cor: string; ponto: string; tipo: 'agenda' | 'passo' | 'tarefa' | 'data'; agenda?: Agenda; negocioId?: string; tarefaId?: string }

export default function Calendario() {
  const { agenda, negocios, tarefas, negocioDe, emCurso } = useDados()
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [dia, setDia] = useState(hoje())
  const [editar, setEditar] = useState<Partial<Agenda> | null>(null)
  const [negocio, setNegocio] = useState<string | null>(null)
  const [tarefa, setTarefa] = useState<string | null>(null)

  const itens = useMemo(() => {
    const l: Item[] = []
    for (const a of agenda) {
      const t = TIPOS_AGENDA.find(x => x.id === a.tipo) ?? TIPOS_AGENDA[0]
      const ini = new Date(a.inicio); const fim = a.fim ? new Date(a.fim) : ini
      // marcações de vários dias aparecem em cada dia (até 60)
      for (let d = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate()), k = 0; d <= fim && k < 60; d.setDate(d.getDate() + 1), k++)
        l.push({ chave: a.id + isoDia(d), dia: isoDia(d), titulo: a.titulo, hora: a.dia_inteiro ? undefined : hora(a.inicio), cor: t.cor, ponto: t.ponto, tipo: 'agenda', agenda: a, negocioId: a.negocio_id ?? undefined })
    }
    for (const n of negocios) {
      if (!emCurso(n)) continue
      if (n.proximo_passo && n.proximo_passo_em) l.push({ chave: 'pp' + n.id, dia: n.proximo_passo_em, titulo: n.proximo_passo, cor: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200', ponto: 'bg-amber-500', tipo: 'passo', negocioId: n.id })
      if (n.data) l.push({ chave: 'dt' + n.id, dia: n.data, titulo: n.titulo, cor: 'bg-white text-marca-800 ring-1 ring-inset ring-marca-200', ponto: 'bg-marca-300', tipo: 'data', negocioId: n.id })
    }
    for (const t of tarefas) if (t.prazo && !t.feito)
      l.push({ chave: 'ta' + t.id, dia: t.prazo, titulo: (t.prioridade ? '!'.repeat(t.prioridade) + ' ' : '') + t.titulo, hora: t.hora?.slice(0, 5), cor: 'bg-sky-50 text-sky-900', ponto: 'bg-sky-500', tipo: 'tarefa', tarefaId: t.id, negocioId: t.negocio_id ?? undefined })
    return l.sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? ''))
  }, [agenda, negocios, tarefas, emCurso])

  const porDia = useMemo(() => { const m = new Map<string, Item[]>(); for (const i of itens) { if (!m.has(i.dia)) m.set(i.dia, []); m.get(i.dia)!.push(i) } return m }, [itens])
  // grelha a começar à segunda feira
  const dias = useMemo(() => {
    const desvio = (mes.getDay() + 6) % 7
    const n = Math.ceil((desvio + new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()) / 7) * 7
    return Array.from({ length: n }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), 1 - desvio + i))
  }, [mes])
  const doDia = porDia.get(dia) ?? []
  const semData = tarefas.filter(t => !t.feito && !t.prazo)
  const abrir = (i: Item) => { if (i.tarefaId) setTarefa(i.tarefaId); else if (i.agenda) setEditar(i.agenda); else if (i.negocioId) setNegocio(i.negocioId) }
  const nomeTipo = (i: Item) => i.tipo === 'tarefa' ? 'Tarefa' : i.tipo === 'passo' ? 'Próximo passo' : i.tipo === 'data' ? 'Data prevista do negócio' : TIPOS_AGENDA.find(t => t.id === i.agenda?.tipo)?.nome ?? 'Marcação'
  const irPara = (d: Date) => { setMes(new Date(d.getFullYear(), d.getMonth(), 1)); setDia(isoDia(d)) }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Calendário</h1>
        <button className="btn-primary" onClick={() => setEditar({ inicio: dia + 'T10:00', tipo: 'reuniao' })}><Plus size={16} /> Marcar</button>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card min-w-0 overflow-hidden">
          <div className="flex items-center gap-1 border-b border-stone-200 px-3 py-2.5">
            <button aria-label="Mês anterior" className="rounded-lg p-1.5 hover:bg-stone-100" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
            <h2 className="flex-1 text-center font-semibold capitalize">{MES_LONGO[mes.getMonth()]} {mes.getFullYear()}</h2>
            <button aria-label="Mês seguinte" className="rounded-lg p-1.5 hover:bg-stone-100" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
            <button className="btn-outline ml-1 px-2.5 py-1 text-xs" onClick={() => irPara(new Date())}>Hoje</button>
          </div>
          <div className="grid grid-cols-7 bg-stone-50 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            {[1, 2, 3, 4, 5, 6, 0].map(d => <div key={d} className="py-1.5"><span className="sm:hidden">{DIA_SEMANA[d].slice(0, 1)}</span><span className="hidden sm:inline">{DIA_SEMANA[d]}</span></div>)}
          </div>
          <div className="grid grid-cols-7">
            {dias.map(d => {
              const iso = isoDia(d); const doMes = d.getMonth() === mes.getMonth(); const lista = porDia.get(iso) ?? []
              return (
                <button key={iso} aria-label={`${dataComDia(iso)}, ${lista.length} ${lista.length === 1 ? 'item' : 'itens'}`} aria-pressed={iso === dia} onClick={() => { setDia(iso); if (!doMes) setMes(new Date(d.getFullYear(), d.getMonth(), 1)) }}
                  className={`flex min-h-12 min-w-0 flex-col items-center justify-start gap-0.5 border-t border-stone-100 p-1 transition sm:min-h-24 sm:items-stretch sm:border-r sm:p-1.5 ${doMes ? 'hover:bg-stone-50' : 'text-stone-300'} ${iso === dia ? 'bg-marca-50' : ''}`}>
                  <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm sm:self-start sm:text-xs ${iso === hoje() ? 'bg-red-600 font-semibold text-white' : iso === dia ? 'bg-marca-700 font-semibold text-sobre-marca' : ''}`}>{d.getDate()}</span>
                  <div className="hidden w-full min-w-0 space-y-0.5 sm:block">
                    {lista.slice(0, 3).map(i => <div key={i.chave} className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${i.cor}`}>{i.hora && <span className="mono mr-1 opacity-70">{i.hora}</span>}{i.titulo}</div>)}
                    {lista.length > 3 && <div className="px-1 text-[11px] text-stone-500">+{lista.length - 3}</div>}
                  </div>
                  <div className="flex h-1.5 gap-0.5 sm:hidden">{lista.slice(0, 3).map(i => <span key={i.chave} className={`h-1.5 w-1.5 rounded-full ${i.ponto}`} />)}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <section aria-label="Agenda do dia">
            <div className="mb-2 flex items-center gap-2 px-1"><h3 className="flex-1 font-semibold">{dia === hoje() ? 'Hoje' : maiuscula(dataComDia(dia))}</h3><button className="text-sm font-medium text-marca-700" onClick={() => setEditar({ inicio: dia + 'T10:00', tipo: 'reuniao' })}>+ Marcar</button></div>
            {doDia.length === 0 ? <p className="rounded-xl border border-dashed border-stone-300 px-3 py-4 text-center text-sm text-stone-400">Nada neste dia.</p> : (
              <div className="space-y-1.5">{doDia.map(i => (
                <button key={i.chave} onClick={() => abrir(i)} className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left ring-1 ring-stone-200 hover:bg-stone-50">
                  <span className="mono w-11 shrink-0 text-xs text-stone-500">{i.hora ?? 'dia'}</span>
                  <span className={`h-8 w-1.5 shrink-0 rounded-full ${i.ponto}`} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{i.titulo}</span><span className="block truncate text-xs text-stone-500">{nomeTipo(i)}{i.negocioId && i.tipo !== 'data' ? ` · ${negocioDe(i.negocioId)?.titulo ?? ''}` : ''}{i.agenda?.local ? ` · ${i.agenda.local}` : ''}</span></span>
                </button>
              ))}</div>
            )}
            <div className="mt-2"><NovaTarefa key={dia} diaInicial={dia} /></div>
          </section>
          {semData.length > 0 && <section>
            <h3 className="mb-1 px-1 font-semibold">Tarefas sem prazo</h3>
            <ul className="px-1">{semData.map(t => <LinhaTarefa key={t.id} t={t} onAbrir={() => setTarefa(t.id)} />)}</ul>
          </section>}
          <details className="px-1 text-xs text-stone-500">
            <summary className="cursor-pointer">O que querem dizer as cores</summary>
            <div className="mt-2 space-y-1.5">
              {TIPOS_AGENDA.map(t => <div key={t.id} className="flex items-center gap-2"><span className={`h-3 w-3 rounded ${t.ponto}`} />{t.nome}</div>)}
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-sky-500" />Tarefa com prazo</div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-amber-500" />Próximo passo de um negócio</div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-marca-300" />Data prevista de um negócio</div>
            </div>
          </details>
        </div>
      </div>

      <Painel aberto={!!editar} onFechar={() => setEditar(null)} titulo={editar?.id ? 'Editar marcação' : 'Nova marcação'}>
        {editar && <AgendaForm key={editar.id ?? 'novo'} base={editar} onFeito={() => setEditar(null)} />}
      </Painel>
      <NegocioPainel id={negocio} onFechar={() => setNegocio(null)} />
      <TarefaPainel id={tarefa} onFechar={() => setTarefa(null)} />
    </div>
  )
}
