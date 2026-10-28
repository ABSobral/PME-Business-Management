import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { aplicarMarca } from './tema'
import { definirMoeda } from './util'
import { CONFIG } from '../config'
import type { Agenda, Atividade, Contacto, Definicoes, Empresa, Fase, Membro, Negocio, Tarefa } from './tipos'

type Tabelas = { membros: Membro[]; empresas: Empresa[]; contactos: Contacto[]; negocios: Negocio[]; atividades: Atividade[]; agenda: Agenda[]; tarefas: Tarefa[] }
type Editavel = 'empresas' | 'contactos' | 'negocios' | 'atividades' | 'agenda' | 'tarefas'
const vazio: Tabelas = { membros: [], empresas: [], contactos: [], negocios: [], atividades: [], agenda: [], tarefas: [] }

export const DEFINICOES_PADRAO: Definicoes = {
  nome_negocio: CONFIG.nomeApp, logo_url: null, cor: CONFIG.corPadrao, moeda: CONFIG.moedaPadrao, iva_pct: CONFIG.ivaPadrao,
  email: null, telefone: null, site: null, morada: null, nif: null,
  estados: [
    { id: 'lead', nome: 'Novo contacto', cor: 'cinza', tipo: 'aberto' }, { id: 'conversa', nome: 'Em conversa', cor: 'azul', tipo: 'aberto' },
    { id: 'proposta', nome: 'Proposta enviada', cor: 'ambar', tipo: 'aberto' }, { id: 'ganho', nome: 'Ganho', cor: 'verde', tipo: 'ganho' },
    { id: 'perdido', nome: 'Perdido', cor: 'vermelho', tipo: 'perdido' },
  ],
  proposta_intro: '', proposta_condicoes: '', proposta_validade_dias: 30,
}

// "a_carregar" enquanto lê; "sem_acesso" se a conta não está na equipa; "inativo" se foi desativada
export type Acesso = 'a_carregar' | 'ok' | 'sem_acesso' | 'inativo' | 'erro'

type Ctx = Tabelas & {
  sessao: Session | null; semSessao: boolean; acesso: Acesso; erro: string | null; definicoes: Definicoes
  eu: Membro | null; eAdmin: boolean
  recarregar: () => Promise<void>
  gravar: <T = Record<string, unknown>>(tabela: Editavel, linha: Record<string, unknown> & { id?: string }) => Promise<T>
  apagar: (tabela: Editavel, id: string) => Promise<void>
  registar: (a: Pick<Atividade, 'tipo' | 'resumo'> & { negocio_id?: string | null; contacto_id?: string | null }) => Promise<void>
  guardarDefinicoes: (d: Partial<Definicoes>) => Promise<void>
  empresaDe: (id: string | null | undefined) => Empresa | undefined
  contactoDe: (id: string | null | undefined) => Contacto | undefined
  negocioDe: (id: string | null | undefined) => Negocio | undefined
  ultimoContacto: (contactoId: string) => string | null
  fases: Fase[]
  faseDe: (id: string) => Fase
  emCurso: (n: Negocio) => boolean
}

const C = createContext<Ctx | null>(null)

export function DadosProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [semSessao, setSemSessao] = useState(false)
  const [acesso, setAcesso] = useState<Acesso>('a_carregar')
  const [erro, setErro] = useState<string | null>(null)
  const [t, setT] = useState<Tabelas>(vazio)
  const [definicoes, setDefinicoes] = useState<Definicoes>(DEFINICOES_PADRAO)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSessao(data.session); setSemSessao(!data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSessao(s); setSemSessao(!s) })
    return () => sub.subscription.unsubscribe()
  }, [])

  const recarregar = useCallback(async () => {
    const q = (nome: string, ordem: string, asc = true, limite?: number) => {
      const b = supabase.from(nome).select('*').order(ordem, { ascending: asc })
      return limite ? b.limit(limite) : b
    }
    const r = await Promise.all([
      q('membros', 'nome'), q('empresas', 'nome'), q('contactos', 'nome'), q('negocios', 'ordem', false),
      q('atividades', 'data', false, 3000), q('agenda', 'inicio'), q('tarefas', 'criado_em'),
      supabase.from('definicoes').select('*').eq('id', 1).maybeSingle(),
    ])
    const falha = r.find(x => x.error)
    if (falha?.error) { setErro(falha.error.message); setAcesso('erro'); return }
    setErro(null)
    setT({
      membros: r[0].data as Membro[], empresas: r[1].data as Empresa[], contactos: r[2].data as Contacto[], negocios: r[3].data as Negocio[],
      atividades: r[4].data as Atividade[], agenda: r[5].data as Agenda[], tarefas: r[6].data as Tarefa[],
    })
    if (r[7].data) setDefinicoes({ ...DEFINICOES_PADRAO, ...(r[7].data as Definicoes) })
    setAcesso('ok')
  }, [])

  // ao entrar: a primeira pessoa (com a equipa vazia) passa a admin; quem não está na equipa fica sem acesso
  useEffect(() => {
    if (!sessao) { setT(vazio); setAcesso('a_carregar'); return }
    let vivo = true
    ;(async () => {
      setAcesso('a_carregar')
      const { data, error } = await supabase.rpc('entrar_primeira_vez')
      if (!vivo) return
      if (error) { setErro(error.message); setAcesso('erro'); return }
      const estado = (data as { estado?: string } | null)?.estado
      if (estado === 'sem_acesso' || estado === 'sem_sessao') { setAcesso('sem_acesso'); return }
      if (estado === 'inativo') { setAcesso('inativo'); return }
      await recarregar()
    })()
    return () => { vivo = false }
  }, [sessao?.user.id, recarregar]) // eslint-disable-line react-hooks/exhaustive-deps

  // volta a ler quando a janela volta a ter foco (outra pessoa da equipa pode ter mudado algo)
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'visible' && sessao && acesso === 'ok') recarregar() }
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [sessao, acesso, recarregar])

  useEffect(() => { aplicarMarca({ nome: definicoes.nome_negocio, cor: definicoes.cor, logo_url: definicoes.logo_url }, acesso === 'ok'); definirMoeda(definicoes.moeda) }, [definicoes, acesso])

  const gravar: Ctx['gravar'] = useCallback(async (tabela, linha) => {
    const { id, ...resto } = linha
    const { data, error } = await (id ? supabase.from(tabela).update(resto).eq('id', id).select().single() : supabase.from(tabela).insert(resto).select().single())
    if (error) throw new Error(error.message)
    setT(prev => {
      const lista = prev[tabela] as unknown as { id: string }[]
      return { ...prev, [tabela]: id ? lista.map(x => (x.id === id ? data : x)) : [...lista, data] }
    })
    // mudar de fase cria uma linha no histórico (na base de dados): vai buscá-la
    if (tabela === 'negocios' && id && 'estado' in resto) {
      const { data: at } = await supabase.from('atividades').select('*').eq('negocio_id', id).order('data', { ascending: false })
      if (at) setT(prev => ({ ...prev, atividades: [...prev.atividades.filter(x => x.negocio_id !== id), ...(at as Atividade[])].sort((a, b) => b.data.localeCompare(a.data)) }))
    }
    return data
  }, [])

  const apagar: Ctx['apagar'] = useCallback(async (tabela, id) => {
    const { error } = await supabase.from(tabela).delete().eq('id', id)
    if (error) throw new Error(error.message)
    setT(prev => ({ ...prev, [tabela]: (prev[tabela] as unknown as { id: string }[]).filter(x => x.id !== id) }))
  }, [])

  const email = sessao?.user.email?.toLowerCase() ?? ''
  const eu = t.membros.find(m => m.email === email) ?? null

  // evita registos repetidos com dois toques seguidos no mesmo botão
  const recentes = useRef(new Map<string, number>())
  const registar: Ctx['registar'] = useCallback(async a => {
    const chave = `${a.negocio_id ?? ''}|${a.contacto_id ?? ''}|${a.tipo}|${a.resumo}`
    if (Date.now() - (recentes.current.get(chave) ?? 0) < 30_000) return
    recentes.current.set(chave, Date.now())
    const { data, error } = await supabase.from('atividades').insert({ ...a, autor: eu?.nome ?? null }).select().single()
    if (error) throw new Error(error.message)
    setT(prev => ({ ...prev, atividades: [data as Atividade, ...prev.atividades] }))
  }, [eu?.nome])

  const guardarDefinicoes: Ctx['guardarDefinicoes'] = useCallback(async d => {
    const { data, error } = await supabase.from('definicoes').update(d).eq('id', 1).select().single()
    if (error) throw new Error(error.message)
    setDefinicoes({ ...DEFINICOES_PADRAO, ...(data as Definicoes) })
  }, [])

  const valor = useMemo<Ctx>(() => {
    const emp = new Map(t.empresas.map(e => [e.id, e]))
    const con = new Map(t.contactos.map(c => [c.id, c]))
    const neg = new Map(t.negocios.map(n => [n.id, n]))
    // último contacto com cada pessoa: a atividade mais recente dela ou dos seus negócios (mudanças de fase não contam)
    const ultimos = new Map<string, string>()
    for (const a of t.atividades) {
      if (a.tipo === 'estado') continue
      const cid = a.contacto_id ?? (a.negocio_id ? neg.get(a.negocio_id)?.contacto_id : null)
      if (cid && (!ultimos.has(cid) || ultimos.get(cid)! < a.data)) ultimos.set(cid, a.data)
    }
    const fases = definicoes.estados?.length ? definicoes.estados : DEFINICOES_PADRAO.estados
    const faseDe = (id: string) => fases.find(f => f.id === id) ?? { id, nome: id, cor: 'cinza' as const, tipo: 'aberto' as const }
    return {
      ...t, sessao, semSessao, acesso, erro, definicoes, eu, eAdmin: eu?.papel === 'admin',
      recarregar, gravar, apagar, registar, guardarDefinicoes,
      empresaDe: id => (id ? emp.get(id) : undefined),
      contactoDe: id => (id ? con.get(id) : undefined),
      negocioDe: id => (id ? neg.get(id) : undefined),
      ultimoContacto: id => ultimos.get(id) ?? null,
      fases, faseDe,
      emCurso: n => !n.arquivado && faseDe(n.estado).tipo === 'aberto',
    }
  }, [t, sessao, semSessao, acesso, erro, definicoes, eu, recarregar, gravar, apagar, registar, guardarDefinicoes])

  return <C.Provider value={valor}>{children}</C.Provider>
}

export function useDados() {
  const v = useContext(C)
  if (!v) throw new Error('useDados fora do DadosProvider')
  return v
}
