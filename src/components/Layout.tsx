import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, KanbanSquare, Users, CalendarDays, Settings, LogOut, FileText, Menu, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useDados } from '../lib/dados'
import { Avatar, Marca } from './ui'

const itens = [
  { to: '/', label: 'Início', icon: LayoutDashboard, end: true },
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/contactos', label: 'Contactos', icon: Users },
  { to: '/calendario', label: 'Calendário', icon: CalendarDays },
  { to: '/propostas', label: 'Propostas', icon: FileText },
  { to: '/definicoes', label: 'Definições', icon: Settings },
]
const NO_FUNDO = ['/', '/pipeline', '/contactos', '/calendario']

export default function Layout() {
  const { eu, definicoes, negocios, faseDe, recarregar } = useDados()
  const [mais, setMais] = useState(false)
  const local = useLocation()
  const novos = negocios.filter(n => !n.arquivado && faseDe(n.estado).tipo === 'aberto' && n.proximo_passo_em && n.proximo_passo_em <= new Date().toISOString().slice(0, 10)).length
  const contador = (to: string) => (to === '/pipeline' ? novos : 0)
  const emMais = !NO_FUNDO.some(p => (p === '/' ? local.pathname === '/' : local.pathname.startsWith(p)))
  const sair = () => supabase.auth.signOut()

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-stone-200 bg-white px-3 py-5 lg:flex print:hidden">
        <NavLink to="/" onClick={() => recarregar()} className="mb-6 flex px-2.5" title="Início"><Marca nome={definicoes.nome_negocio} logo={definicoes.logo_url} tamanho={34} /></NavLink>
        <nav className="flex flex-col gap-0.5" aria-label="Principal">
          {itens.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${isActive ? 'bg-marca-50 text-marca-800' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'}`}>
              <n.icon size={17} /><span className="flex-1">{n.label}</span>
              {contador(n.to) > 0 && <span className="badge bg-red-600 text-white" title="Próximos passos para hoje ou atrasados">{contador(n.to)}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 rounded-lg px-2.5 py-2">
          {eu && <Avatar nome={eu.nome} cor={eu.cor} />}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{eu?.nome}</span>
          <button onClick={sair} className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" title="Sair" aria-label="Sair"><LogOut size={16} /></button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-stone-200 bg-white/95 px-4 py-2.5 lg:hidden print:hidden">
          <NavLink to="/" className="min-w-0"><Marca nome={definicoes.nome_negocio} logo={definicoes.logo_url} tamanho={28} /></NavLink>
          {eu && <NavLink to="/definicoes" aria-label="O meu perfil"><Avatar nome={eu.nome} cor={eu.cor} tamanho={30} /></NavLink>}
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8 print:p-0">
          <Outlet />
        </main>
        <nav aria-label="Navegação do telemóvel" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden">
          {itens.filter(n => NO_FUNDO.includes(n.to)).map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMais(false)} className={({ isActive }) => `relative flex min-w-0 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive && !mais ? 'text-marca-700' : 'text-stone-500'}`}>
              <n.icon size={21} /><span className="max-w-full truncate">{n.label}</span>
              {contador(n.to) > 0 && <span className="absolute right-[26%] top-1.5 h-2 w-2 rounded-full bg-red-600" />}
            </NavLink>
          ))}
          <button onClick={() => setMais(m => !m)} aria-expanded={mais} className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${mais || emMais ? 'text-marca-700' : 'text-stone-500'}`}>{mais ? <X size={21} /> : <Menu size={21} />}Mais</button>
        </nav>
        {mais && (
          <div className="fixed inset-0 z-20 lg:hidden" onClick={() => setMais(false)}>
            <div className="absolute inset-0 bg-stone-900/20" />
            <div className="absolute inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] grid grid-cols-3 gap-2 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-200" onClick={e => e.stopPropagation()}>
              {itens.filter(n => !NO_FUNDO.includes(n.to)).map(n => (
                <NavLink key={n.to} to={n.to} onClick={() => setMais(false)} className={({ isActive }) => `flex flex-col items-center gap-1 rounded-xl py-3 text-xs font-medium ${isActive ? 'bg-marca-50 text-marca-800' : 'text-stone-600 hover:bg-stone-50'}`}><n.icon size={22} />{n.label}</NavLink>
              ))}
              <button onClick={sair} className="flex flex-col items-center gap-1 rounded-xl py-3 text-xs font-medium text-stone-600 hover:bg-stone-50"><LogOut size={22} />Sair</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
