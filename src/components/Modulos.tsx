import { useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, KeyRound, Landmark, Plug, Plus, RefreshCw, Unplug, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { funcao, useDados } from '../lib/dados'
import type { Cifra, EmailConfig, LigacaoBanco } from '../lib/tipos'
import { dataCurta, dataLonga, diasAte, emailValido, normaliza, relativo } from '../lib/util'
import { Campo, Erro, Painel } from './ui'
import { Aviso, Seccao, useGuardar } from './Seccao'
import { useDialogo } from './Dialogo'

// ---------------------------------------------------------------------------------------------
// Ligar e desligar os módulos
// ---------------------------------------------------------------------------------------------

export function Modulos() {
  const { definicoes, guardarDefinicoes } = useDados()
  const g = useGuardar()
  const mudar = (campo: 'modulo_email' | 'modulo_banco', v: boolean) => g.correr(() => guardarDefinicoes({ [campo]: v }), v ? 'Ligado.' : 'Desligado.')
  const caixa = (campo: 'modulo_email' | 'modulo_banco', titulo: string, texto: string) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ring-stone-200 hover:bg-stone-50">
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={definicoes[campo]} disabled={g.aGuardar} onChange={e => mudar(campo, e.target.checked)} />
      <span><span className="block text-sm font-medium">{titulo}</span><span className="block text-xs text-stone-500">{texto}</span></span>
    </label>
  )
  return (
    <Seccao titulo="Módulos" desc="Funções extra. Desligadas não aparecem no menu. Os membros só as usam se lhes der acesso em Equipa." rodape={(g.ok || g.erro) && <Aviso ok={g.ok} erro={g.erro} />}>
      <div className="grid gap-2 sm:grid-cols-2">
        {caixa('modulo_email', 'Email (IMAP e SMTP)', 'A caixa de correio do negócio dentro da app, ligada aos contactos. Funciona com Gmail, Hostinger, Sapo, IONOS, OVH, Zoho e outros.')}
        {caixa('modulo_banco', 'Banco', 'Saldo e movimentos pelo Enable Banking (open banking, só leitura) ou por extratos em CSV e Excel.')}
      </div>
    </Seccao>
  )
}

// ---------------------------------------------------------------------------------------------
// Email: servidores, utilizador e password de aplicação
// ---------------------------------------------------------------------------------------------

type Fornecedor = { id: string; nome: string; imap: [string, number, Cifra]; smtp: [string, number, Cifra]; enviados: boolean; nota: string; aviso?: string }
export const FORNECEDORES: Fornecedor[] = [
  { id: 'gmail', nome: 'Gmail ou Google Workspace', imap: ['imap.gmail.com', 993, 'ssl'], smtp: ['smtp.gmail.com', 465, 'ssl'], enviados: false, nota: 'Precisa da verificação em dois passos e de uma password de aplicação (Conta Google, Segurança, Passwords de aplicações). O Gmail guarda sozinho os enviados.' },
  { id: 'outlook', nome: 'Outlook ou Microsoft 365', imap: ['outlook.office365.com', 993, 'ssl'], smtp: ['smtp.office365.com', 587, 'starttls'], enviados: false, nota: 'Use uma password de aplicação, se a sua conta ainda as permitir.', aviso: 'A Microsoft desligou o acesso por password na maioria das contas Outlook.com e Microsoft 365 (pede OAuth) e o Supabase bloqueia a porta 587. Muito provavelmente não vai funcionar; confirme com o Testar ligação.' },
  { id: 'hostinger', nome: 'Hostinger', imap: ['imap.hostinger.com', 993, 'ssl'], smtp: ['smtp.hostinger.com', 465, 'ssl'], enviados: true, nota: 'Use o endereço completo e a password da caixa (hPanel, Emails).' },
  { id: 'sapo', nome: 'Sapo', imap: ['imap.sapo.pt', 993, 'ssl'], smtp: ['smtp.sapo.pt', 465, 'ssl'], enviados: true, nota: 'Use o endereço completo e a password do Sapo Mail.' },
  { id: 'ionos', nome: 'IONOS', imap: ['imap.ionos.com', 993, 'ssl'], smtp: ['smtp.ionos.com', 465, 'ssl'], enviados: true, nota: 'Confirme no painel da IONOS se os servidores do seu país são outros (por exemplo imap.ionos.es).' },
  { id: 'ovh', nome: 'OVH', imap: ['ssl0.ovh.net', 993, 'ssl'], smtp: ['ssl0.ovh.net', 465, 'ssl'], enviados: true, nota: 'Use o endereço completo e a password da caixa.' },
  { id: 'zoho', nome: 'Zoho Mail', imap: ['imap.zoho.eu', 993, 'ssl'], smtp: ['smtp.zoho.eu', 465, 'ssl'], enviados: true, nota: 'Contas criadas fora da Europa usam imap.zoho.com e smtp.zoho.com. Ative o IMAP nas definições do Zoho e crie uma password de aplicação.' },
  { id: 'outro', nome: 'Outro', imap: ['', 993, 'ssl'], smtp: ['', 465, 'ssl'], enviados: true, nota: 'Os dados estão na ajuda do seu fornecedor de email (procure "IMAP" e "SMTP").' },
]
const CIFRAS: { id: Cifra; nome: string }[] = [{ id: 'ssl', nome: 'SSL/TLS' }, { id: 'starttls', nome: 'STARTTLS' }, { id: 'nenhuma', nome: 'Nenhuma (só testes)' }]

export function ConfigEmail() {
  const { definicoes, guardarDefinicoes } = useDados()
  const [f, setF] = useState<EmailConfig>({ fornecedor: 'outro', imap_porta: 993, imap_cifra: 'ssl', smtp_porta: 465, smtp_cifra: 'ssl', guardar_enviados: true, ...definicoes.email_config })
  const [password, setPassword] = useState('')
  const [guardada, setGuardada] = useState<boolean | null>(null)
  const [teste, setTeste] = useState<{ imap: string | null; smtp: string | null; pastas?: number } | null>(null)
  const [aTestar, setATestar] = useState(false)
  const g = useGuardar()
  const { confirmar } = useDialogo()
  useEffect(() => { supabase.rpc('segredo_existe', { p_nome: 'email_password' }).then(({ data }) => setGuardada(!!data)) }, [])
  const forn = FORNECEDORES.find(x => x.id === f.fornecedor) ?? FORNECEDORES[FORNECEDORES.length - 1]
  const set = (c: Partial<EmailConfig>) => { setF(x => ({ ...x, ...c })); setTeste(null) }
  const escolher = (id: string) => {
    const p = FORNECEDORES.find(x => x.id === id)!
    set({ fornecedor: id, imap_host: p.imap[0] || f.imap_host, imap_porta: p.imap[1], imap_cifra: p.imap[2], smtp_host: p.smtp[0] || f.smtp_host, smtp_porta: p.smtp[1], smtp_cifra: p.smtp[2], guardar_enviados: p.enviados })
  }
  const limpo = (): EmailConfig => {
    const endereco = (f.endereco ?? '').trim().toLowerCase()
    return { ...f, endereco, utilizador: (f.utilizador ?? '').trim() || endereco, imap_host: (f.imap_host ?? '').trim(), smtp_host: (f.smtp_host ?? '').trim(), nome_remetente: (f.nome_remetente ?? '').trim(), imap_porta: Number(f.imap_porta) || 993, smtp_porta: Number(f.smtp_porta) || 465 }
  }
  const validar = (c: EmailConfig) => {
    if (!emailValido(c.endereco ?? '')) throw new Error('Escreva o endereço de email.')
    if (!c.imap_host || !c.smtp_host) throw new Error('Faltam os servidores IMAP e SMTP.')
    if (!guardada && !password) throw new Error('Falta a password de aplicação.')
  }
  const guardar = () => g.correr(async () => {
    const c = limpo(); validar(c)
    if (password) {
      const { error } = await supabase.rpc('guardar_segredo', { p_nome: 'email_password', p_valor: password })
      if (error) throw new Error(error.message)
      setPassword(''); setGuardada(true)
    }
    await guardarDefinicoes({ email_config: c })
  })
  async function testar() {
    setATestar(true); setTeste(null); g.setErro(null)
    try { const c = limpo(); validar(c); setTeste(await funcao('email', { acao: 'testar', config: c, password: password || undefined })) }
    catch (e) { g.setErro((e as Error).message) } finally { setATestar(false) }
  }
  async function apagar() {
    if (!(await confirmar('Apagar a password do email?', { texto: 'A app deixa de ler e enviar emails até guardar outra.', ok: 'Apagar', perigo: true }))) return
    g.correr(async () => { const { error } = await supabase.rpc('apagar_segredo', { p_nome: 'email_password' }); if (error) throw new Error(error.message); setGuardada(false) }, 'Password apagada.')
  }
  const portaBloqueada = [25, 587].includes(Number(f.smtp_porta))
  return (
    <Seccao id="email" titulo="Email" desc="A caixa de correio que a equipa usa na app. A password fica cifrada no servidor (Supabase Vault) e nunca volta ao browser."
      rodape={<><Aviso ok={g.ok} erro={g.erro} /><button className="btn-outline" onClick={testar} disabled={aTestar}><Plug size={15} />{aTestar ? 'A testar' : 'Testar ligação'}</button><button className="btn-primary" onClick={guardar} disabled={g.aGuardar}>Guardar</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Fornecedor" className="sm:col-span-2"><select className="input" value={f.fornecedor ?? 'outro'} onChange={e => escolher(e.target.value)}>{FORNECEDORES.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
        <p className="text-xs text-stone-500 sm:col-span-2">{forn.nota}</p>
        {forn.aviso && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:col-span-2">{forn.aviso}</p>}
        <Campo label="Endereço de email"><input className="input" type="email" value={f.endereco ?? ''} onChange={e => set({ endereco: e.target.value })} placeholder="geral@o-meu-negocio.pt" /></Campo>
        <Campo label="Nome do remetente"><input className="input" value={f.nome_remetente ?? ''} onChange={e => set({ nome_remetente: e.target.value })} placeholder={definicoes.nome_negocio} /></Campo>
        <Campo label="Utilizador (se for diferente do endereço)"><input className="input" value={f.utilizador ?? ''} autoComplete="off" onChange={e => set({ utilizador: e.target.value })} placeholder={f.endereco || 'o endereço de email'} /></Campo>
        <Campo label={guardada ? 'Password de aplicação (guardada)' : 'Password de aplicação'}>
          <span className="flex gap-2"><input className="input" type="password" autoComplete="new-password" value={password} onChange={e => { setPassword(e.target.value); setTeste(null) }} placeholder={guardada ? 'Deixe vazio para manter' : ''} />
            {guardada && <button type="button" className="btn-outline shrink-0 px-2.5" onClick={apagar} aria-label="Apagar a password guardada"><X size={15} /></button>}</span>
        </Campo>
      </div>
      <details className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200" open={f.fornecedor === 'outro'}>
        <summary className="cursor-pointer text-sm font-medium">Servidores</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_9rem]">
          <Campo label="Servidor IMAP (receber)"><input className="input" value={f.imap_host ?? ''} onChange={e => set({ imap_host: e.target.value })} placeholder="imap.exemplo.pt" /></Campo>
          <Campo label="Porta"><input className="input" inputMode="numeric" value={f.imap_porta ?? ''} onChange={e => set({ imap_porta: Number(e.target.value.replace(/\D/g, '')) || undefined })} /></Campo>
          <Campo label="Cifra"><select className="input" value={f.imap_cifra} onChange={e => set({ imap_cifra: e.target.value as Cifra })}>{CIFRAS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
          <Campo label="Servidor SMTP (enviar)"><input className="input" value={f.smtp_host ?? ''} onChange={e => set({ smtp_host: e.target.value })} placeholder="smtp.exemplo.pt" /></Campo>
          <Campo label="Porta"><input className="input" inputMode="numeric" value={f.smtp_porta ?? ''} onChange={e => set({ smtp_porta: Number(e.target.value.replace(/\D/g, '')) || undefined })} /></Campo>
          <Campo label="Cifra"><select className="input" value={f.smtp_cifra} onChange={e => set({ smtp_cifra: e.target.value as Cifra })}>{CIFRAS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
        </div>
        {portaBloqueada && <p className="mt-2 text-xs text-amber-800">O Supabase não deixa as funções usar as portas 25 e 587. Use a porta 465 (SSL/TLS), se o seu fornecedor a tiver.</p>}
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.guardar_enviados !== false} onChange={e => set({ guardar_enviados: e.target.checked })} />Guardar uma cópia dos emails enviados na pasta Enviados (desligue no Gmail e no Outlook, que já o fazem)</label>
      </details>
      {teste && (
        <ul className="space-y-1 rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200" role="status" aria-label="Resultado do teste">
          <li className={teste.imap ? 'text-red-700' : 'text-emerald-700'}>{teste.imap ? teste.imap : `Receber (IMAP): ligação feita${teste.pastas ? `, ${teste.pastas} pastas` : ''}.`}</li>
          <li className={teste.smtp ? 'text-red-700' : 'text-emerald-700'}>{teste.smtp ? teste.smtp : 'Enviar (SMTP): ligação feita.'}</li>
        </ul>
      )}
    </Seccao>
  )
}

// ---------------------------------------------------------------------------------------------
// Banco: aplicação do Enable Banking, ligações e categorias
// ---------------------------------------------------------------------------------------------

const PAISES: [string, string][] = [['PT', 'Portugal'], ['ES', 'Espanha'], ['FR', 'França'], ['DE', 'Alemanha'], ['IT', 'Itália'], ['BE', 'Bélgica'], ['NL', 'Países Baixos'], ['IE', 'Irlanda'], ['AT', 'Áustria'], ['LU', 'Luxemburgo'], ['FI', 'Finlândia'], ['SE', 'Suécia'], ['DK', 'Dinamarca'], ['NO', 'Noruega'], ['PL', 'Polónia'], ['GB', 'Reino Unido']]
type BancoEB = { nome: string; pais: string; logo: string | null; psu_types: string[]; dias: number | null }

export function ConfigBanco() {
  const { definicoes, guardarDefinicoes } = useDados()
  const padrao = `${location.origin}/banco`
  const [f, setF] = useState({ app_id: definicoes.banco_config.app_id ?? '', pais: definicoes.banco_config.pais ?? 'PT', redirect_url: definicoes.banco_config.redirect_url ?? padrao })
  const [pem, setPem] = useState('')
  const [chave, setChave] = useState<boolean | null>(null)
  const [ligacoes, setLigacoes] = useState<LigacaoBanco[]>([])
  const [escolher, setEscolher] = useState(false)
  const [cats, setCats] = useState<string[]>(definicoes.banco_categorias)
  const [nova, setNova] = useState('')
  const g = useGuardar(); const gl = useGuardar(); const gc = useGuardar()
  const { confirmar } = useDialogo()
  const ficheiro = useRef<HTMLInputElement>(null)
  const carregar = () => supabase.from('banco_ligacoes').select('*').order('criado_em').then(({ data }) => setLigacoes((data ?? []) as LigacaoBanco[]))
  useEffect(() => { supabase.rpc('segredo_existe', { p_nome: 'enablebanking_key' }).then(({ data }) => setChave(!!data)); carregar() }, [])
  useEffect(() => setCats(definicoes.banco_categorias), [definicoes.banco_categorias])

  const guardar = () => g.correr(async () => {
    const app_id = f.app_id.trim()
    if (!/^[0-9a-f-]{20,60}$/i.test(app_id)) throw new Error('O ID da aplicação é um código como 0a1b2c3d-...; está no painel do Enable Banking.')
    if (!/^https?:\/\/\S+$/.test(f.redirect_url.trim())) throw new Error('O endereço de regresso tem de começar por https://')
    if (pem) {
      if (!/-----BEGIN (RSA )?PRIVATE KEY-----/.test(pem)) throw new Error('A chave tem de ser o ficheiro .pem da aplicação (começa por -----BEGIN PRIVATE KEY-----).')
      const { error } = await supabase.rpc('guardar_segredo', { p_nome: 'enablebanking_key', p_valor: pem.trim() })
      if (error) throw new Error(error.message)
      setPem(''); setChave(true)
    }
    await guardarDefinicoes({ banco_config: { app_id, pais: f.pais, redirect_url: f.redirect_url.trim() } })
  })
  async function lerPem(fl: File | undefined) { if (fl) setPem((await fl.text()).trim()) }
  const desligar = async (l: LigacaoBanco) => {
    if (!(await confirmar(`Desligar ${l.banco}?`, { texto: 'A app deixa de ler esta conta. Os movimentos já trazidos ficam.', ok: 'Desligar', perigo: true }))) return
    gl.correr(async () => { await funcao('banco', { acao: 'desligar', ligacao_id: l.id }); await carregar() }, 'Desligado.')
  }
  const religar = (l: LigacaoBanco) => gl.correr(async () => { const r = await funcao<{ url: string }>('banco', { acao: 'iniciar', banco: l.banco, pais: l.pais, psu_type: l.psu_type }); location.href = r.url })
  const configurado = !!definicoes.banco_config.app_id && !!chave
  const visiveis = ligacoes.filter(l => l.estado !== 'pendente')

  return (
    <>
      <Seccao id="banco" titulo="Banco" desc="A ligação é feita pelo Enable Banking (PSD2, só leitura). Precisa de uma aplicação sua no Enable Banking: o ID e a chave privada ficam aqui; a chave fica cifrada no servidor (Supabase Vault)."
        rodape={<><Aviso ok={g.ok} erro={g.erro} /><button className="btn-primary" onClick={guardar} disabled={g.aGuardar}>Guardar</button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="ID da aplicação (Enable Banking)"><input className="input mono" value={f.app_id} onChange={e => setF({ ...f, app_id: e.target.value })} placeholder="0a1b2c3d-0000-0000-0000-000000000000" /></Campo>
          <Campo label="País dos bancos"><select className="input" value={f.pais} onChange={e => setF({ ...f, pais: e.target.value })}>{PAISES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Campo>
          <Campo label="Endereço de regresso (registe-o na aplicação)" className="sm:col-span-2"><input className="input mono text-xs" value={f.redirect_url} onChange={e => setF({ ...f, redirect_url: e.target.value })} /></Campo>
          <div className="sm:col-span-2">
            <span className="label">Chave privada (.pem)</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${chave ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}><KeyRound size={12} />{chave ? 'Guardada' : 'Por guardar'}</span>
              <button type="button" className="btn-outline" onClick={() => ficheiro.current?.click()}><FileUp size={15} /> Escolher ficheiro .pem</button>
              <input ref={ficheiro} type="file" accept=".pem,.key,text/plain" hidden aria-label="Ficheiro da chave privada" onChange={e => { lerPem(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            <textarea className="input mono mt-2 min-h-20 text-xs" aria-label="Chave privada" placeholder="Ou cole aqui o conteúdo do ficheiro .pem" value={pem} onChange={e => setPem(e.target.value)} />
            {pem && <p className="mt-1 text-xs text-stone-500">Carregue em Guardar para a guardar no servidor.</p>}
          </div>
        </div>
      </Seccao>

      <Seccao titulo="Contas ligadas" desc="A autorização do banco dura até 180 dias. Antes de acabar, volte a ligar: os movimentos continuam na mesma conta." rodape={<><Aviso ok={gl.ok} erro={gl.erro} /><button className="btn-primary" disabled={!configurado} onClick={() => setEscolher(true)}><Landmark size={15} /> Ligar um banco</button></>}>
        {!configurado && <p className="text-sm text-stone-500">Guarde primeiro o ID da aplicação e a chave privada.</p>}
        {visiveis.length === 0 ? configurado && <p className="text-sm text-stone-500">Ainda nenhum banco ligado.</p> : (
          <ul className="divide-y divide-stone-100" aria-label="Ligações ao banco">
            {visiveis.map(l => {
              const dias = l.valido_ate ? diasAte(l.valido_ate) : null
              const expirada = l.estado === 'expirada' || (dias != null && dias < 0)
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Landmark size={18} className="shrink-0 text-stone-400" />
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="block truncate text-sm font-medium">{l.banco}{l.nome_conta ? ` · ${l.nome_conta}` : ''}</span>
                    <span className="block truncate text-xs text-stone-500">{l.iban ?? ''}</span>
                    <span className={`block text-xs ${expirada ? 'text-red-700' : dias != null && dias <= 14 ? 'text-amber-800' : 'text-stone-500'}`}>
                      {l.estado === 'escolher' ? 'Por escolher na página Banco' : expirada ? `Autorização terminada${l.valido_ate ? ` a ${dataCurta(l.valido_ate)}` : ''}` : l.valido_ate ? `Autorizada até ${dataLonga(l.valido_ate)}` : 'Autorizada'}{l.ultima_sinc ? ` · lida ${relativo(l.ultima_sinc)}` : ''}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    {(expirada || (dias != null && dias <= 30)) && <button className="btn-outline px-2.5 py-1.5 text-xs" onClick={() => religar(l)} disabled={gl.aGuardar}><RefreshCw size={14} /> Voltar a ligar</button>}
                    <button className="btn-outline px-2.5 py-1.5 text-xs text-red-700" onClick={() => desligar(l)} disabled={gl.aGuardar}><Unplug size={14} /> Desligar</button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Seccao>

      <Seccao titulo="Categorias dos movimentos" desc="Para classificar entradas e saídas na página Banco." rodape={<><Aviso ok={gc.ok} erro={gc.erro} /><button className="btn-primary" disabled={gc.aGuardar} onClick={() => gc.correr(() => guardarDefinicoes({ banco_categorias: cats }))}>Guardar categorias</button></>}>
        <ul className="flex flex-wrap gap-1.5" aria-label="Categorias">
          {cats.map(c => <li key={c} className="badge bg-stone-100 py-1 pl-2.5 pr-1 text-xs text-stone-700">{c}<button className="rounded-full p-0.5 hover:bg-white" aria-label={`Tirar ${c}`} onClick={() => setCats(l => l.filter(x => x !== c))}><X size={12} /></button></li>)}
        </ul>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const n = nova.trim(); if (n && !cats.some(c => normaliza(c) === normaliza(n))) setCats([...cats, n.slice(0, 80)]); setNova('') }}>
          <input className="input" aria-label="Nova categoria" placeholder="Nova categoria" value={nova} onChange={e => setNova(e.target.value)} />
          <button className="btn-outline shrink-0" type="submit"><Plus size={15} /> Acrescentar</button>
        </form>
      </Seccao>

      {escolher && <EscolherBanco pais={definicoes.banco_config.pais ?? 'PT'} onFechar={() => setEscolher(false)} />}
    </>
  )
}

function EscolherBanco({ pais, onFechar }: { pais: string; onFechar: () => void }) {
  const [bancos, setBancos] = useState<BancoEB[] | null>(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aIr, setAIr] = useState<string | null>(null)
  const [tipo, setTipo] = useState<'business' | 'personal'>('business')
  useEffect(() => { funcao<{ bancos: BancoEB[] }>('banco', { acao: 'bancos', pais }).then(r => setBancos(r.bancos)).catch(e => { setErro((e as Error).message); setBancos([]) }) }, [pais])
  const lista = useMemo(() => (bancos ?? []).filter(b => normaliza(b.nome).includes(normaliza(busca))), [bancos, busca])
  async function ir(b: BancoEB) {
    setAIr(b.nome); setErro(null)
    try {
      const psu = b.psu_types.includes(tipo) ? tipo : (b.psu_types[0] as 'business' | 'personal') ?? 'personal'
      const r = await funcao<{ url: string }>('banco', { acao: 'iniciar', banco: b.nome, pais, psu_type: psu, dias: b.dias ?? 180 })
      location.href = r.url
    } catch (e) { setErro((e as Error).message); setAIr(null) }
  }
  return (
    <Painel aberto onFechar={onFechar} titulo="Ligar um banco">
      <div className="space-y-3">
        <p className="text-sm text-stone-600">Vai para o site do banco, entra com as suas credenciais e autoriza só a leitura do saldo e dos movimentos. A app nunca vê a password do banco. No fim volta para a página Banco.</p>
        <Erro texto={erro} />
        <div className="flex gap-1.5" role="group" aria-label="Tipo de conta">
          {([['business', 'Empresa'], ['personal', 'Particular']] as const).map(([id, n]) => <button key={id} aria-pressed={tipo === id} onClick={() => setTipo(id)} className={`badge px-3 py-1.5 text-xs ${tipo === id ? 'bg-marca-700 text-sobre-marca' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}>{n}</button>)}
        </div>
        <input className="input" aria-label="Procurar banco" placeholder="Procurar banco" value={busca} onChange={e => setBusca(e.target.value)} />
        {bancos === null ? <p className="text-sm text-stone-500">A carregar bancos</p> : (
          <ul className="space-y-1.5" aria-label="Bancos">
            {lista.map(b => (
              <li key={b.nome}><button disabled={!!aIr} onClick={() => ir(b)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 ring-stone-200 hover:bg-stone-50 disabled:opacity-60">
                {b.logo ? <img src={b.logo} alt="" className="h-7 w-7 shrink-0 object-contain" /> : <Landmark size={20} className="shrink-0 text-stone-400" />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.nome}</span>
                {aIr === b.nome ? <span className="text-xs text-stone-500">A abrir</span> : b.psu_types.includes('business') && <span className="text-xs text-stone-500">empresas</span>}
              </button></li>
            ))}
            {lista.length === 0 && <li className="text-sm text-stone-500">Nenhum banco encontrado.</li>}
          </ul>
        )}
      </div>
    </Painel>
  )
}
