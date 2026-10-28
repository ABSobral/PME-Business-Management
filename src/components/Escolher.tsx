import { useEffect, useMemo, useState } from 'react'
import { useDados } from '../lib/dados'
import { normaliza } from '../lib/util'
import type { TipoEmpresa } from '../lib/tipos'

// escolher um contacto existente ou escrever um nome novo (cria-se ao gravar)
export function EscolherContacto({ valor, onEscolher }: { valor: { id: string | null; nomeNovo: string }; onEscolher: (v: { id: string | null; nomeNovo: string }) => void }) {
  const { contactos, contactoDe, empresaDe } = useDados()
  const [texto, setTexto] = useState(valor.id ? contactoDe(valor.id)?.nome ?? '' : valor.nomeNovo)
  const [aberto, setAberto] = useState(false)
  useEffect(() => { if (valor.id) setTexto(contactoDe(valor.id)?.nome ?? ''); else if (!valor.nomeNovo) setTexto('') }, [valor.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const sugestoes = useMemo(() => {
    const q = normaliza(texto)
    if (!q) return contactos.slice(0, 8)
    return contactos.filter(c => normaliza(c.nome).includes(q) || normaliza(empresaDe(c.empresa_id)?.nome ?? '').includes(q)).slice(0, 8)
  }, [texto, contactos, empresaDe])
  return (
    <div className="relative">
      <input className="input pr-20" value={texto} placeholder="Nome da pessoa" aria-label="Pessoa"
        onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)}
        onChange={e => { setTexto(e.target.value); onEscolher({ id: null, nomeNovo: e.target.value }) }} />
      {valor.id && <span className="badge absolute right-2 top-1/2 -translate-y-1/2 bg-marca-50 text-marca-800">existente</span>}
      {!valor.id && texto.trim() && <span className="badge absolute right-2 top-1/2 -translate-y-1/2 bg-amber-50 text-amber-800">novo</span>}
      {aberto && sugestoes.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-stone-200">
          {sugestoes.map(c => (
            <button type="button" key={c.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-stone-50"
              onMouseDown={() => { setTexto(c.nome); onEscolher({ id: c.id, nomeNovo: '' }); setAberto(false) }}>
              <span className="font-medium">{c.nome}</span>
              {c.empresa_id && <span className="text-stone-500"> · {empresaDe(c.empresa_id)?.nome}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function EscolherEmpresa({ valor, onEscolher, id = 'lista-empresas' }: { valor: string; onEscolher: (nome: string) => void; id?: string }) {
  const { empresas } = useDados()
  return (
    <>
      <input className="input" list={id} value={valor} placeholder="Empresa (opcional)" aria-label="Empresa" onChange={e => onEscolher(e.target.value)} />
      <datalist id={id}>{empresas.map(e => <option key={e.id} value={e.nome} />)}</datalist>
    </>
  )
}

// devolve o id da empresa com esse nome, criando-a se não existir
export function useGarantirEmpresa() {
  const { empresas, gravar } = useDados()
  return async (nome: string, tipo: TipoEmpresa = 'cliente') => {
    const n = nome.trim(); if (!n) return null
    const e = empresas.find(x => normaliza(x.nome) === normaliza(n))
    if (e) return e.id
    const nova = await gravar<{ id: string }>('empresas', { nome: n, tipo })
    return nova.id
  }
}

// lista de quem pode tratar de algo (membros ativos)
export function OpcoesEquipa() {
  const { membros } = useDados()
  return <><option value="">Ninguém</option>{membros.filter(m => m.ativo).map(m => <option key={m.email} value={m.nome}>{m.nome}</option>)}</>
}
