import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react'
import { useDados } from '../lib/dados'
import { CATEGORIAS_CONTACTO, ORIGENS } from '../config'
import { corFase, type Contacto } from '../lib/tipos'
import { dataCurta, dinheiro, emailValido, hora, normaliza, numeroLimpo, relativo } from '../lib/util'
import { Avatar, Campo, Erro, Grupo, Painel } from './ui'
import { EscolherEmpresa, OpcoesEquipa, useGarantirEmpresa } from './Escolher'
import { BotoesContacto } from './Telefone'
import { useDialogo } from './Dialogo'
import { ICONE_ATIVIDADE, traduzFase } from './NegocioPainel'
import NegocioPainel from './NegocioPainel'

type Form = { nome: string; empresa: string; cargo: string; email: string; telefone: string; categoria: string; origem: string; responsavel: string; notas: string }
const digitos = (t: string | null | undefined) => numeroLimpo(t ?? '').replace(/^\+?351/, '').replace(/^00351/, '')

// contactos que parecem a mesma pessoa: mesmo email, mesmo telefone ou mesmo nome
export function possiveisRepetidos(c: Pick<Contacto, 'nome' | 'email' | 'telefone'> & { id?: string }, todos: Contacto[]) {
  const mail = (c.email ?? '').trim().toLowerCase(); const tel = digitos(c.telefone); const nome = normaliza(c.nome)
  return todos.filter(x => x.id !== c.id && (
    (mail && (x.email ?? '').trim().toLowerCase() === mail) || (tel.length >= 9 && digitos(x.telefone) === tel) || (nome.length > 2 && normaliza(x.nome) === nome)))
}

// todos os contactos que parecem repetidos (para a lista), sem comparar cada um com todos
export function idsRepetidos(todos: Contacto[]) {
  const chaves = (c: Contacto) => [c.email && 'e' + c.email.trim().toLowerCase(), digitos(c.telefone).length >= 9 && 't' + digitos(c.telefone), normaliza(c.nome).length > 2 && 'n' + normaliza(c.nome)].filter(Boolean) as string[]
  const conta = new Map<string, number>()
  for (const c of todos) for (const k of chaves(c)) conta.set(k, (conta.get(k) ?? 0) + 1)
  return new Set(todos.filter(c => chaves(c).some(k => conta.get(k)! > 1)).map(c => c.id))
}

export default function ContactoPainel({ id, novo, onFechar, onAbrir }: { id: string | null; novo?: boolean; onFechar: () => void; onAbrir?: (id: string) => void }) {
  const { contactos, contactoDe, empresaDe, gravar, apagar, eu, negocios, atividades, registar, faseDe } = useDados()
  const { confirmar } = useDialogo()
  const garantirEmpresa = useGarantirEmpresa()
  const c = contactoDe(id)
  const vazio: Form = { nome: '', empresa: '', cargo: '', email: '', telefone: '', categoria: '', origem: '', responsavel: eu?.nome ?? '', notas: '' }
  const [f, setF] = useState<Form>(vazio)
  const [editar, setEditar] = useState(false)
  const [mudou, setMudou] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [negocio, setNegocio] = useState<string | null>(null)
  const [novoNegocio, setNovoNegocio] = useState(false)
  const preencher = () => setF(c ? { nome: c.nome, empresa: empresaDe(c.empresa_id)?.nome ?? '', cargo: c.cargo ?? '', email: c.email ?? '', telefone: c.telefone ?? '', categoria: c.categoria ?? '', origem: c.origem ?? '', responsavel: c.responsavel ?? '', notas: c.notas ?? '' } : vazio)
  useEffect(() => { preencher(); setEditar(!id); setMudou(false); setErro(null) }, [id, novo]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF(p => ({ ...p, [k]: v })); setMudou(true) }

  const seus = useMemo(() => (c ? negocios.filter(n => n.contacto_id === c.id) : []), [negocios, c])
  const historico = useMemo(() => {
    if (!c) return []
    const ids = new Set(seus.map(n => n.id))
    return atividades.filter(a => a.contacto_id === c.id || (a.negocio_id && ids.has(a.negocio_id)))
  }, [atividades, c, seus])
  const repetidos = useMemo(() => (f.nome || f.email || f.telefone ? possiveisRepetidos({ id: c?.id, nome: f.nome, email: f.email, telefone: f.telefone }, contactos) : []), [f.nome, f.email, f.telefone, contactos, c?.id])
  const emailMau = !!f.email.trim() && !emailValido(f.email)

  async function guardar() {
    if (!f.nome.trim()) { setErro('Falta o nome.'); return }
    if (emailMau) { setErro('O email não parece válido. Corrige ou deixa em branco.'); return }
    try {
      const empresa_id = await garantirEmpresa(f.empresa)
      const linha = { nome: f.nome.trim(), empresa_id, cargo: f.cargo.trim() || null, email: f.email.trim().toLowerCase() || null, telefone: f.telefone.trim() || null, categoria: f.categoria || null, origem: f.origem || null, responsavel: f.responsavel || null, notas: f.notas || null }
      await gravar('contactos', c ? { id: c.id, ...linha } : linha)
      setMudou(false); if (!c) onFechar(); else setEditar(false)
    } catch (e) { setErro((e as Error).message) }
  }
  async function remover() {
    if (!c || !(await confirmar(`Apagar ${c.nome}?`, { texto: 'Os negócios ficam, mas sem esta pessoa.', ok: 'Apagar', perigo: true }))) return
    await apagar('contactos', c.id); onFechar()
  }
  async function registarNota() {
    if (!c || !nota.trim()) return
    try { await registar({ contacto_id: c.id, negocio_id: seus.find(n => !n.arquivado)?.id ?? null, tipo: 'nota', resumo: nota.trim() }); setNota('') } catch (e) { setErro((e as Error).message) }
  }

  const formulario = (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Nome"><input className="input" value={f.nome} onChange={e => set('nome', e.target.value)} autoFocus={!c} /></Campo>
        <Campo label="Empresa"><EscolherEmpresa id="empresas-contacto" valor={f.empresa} onEscolher={v => set('empresa', v)} /></Campo>
        <Campo label="Email">
          <input className={`input ${emailMau ? 'border-red-400' : ''}`} type="email" value={f.email} onChange={e => set('email', e.target.value)} aria-invalid={emailMau} />
          {emailMau && <span className="mt-1 block text-xs text-red-700">Este email não parece válido.</span>}
        </Campo>
        <Campo label="Telefone"><input className="input" type="tel" value={f.telefone} onChange={e => set('telefone', e.target.value)} placeholder="912 345 678" /></Campo>
        <Campo label="Cargo"><input className="input" value={f.cargo} onChange={e => set('cargo', e.target.value)} /></Campo>
        <Campo label="Origem"><select className="input" value={f.origem} onChange={e => set('origem', e.target.value)}><option value="">Sem origem</option>{ORIGENS.map(o => <option key={o}>{o}</option>)}</select></Campo>
        <Grupo label="Categoria" className="sm:col-span-2"><div className="flex flex-wrap gap-1.5">{CATEGORIAS_CONTACTO.map(k => <button key={k.id} type="button" aria-pressed={f.categoria === k.id} onClick={() => set('categoria', f.categoria === k.id ? '' : k.id)} className={`badge px-2.5 py-1.5 text-xs ${f.categoria === k.id ? 'bg-marca-700 text-sobre-marca' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}>{k.nome}</button>)}</div></Grupo>
        <Campo label="Responsável"><select className="input" value={f.responsavel} onChange={e => set('responsavel', e.target.value)}><OpcoesEquipa /></select></Campo>
      </div>
      {repetidos.length > 0 && (
        <div className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200" role="status">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="min-w-0">Parece repetido: {repetidos.slice(0, 3).map((r, i) => <span key={r.id}>{i > 0 && ', '}{onAbrir ? <button type="button" className="font-medium underline" onClick={() => onAbrir(r.id)}>{r.nome}</button> : <b>{r.nome}</b>}</span>)}. Confirma antes de criar outro.</div>
        </div>
      )}
      <Campo label="Notas"><textarea className="input min-h-16" value={f.notas} onChange={e => set('notas', e.target.value)} /></Campo>
    </div>
  )

  const cat = CATEGORIAS_CONTACTO.find(k => k.id === c?.categoria)
  const novoN = useMemo(() => (novoNegocio && c ? { contacto_id: c.id, empresa_id: c.empresa_id } : null), [novoNegocio, c?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Painel aberto={!!id || !!novo} onFechar={onFechar} largura="max-w-2xl" titulo={c ? (editar ? `Editar ${c.nome}` : 'Contacto') : 'Novo contacto'}
      rodape={editar || !c ? <div className="flex gap-2">
        {c && <button className="btn text-stone-500 hover:bg-red-50 hover:text-red-700" onClick={remover} aria-label="Apagar contacto"><Trash2 size={16} /></button>}
        <div className="flex-1" />
        <button className="btn-outline" onClick={() => { if (c) { preencher(); setMudou(false); setEditar(false) } else onFechar() }}>Cancelar</button>
        <button className="btn-primary" disabled={!!c && !mudou} onClick={guardar}>{c ? 'Guardar' : 'Criar'}</button>
      </div> : undefined}>
      <div className="space-y-5">
        <Erro texto={erro} />
        {(!c || editar) ? formulario : <>
          <div className="flex items-start gap-3">
            <Avatar nome={c.nome} cor="var(--marca)" tamanho={48} />
            <div className="min-w-0 flex-1">
              <h3 className="break-words text-lg font-semibold">{c.nome}</h3>
              <p className="text-sm text-stone-500">{[c.cargo, empresaDe(c.empresa_id)?.nome].filter(Boolean).join(' · ')}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">{cat && <span className="badge bg-stone-100 text-stone-700">{cat.nome}</span>}{c.origem && <span className="badge bg-stone-100 text-stone-500">{c.origem}</span>}</div>
            </div>
            <button className="btn-outline px-2.5 py-1.5" onClick={() => setEditar(true)}><Pencil size={14} /> Editar</button>
          </div>
          {(c.email || c.telefone) && <div className="flex flex-wrap gap-2"><BotoesContacto telefone={c.telefone} email={c.email} /></div>}
          <dl className="divide-y divide-stone-100 rounded-2xl text-sm ring-1 ring-stone-200">
            {c.email && <div className="flex gap-3 px-3.5 py-2.5"><dt className="w-24 shrink-0 text-stone-500">Email</dt><dd className="min-w-0 break-all">{c.email}{!emailValido(c.email) && <span className="badge ml-2 bg-red-50 text-red-700">inválido</span>}</dd></div>}
            {c.telefone && <div className="flex gap-3 px-3.5 py-2.5"><dt className="w-24 shrink-0 text-stone-500">Telefone</dt><dd>{c.telefone}</dd></div>}
            {c.responsavel && <div className="flex gap-3 px-3.5 py-2.5"><dt className="w-24 shrink-0 text-stone-500">Responsável</dt><dd>{c.responsavel}</dd></div>}
            <div className="flex gap-3 px-3.5 py-2.5"><dt className="w-24 shrink-0 text-stone-500">Criado</dt><dd>{dataCurta(c.criado_em)}</dd></div>
          </dl>
          {repetidos.length > 0 && <p className="flex items-center gap-1.5 text-xs text-amber-800"><AlertTriangle size={13} /> Pode estar repetido com {repetidos.map(r => r.nome).join(', ')}.</p>}
          {c.notas && <p className="whitespace-pre-wrap break-words rounded-xl bg-stone-50 p-3 text-sm text-stone-700">{c.notas}</p>}

          <section className="border-t border-stone-200 pt-4">
            <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Negócios</h3><button className="btn-ghost px-2 py-1 text-xs" onClick={() => setNovoNegocio(true)}><Plus size={14} /> Novo</button></div>
            {seus.length === 0 ? <p className="text-sm text-stone-400">Nenhum.</p> : <ul className="space-y-1.5">{seus.map(n => { const fase = faseDe(n.estado); return (
              <li key={n.id}><button onClick={() => setNegocio(n.id)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ring-1 ring-stone-200 hover:bg-stone-50">
                <span className="min-w-0 flex-1 truncate text-sm">{n.titulo}</span>{n.valor ? <span className="numero text-xs text-stone-500">{dinheiro(n.valor)}</span> : null}<span className={`badge ${corFase(fase.cor).badge}`}>{fase.nome}</span>
              </button></li>) })}</ul>}
          </section>

          <section className="border-t border-stone-200 pt-4">
            <h3 className="mb-1 font-semibold">Histórico</h3>
            <p className="mb-2 text-xs text-stone-500">Último contacto: {relativo(historico.find(a => a.tipo !== 'estado')?.data)}</p>
            <div className="mb-3 flex gap-2"><input className="input" aria-label="Nota" value={nota} onChange={e => setNota(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') registarNota() }} placeholder="Acrescentar uma nota" /><button className="btn-primary" disabled={!nota.trim()} onClick={registarNota}>Registar</button></div>
            <ol className="relative space-y-3 border-l border-stone-200 pl-4">
              {historico.slice(0, 50).map(a => { const I = ICONE_ATIVIDADE[a.tipo]; return (
                <li key={a.id} className="relative"><span className="absolute -left-[25px] top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-marca-50 text-marca-700"><I size={11} /></span>
                  <p className="break-words text-sm">{a.tipo === 'estado' ? traduzFase(a.resumo, x => faseDe(x).nome) : a.resumo}</p><p className="text-xs text-stone-400">{dataCurta(a.data)} {hora(a.data)}{a.autor && <> · {a.autor}</>}</p></li>
              ) })}
              {historico.length === 0 && <li className="text-sm text-stone-400">Sem registos.</li>}
            </ol>
          </section>
        </>}
      </div>
      <NegocioPainel id={negocio} novo={novoN} onFechar={() => { setNegocio(null); setNovoNegocio(false) }} />
    </Painel>
  )
}
