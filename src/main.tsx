import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import './index.css'
import { DadosProvider, useDados } from './lib/dados'
import { configurado, supabase } from './lib/supabase'
import { aplicarMarca, marcaGuardada } from './lib/tema'
import { DialogoProvider } from './components/Dialogo'
import Layout from './components/Layout'
import { Marca } from './components/ui'
import Entrar from './pages/Entrar'
import Inicio from './pages/Inicio'
import Pipeline from './pages/Pipeline'
import Contactos from './pages/Contactos'
import Calendario from './pages/Calendario'
import Definicoes from './pages/Definicoes'
import { ListaPropostas, EditorProposta } from './pages/Propostas'
import PropostaPublica from './pages/PropostaPublica'
import Email from './pages/Email'
import Banco from './pages/Banco'
import AvisoVersao from './components/AvisoVersao'

aplicarMarca(marcaGuardada(), false)

function Aviso({ titulo, texto, sair }: { titulo: string; texto: string; sair?: boolean }) {
  const m = marcaGuardada()
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="card max-w-sm space-y-3 p-6 text-center">
        <div className="flex justify-center"><Marca nome={m.nome} logo={m.logo_url} tamanho={40} comNome={false} /></div>
        <h1 className="font-semibold">{titulo}</h1>
        <p className="text-sm text-stone-600">{texto}</p>
        {sair && <button className="btn-outline" onClick={() => supabase.auth.signOut()}>Sair</button>}
      </div>
    </div>
  )
}

function App() {
  const { sessao, semSessao, acesso, erro, pode } = useDados()
  if (semSessao) return <Entrar />
  if (!sessao || acesso === 'a_carregar') return <div className="flex h-full items-center justify-center" aria-busy="true"><div className="h-10 w-10 animate-pulse rounded-xl bg-marca-700" /></div>
  if (acesso === 'erro') return <Aviso titulo="Não foi possível ler os dados" texto={`${erro ?? ''} Confirme que o esquema "app" está exposto na API do Supabase e que correu o schema.sql.`} sair />
  if (acesso === 'sem_acesso') return <Aviso titulo="Ainda sem acesso" texto={`A conta ${sessao.user.email} não está na equipa. Peça a um administrador para a acrescentar em Definições.`} sair />
  if (acesso === 'inativo') return <Aviso titulo="Acesso desativado" texto="Esta conta foi desativada por um administrador." sair />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="contactos" element={<Contactos />} />
        <Route path="calendario" element={<Calendario />} />
        <Route path="propostas" element={<ListaPropostas />} />
        <Route path="propostas/:id" element={<EditorProposta />} />
        <Route path="email" element={pode('email') ? <Email /> : <Inicio />} />
        <Route path="banco" element={pode('banco') ? <Banco /> : <Inicio />} />
        <Route path="definicoes" element={<Definicoes />} />
        <Route path="*" element={<Inicio />} />
      </Route>
    </Routes>
  )
}

// a página da proposta é pública (o cliente abre sem conta); o resto precisa de sessão
function Raiz() {
  const local = useLocation()
  if (!configurado) return <Aviso titulo="Falta configurar" texto="Copie .env.example para .env, preencha VITE_SUPABASE_URL e VITE_SUPABASE_KEY e volte a arrancar a app." />
  if (local.pathname.startsWith('/p/')) return <Routes><Route path="/p/:token" element={<PropostaPublica />} /></Routes>
  return <DadosProvider><App /></DadosProvider>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter><DialogoProvider><Raiz /><AvisoVersao /></DialogoProvider></BrowserRouter>
  </StrictMode>,
)
