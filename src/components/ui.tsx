import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { iniciais, numeroPT } from '../lib/util'

// painel lateral (no telemóvel ocupa o ecrã todo)
export function Painel({ aberto, onFechar, titulo, children, largura = 'max-w-xl', rodape }: { aberto: boolean; onFechar: () => void; titulo: ReactNode; children: ReactNode; largura?: string; rodape?: ReactNode }) {
  useEffect(() => {
    if (!aberto) return
    document.body.classList.add('modal-aberto')
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    return () => { document.body.classList.remove('modal-aberto'); window.removeEventListener('keydown', esc) }
  }, [aberto, onFechar])
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/30" onClick={onFechar} />
      <div className={`relative flex h-full w-full ${largura} flex-col bg-white shadow-2xl`}>
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4">
          <div className="min-w-0 flex-1">{typeof titulo === 'string' ? <h2 className="truncate text-lg font-semibold">{titulo}</h2> : titulo}</div>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <div className="border-t border-stone-200 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{rodape}</div>}
      </div>
    </div>
  )
}

export function Campo({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="label">{label}</span>{children}</label>
}

// para conjuntos de botões (um <label> à volta de botões estragaria os nomes deles para leitores de ecrã)
export function Grupo({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <div role="group" aria-label={label} className={className}><span className="label">{label}</span>{children}</div>
}

export function Avatar({ nome, cor, tamanho = 28 }: { nome: string; cor?: string; tamanho?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: tamanho, height: tamanho, background: cor ?? '#57534e', fontSize: tamanho * 0.38 }}>{iniciais(nome)}</span>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">{children}</div>
}

export function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null
  return <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{texto}</div>
}

// logótipo do negócio (imagem, se houver) ou as iniciais numa pastilha com a cor principal
export function Marca({ nome, logo, tamanho = 32, comNome = true, claro = false }: { nome: string; logo?: string | null; tamanho?: number; comNome?: boolean; claro?: boolean }) {
  const [falhou, setFalhou] = useState(false)
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      {logo && !falhou
        ? <img src={logo} alt="" onError={() => setFalhou(true)} className="shrink-0 rounded-lg object-contain" style={{ height: tamanho, maxWidth: tamanho * 3 }} />
        : <span className={`inline-flex shrink-0 items-center justify-center rounded-lg font-bold ${claro ? 'bg-white/15 text-sobre-marca' : 'bg-marca-700 text-sobre-marca'}`} style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.42 }}>{iniciais(nome) || 'G'}</span>}
      {comNome && <span className={`truncate font-semibold ${claro ? 'text-sobre-marca' : ''}`}>{nome}</span>}
    </span>
  )
}

// campo de número à portuguesa: deixa escrever "650," ou "1.234,5" sem saltar; devolve o número (vazio ou inválido = 0)
export function InputNumero({ valor, onValor, className = 'input', placeholder, rotulo }: { valor: number | null | undefined; onValor: (v: number) => void; className?: string; placeholder?: string; rotulo?: string }) {
  const mostrar = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','))
  const [txt, setTxt] = useState(mostrar(valor))
  const ultimo = useRef(valor ?? 0)
  useEffect(() => { if ((valor ?? 0) !== ultimo.current) { ultimo.current = valor ?? 0; setTxt(mostrar(valor)) } }, [valor])
  return <input className={className} inputMode="decimal" placeholder={placeholder} aria-label={rotulo} value={txt} onChange={e => {
    const t = e.target.value; setTxt(t)
    let n = numeroPT(t) ?? 0
    if (n < 0) n = 0
    ultimo.current = n; onValor(n)
  }} />
}
