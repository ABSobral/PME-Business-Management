import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Paperclip, Send, X } from 'lucide-react'
import { funcao, useDados } from '../lib/dados'
import type { AnexoEmail } from '../lib/tipos'
import { enderecoValido, normaliza, tamanhoLegivel } from '../lib/util'
import { Campo, Erro, Painel } from './ui'

export const LIMITE_ANEXOS = 15 * 1024 * 1024
export type Rascunho = {
  para: string[]; cc: string[]; assunto: string; texto: string
  responder_a?: string; reencaminhar_de?: string; anexosOriginais?: AnexoEmail[]; negocio_id?: string | null
  titulo?: string
}
type Ficheiro = { nome: string; tipo: string; tamanho: number; base64: string }

// "Ana <ana@x.pt>, rui@y.pt; z@w.pt" → ["ana@x.pt", "rui@y.pt", "z@w.pt"]
export function separarEnderecos(t: string): string[] {
  return t.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).map(s => (s.match(/<([^>]+)>/)?.[1] ?? s).trim())
}

function lerFicheiro(f: File): Promise<Ficheiro> {
  return new Promise((ok, falha) => {
    const r = new FileReader()
    r.onload = () => ok({ nome: f.name, tipo: f.type || 'application/octet-stream', tamanho: f.size, base64: String(r.result).split(',')[1] ?? '' })
    r.onerror = () => falha(new Error(`Não foi possível ler ${f.name}.`))
    r.readAsDataURL(f)
  })
}

/** campo de destinatários: pastilhas, sugestões dos contactos e endereços inválidos a vermelho */
function Destinatarios({ rotulo, valor, onValor }: { rotulo: string; valor: string[]; onValor: (v: string[]) => void }) {
  const { contactos } = useDados()
  const [txt, setTxt] = useState('')
  const [foco, setFoco] = useState(false)
  const sugestoes = useMemo(() => {
    const q = normaliza(txt)
    if (q.length < 2) return []
    return contactos.filter(c => c.email && !valor.includes(c.email.toLowerCase()) && normaliza(`${c.nome} ${c.email}`).includes(q)).slice(0, 6)
  }, [txt, contactos, valor])
  const juntar = (t: string) => {
    const novos = separarEnderecos(t).map(e => e.toLowerCase()).filter(e => !valor.includes(e))
    if (novos.length) onValor([...valor, ...novos])
    setTxt('')
  }
  const tecla = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab') && txt.trim()) { e.preventDefault(); juntar(sugestoes.length === 1 && !txt.includes('@') ? sugestoes[0].email! : txt) }
    else if (e.key === 'Backspace' && !txt && valor.length) onValor(valor.slice(0, -1))
  }
  return (
    <div className="relative">
      <span className="label">{rotulo}</span>
      <div className="flex min-h-[2.6rem] flex-wrap items-center gap-1 rounded-xl border border-stone-300 bg-white px-2 py-1 focus-within:border-marca-600 focus-within:ring-2 focus-within:ring-marca-100">
        {valor.map(e => {
          const ok = enderecoValido(e)
          const c = contactos.find(x => x.email?.toLowerCase() === e)
          return (
            <span key={e} data-endereco={e} className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs ${ok ? 'bg-stone-100 text-stone-700' : 'bg-red-50 text-red-700 ring-1 ring-red-300'}`} title={ok ? e : 'Endereço inválido'}>
              <span className="truncate">{c ? `${c.nome} <${e}>` : e}</span>
              <button type="button" className="shrink-0 rounded-full p-0.5 hover:bg-white" aria-label={`Tirar ${e}`} onClick={() => onValor(valor.filter(x => x !== e))}><X size={11} /></button>
            </span>
          )
        })}
        <input className="min-w-28 flex-1 bg-transparent px-1 py-1 text-sm outline-none max-sm:text-base" aria-label={rotulo} value={txt} inputMode="email" autoComplete="off"
          onChange={e => { const v = e.target.value; if (/[,;]\s*$/.test(v)) juntar(v); else setTxt(v) }}
          onKeyDown={tecla} onFocus={() => setFoco(true)} onBlur={() => { setTimeout(() => setFoco(false), 150); if (txt.trim()) juntar(txt) }}
          onPaste={e => { const t = e.clipboardData.getData('text'); if (/[,;\n]/.test(t)) { e.preventDefault(); juntar(t) } }} />
      </div>
      {foco && sugestoes.length > 0 && (
        <ul role="listbox" aria-label="Sugestões de contactos" className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-stone-200">
          {sugestoes.map(c => (
            <li key={c.id}><button type="button" role="option" aria-selected="false" className="block w-full px-3 py-2 text-left text-sm hover:bg-stone-50" onMouseDown={e => { e.preventDefault(); juntar(c.email!) }}>
              <span className="font-medium">{c.nome}</span> <span className="text-stone-500">{c.email}</span>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** painel para escrever, responder e reencaminhar (usado na página Email e nas Propostas) */
export default function Escrever({ rascunho, onFechar, onEnviado }: { rascunho: Rascunho | null; onFechar: () => void; onEnviado?: (r: { atividades: number; avisos: string[] }) => void }) {
  const [r, setR] = useState<Rascunho | null>(rascunho)
  const [ficheiros, setFicheiros] = useState<Ficheiro[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [aEnviar, setAEnviar] = useState(false)
  const escolher = useRef<HTMLInputElement>(null)
  useEffect(() => { setR(rascunho); setFicheiros([]); setErro(null) }, [rascunho])
  if (!r) return null
  const total = ficheiros.reduce((s, f) => s + f.tamanho, 0) + (r.reencaminhar_de ? (r.anexosOriginais ?? []).reduce((s, a) => s + a.tamanho, 0) : 0)

  async function juntar(fs: File[]) {
    setErro(null)
    const soma = total + fs.reduce((s, f) => s + f.size, 0)
    if (soma > LIMITE_ANEXOS) { setErro(`Os anexos passam de 15 MB (ficariam com ${tamanhoLegivel(soma)}).`); return }
    try { const lidos = await Promise.all(fs.map(lerFicheiro)); setFicheiros(l => [...l, ...lidos]) } catch (e) { setErro((e as Error).message) }
  }
  async function enviar() {
    if (!r) return
    setErro(null)
    const invalidos = [...r.para, ...r.cc].filter(e => !enderecoValido(e))
    if (!r.para.length) { setErro('Falta o destinatário.'); return }
    if (invalidos.length) { setErro(`Há endereços inválidos: ${invalidos.join(', ')}. Corrija antes de enviar.`); return }
    if (total > LIMITE_ANEXOS) { setErro('Os anexos passam de 15 MB.'); return }
    if (!r.assunto.trim() && !r.texto.trim()) { setErro('Escreva o assunto ou a mensagem.'); return }
    setAEnviar(true)
    try {
      const res = await funcao<{ atividades: number; avisos: string[] }>('email', {
        acao: 'enviar', para: r.para, cc: r.cc, assunto: r.assunto.trim(), texto: r.texto,
        anexos: ficheiros.map(f => ({ nome: f.nome, tipo: f.tipo, base64: f.base64 })),
        responder_a: r.responder_a ?? null, reencaminhar_de: r.reencaminhar_de ?? null, negocio_id: r.negocio_id ?? null,
      })
      onEnviado?.(res); onFechar()
    } catch (e) { setErro((e as Error).message) } finally { setAEnviar(false) }
  }
  const set = (c: Partial<Rascunho>) => setR(x => (x ? { ...x, ...c } : x))
  return (
    <Painel aberto onFechar={onFechar} titulo={r.titulo ?? 'Novo email'} largura="max-w-2xl"
      rodape={<div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-outline" onClick={() => escolher.current?.click()}><Paperclip size={16} /> Anexar</button>
        <span className="mr-auto text-xs text-stone-500">{total ? `${tamanhoLegivel(total)} de 15 MB` : 'Até 15 MB de anexos'}</span>
        <button type="button" className="btn-primary" onClick={enviar} disabled={aEnviar}><Send size={16} />{aEnviar ? 'A enviar' : 'Enviar'}</button>
      </div>}>
      <div className="space-y-3">
        <Erro texto={erro} />
        <Destinatarios rotulo="Para" valor={r.para} onValor={v => set({ para: v })} />
        <Destinatarios rotulo="Cc" valor={r.cc} onValor={v => set({ cc: v })} />
        <Campo label="Assunto"><input className="input" value={r.assunto} onChange={e => set({ assunto: e.target.value })} /></Campo>
        <Campo label="Mensagem"><textarea className="input min-h-64 leading-relaxed" value={r.texto} onChange={e => set({ texto: e.target.value })} /></Campo>
        <input ref={escolher} type="file" multiple hidden aria-label="Escolher anexos" onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) juntar(fs) }} />
        {(ficheiros.length > 0 || (r.reencaminhar_de && (r.anexosOriginais ?? []).length > 0)) && (
          <ul className="space-y-1.5" aria-label="Anexos">
            {r.reencaminhar_de && (r.anexosOriginais ?? []).map(a => <li key={a.parte} className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-sm ring-1 ring-stone-200"><Paperclip size={14} className="shrink-0 text-stone-400" /><span className="min-w-0 flex-1 truncate">{a.nome}</span><span className="text-xs text-stone-500">do original</span></li>)}
            {ficheiros.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-sm ring-1 ring-stone-200">
                <Paperclip size={14} className="shrink-0 text-stone-400" /><span className="min-w-0 flex-1 truncate">{f.nome}</span><span className="shrink-0 text-xs text-stone-500">{tamanhoLegivel(f.tamanho)}</span>
                <button type="button" className="rounded-lg p-1 text-stone-400 hover:text-red-600" aria-label={`Tirar ${f.nome}`} onClick={() => setFicheiros(l => l.filter((_, j) => j !== i))}><X size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Painel>
  )
}
