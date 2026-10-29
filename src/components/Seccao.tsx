import { useState, type ReactNode } from 'react'
import { Erro } from './ui'

// secção de Definições: título, descrição, conteúdo e rodapé com os botões
export function Seccao({ titulo, desc, children, rodape, id }: { titulo: string; desc?: string; children: ReactNode; rodape?: ReactNode; id?: string }) {
  return (
    <section id={id} className="card scroll-mt-20 space-y-4 p-4 sm:p-5">
      <div><h2 className="text-lg font-semibold">{titulo}</h2>{desc && <p className="text-sm text-stone-500">{desc}</p>}</div>
      {children}
      {rodape && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 pt-3">{rodape}</div>}
    </section>
  )
}
export function Aviso({ ok, erro }: { ok: string | null; erro: string | null }) {
  return <>{erro && <span className="mr-auto"><Erro texto={erro} /></span>}{ok && <span className="mr-auto text-sm text-emerald-700" role="status">{ok}</span>}</>
}
// guarda e mostra "Guardado" ou o erro
export function useGuardar() {
  const [ok, setOk] = useState<string | null>(null); const [erro, setErro] = useState<string | null>(null); const [aGuardar, setAGuardar] = useState(false)
  const correr = async (f: () => Promise<void>, msg = 'Guardado.') => {
    setOk(null); setErro(null); setAGuardar(true)
    try { await f(); setOk(msg); setTimeout(() => setOk(null), 3000) } catch (e) { setErro((e as Error).message) } finally { setAGuardar(false) }
  }
  return { ok, erro, aGuardar, correr, setErro }
}

