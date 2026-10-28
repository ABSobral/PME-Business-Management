import { useEffect, useRef, useState } from 'react'
import { Mail, MessageCircle, Phone } from 'lucide-react'
import { numeroLimpo, numeroWhatsapp } from '../lib/util'

// ligar, WhatsApp e email de um contacto, em botões
export function BotoesContacto({ telefone, email, compacto }: { telefone?: string | null; email?: string | null; compacto?: boolean }) {
  const cls = compacto ? 'btn-outline px-2.5 py-1.5 text-xs' : 'btn-outline py-1.5'
  return <>
    {telefone && <a className={cls} href={`tel:${numeroLimpo(telefone)}`}><Phone size={15} /> Ligar</a>}
    {telefone && <a className={cls} href={`https://wa.me/${numeroWhatsapp(telefone)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>}
    {email && <a className={cls} href={`mailto:${email}`}><Mail size={15} /> Email</a>}
  </>
}

// botão pequeno com menu, para as listas
export function MenuTelefone({ telefone }: { telefone: string }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const f = (e: MouseEvent | TouchEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', f); document.addEventListener('touchstart', f)
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('touchstart', f) }
  }, [aberto])
  const item = 'flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-stone-50'
  return (
    <div className="relative" ref={caixa} onClick={e => e.stopPropagation()}>
      <button className="rounded-lg p-2 text-marca-700 hover:bg-marca-50" aria-label="Contactar por telefone" onClick={() => setAberto(a => !a)}><Phone size={16} /></button>
      {aberto && (
        <div className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-stone-200">
          <p className="mono border-b border-stone-100 px-3 py-2 text-xs text-stone-500">{telefone}</p>
          <a className={item} href={`tel:${numeroLimpo(telefone)}`}><Phone size={15} className="text-marca-700" /> Ligar</a>
          <a className={item} href={`https://wa.me/${numeroWhatsapp(telefone)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} className="text-emerald-600" /> WhatsApp</a>
        </div>
      )}
    </div>
  )
}
