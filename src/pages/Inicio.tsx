import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, Snowflake } from 'lucide-react'
import { useDados } from '../lib/dados'
import { CONFIG } from '../config'
import { corFase } from '../lib/tipos'
import { dataCurta, diasAte, dinheiro, hoje, hora, isoDia, maiuscula, dataComDia, relativo } from '../lib/util'
import { Vazio } from '../components/ui'
import NegocioPainel from '../components/NegocioPainel'
import ContactoPainel from '../components/ContactoPainel'
import { LinhaTarefa, NovaTarefa, TarefaPainel } from '../components/Tarefas'

function Cartao({ titulo, link, children, className = '' }: { titulo: string; link?: [string, string]; children: ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-base font-semibold">{titulo}</h2>{link && <Link to={link[1]} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-marca-700 hover:underline">{link[0]} <ArrowRight size={12} /></Link>}</div>
      {children}
    </section>
  )
}

export default function Inicio() {
  const { eu, negocios, fases, faseDe, emCurso, tarefas, agenda, contactoDe, empresaDe, ultimoContacto, contactos } = useDados()
  const [negocio, setNegocio] = useState<string | null>(null)
  const [tarefa, setTarefa] = useState<string | null>(null)
  const [contacto, setContacto] = useState<string | null>(null)
  const h = hoje()

  const abertos = useMemo(() => negocios.filter(emCurso), [negocios, emCurso])
  const totalAberto = abertos.reduce((s, n) => s + (n.valor ?? 0), 0)
  const ganhosMes = negocios.filter(n => faseDe(n.estado).tipo === 'ganho' && n.estado_desde.slice(0, 7) === h.slice(0, 7))
  const porFase = fases.map(f => { const l = negocios.filter(n => !n.arquivado && n.estado === f.id); return { f, n: l.length, valor: l.reduce((s, x) => s + (x.valor ?? 0), 0) } })
  const maxFase = Math.max(1, ...porFase.map(x => x.n))

  const agendaHoje = agenda.filter(a => isoDia(new Date(a.inicio)) <= h && isoDia(new Date(a.fim ?? a.inicio)) >= h).sort((a, b) => a.inicio.localeCompare(b.inicio))
  const tarefasHoje = tarefas.filter(t => !t.feito && t.prazo && t.prazo <= h).sort((a, b) => (a.prazo! + (a.hora ?? '')).localeCompare(b.prazo! + (b.hora ?? '')))
  const passos = abertos.filter(n => n.proximo_passo && n.proximo_passo_em && n.proximo_passo_em <= h).sort((a, b) => a.proximo_passo_em!.localeCompare(b.proximo_passo_em!))
  // a arrefecer: pessoas com negócio em curso com quem ninguém fala há muitos dias e sem passo marcado para a frente
  const arrefecer = useMemo(() => {
    const vistos = new Set<string>()
    const lista: { contactoId: string; negocioTitulo: string; ultimo: string | null }[] = []
    for (const n of abertos) {
      if (!n.contacto_id || vistos.has(n.contacto_id) || (n.proximo_passo_em && n.proximo_passo_em >= h)) continue
      const ultimo = ultimoContacto(n.contacto_id) ?? n.criado_em
      if (diasAte(ultimo.slice(0, 10)) <= -CONFIG.diasArrefecer) { vistos.add(n.contacto_id); lista.push({ contactoId: n.contacto_id, negocioTitulo: n.titulo, ultimo: ultimoContacto(n.contacto_id) }) }
    }
    return lista.sort((a, b) => (a.ultimo ?? '').localeCompare(b.ultimo ?? ''))
  }, [abertos, ultimoContacto, h])

  const primeiroNome = eu?.nome.split(' ')[0] ?? ''
  const vazioTotal = negocios.length === 0 && contactos.length === 0

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-stone-500">{maiuscula(dataComDia(h))}</p>
        <h1 className="text-2xl font-semibold">Olá{primeiroNome ? `, ${primeiroNome}` : ''}</h1>
      </div>
      {vazioTotal && (
        <div className="card flex flex-wrap items-center gap-3 p-4 text-sm">
          <p className="min-w-0 flex-1">Para começar: acrescente o primeiro contacto ou negócio, e em Definições ponha o nome, a cor e as fases do seu negócio.</p>
          <Link to="/definicoes" className="btn-outline">Definições</Link><Link to="/pipeline" className="btn-primary">Novo negócio</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4"><p className="label">Pipeline em curso</p><p className="numero text-2xl font-semibold" data-teste="pipeline-aberto">{dinheiro(totalAberto)}</p><p className="text-xs text-stone-500">{abertos.length} negócio{abertos.length === 1 ? '' : 's'}</p></div>
        <div className="card p-4"><p className="label">Ganho este mês</p><p className="numero text-2xl font-semibold">{dinheiro(ganhosMes.reduce((s, n) => s + (n.valor ?? 0), 0))}</p><p className="text-xs text-stone-500">{ganhosMes.length} negócio{ganhosMes.length === 1 ? '' : 's'}</p></div>
        <div className="card p-4"><p className="label">Para hoje</p><p className="numero text-2xl font-semibold">{agendaHoje.length + tarefasHoje.length}</p><p className="text-xs text-stone-500">marcações e tarefas</p></div>
        <div className="card p-4"><p className="label">Passos em atraso</p><p className={`numero text-2xl font-semibold ${passos.some(n => n.proximo_passo_em! < h) ? 'text-red-600' : ''}`}>{passos.filter(n => n.proximo_passo_em! < h).length}</p><p className="text-xs text-stone-500">{passos.filter(n => n.proximo_passo_em === h).length} para hoje</p></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Hoje" link={['Calendário', '/calendario']}>
          {agendaHoje.length === 0 && tarefasHoje.length === 0 ? <p className="mb-3 text-sm text-stone-400">Nada marcado para hoje.</p> : (
            <ul className="mb-3 divide-y divide-stone-100">
              {agendaHoje.map(a => <li key={a.id} className="flex items-center gap-3 py-2 text-sm"><span className="mono w-12 shrink-0 text-xs text-stone-500">{a.dia_inteiro ? 'dia' : hora(a.inicio)}</span><span className="min-w-0 flex-1 truncate font-medium">{a.titulo}</span>{a.local && <span className="hidden truncate text-xs text-stone-500 sm:block">{a.local}</span>}</li>)}
              {tarefasHoje.map(t => <LinhaTarefa key={t.id} t={t} onAbrir={() => setTarefa(t.id)} />)}
            </ul>
          )}
          <NovaTarefa diaInicial={h} />
        </Cartao>

        <Cartao titulo="Próximos passos" link={['Pipeline', '/pipeline']}>
          {passos.length === 0 ? <Vazio>Sem passos para hoje nem em atraso.</Vazio> : (
            <ul className="divide-y divide-stone-100">{passos.slice(0, 8).map(n => { const atraso = n.proximo_passo_em! < h; return (
              <li key={n.id}><button className="flex w-full items-start gap-2 py-2 text-left" onClick={() => setNegocio(n.id)}>
                {atraso ? <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-600" /> : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
                <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{n.proximo_passo}</span><span className="block truncate text-xs text-stone-500">{n.titulo}{contactoDe(n.contacto_id) ? ` · ${contactoDe(n.contacto_id)!.nome}` : ''}</span></span>
                <span className={`shrink-0 text-xs ${atraso ? 'text-red-600' : 'text-stone-500'}`}>{n.proximo_passo_em === h ? 'hoje' : dataCurta(n.proximo_passo_em)}</span>
              </button></li>) })}</ul>
          )}
        </Cartao>

        <Cartao titulo="Negócios por fase" link={['Ver pipeline', '/pipeline']}>
          <ul className="space-y-2.5">
            {porFase.map(({ f, n, valor }) => (
              <li key={f.id} className="text-sm">
                <div className="mb-1 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${corFase(f.cor).ponto}`} /><span className="min-w-0 flex-1 truncate">{f.nome}</span><span className="text-xs text-stone-500">{n}</span>{valor > 0 && <span className="numero w-20 text-right text-xs font-medium">{dinheiro(valor)}</span>}</div>
                <div className="h-1.5 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full ${corFase(f.cor).ponto}`} style={{ width: `${(n / maxFase) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </Cartao>

        <Cartao titulo="A arrefecer">
          <p className="-mt-2 mb-3 text-xs text-stone-500">Negócios em curso sem conversa há {CONFIG.diasArrefecer} dias ou mais.</p>
          {arrefecer.length === 0 ? <Vazio>Ninguém a arrefecer.</Vazio> : (
            <ul className="divide-y divide-stone-100">{arrefecer.slice(0, 8).map(x => { const c = contactoDe(x.contactoId); return (
              <li key={x.contactoId}><button className="flex w-full items-center gap-2 py-2 text-left" onClick={() => setContacto(x.contactoId)}>
                <Snowflake size={14} className="shrink-0 text-sky-500" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c?.nome}{c?.empresa_id && <span className="font-normal text-stone-500"> · {empresaDe(c.empresa_id)?.nome}</span>}</span><span className="block truncate text-xs text-stone-500">{x.negocioTitulo}</span></span>
                <span className="shrink-0 text-xs text-stone-500">{x.ultimo ? relativo(x.ultimo) : 'nunca'}</span>
              </button></li>) })}</ul>
          )}
        </Cartao>
      </div>

      <NegocioPainel id={negocio} onFechar={() => setNegocio(null)} />
      <TarefaPainel id={tarefa} onFechar={() => setTarefa(null)} />
      <ContactoPainel id={contacto} onFechar={() => setContacto(null)} onAbrir={setContacto} />
    </div>
  )
}
