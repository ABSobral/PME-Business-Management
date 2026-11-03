import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Mail, Phone } from 'lucide-react'
import { numeroLimpo } from '../lib/util'

// Telefone de um contacto: carregar em "Ligar" mostra o número (para marcar no telemóvel ou copiar).
// SMS e WhatsApp ficam fora da app, porque a app não consegue registar essas conversas.
// 912345678 passa a 912 345 678; +351912345678 passa a +351 912 345 678
export const numeroBonito = (t: string) => {
  const n = numeroLimpo(t)
  const m = n.match(/^(\+351|00351)?(\d{3})(\d{3})(\d{3})$/)
  return m ? `${m[1] ? '+351 ' : ''}${m[2]} ${m[3]} ${m[4]}` : t.trim()
}

function CaixaNumero({ telefone, fechar, direita }: { telefone: string; fechar: () => void; direita?: boolean }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [copiado, setCopiado] = useState(false)
  // não deixa a caixa sair do ecrã (em telemóveis estreitos o botão pode estar perto da margem)
  const [desvio, setDesvio] = useState(0)
  useEffect(() => {
    const r = caixa.current?.getBoundingClientRect(); if (!r) return
    if (r.right > window.innerWidth - 8) setDesvio(window.innerWidth - 8 - r.right)
    else if (r.left < 8) setDesvio(8 - r.left)
  }, [])
  useEffect(() => {
    const f = (e: MouseEvent | TouchEvent) => { if (!caixa.current?.parentElement?.contains(e.target as Node)) fechar() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    document.addEventListener('mousedown', f); document.addEventListener('touchstart', f); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('touchstart', f); document.removeEventListener('keydown', esc) }
  }, [fechar])
  const copiar = async () => {
    try { await navigator.clipboard.writeText(numeroLimpo(telefone)); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* sem acesso à área de transferência */ }
  }
  return (
    <div ref={caixa} className={`absolute ${direita ? 'right-0' : 'left-0'} top-full z-30 mt-1.5 w-60 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-200`} style={desvio ? { marginLeft: desvio } : undefined} onClick={e => e.stopPropagation()}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Telefone</p>
      <p className="mono mt-0.5 select-all text-xl font-semibold text-marca-700">{numeroBonito(telefone)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a className="btn-primary justify-center py-1.5 text-sm" href={`tel:${numeroLimpo(telefone)}`}><Phone size={14} /> Ligar</a>
        <button type="button" className="btn-outline justify-center py-1.5 text-sm" onClick={copiar}>{copiado ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}</button>
      </div>
    </div>
  )
}

function BotaoLigar({ telefone, cls }: { telefone: string; cls: string }) {
  const [aberto, setAberto] = useState(false)
  return (
    <span className="relative inline-flex">
      <button type="button" className={`${cls} ${aberto ? 'bg-marca-50' : ''}`} aria-expanded={aberto} onClick={() => setAberto(a => !a)}><Phone size={15} /> Ligar</button>
      {aberto && <CaixaNumero telefone={telefone} fechar={() => setAberto(false)} />}
    </span>
  )
}

// ligar e email de um contacto, em botões
export function BotoesContacto({ telefone, email, compacto }: { telefone?: string | null; email?: string | null; compacto?: boolean }) {
  const cls = compacto ? 'btn-outline px-2.5 py-1.5 text-xs' : 'btn-outline py-1.5'
  return <>
    {telefone && <BotaoLigar telefone={telefone} cls={cls} />}
    {email && <a className={cls} href={`mailto:${email}`}><Mail size={15} /> Email</a>}
  </>
}

// botão pequeno, para as listas
export function MenuTelefone({ telefone }: { telefone: string }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button className="rounded-lg p-2 text-marca-700 hover:bg-marca-50" aria-label="Ver o telefone" aria-expanded={aberto} onClick={() => setAberto(a => !a)}><Phone size={16} /></button>
      {aberto && <CaixaNumero telefone={telefone} fechar={() => setAberto(false)} direita />}
    </div>
  )
}
