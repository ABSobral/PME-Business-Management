import { useState } from 'react'
import { Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { marcaGuardada } from '../lib/tema'
import { Erro, Marca } from '../components/ui'

// Entrar com Google ou com um link enviado por email (Supabase Auth). Não há passwords.
export default function Entrar() {
  const marca = marcaGuardada()
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [aEnviar, setAEnviar] = useState(false)

  async function google() {
    setErro(null)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } } })
    if (error) setErro(error.message)
  }
  async function link(e: React.FormEvent) {
    e.preventDefault(); setErro(null); setAEnviar(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } })
      if (error) throw error
      setEnviado(true)
    } catch (err) { setErro((err as Error).message) } finally { setAEnviar(false) }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-marca-700 px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center text-lg"><Marca nome={marca.nome} logo={marca.logo_url} tamanho={44} claro /></div>
        <div className="card space-y-4 p-6">
          <div>
            <h1 className="text-xl font-semibold">Entrar</h1>
            <p className="mt-1 text-sm text-stone-500">Só para a equipa. Se é a primeira vez, quem entrar primeiro fica como administrador.</p>
          </div>
          {enviado ? (
            <p className="rounded-xl bg-marca-50 px-3 py-3 text-sm text-marca-800" role="status">Enviámos um link para <b>{email}</b>. Abra o email neste aparelho para entrar.</p>
          ) : <>
            <button type="button" onClick={google} className="btn-outline w-full">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
              Entrar com Google
            </button>
            <div className="flex items-center gap-3 text-xs text-stone-400"><span className="h-px flex-1 bg-stone-200" />ou<span className="h-px flex-1 bg-stone-200" /></div>
            <form onSubmit={link} className="space-y-3">
              <input className="input" type="email" autoComplete="email" placeholder="O seu email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} required />
              <button className="btn-primary w-full" disabled={aEnviar}><Mail size={16} /> Enviar link de entrada</button>
            </form>
          </>}
          <Erro texto={erro} />
        </div>
      </div>
    </div>
  )
}
