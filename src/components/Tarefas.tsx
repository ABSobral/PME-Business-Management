import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Check, Clock, Flag, Plus, Trash2, User, X } from 'lucide-react'
import { useDados } from '../lib/dados'
import type { Tarefa } from '../lib/tipos'
import { dataCurta, diasAte, hoje, somaDias } from '../lib/util'
import { Campo, Painel } from './ui'
import { OpcoesEquipa } from './Escolher'
import { useDialogo } from './Dialogo'

// Só o título é obrigatório; prazo, hora, prioridade e responsável são opcionais.
// Com prazo, a tarefa aparece no calendário até estar feita.
export const PRIORIDADES = [{ v: 0, nome: 'Nenhuma', marca: '' }, { v: 1, nome: 'Baixa', marca: '!' }, { v: 2, nome: 'Média', marca: '!!' }, { v: 3, nome: 'Alta', marca: '!!!' }]
export const quandoTarefa = (t: Pick<Tarefa, 'prazo' | 'hora'>) => {
  if (!t.prazo) return ''
  const d = diasAte(t.prazo)
  const dia = d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : d === -1 ? 'Ontem' : dataCurta(t.prazo)
  return t.hora ? `${dia}, ${t.hora.slice(0, 5)}` : dia
}

export function NovaTarefa({ diaInicial, negocioId }: { diaInicial?: string; negocioId?: string | null }) {
  const { gravar, eu, membros } = useDados()
  const [titulo, setTitulo] = useState('')
  const [prazo, setPrazo] = useState(diaInicial ?? '')
  const [horaT, setHoraT] = useState('')
  const [prioridade, setPrioridade] = useState(0)
  const [quem, setQuem] = useState(eu?.nome ?? '')
  const [abrir, setAbrir] = useState<null | 'data' | 'hora' | 'prioridade' | 'quem'>(null)
  const [aGravar, setAGravar] = useState(false)
  const caixa = useRef<HTMLInputElement>(null)

  async function criar() {
    if (!titulo.trim() || aGravar) return
    setAGravar(true)
    try {
      await gravar('tarefas', { titulo: titulo.trim(), prazo: prazo || null, hora: prazo && horaT ? horaT : null, prioridade, responsavel: quem || null, negocio_id: negocioId ?? null })
      setTitulo(''); setPrazo(diaInicial ?? ''); setHoraT(''); setPrioridade(0); setAbrir(null); caixa.current?.focus()
    } finally { setAGravar(false) }
  }

  const chip = (k: NonNullable<typeof abrir>, icone: React.ReactNode, texto: string, ligado: boolean, limpar?: () => void) => (
    <span className={`badge gap-1 px-2.5 py-1.5 text-xs ${ligado ? 'bg-marca-50 text-marca-800 ring-1 ring-marca-200' : 'bg-white text-stone-600 ring-1 ring-stone-200'} ${abrir === k ? 'ring-2 ring-marca-300' : ''}`}>
      <button type="button" className="inline-flex items-center gap-1" onClick={() => setAbrir(abrir === k ? null : k)}>{icone}{texto}</button>
      {ligado && limpar && <button type="button" aria-label="Tirar" onClick={limpar}><X size={11} /></button>}
    </span>
  )
  const opcao = (ativo: boolean) => `badge px-2.5 py-1.5 text-xs ${ativo ? 'bg-marca-700 text-sobre-marca' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`

  return (
    <div className="rounded-2xl bg-stone-50 p-2.5 ring-1 ring-stone-200">
      <div className="flex gap-2">
        <input ref={caixa} className="input bg-white" placeholder="Nova tarefa" aria-label="Nova tarefa" value={titulo} onChange={e => setTitulo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') criar() }} />
        <button className="btn-primary px-3" onClick={criar} disabled={!titulo.trim() || aGravar} aria-label="Criar tarefa"><Plus size={16} /></button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chip('data', <CalendarDays size={12} />, prazo ? quandoTarefa({ prazo, hora: null }) : 'Prazo', !!prazo, () => { setPrazo(''); setHoraT('') })}
        {chip('hora', <Clock size={12} />, horaT || 'Hora', !!horaT, () => setHoraT(''))}
        {chip('prioridade', <Flag size={12} />, prioridade ? PRIORIDADES[prioridade].nome : 'Prioridade', prioridade > 0, () => setPrioridade(0))}
        {membros.length > 1 && chip('quem', <User size={12} />, quem || 'Ninguém', !!quem)}
      </div>
      {abrir === 'data' && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {[['Hoje', hoje()], ['Amanhã', somaDias(hoje(), 1)], ['Daqui a 1 semana', somaDias(hoje(), 7)]].map(([l, v]) => (
            <button key={l} type="button" onClick={() => { setPrazo(v); setAbrir(null) }} className={opcao(prazo === v)}>{l}</button>
          ))}
          <input type="date" aria-label="Prazo" className="input w-auto bg-white py-1 text-sm" value={prazo} onChange={e => setPrazo(e.target.value)} />
        </div>
      )}
      {abrir === 'hora' && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {['09:00', '12:00', '15:00', '18:00'].map(h => <button key={h} type="button" onClick={() => { setHoraT(h); if (!prazo) setPrazo(hoje()); setAbrir(null) }} className={`mono ${opcao(horaT === h)}`}>{h}</button>)}
          <input type="time" aria-label="Hora" className="input w-auto bg-white py-1 text-sm" value={horaT} onChange={e => { setHoraT(e.target.value); if (!prazo) setPrazo(hoje()) }} />
        </div>
      )}
      {abrir === 'prioridade' && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRIORIDADES.map(p => <button key={p.v} type="button" onClick={() => { setPrioridade(p.v); setAbrir(null) }} className={opcao(prioridade === p.v)}>{p.marca && <b>{p.marca}</b>} {p.nome}</button>)}
        </div>
      )}
      {abrir === 'quem' && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...membros.filter(m => m.ativo).map(m => m.nome), ''].map(n => <button key={n || 'ninguem'} type="button" onClick={() => { setQuem(n); setAbrir(null) }} className={opcao(quem === n)}>{n || 'Ninguém'}</button>)}
        </div>
      )}
    </div>
  )
}

export function LinhaTarefa({ t, onAbrir }: { t: Tarefa; onAbrir: () => void }) {
  const { gravar } = useDados()
  const atrasada = !t.feito && !!t.prazo && t.prazo < hoje()
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <button aria-label={t.feito ? `Desmarcar ${t.titulo}` : `Marcar feita: ${t.titulo}`} onClick={() => gravar('tarefas', { id: t.id, feito: !t.feito, feito_em: t.feito ? null : new Date().toISOString() })}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1 ${t.feito ? 'bg-marca-600 text-white ring-marca-600' : 'ring-stone-300 hover:ring-marca-600'}`}>{t.feito && <Check size={12} strokeWidth={3} />}</button>
      <button className="min-w-0 flex-1 text-left" onClick={onAbrir}>
        <span className={`block break-words text-sm ${t.feito ? 'text-stone-400 line-through' : ''}`}>{t.prioridade > 0 && <b className="mr-1 text-red-600">{'!'.repeat(t.prioridade)}</b>}{t.titulo}</span>
        {(t.prazo || t.responsavel) && <span className={`block text-xs ${atrasada ? 'text-red-600' : 'text-stone-400'}`}>{[quandoTarefa(t), t.responsavel].filter(Boolean).join(' · ')}</span>}
      </button>
    </li>
  )
}

export function TarefaPainel({ id, onFechar }: { id: string | null; onFechar: () => void }) {
  const { tarefas, gravar, apagar } = useDados()
  const { confirmar } = useDialogo()
  const t = tarefas.find(x => x.id === id)
  const [f, setF] = useState({ titulo: '', prazo: '', hora: '', prioridade: 0, responsavel: '', notas: '' })
  useEffect(() => { if (t) setF({ titulo: t.titulo, prazo: t.prazo ?? '', hora: t.hora?.slice(0, 5) ?? '', prioridade: t.prioridade ?? 0, responsavel: t.responsavel ?? '', notas: t.notas ?? '' }) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  async function guardar() {
    if (!t) return
    await gravar('tarefas', { id: t.id, titulo: f.titulo.trim() || t.titulo, prazo: f.prazo || null, hora: f.prazo && f.hora ? f.hora : null, prioridade: f.prioridade, responsavel: f.responsavel || null, notas: f.notas || null })
    onFechar()
  }
  return (
    <Painel aberto={!!t} onFechar={onFechar} titulo="Tarefa"
      rodape={<div className="flex items-center gap-2">
        <button className="btn text-stone-500 hover:bg-red-50 hover:text-red-700" aria-label="Apagar tarefa" onClick={async () => { if (t && await confirmar('Apagar esta tarefa?', { ok: 'Apagar', perigo: true })) { await apagar('tarefas', t.id); onFechar() } }}><Trash2 size={16} /></button>
        <div className="flex-1" /><button className="btn-outline" onClick={onFechar}>Fechar</button><button className="btn-primary" onClick={guardar}>Guardar</button>
      </div>}>
      {t && <div className="space-y-3">
        <Campo label="Tarefa"><input className="input" value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Prazo"><input type="date" className="input" value={f.prazo} onChange={e => setF({ ...f, prazo: e.target.value })} /></Campo>
          <Campo label="Hora"><input type="time" className="input" value={f.hora} onChange={e => setF({ ...f, hora: e.target.value, prazo: f.prazo || hoje() })} /></Campo>
        </div>
        <div><span className="label">Prioridade</span><div className="flex flex-wrap gap-1.5">{PRIORIDADES.map(p => <button key={p.v} type="button" onClick={() => setF({ ...f, prioridade: p.v })} className={`badge px-3 py-1.5 text-xs ${f.prioridade === p.v ? 'bg-marca-700 text-sobre-marca' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}>{p.marca && <b>{p.marca}</b>} {p.nome}</button>)}</div></div>
        <Campo label="Responsável"><select className="input" value={f.responsavel} onChange={e => setF({ ...f, responsavel: e.target.value })}><OpcoesEquipa /></select></Campo>
        <Campo label="Notas"><textarea className="input min-h-20" value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} /></Campo>
        {f.prazo && <p className="text-xs text-stone-500">Aparece no calendário até estar feita.</p>}
      </div>}
    </Painel>
  )
}
