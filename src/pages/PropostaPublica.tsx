import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { aplicarMarca } from '../lib/tema'
import type { PropostaPublica as Tipo } from '../lib/tipos'
import PropostaDoc from '../components/PropostaDoc'
import { useDialogo } from '../components/Dialogo'

const MOTIVOS: Record<string, string> = {
  expirada: 'Esta proposta já passou da validade. Fale connosco e enviamos uma atualizada.',
  ja_respondida: 'Esta proposta já tinha resposta.',
  falta_nome: 'Escreva o seu nome para aceitar.',
  nao_encontrada: 'Esta proposta já não está disponível.',
}

// A página que o cliente abre pelo link, sem conta. Pode aceitar (com o nome), recusar ou guardar em PDF.
// A validade é verificada no servidor (app.proposta_responder).
export default function PropostaPublica() {
  const { token } = useParams()
  const { confirmar } = useDialogo()
  const [p, setP] = useState<Tipo | null | undefined>(undefined)
  const [nome, setNome] = useState(''); const [nota, setNota] = useState('')
  const [feito, setFeito] = useState<'aceite' | 'recusada' | null>(null)
  const [aEnviar, setAEnviar] = useState(false)
  const [falhou, setFalhou] = useState<string | null>(null)
  useEffect(() => {
    supabase.rpc('proposta_publica', { p_token: token }).then(({ data }) => {
      const d = (data as Tipo | null) ?? null
      setP(d)
      if (d) { aplicarMarca({ nome: d.marca.nome, cor: d.marca.cor, logo_url: d.marca.logo_url }, false); document.title = `Proposta: ${d.titulo}` }
    })
  }, [token])

  async function responder(aceita: boolean) {
    if (aceita && !nome.trim()) { setFalhou(MOTIVOS.falta_nome); return }
    if (!aceita && !(await confirmar('Recusar esta proposta?', { texto: 'Pode deixar uma nota a explicar, se quiser.', ok: 'Recusar', perigo: true }))) return
    setAEnviar(true); setFalhou(null)
    const { data, error } = await supabase.rpc('proposta_responder', { p_token: token, p_aceita: aceita, p_nome: nome.trim(), p_resposta: nota.trim() })
    setAEnviar(false)
    const r = data as { ok: boolean; motivo?: string } | null
    if (r?.ok) setFeito(aceita ? 'aceite' : 'recusada')
    else setFalhou(error ? 'Não foi possível enviar a resposta. Tente outra vez daqui a pouco.' : MOTIVOS[r?.motivo ?? ''] ?? 'Não foi possível enviar a resposta.')
  }

  if (p === undefined) return <div className="flex min-h-full items-center justify-center bg-stone-100"><div className="h-10 w-10 animate-pulse rounded-xl bg-stone-300" /></div>
  if (p === null) return <div className="flex min-h-full items-center justify-center bg-stone-100 px-6 text-center"><p className="text-stone-600">{MOTIVOS.nao_encontrada} Fale com quem lha enviou.</p></div>
  const estado = feito ?? p.estado
  const contacto = [p.marca.email, p.marca.telefone].filter(Boolean).join(' ou ')
  return (
    <div className="min-h-full bg-stone-100 px-3 py-6 sm:px-6 sm:py-10 print:bg-white print:p-0">
      <PropostaDoc p={p} marca={p.marca} />
      <div className="mx-auto mt-6 max-w-[760px] print:hidden">
        {estado === 'aceite' ? (
          <div className="flex items-center gap-3 rounded-2xl bg-marca-700 px-6 py-5 text-sobre-marca" role="status"><Check className="shrink-0" /><p><b>Proposta aceite{p.respondida_por || nome ? ` por ${p.respondida_por || nome}` : ''}.</b> Obrigado! Entraremos em contacto para os próximos passos.</p></div>
        ) : estado === 'recusada' ? (
          <div className="rounded-2xl bg-white px-6 py-5 text-stone-600 ring-1 ring-stone-200" role="status">Obrigado pela resposta. Se alguma coisa mudar, estamos ao dispor{contacto ? ` em ${contacto}` : ''}.</div>
        ) : p.expirada ? (
          <div className="rounded-2xl bg-white px-6 py-5 text-stone-600 ring-1 ring-stone-200">{MOTIVOS.expirada}{contacto ? ` Contacto: ${contacto}.` : ''}</div>
        ) : (
          <div className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-stone-200 sm:p-6">
            <h2 className="text-lg font-semibold text-marca-700">Aceita esta proposta?</h2>
            <input className="input" placeholder="O seu nome" aria-label="O seu nome" value={nome} onChange={e => setNome(e.target.value)} />
            <textarea className="input min-h-20" placeholder="Alguma nota para nós (opcional)" aria-label="Nota" value={nota} onChange={e => setNota(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary px-6" onClick={() => responder(true)} disabled={aEnviar || !nome.trim()}><Check size={16} /> Aceitar proposta</button>
              <button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> Guardar PDF</button>
              <button className="btn text-stone-500 hover:bg-stone-100" onClick={() => responder(false)} disabled={aEnviar}>Recusar</button>
            </div>
            {falhou && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{falhou}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
