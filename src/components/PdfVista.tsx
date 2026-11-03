import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

// Mostra um PDF desenhado página a página dentro da app (com o pdf.js), em vez de o entregar ao browser:
// assim nada é descarregado, mesmo nos telemóveis que não têm leitor de PDF embutido.
export default function PdfVista({ dados, titulo }: { dados: Uint8Array; titulo: string }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<'a-abrir' | 'pronto' | 'erro'>('a-abrir')
  const [paginas, setPaginas] = useState(0)
  useEffect(() => {
    let vivo = true
    let destruir: (() => void) | null = null
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        pdfjs.GlobalWorkerOptions.workerSrc = worker
        // o pdf.js fica com o buffer: passa uma cópia para o original continuar a servir para descarregar
        const doc = await pdfjs.getDocument({ data: dados.slice(), isEvalSupported: false }).promise
        destruir = () => { void doc.destroy() }
        if (!vivo) return
        const total = Math.min(doc.numPages, 60)
        setPaginas(doc.numPages); setEstado('pronto')
        const largura = Math.max(280, (caixa.current?.clientWidth ?? 600) - 2)
        const escalaEcra = Math.min(window.devicePixelRatio || 1, 2)
        for (let i = 1; i <= total && vivo; i++) {
          const pagina = await doc.getPage(i)
          const base = pagina.getViewport({ scale: 1 })
          const vp = pagina.getViewport({ scale: (largura / base.width) * escalaEcra })
          const c = document.createElement('canvas')
          c.width = Math.floor(vp.width); c.height = Math.floor(vp.height)
          c.style.width = '100%'; c.style.height = 'auto'
          c.className = 'block rounded-md bg-white shadow-sm ring-1 ring-stone-200'
          c.setAttribute('aria-label', `${titulo}, página ${i}`)
          if (!vivo || !caixa.current) return
          caixa.current.appendChild(c)
          await pagina.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise
        }
      } catch (e) { console.error('pdf', e); if (vivo) setEstado('erro') }
    })()
    return () => { vivo = false; destruir?.(); if (caixa.current) caixa.current.innerHTML = '' }
  }, [dados, titulo])
  return (
    <div className="h-[75vh] overflow-y-auto rounded-lg bg-stone-100 p-2 ring-1 ring-stone-200">
      {estado === 'a-abrir' && <p className="flex items-center gap-2 p-2 text-sm text-stone-400"><Loader2 size={15} className="animate-spin" /> A preparar o PDF...</p>}
      {estado === 'erro' && <p className="p-2 text-sm text-stone-500">Não consegui mostrar este PDF aqui. Usa "Abrir noutro separador" ou "Descarregar".</p>}
      <div ref={caixa} className="space-y-2" />
      {estado === 'pronto' && paginas > 60 && <p className="p-2 text-center text-xs text-stone-500">Mostrei as primeiras 60 de {paginas} páginas. Abre noutro separador para ver o resto.</p>}
    </div>
  )
}
