import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

const CADA = 5 * 60 * 1000

/** pergunta ao servidor qual é a versão publicada (sem cache); null se não conseguir */
async function versaoPublicada(): Promise<string | null> {
  try {
    const r = await fetch(`/versao.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json() as { versao?: unknown }
    return typeof j.versao === 'string' ? j.versao : null
  } catch { return null }
}

/** Aviso discreto no topo quando foi publicada uma versão nova da app. Verifica de 5 em 5 minutos
 *  e quando o separador volta a estar visível. Fechar só esconde até à verificação seguinte. */
export default function AvisoVersao() {
  const [nova, setNova] = useState(false)
  useEffect(() => {
    let vivo = true
    const verificar = async () => { const v = await versaoPublicada(); if (vivo && v) setNova(v !== __VERSAO__) }
    const visivel = () => { if (document.visibilityState === 'visible') verificar() }
    verificar()
    const t = setInterval(verificar, CADA)
    document.addEventListener('visibilitychange', visivel)
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', visivel) }
  }, [])
  if (!nova) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))] print:hidden">
      <div role="status" aria-label="Nova versão" className="pointer-events-auto flex max-w-full items-center gap-2 rounded-xl bg-stone-900 py-1.5 pl-3 pr-1.5 text-sm text-white shadow-lg">
        <span className="min-w-0">Há uma versão mais recente desta app.</span>
        <button className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-stone-900 hover:bg-stone-100" onClick={() => location.reload()}><RefreshCw size={13} />Atualizar</button>
        <button className="shrink-0 rounded-lg p-1 text-stone-300 hover:bg-white/10 hover:text-white" aria-label="Fechar aviso de versão" onClick={() => setNova(false)}><X size={15} /></button>
      </div>
    </div>
  )
}
