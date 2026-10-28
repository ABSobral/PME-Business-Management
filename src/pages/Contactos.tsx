import { useMemo, useState } from 'react'
import { AlertTriangle, Building2, Mail, MessageCircle, Plus, Search } from 'lucide-react'
import { useDados } from '../lib/dados'
import { CATEGORIAS_CONTACTO } from '../config'
import { TIPOS_EMPRESA } from '../lib/tipos'
import { emailValido, normaliza, numeroWhatsapp, relativo } from '../lib/util'
import ContactoPainel, { idsRepetidos } from '../components/ContactoPainel'
import EmpresaPainel from '../components/EmpresaPainel'
import { MenuTelefone } from '../components/Telefone'
import { Avatar, Vazio } from '../components/ui'

export default function Contactos() {
  const { contactos, empresas, empresaDe, ultimoContacto, negocios, emCurso } = useDados()
  const [vista, setVista] = useState<'contactos' | 'empresas'>('contactos')
  const [busca, setBusca] = useState('')
  const [cat, setCat] = useState('')
  const [contacto, setContacto] = useState<string | null>(null)
  const [novoContacto, setNovoContacto] = useState(false)
  const [empresa, setEmpresa] = useState<string | null>(null)
  const [novaEmpresa, setNovaEmpresa] = useState(false)

  // procurar ignora acentos, maiúsculas e pontuação, e encontra pelo nome, empresa, email ou telefone
  const q = normaliza(busca)
  const qDigitos = busca.replace(/\D/g, '')
  const listaC = useMemo(() => contactos.filter(c => (!cat || c.categoria === cat) && (!q ||
    normaliza(`${c.nome} ${empresaDe(c.empresa_id)?.nome ?? ''} ${c.email ?? ''} ${c.cargo ?? ''}`).includes(q) || (qDigitos.length >= 3 && (c.telefone ?? '').replace(/\D/g, '').includes(qDigitos)))),
  [contactos, cat, q, qDigitos, empresaDe])
  const listaE = useMemo(() => empresas.filter(e => !q || normaliza(`${e.nome} ${e.setor ?? ''} ${e.email ?? ''}`).includes(q)), [empresas, q])
  const repetidos = useMemo(() => idsRepetidos(contactos), [contactos])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Contactos</h1>
        {vista === 'contactos'
          ? <button className="btn-primary" onClick={() => setNovoContacto(true)}><Plus size={16} /> Novo contacto</button>
          : <button className="btn-primary" onClick={() => setNovaEmpresa(true)}><Plus size={16} /> Nova empresa</button>}
      </div>
      <div className="mb-3 inline-flex rounded-xl bg-stone-200/60 p-1 text-sm" role="tablist">
        {([['contactos', `Pessoas (${contactos.length})`], ['empresas', `Empresas (${empresas.length})`]] as const).map(([v, l]) => (
          <button key={v} role="tab" aria-selected={vista === v} onClick={() => setVista(v)} className={`rounded-lg px-3 py-1.5 font-medium ${vista === v ? 'bg-white shadow-sm' : 'text-stone-500'}`}>{l}</button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-56 sm:max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="input pl-9" placeholder={vista === 'contactos' ? 'Nome, empresa, email ou telefone' : 'Nome ou setor'} aria-label="Procurar" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        {vista === 'contactos' && <select className="input w-auto" aria-label="Categoria" value={cat} onChange={e => setCat(e.target.value)}><option value="">Todas as categorias</option>{CATEGORIAS_CONTACTO.map(k => <option key={k.id} value={k.id}>{k.nome}</option>)}</select>}
      </div>

      {vista === 'contactos' ? (
        listaC.length === 0 ? <Vazio>{contactos.length ? 'Ninguém encontrado com essa pesquisa.' : 'Ainda não há contactos. Acrescente o primeiro.'}</Vazio> : (
          <ul className="card divide-y divide-stone-100 overflow-hidden">
            {listaC.map(c => {
              const e = empresaDe(c.empresa_id); const ultimo = ultimoContacto(c.id)
              const emCursoN = negocios.filter(n => n.contacto_id === c.id && emCurso(n)).length
              const mau = !!c.email && !emailValido(c.email)
              return (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setContacto(c.id)}>
                    <Avatar nome={c.nome} cor="var(--marca)" tamanho={34} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5"><span className="truncate text-sm font-medium">{c.nome}</span>
                        {repetidos.has(c.id) && <span className="badge shrink-0 bg-amber-50 text-amber-800" title="Pode estar repetido"><AlertTriangle size={10} />repetido?</span>}
                        {mau && <span className="badge shrink-0 bg-red-50 text-red-700">email inválido</span>}
                      </span>
                      <span className="block truncate text-xs text-stone-500">{[c.cargo, e?.nome, CATEGORIAS_CONTACTO.find(k => k.id === c.categoria)?.nome].filter(Boolean).join(' · ') || c.email || 'Sem detalhes'}</span>
                    </span>
                    <span className="hidden shrink-0 text-right text-xs text-stone-500 sm:block">{emCursoN > 0 && <span className="block font-medium text-marca-700">{emCursoN} em curso</span>}{relativo(ultimo)}</span>
                  </button>
                  <span className="flex shrink-0 items-center">
                    {c.email && !mau && <a className="rounded-lg p-2 text-marca-700 hover:bg-marca-50" href={`mailto:${c.email}`} aria-label={`Email a ${c.nome}`}><Mail size={16} /></a>}
                    {c.telefone && <a className="hidden rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 min-[400px]:block" href={`https://wa.me/${numeroWhatsapp(c.telefone)}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${c.nome}`}><MessageCircle size={16} /></a>}
                    {c.telefone && <MenuTelefone telefone={c.telefone} />}
                  </span>
                </li>
              )
            })}
          </ul>
        )
      ) : (
        listaE.length === 0 ? <Vazio>{empresas.length ? 'Nenhuma empresa encontrada.' : 'Ainda não há empresas. Também se criam ao escrever o nome num contacto ou negócio.'}</Vazio> : (
          <ul className="card divide-y divide-stone-100 overflow-hidden">
            {listaE.map(e => {
              const nPessoas = contactos.filter(c => c.empresa_id === e.id).length
              const nNeg = negocios.filter(n => n.empresa_id === e.id && emCurso(n)).length
              return (
                <li key={e.id}><button className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-stone-50 sm:px-4" onClick={() => setEmpresa(e.id)}>
                  <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500"><Building2 size={17} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{e.nome}</span><span className="block truncate text-xs text-stone-500">{[TIPOS_EMPRESA.find(t => t.id === e.tipo)?.nome, e.setor].filter(Boolean).join(' · ')}</span></span>
                  <span className="shrink-0 text-right text-xs text-stone-500">{nPessoas} pessoa{nPessoas === 1 ? '' : 's'}{nNeg > 0 && <span className="block font-medium text-marca-700">{nNeg} em curso</span>}</span>
                </button></li>
              )
            })}
          </ul>
        )
      )}

      <ContactoPainel id={contacto} novo={novoContacto} onFechar={() => { setContacto(null); setNovoContacto(false) }} onAbrir={id => { setNovoContacto(false); setContacto(id) }} />
      <EmpresaPainel id={empresa} novo={novaEmpresa} onFechar={() => { setEmpresa(null); setNovaEmpresa(false) }} onContacto={id => { setEmpresa(null); setVista('contactos'); setContacto(id) }} />
    </div>
  )
}
