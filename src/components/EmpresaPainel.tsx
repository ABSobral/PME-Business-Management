import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Pencil, Trash2 } from 'lucide-react'
import { useDados } from '../lib/dados'
import { TIPOS_EMPRESA, corFase, type TipoEmpresa } from '../lib/tipos'
import { dinheiro, emailValido, normaliza } from '../lib/util'
import { Campo, Erro, Painel } from './ui'
import { BotoesContacto } from './Telefone'
import { useDialogo } from './Dialogo'

type Form = { nome: string; tipo: TipoEmpresa; setor: string; site: string; email: string; telefone: string; nif: string; morada: string; notas: string }
const vazio: Form = { nome: '', tipo: 'cliente', setor: '', site: '', email: '', telefone: '', nif: '', morada: '', notas: '' }

export default function EmpresaPainel({ id, novo, onFechar, onContacto }: { id: string | null; novo?: boolean; onFechar: () => void; onContacto: (id: string) => void }) {
  const { empresas, empresaDe, contactos, negocios, gravar, apagar, faseDe } = useDados()
  const { confirmar } = useDialogo()
  const e = empresaDe(id)
  const [f, setF] = useState<Form>(vazio)
  const [editar, setEditar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const preencher = () => setF(e ? { nome: e.nome, tipo: e.tipo, setor: e.setor ?? '', site: e.site ?? '', email: e.email ?? '', telefone: e.telefone ?? '', nif: e.nif ?? '', morada: e.morada ?? '', notas: e.notas ?? '' } : vazio)
  useEffect(() => { preencher(); setEditar(!id); setErro(null) }, [id, novo]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(p => ({ ...p, [k]: v }))
  const pessoas = useMemo(() => contactos.filter(c => e && c.empresa_id === e.id), [contactos, e])
  const seus = useMemo(() => negocios.filter(n => e && n.empresa_id === e.id), [negocios, e])
  const repetida = f.nome.trim() ? empresas.find(x => x.id !== e?.id && normaliza(x.nome) === normaliza(f.nome)) : undefined
  const emailMau = !!f.email.trim() && !emailValido(f.email)

  async function guardar() {
    if (!f.nome.trim()) { setErro('Falta o nome.'); return }
    if (emailMau) { setErro('O email não parece válido.'); return }
    try {
      const linha = { nome: f.nome.trim(), tipo: f.tipo, setor: f.setor || null, site: f.site || null, email: f.email.trim() || null, telefone: f.telefone || null, nif: f.nif || null, morada: f.morada || null, notas: f.notas || null }
      await gravar('empresas', e ? { id: e.id, ...linha } : linha)
      if (e) setEditar(false); else onFechar()
    } catch (x) { setErro((x as Error).message) }
  }
  async function remover() {
    if (!e || !(await confirmar(`Apagar ${e.nome}?`, { texto: 'Os contactos e negócios ficam, mas sem empresa.', ok: 'Apagar', perigo: true }))) return
    await apagar('empresas', e.id); onFechar()
  }

  return (
    <Painel aberto={!!id || !!novo} onFechar={onFechar} titulo={e ? (editar ? `Editar ${e.nome}` : e.nome) : 'Nova empresa'}
      rodape={editar ? <div className="flex gap-2">
        {e && <button className="btn text-stone-500 hover:bg-red-50 hover:text-red-700" onClick={remover} aria-label="Apagar empresa"><Trash2 size={16} /></button>}
        <div className="flex-1" />
        <button className="btn-outline" onClick={() => { if (e) { preencher(); setEditar(false) } else onFechar() }}>Cancelar</button>
        <button className="btn-primary" onClick={guardar}>{e ? 'Guardar' : 'Criar'}</button>
      </div> : undefined}>
      <div className="space-y-5">
        <Erro texto={erro} />
        {editar ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nome" className="sm:col-span-2"><input className="input" value={f.nome} onChange={x => set('nome', x.target.value)} autoFocus={!e} /></Campo>
            {repetida && <p className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:col-span-2"><AlertTriangle size={15} /> Já existe "{repetida.nome}".</p>}
            <Campo label="Tipo"><select className="input" value={f.tipo} onChange={x => set('tipo', x.target.value as TipoEmpresa)}>{TIPOS_EMPRESA.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></Campo>
            <Campo label="Setor"><input className="input" value={f.setor} onChange={x => set('setor', x.target.value)} /></Campo>
            <Campo label="Email"><input className="input" type="email" value={f.email} onChange={x => set('email', x.target.value)} />{emailMau && <span className="mt-1 block text-xs text-red-700">Este email não parece válido.</span>}</Campo>
            <Campo label="Telefone"><input className="input" type="tel" value={f.telefone} onChange={x => set('telefone', x.target.value)} /></Campo>
            <Campo label="Site"><input className="input" value={f.site} onChange={x => set('site', x.target.value)} placeholder="https://" /></Campo>
            <Campo label="NIF"><input className="input" value={f.nif} onChange={x => set('nif', x.target.value)} /></Campo>
            <Campo label="Morada" className="sm:col-span-2"><input className="input" value={f.morada} onChange={x => set('morada', x.target.value)} /></Campo>
            <Campo label="Notas" className="sm:col-span-2"><textarea className="input min-h-16" value={f.notas} onChange={x => set('notas', x.target.value)} /></Campo>
          </div>
        ) : e && <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><span className="badge bg-stone-100 text-stone-600">{TIPOS_EMPRESA.find(t => t.id === e.tipo)?.nome}</span>{e.setor && <span className="ml-2 text-sm text-stone-500">{e.setor}</span>}</div>
            <button className="btn-outline px-2.5 py-1.5" onClick={() => setEditar(true)}><Pencil size={14} /> Editar</button>
          </div>
          {(e.email || e.telefone) && <div className="flex flex-wrap gap-2"><BotoesContacto telefone={e.telefone} email={e.email} /></div>}
          <dl className="divide-y divide-stone-100 rounded-2xl text-sm ring-1 ring-stone-200">
            {([['Site', e.site], ['Email', e.email], ['Telefone', e.telefone], ['NIF', e.nif], ['Morada', e.morada]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex gap-3 px-3.5 py-2.5"><dt className="w-20 shrink-0 text-stone-500">{k}</dt><dd className="min-w-0 break-all">{v}</dd></div>)}
          </dl>
          {e.notas && <p className="whitespace-pre-wrap break-words rounded-xl bg-stone-50 p-3 text-sm">{e.notas}</p>}
          <section><h3 className="mb-2 font-semibold">Pessoas ({pessoas.length})</h3>
            {pessoas.length === 0 ? <p className="text-sm text-stone-400">Nenhuma.</p> : <ul className="space-y-1">{pessoas.map(c => <li key={c.id}><button className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-stone-50" onClick={() => onContacto(c.id)}><b className="font-medium">{c.nome}</b>{c.cargo && <span className="text-stone-500"> · {c.cargo}</span>}</button></li>)}</ul>}
          </section>
          <section><h3 className="mb-2 font-semibold">Negócios ({seus.length})</h3>
            {seus.length === 0 ? <p className="text-sm text-stone-400">Nenhum.</p> : <ul className="space-y-1">{seus.map(n => { const fase = faseDe(n.estado); return <li key={n.id} className="flex items-center gap-2 px-2 py-1 text-sm"><span className="min-w-0 flex-1 truncate">{n.titulo}</span>{n.valor ? <span className="numero text-xs text-stone-500">{dinheiro(n.valor)}</span> : null}<span className={`badge ${corFase(fase.cor).badge}`}>{fase.nome}</span></li> })}</ul>}
          </section>
        </>}
      </div>
    </Painel>
  )
}
