import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, Download, Landmark, RefreshCw, Search, Upload, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { funcao, useDados } from '../lib/dados'
import type { LigacaoBanco, Movimento } from '../lib/tipos'
import { comHash, lerExtrato, paraCSV, xlsxParaTexto, type ResultadoExtrato } from '../lib/extrato'
import { dataCurta, dataLonga, diasAte, dinheiro2, MES_LONGO, normaliza, relativo } from '../lib/util'
import { Campo, Erro, Painel, Vazio } from '../components/ui'

type Sentido = 'todos' | 'entradas' | 'saidas'
const nomeMes = (m: string) => `${MES_LONGO[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`

export default function Banco() {
  const { definicoes, eAdmin } = useDados()
  const [params, setParams] = useSearchParams()
  const [ligacoes, setLigacoes] = useState<LigacaoBanco[]>([])
  const [movs, setMovs] = useState<Movimento[] | null>(null)
  const [mes, setMes] = useState<string>('')
  const [sentido, setSentido] = useState<Sentido>('todos')
  const [categoria, setCategoria] = useState('')
  const [porRever, setPorRever] = useState(false)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [importar, setImportar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [aSinc, setASinc] = useState(false)

  const carregar = useCallback(async () => {
    const [l, m] = await Promise.all([
      supabase.from('banco_ligacoes').select('*').order('criado_em'),
      supabase.from('movimentos').select('*').order('data', { ascending: false }).limit(5000),
    ])
    if (l.error || m.error) setErro((l.error ?? m.error)!.message)
    setLigacoes((l.data ?? []) as LigacaoBanco[]); setMovs((m.data ?? []) as Movimento[])
  }, [])
  useEffect(() => { carregar() }, [carregar])

  // regresso do banco (Enable Banking) com ?code=...&state=...
  useEffect(() => {
    const code = params.get('code'), state = params.get('state'), falha = params.get('error')
    if (!code && !falha) return
    setParams({}, { replace: true })
    if (falha) { setErro(`O banco não autorizou a ligação: ${params.get('error_description') ?? falha}`); return }
    setASinc(true)
    funcao<{ escolher: boolean; novos?: number }>('banco', { acao: 'concluir', code, state })
      .then(r => { setAviso(r.escolher ? 'O banco partilhou mais de uma conta. Escolha abaixo as que quer acompanhar.' : `Banco ligado. ${r.novos ?? 0} movimentos trazidos.`); carregar() })
      .catch(e => setErro((e as Error).message)).finally(() => setASinc(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function sincronizar() {
    setASinc(true); setErro(null)
    try {
      const r = await funcao<{ res: { novos?: number; erro?: string }[] }>('banco', { acao: 'sincronizar' })
      const e = r.res.find(x => x.erro)
      if (e) setErro(e.erro!); else setAviso(`${r.res.reduce((s, x) => s + (x.novos ?? 0), 0)} movimentos novos.`)
      await carregar()
    } catch (e) { setErro((e as Error).message) } finally { setASinc(false) }
  }
  async function escolherConta(id: string) {
    setASinc(true); setErro(null)
    try { await funcao('banco', { acao: 'escolher', ligacao_id: id }); setAviso('Conta ligada.'); await carregar() } catch (e) { setErro((e as Error).message) } finally { setASinc(false) }
  }

  const todos = movs ?? []
  const meses = useMemo(() => [...new Set(todos.map(m => m.data.slice(0, 7)))].sort().reverse(), [todos])
  const doMes = todos.filter(m => !mes || m.data.startsWith(mes))
  const entradas = doMes.filter(m => m.valor > 0).reduce((s, m) => s + Number(m.valor), 0)
  const saidas = doMes.filter(m => m.valor < 0).reduce((s, m) => s + Number(m.valor), 0)
  const naoRevistos = todos.filter(m => !m.revisto).length
  const lista = useMemo(() => {
    const q = normaliza(busca.trim())
    return doMes.filter(m => (sentido === 'todos' || (sentido === 'entradas' ? m.valor > 0 : m.valor < 0))
      && (!categoria || (categoria === '_sem' ? !m.categoria : m.categoria === categoria)) && (!porRever || !m.revisto)
      && (!q || normaliza(`${m.descritivo} ${m.contraparte ?? ''} ${m.categoria ?? ''} ${m.notas ?? ''} ${String(m.valor).replace('.', ',')}`).includes(q)))
  }, [doMes, sentido, categoria, porRever, busca])
  const ativas = ligacoes.filter(l => l.estado === 'ativa')
  const escolher = ligacoes.filter(l => l.estado === 'escolher')
  const expiradas = ligacoes.filter(l => l.estado === 'expirada' || (l.estado === 'ativa' && l.valido_ate && diasAte(l.valido_ate) < 0))
  const aExpirar = ativas.filter(l => l.valido_ate && diasAte(l.valido_ate) >= 0 && diasAte(l.valido_ate) <= 14)
  const saldo = ativas.reduce((s, l) => s + Number(l.saldo_atual ?? 0), 0)
  const mov = todos.find(m => m.id === aberto)

  function exportar() {
    const csv = paraCSV(['Data', 'Descritivo', 'Contraparte', 'Valor', 'Categoria', 'Negócio', 'Notas', 'Revisto', 'Origem'],
      lista.map(m => [m.data, m.descritivo, m.contraparte, Number(m.valor), m.categoria, m.negocio_id ? 'sim' : null, m.notas, m.revisto ? 'sim' : 'não', m.origem === 'enablebanking' ? 'banco' : 'extrato']))
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `movimentos${mes ? '-' + mes : ''}.csv`; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">Banco</h1>
        {ativas.length > 0 && <button className="btn-outline" onClick={sincronizar} disabled={aSinc} aria-label="Atualizar"><RefreshCw size={16} className={aSinc ? 'animate-spin' : ''} /><span className="max-sm:hidden">Atualizar</span></button>}
        <button className="btn-outline" onClick={() => setImportar(true)}><Upload size={16} /> Importar</button>
        <button className="btn-outline" onClick={exportar} disabled={!lista.length} aria-label="Exportar CSV"><Download size={16} /><span className="max-sm:hidden">Exportar</span></button>
      </div>
      <div className="mb-3 space-y-2">
        <Erro texto={erro} />
        {aviso && <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}<button className="ml-auto" aria-label="Fechar aviso" onClick={() => setAviso(null)}><X size={14} /></button></div>}
        {expiradas.map(l => <p key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle size={15} className="shrink-0" />A autorização de {l.banco} terminou{l.valido_ate ? ` a ${dataCurta(l.valido_ate)}` : ''}. {eAdmin ? <Link className="font-medium underline" to="/definicoes#banco">Voltar a ligar</Link> : 'Peça a um administrador para voltar a ligar.'}</p>)}
        {aExpirar.map(l => <p key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle size={15} className="shrink-0" />A autorização de {l.banco} acaba a {dataLonga(l.valido_ate!)}. {eAdmin && <Link className="font-medium underline" to="/definicoes#banco">Renovar</Link>}</p>)}
        {ativas.filter(l => l.ultimo_erro).map(l => <p key={l.id} className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{l.banco}: {l.ultimo_erro}</p>)}
      </div>

      {escolher.length > 0 && eAdmin && (
        <div className="card mb-4 space-y-2 p-4">
          <p className="text-sm font-medium">Que contas quer acompanhar?</p>
          {escolher.map(l => <button key={l.id} className="btn-outline w-full justify-start" disabled={aSinc} onClick={() => escolherConta(l.id)}><Landmark size={15} className="shrink-0" /><span className="truncate">{l.nome_conta ?? 'Conta'} · {l.iban ?? ''}</span></button>)}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card col-span-2 p-4 lg:col-span-1" data-teste="saldo">
          <p className="label">Saldo</p>
          <p className="numero text-2xl font-semibold">{ativas.length ? dinheiro2(saldo, ativas[0].moeda ?? definicoes.moeda) : 'Sem banco ligado'}</p>
          <p className="mt-1 truncate text-xs text-stone-500">{ativas.length ? `${ativas.map(l => l.banco).join(', ')} · lido ${relativo(ativas[0].ultima_sinc)}` : eAdmin ? <Link to="/definicoes#banco" className="underline">Ligar o banco em Definições</Link> : 'Pode importar extratos'}</p>
          {ativas[0]?.valido_ate && <p className="truncate text-xs text-stone-500">Autorização até {dataCurta(ativas[0].valido_ate)}</p>}
        </div>
        <div className="card p-4"><p className="label">Entradas</p><p className="numero text-xl font-semibold text-emerald-700 sm:text-2xl">{dinheiro2(entradas)}</p><p className="text-xs text-stone-500">{mes ? nomeMes(mes) : 'tudo'}</p></div>
        <div className="card p-4"><p className="label">Saídas</p><p className="numero text-xl font-semibold sm:text-2xl">{dinheiro2(-saidas)}</p><p className="text-xs text-stone-500">{mes ? nomeMes(mes) : 'tudo'}</p></div>
        <button className="card col-span-2 p-4 text-left hover:ring-stone-300 lg:col-span-1" onClick={() => setPorRever(true)}><p className="label">Por rever</p><p className={`numero text-2xl font-semibold ${naoRevistos ? 'text-amber-700' : ''}`}>{naoRevistos}</p></button>
      </div>

      <div className="mb-3 space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="input pl-9" placeholder="Procurar" aria-label="Procurar movimentos" value={busca} onChange={e => setBusca(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <select className="input sm:w-44" aria-label="Mês" value={mes} onChange={e => setMes(e.target.value)}><option value="">Todos os meses</option>{meses.map(m => <option key={m} value={m}>{nomeMes(m)}</option>)}</select>
            <select className="input sm:w-48" aria-label="Categoria" value={categoria} onChange={e => setCategoria(e.target.value)}><option value="">Todas as categorias</option><option value="_sem">Sem categoria</option>{definicoes.banco_categorias.map(c => <option key={c}>{c}</option>)}</select>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtros">
          {([['todos', 'Todos'], ['entradas', 'Entradas'], ['saidas', 'Saídas']] as [Sentido, string][]).map(([id, nome]) => (
            <button key={id} aria-pressed={sentido === id} onClick={() => setSentido(id)} className={`badge px-3 py-1.5 text-xs ${sentido === id ? 'bg-marca-700 text-sobre-marca' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}>{nome}</button>
          ))}
          <button aria-pressed={porRever} onClick={() => setPorRever(v => !v)} className={`badge px-3 py-1.5 text-xs ${porRever ? 'bg-amber-600 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}>Por rever</button>
        </div>
      </div>

      {movs === null ? null : todos.length === 0 ? <Vazio>Ainda sem movimentos. {eAdmin ? 'Ligue o banco em Definições ou importe' : 'Importe'} um extrato (CSV ou Excel exportado do banco).</Vazio> : lista.length === 0 ? <Vazio>Nenhum movimento com estes filtros.</Vazio> : (
        <ul className="card divide-y divide-stone-100 overflow-hidden" aria-label="Movimentos">
          {lista.map(m => (
            <li key={m.id}>
              <button onClick={() => setAberto(m.id)} data-movimento={m.descritivo} className="relative flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50">
                <span className={`absolute inset-y-0 left-0 w-1 ${m.revisto ? 'bg-emerald-500' : 'bg-amber-400'}`} title={m.revisto ? 'Revisto' : 'Por rever'} />
                <span className="w-12 shrink-0 text-xs text-stone-500">{dataCurta(m.data)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.contraparte || m.descritivo}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-stone-500">
                    {m.contraparte && <span className="max-w-full truncate">{m.descritivo}</span>}
                    {m.categoria && <span className="badge bg-stone-100 text-stone-600">{m.categoria}</span>}
                    {m.revisto && <span className="inline-flex items-center gap-0.5 text-emerald-700"><Check size={11} />revisto</span>}
                  </span>
                </span>
                <span className={`numero shrink-0 text-sm font-semibold ${m.valor > 0 ? 'text-emerald-700' : ''}`}>{m.valor > 0 ? '+' : ''}{dinheiro2(Number(m.valor))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {mov && <Classificar m={mov} onFechar={() => setAberto(null)} onGravado={x => setMovs(ms => (ms ?? []).map(y => (y.id === x.id ? x : y)))} />}
      {importar && <Importar onFechar={() => setImportar(false)} onFeito={(n, rep) => { setAviso(`${n} movimentos importados.${rep ? ` ${rep} já existiam.` : ''}`); carregar() }} />}
    </div>
  )
}

function Classificar({ m, onFechar, onGravado }: { m: Movimento; onFechar: () => void; onGravado: (m: Movimento) => void }) {
  const { negocios, definicoes, eu } = useDados()
  const [notas, setNotas] = useState(m.notas ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  useEffect(() => setNotas(m.notas ?? ''), [m.id]) // eslint-disable-line react-hooks/exhaustive-deps
  async function mudar(campos: Partial<Movimento>) {
    setErro(null)
    const { data, error } = await supabase.from('movimentos').update(campos).eq('id', m.id).select().single()
    if (error) { setErro(error.message); return }
    onGravado(data as Movimento); setGuardado(true); setTimeout(() => setGuardado(false), 1500)
  }
  const categorias = [...new Set([...definicoes.banco_categorias, ...(m.categoria ? [m.categoria] : [])])]
  return (
    <Painel aberto onFechar={onFechar} titulo={<div><div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{dataLonga(m.data)} · {m.origem === 'enablebanking' ? 'banco' : 'extrato'}</div><h2 className={`numero text-xl font-semibold ${m.valor > 0 ? 'text-emerald-700' : ''}`}>{dinheiro2(Number(m.valor))}</h2></div>}
      rodape={<div className="flex items-center gap-2">
        <span className={`mr-auto text-xs text-emerald-700 transition ${guardado ? 'opacity-100' : 'opacity-0'}`} role="status">{guardado ? 'Guardado' : ''}</span>
        {m.revisto ? <button className="btn-outline" onClick={() => mudar({ revisto: false, revisto_por: null, revisto_em: null })}>Voltar a por rever</button>
          : <button className="btn-primary" onClick={() => mudar({ revisto: true, revisto_por: eu?.nome ?? null, revisto_em: new Date().toISOString() })}><Check size={16} /> Marcar como revisto</button>}
      </div>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <dl className="divide-y divide-stone-100 rounded-xl text-sm ring-1 ring-stone-200">
          {m.contraparte && <div className="flex gap-3 px-3 py-2.5"><dt className="w-24 shrink-0 text-stone-500">{m.valor > 0 ? 'De' : 'Para'}</dt><dd className="min-w-0 break-words">{m.contraparte}</dd></div>}
          <div className="flex gap-3 px-3 py-2.5"><dt className="w-24 shrink-0 text-stone-500">No banco</dt><dd className="mono min-w-0 break-words text-xs">{m.descritivo}</dd></div>
          {m.saldo != null && <div className="flex gap-3 px-3 py-2.5"><dt className="w-24 shrink-0 text-stone-500">Saldo depois</dt><dd className="numero">{dinheiro2(Number(m.saldo))}</dd></div>}
          {m.revisto && <div className="flex gap-3 px-3 py-2.5"><dt className="w-24 shrink-0 text-stone-500">Revisto</dt><dd>{m.revisto_por ?? ''} {relativo(m.revisto_em)}</dd></div>}
        </dl>
        <Campo label="Categoria"><select className="input" value={m.categoria ?? ''} onChange={e => mudar({ categoria: e.target.value || null })}><option value="">Sem categoria</option>{categorias.map(c => <option key={c}>{c}</option>)}</select></Campo>
        <Campo label="Negócio"><select className="input" value={m.negocio_id ?? ''} onChange={e => mudar({ negocio_id: e.target.value || null })}><option value="">Nenhum</option>{negocios.filter(n => !n.arquivado || n.id === m.negocio_id).map(n => <option key={n.id} value={n.id}>{n.titulo}</option>)}</select></Campo>
        <Campo label="Notas"><textarea className="input min-h-20" value={notas} placeholder="Grava quando sai da caixa" onChange={e => setNotas(e.target.value)} onBlur={() => { if (notas !== (m.notas ?? '')) mudar({ notas: notas.trim() || null }) }} /></Campo>
      </div>
    </Painel>
  )
}

function Importar({ onFechar, onFeito }: { onFechar: () => void; onFeito: (n: number, repetidos: number) => void }) {
  const [r, setR] = useState<(ResultadoExtrato & { nome: string }) | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aGravar, setAGravar] = useState(false)
  const ficheiro = useRef<HTMLInputElement>(null)
  async function ler(f: File) {
    setErro(null); setR(null)
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error('O ficheiro passa de 10 MB.')
      let texto: string
      if (/\.xlsx?$/i.test(f.name)) texto = xlsxParaTexto(await import('xlsx'), await f.arrayBuffer())
      else { const buf = await f.arrayBuffer(); texto = new TextDecoder('utf-8').decode(buf); if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf) }
      const x = lerExtrato(texto)
      if (!x.linhas.length) throw new Error(x.aviso ?? 'Não encontrei movimentos neste ficheiro.')
      setR({ ...x, nome: f.name })
    } catch (e) { setErro((e as Error).message) }
  }
  async function gravar() {
    if (!r) return
    setAGravar(true); setErro(null)
    try {
      const linhas = (await comHash(r.linhas)).map(l => ({ data: l.data, valor: l.valor, descritivo: l.descritivo, saldo: l.saldo, hash: l.hash, origem: 'extrato' }))
      let n = 0
      for (let i = 0; i < linhas.length; i += 500) {
        const { data, error } = await supabase.from('movimentos').upsert(linhas.slice(i, i + 500), { onConflict: 'hash', ignoreDuplicates: true }).select('id')
        if (error) throw new Error(error.message)
        n += data?.length ?? 0
      }
      onFeito(n, linhas.length - n); onFechar()
    } catch (e) { setErro((e as Error).message) } finally { setAGravar(false) }
  }
  const soma = (r?.linhas ?? []).reduce((s, l) => s + l.valor, 0)
  return (
    <Painel aberto onFechar={onFechar} titulo="Importar extrato" rodape={r && <div className="flex flex-wrap items-center justify-end gap-2"><button className="btn-outline" onClick={() => setR(null)}>Outro ficheiro</button><button className="btn-primary" onClick={gravar} disabled={aGravar}>{aGravar ? 'A importar' : `Importar ${r.linhas.length} movimentos`}</button></div>}>
      <div className="space-y-3">
        <p className="text-sm text-stone-600">Exporte os movimentos no site do banco em CSV ou Excel. Antes de importar vê o que foi lido. Os movimentos que já existem não entram outra vez.</p>
        <Erro texto={erro} />
        {!r && <button className="btn-outline w-full py-6" onClick={() => ficheiro.current?.click()}><Upload size={18} /> Escolher ficheiro</button>}
        <input ref={ficheiro} type="file" accept=".csv,.txt,.tsv,.xls,.xlsx" hidden aria-label="Ficheiro do extrato" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) ler(f) }} />
        {r && <>
          <p className="text-sm" role="status" data-teste="pre-visualizacao"><b>{r.nome}</b>: {r.linhas.length} movimentos, de {dataCurta(r.linhas[0].data)} a {dataCurta(r.linhas[r.linhas.length - 1].data)}, total {dinheiro2(soma)}.{r.rejeitadas.length ? ` ${r.rejeitadas.length} ${r.rejeitadas.length === 1 ? 'linha ficou' : 'linhas ficaram'} de fora.` : ''}</p>
          {r.aviso && <p className="text-xs text-amber-700">{r.aviso}</p>}
          {r.rejeitadas.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" aria-label="Linhas que ficaram de fora">
              <p className="mb-1 font-medium">Ficam de fora (corrija no ficheiro, se forem precisas):</p>
              <ul className="space-y-1">{r.rejeitadas.slice(0, 20).map(x => <li key={x.linha} className="break-words"><span className="font-medium">Linha {x.linha}:</span> {x.motivo} <span className="text-amber-700">({x.texto})</span></li>)}</ul>
            </div>
          )}
          <ul className="card divide-y divide-stone-100 text-sm" aria-label="Pré-visualização">
            {r.linhas.slice(0, 100).map((l, i) => <li key={i} className="flex items-center gap-3 px-3 py-2"><span className="w-14 shrink-0 text-xs text-stone-500">{dataCurta(l.data)}</span><span className="min-w-0 flex-1 truncate">{l.descritivo}</span><span className={`numero shrink-0 ${l.valor > 0 ? 'text-emerald-700' : ''}`}>{dinheiro2(l.valor)}</span></li>)}
            {r.linhas.length > 100 && <li className="px-3 py-2 text-xs text-stone-500">e mais {r.linhas.length - 100}</li>}
          </ul>
        </>}
      </div>
    </Painel>
  )
}
