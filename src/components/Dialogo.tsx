import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

// Perguntas simples (confirmar, pedir um texto) numa janela da app, em vez das caixas do browser.
type Pedido = { titulo: string; texto?: string; campo?: { valor: string; placeholder?: string }; ok: string; perigo?: boolean; resolver: (v: string | boolean | null) => void }
type Ctx = {
  confirmar: (titulo: string, opcoes?: { texto?: string; ok?: string; perigo?: boolean }) => Promise<boolean>
  pedirTexto: (titulo: string, opcoes?: { texto?: string; valor?: string; placeholder?: string; ok?: string }) => Promise<string | null>
}
const C = createContext<Ctx | null>(null)

export function DialogoProvider({ children }: { children: ReactNode }) {
  const [p, setP] = useState<Pedido | null>(null)
  const [valor, setValor] = useState('')
  const caixa = useRef<HTMLInputElement>(null)
  const botaoOk = useRef<HTMLButtonElement>(null)

  const confirmar: Ctx['confirmar'] = useCallback((titulo, o = {}) => new Promise<boolean>(res => {
    setP({ titulo, texto: o.texto, ok: o.ok ?? 'Confirmar', perigo: o.perigo, resolver: v => res(v === true) })
  }), [])
  const pedirTexto: Ctx['pedirTexto'] = useCallback((titulo, o = {}) => new Promise<string | null>(res => {
    setValor(o.valor ?? '')
    setP({ titulo, texto: o.texto, campo: { valor: o.valor ?? '', placeholder: o.placeholder }, ok: o.ok ?? 'Guardar', resolver: v => res(typeof v === 'string' ? v : null) })
  }), [])

  useEffect(() => { if (p) setTimeout(() => (p.campo ? caixa.current?.focus() : botaoOk.current?.focus()), 30) }, [p])
  const fechar = (v: string | boolean | null) => { p?.resolver(v); setP(null) }

  return (
    <C.Provider value={{ confirmar, pedirTexto }}>
      {children}
      {p && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center" role="alertdialog" aria-modal="true" aria-labelledby="dialogo-titulo"
          onKeyDown={e => { if (e.key === 'Escape') fechar(null) }}>
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => fechar(null)} />
          <form className="relative w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-2xl" onSubmit={e => { e.preventDefault(); fechar(p.campo ? valor : true) }}>
            <h2 id="dialogo-titulo" className="text-base font-semibold">{p.titulo}</h2>
            {p.texto && <p className="text-sm text-stone-600">{p.texto}</p>}
            {p.campo && <input ref={caixa} className="input" value={valor} placeholder={p.campo.placeholder} onChange={e => setValor(e.target.value)} />}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-outline" onClick={() => fechar(null)}>Cancelar</button>
              <button ref={botaoOk} type="submit" className={p.perigo ? 'btn-perigo' : 'btn-primary'}>{p.ok}</button>
            </div>
          </form>
        </div>
      )}
    </C.Provider>
  )
}

export function useDialogo() {
  const v = useContext(C)
  if (!v) throw new Error('useDialogo fora do DialogoProvider')
  return v
}
