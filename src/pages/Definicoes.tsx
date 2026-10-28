import { useEffect, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useDados } from '../lib/dados'
import { CORES_FASE, TIPOS_FASE, type CorFase, type Definicoes as Defs, type Fase, type Papel, type TipoFase } from '../lib/tipos'
import { emailValido, normaliza } from '../lib/util'
import { Avatar, Campo, Erro, InputNumero } from '../components/ui'
import { useDialogo } from '../components/Dialogo'

const MOEDAS = ['EUR', 'USD', 'GBP', 'BRL', 'CHF', 'AOA', 'MZN', 'CVE']
const hex = (c: string) => /^#[0-9a-f]{6}$/i.test(c)

function Seccao({ titulo, desc, children, rodape }: { titulo: string; desc?: string; children: ReactNode; rodape?: ReactNode }) {
  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <div><h2 className="text-lg font-semibold">{titulo}</h2>{desc && <p className="text-sm text-stone-500">{desc}</p>}</div>
      {children}
      {rodape && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 pt-3">{rodape}</div>}
    </section>
  )
}
function Aviso({ ok, erro }: { ok: string | null; erro: string | null }) {
  return <>{erro && <span className="mr-auto"><Erro texto={erro} /></span>}{ok && <span className="mr-auto text-sm text-emerald-700" role="status">{ok}</span>}</>
}
// guarda e mostra "Guardado" ou o erro
function useGuardar() {
  const [ok, setOk] = useState<string | null>(null); const [erro, setErro] = useState<string | null>(null); const [aGuardar, setAGuardar] = useState(false)
  const correr = async (f: () => Promise<void>, msg = 'Guardado.') => {
    setOk(null); setErro(null); setAGuardar(true)
    try { await f(); setOk(msg); setTimeout(() => setOk(null), 3000) } catch (e) { setErro((e as Error).message) } finally { setAGuardar(false) }
  }
  return { ok, erro, aGuardar, correr, setErro }
}

export default function Definicoes() {
  const { eAdmin } = useDados()
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">Definições</h1>
      {!eAdmin && <p className="rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-600">Só os administradores mudam o negócio, as fases e a equipa. Pode mudar o seu perfil no fim da página.</p>}
      <Negocio />
      <Fases />
      <TextosPropostas />
      <Equipa />
      <Perfil />
    </div>
  )
}

function Negocio() {
  const { definicoes, guardarDefinicoes, eAdmin } = useDados()
  const [f, setF] = useState(definicoes)
  const g = useGuardar()
  useEffect(() => setF(definicoes), [definicoes])
  const set = <K extends keyof Defs>(k: K, v: Defs[K]) => setF(p => ({ ...p, [k]: v }))
  const guardar = () => g.correr(async () => {
    if (!f.nome_negocio.trim()) throw new Error('Falta o nome do negócio.')
    if (!hex(f.cor)) throw new Error('A cor tem de ser um código como #334155.')
    if (f.logo_url && !/^https?:\/\//.test(f.logo_url)) throw new Error('O logótipo tem de ser um endereço que comece por https://')
    await guardarDefinicoes({ nome_negocio: f.nome_negocio.trim(), logo_url: f.logo_url?.trim() || null, cor: f.cor, moeda: f.moeda, iva_pct: f.iva_pct, email: f.email || null, telefone: f.telefone || null, site: f.site || null, morada: f.morada || null, nif: f.nif || null })
  })
  return (
    <Seccao titulo="O negócio" desc="Nome, logótipo e cor aparecem na app e nas propostas que os clientes abrem."
      rodape={eAdmin && <><Aviso ok={g.ok} erro={g.erro} /><button className="btn-primary" onClick={guardar} disabled={g.aGuardar}>Guardar</button></>}>
      <fieldset disabled={!eAdmin} className="grid gap-3 sm:grid-cols-2">
        <Campo label="Nome do negócio"><input className="input" value={f.nome_negocio} onChange={e => set('nome_negocio', e.target.value)} /></Campo>
        <Campo label="Cor principal">
          <span className="flex gap-2">
            <input type="color" aria-label="Escolher cor" className="h-[2.6rem] w-14 shrink-0 cursor-pointer rounded-xl border border-stone-300 bg-white p-1" value={hex(f.cor) ? f.cor : '#334155'} onChange={e => set('cor', e.target.value)} />
            <input className="input mono" aria-label="Código da cor" value={f.cor} onChange={e => set('cor', e.target.value.trim())} maxLength={7} />
          </span>
        </Campo>
        <Campo label="Logótipo (endereço da imagem)" className="sm:col-span-2"><input className="input" value={f.logo_url ?? ''} onChange={e => set('logo_url', e.target.value)} placeholder="https://.../logotipo.png" /></Campo>
        <Campo label="Moeda"><select className="input" value={f.moeda} onChange={e => set('moeda', e.target.value)}>{[...new Set([f.moeda, ...MOEDAS])].map(m => <option key={m}>{m}</option>)}</select></Campo>
        <Campo label="IVA por omissão (%)"><InputNumero valor={Number(f.iva_pct)} onValor={v => set('iva_pct', Math.min(100, v))} /></Campo>
        <Campo label="Email"><input className="input" type="email" value={f.email ?? ''} onChange={e => set('email', e.target.value)} /></Campo>
        <Campo label="Telefone"><input className="input" value={f.telefone ?? ''} onChange={e => set('telefone', e.target.value)} /></Campo>
        <Campo label="Site"><input className="input" value={f.site ?? ''} onChange={e => set('site', e.target.value)} /></Campo>
        <Campo label="NIF"><input className="input" value={f.nif ?? ''} onChange={e => set('nif', e.target.value)} /></Campo>
        <Campo label="Morada" className="sm:col-span-2"><input className="input" value={f.morada ?? ''} onChange={e => set('morada', e.target.value)} /></Campo>
      </fieldset>
    </Seccao>
  )
}

function Fases() {
  const { definicoes, guardarDefinicoes, eAdmin, negocios } = useDados()
  const [fases, setFases] = useState<Fase[]>(definicoes.estados)
  const g = useGuardar()
  useEffect(() => setFases(definicoes.estados), [definicoes.estados])
  const mudar = (i: number, c: Partial<Fase>) => setFases(l => l.map((x, j) => (j === i ? { ...x, ...c } : x)))
  const mover = (i: number, d: number) => setFases(l => { const n = [...l]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n })
  const contar = (id: string) => negocios.filter(n => n.estado === id).length
  function acrescentar() {
    const base = 'fase'; let k = fases.length + 1
    while (fases.some(f => f.id === `${base}_${k}`)) k++
    const i = Math.max(0, fases.findIndex(f => f.tipo !== 'aberto'))
    setFases(l => [...l.slice(0, i), { id: `${base}_${k}`, nome: 'Nova fase', cor: 'cinza', tipo: 'aberto' }, ...l.slice(i)])
  }
  const guardar = () => g.correr(async () => {
    const limpas = fases.map(f => ({ ...f, nome: f.nome.trim() }))
    if (limpas.some(f => !f.nome)) throw new Error('Todas as fases precisam de nome.')
    if (new Set(limpas.map(f => normaliza(f.nome))).size !== limpas.length) throw new Error('Há fases com o mesmo nome.')
    for (const t of TIPOS_FASE) if (!limpas.some(f => f.tipo === t.id)) throw new Error(`Falta pelo menos uma fase do tipo "${t.nome}".`)
    const tiradas = definicoes.estados.filter(f => !limpas.some(x => x.id === f.id) && contar(f.id) > 0)
    if (tiradas.length) throw new Error(`Não pode tirar "${tiradas[0].nome}": tem negócios. Mude-os de fase primeiro.`)
    await guardarDefinicoes({ estados: limpas })
  })
  return (
    <Seccao titulo="Fases do pipeline" desc='As colunas do pipeline, por ordem. "Ganho" e "Perdido" fecham o negócio; ao passar a "Perdido" pergunta-se o motivo.'
      rodape={eAdmin && <><Aviso ok={g.ok} erro={g.erro} /><button className="btn-outline" onClick={acrescentar}><Plus size={15} /> Fase</button><button className="btn-primary" onClick={guardar} disabled={g.aGuardar}>Guardar fases</button></>}>
      <fieldset disabled={!eAdmin}>
        <ol className="space-y-2">
          {fases.map((f, i) => (
            <li key={f.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-stone-50 p-2 ring-1 ring-stone-200 sm:grid-cols-[minmax(0,1fr)_130px_120px_auto]">
              <input className="input" aria-label={`Nome da fase ${i + 1}`} value={f.nome} onChange={e => mudar(i, { nome: e.target.value })} />
              <span className="flex items-center gap-0.5 sm:order-last">
                <button type="button" className="rounded-lg p-1.5 text-stone-500 hover:bg-white disabled:opacity-30" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}><ArrowUp size={15} /></button>
                <button type="button" className="rounded-lg p-1.5 text-stone-500 hover:bg-white disabled:opacity-30" aria-label="Descer" disabled={i === fases.length - 1} onClick={() => mover(i, 1)}><ArrowDown size={15} /></button>
                <button type="button" className="rounded-lg p-1.5 text-stone-500 hover:bg-white hover:text-red-600 disabled:opacity-30" aria-label={`Tirar ${f.nome}`} disabled={fases.length <= 3} title={contar(f.id) ? `${contar(f.id)} negócio(s) nesta fase` : undefined} onClick={() => setFases(l => l.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
              </span>
              <select className="input" aria-label="Cor" value={f.cor} onChange={e => mudar(i, { cor: e.target.value as CorFase })}>{CORES_FASE.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
              <select className="input" aria-label="Tipo" value={f.tipo} onChange={e => mudar(i, { tipo: e.target.value as TipoFase })}>{TIPOS_FASE.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select>
            </li>
          ))}
        </ol>
      </fieldset>
    </Seccao>
  )
}

function TextosPropostas() {
  const { definicoes, guardarDefinicoes, eAdmin } = useDados()
  const [f, setF] = useState({ intro: definicoes.proposta_intro, cond: definicoes.proposta_condicoes, dias: definicoes.proposta_validade_dias })
  const g = useGuardar()
  useEffect(() => setF({ intro: definicoes.proposta_intro, cond: definicoes.proposta_condicoes, dias: definicoes.proposta_validade_dias }), [definicoes])
  return (
    <Seccao titulo="Propostas" desc="Textos que cada proposta nova traz já escritos (pode mudá-los em cada uma)."
      rodape={eAdmin && <><Aviso ok={g.ok} erro={g.erro} /><button className="btn-primary" disabled={g.aGuardar} onClick={() => g.correr(() => guardarDefinicoes({ proposta_intro: f.intro, proposta_condicoes: f.cond, proposta_validade_dias: Math.max(1, Math.min(365, Math.round(f.dias) || 30)) }))}>Guardar</button></>}>
      <fieldset disabled={!eAdmin} className="space-y-3">
        <Campo label="Introdução"><textarea className="input min-h-24" value={f.intro} onChange={e => setF({ ...f, intro: e.target.value })} /></Campo>
        <Campo label="Condições"><textarea className="input min-h-24" value={f.cond} onChange={e => setF({ ...f, cond: e.target.value })} /></Campo>
        <Campo label="Validade (dias)" className="max-w-40"><InputNumero valor={f.dias} onValor={v => setF({ ...f, dias: v })} /></Campo>
      </fieldset>
    </Seccao>
  )
}

function Equipa() {
  const { membros, eAdmin, eu, recarregar } = useDados()
  const { confirmar } = useDialogo()
  const [novo, setNovo] = useState({ email: '', nome: '', papel: 'membro' as Papel })
  const g = useGuardar()
  const mudar = (email: string, c: Record<string, unknown>) => g.correr(async () => {
    const { error } = await supabase.from('membros').update(c).eq('email', email)
    if (error) throw new Error(error.message.includes('administrador') ? 'Tem de ficar pelo menos um administrador ativo.' : error.message)
    await recarregar()
  })
  const acrescentar = () => g.correr(async () => {
    const email = novo.email.trim().toLowerCase()
    if (!emailValido(email)) throw new Error('Escreva um email válido.')
    if (membros.some(m => m.email === email)) throw new Error('Essa pessoa já está na equipa.')
    const { error } = await supabase.from('membros').insert({ email, nome: novo.nome.trim() || email.split('@')[0], papel: novo.papel })
    if (error) throw new Error(error.message)
    setNovo({ email: '', nome: '', papel: 'membro' }); await recarregar()
  }, 'Acrescentado. Já pode entrar com este email.')
  const tirar = async (email: string, nome: string) => {
    if (!(await confirmar(`Tirar ${nome} da equipa?`, { texto: 'Deixa de conseguir entrar. Os dados que criou ficam.', ok: 'Tirar', perigo: true }))) return
    g.correr(async () => { const { error } = await supabase.from('membros').delete().eq('email', email); if (error) throw new Error(error.message.includes('administrador') ? 'Tem de ficar pelo menos um administrador ativo.' : error.message); await recarregar() })
  }
  return (
    <Seccao titulo="Equipa" desc="Quem pode entrar. Os administradores mudam definições e equipa; os membros trabalham nos dados." rodape={(g.ok || g.erro) && <Aviso ok={g.ok} erro={g.erro} />}>
      <ul className="divide-y divide-stone-100">
        {membros.map(m => (
          <li key={m.email} className="flex flex-wrap items-center gap-3 py-2.5">
            <Avatar nome={m.nome} cor={m.cor} tamanho={32} />
            <span className="min-w-0 flex-1 basis-40"><span className="block truncate text-sm font-medium">{m.nome}{m.email === eu?.email && <span className="text-stone-400"> (eu)</span>}</span><span className="block truncate text-xs text-stone-500">{m.email}</span></span>
            {eAdmin ? <span className="flex items-center gap-2">
              <select className="input w-auto py-1 text-xs" aria-label={`Papel de ${m.nome}`} value={m.papel} onChange={e => mudar(m.email, { papel: e.target.value })}><option value="admin">Administrador</option><option value="membro">Membro</option></select>
              <label className="flex items-center gap-1.5 text-xs text-stone-600"><input type="checkbox" checked={m.ativo} onChange={e => mudar(m.email, { ativo: e.target.checked })} />Ativo</label>
              {m.email !== eu?.email && <button className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label={`Tirar ${m.nome}`} onClick={() => tirar(m.email, m.nome)}><Trash2 size={15} /></button>}
            </span> : <span className="badge bg-stone-100 text-stone-600">{m.papel === 'admin' ? 'Administrador' : 'Membro'}{!m.ativo && ', inativo'}</span>}
          </li>
        ))}
      </ul>
      {eAdmin && (
        <div className="grid gap-2 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input className="input" type="email" aria-label="Email da pessoa nova" placeholder="Email (Google ou outro)" value={novo.email} onChange={e => setNovo({ ...novo, email: e.target.value })} />
          <input className="input" aria-label="Nome da pessoa nova" placeholder="Nome" value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} />
          <select className="input" aria-label="Papel da pessoa nova" value={novo.papel} onChange={e => setNovo({ ...novo, papel: e.target.value as Papel })}><option value="membro">Membro</option><option value="admin">Administrador</option></select>
          <button className="btn-primary" onClick={acrescentar} disabled={g.aGuardar}><UserPlus size={15} /> Acrescentar</button>
        </div>
      )}
    </Seccao>
  )
}

function Perfil() {
  const { eu, recarregar } = useDados()
  const [f, setF] = useState({ nome: eu?.nome ?? '', cor: eu?.cor ?? '#475569', telefone: eu?.telefone ?? '' })
  const g = useGuardar()
  useEffect(() => { if (eu) setF({ nome: eu.nome, cor: eu.cor, telefone: eu.telefone ?? '' }) }, [eu?.email]) // eslint-disable-line react-hooks/exhaustive-deps
  const guardar = () => g.correr(async () => {
    if (!f.nome.trim()) throw new Error('Falta o nome.')
    const { error } = await supabase.rpc('atualizar_perfil', { p_nome: f.nome.trim(), p_cor: hex(f.cor) ? f.cor : null, p_telefone: f.telefone })
    if (error) throw new Error(error.message)
    await recarregar()
  })
  return (
    <Seccao titulo="O meu perfil" desc={eu?.email} rodape={<><Aviso ok={g.ok} erro={g.erro} /><button className="btn-primary" onClick={guardar} disabled={g.aGuardar}>Guardar perfil</button></>}>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Campo label="Nome"><input className="input" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo label="Telemóvel"><input className="input" type="tel" value={f.telefone} onChange={e => setF({ ...f, telefone: e.target.value })} /></Campo>
        <Campo label="Cor"><input type="color" aria-label="A minha cor" className="h-[2.6rem] w-14 cursor-pointer rounded-xl border border-stone-300 bg-white p-1" value={hex(f.cor) ? f.cor : '#475569'} onChange={e => setF({ ...f, cor: e.target.value })} /></Campo>
      </div>
    </Seccao>
  )
}
