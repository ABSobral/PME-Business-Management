import type { LinhaProposta, Proposta, PropostaPublica } from '../lib/tipos'
import { dataComDia, dataLonga, dinheiro2 } from '../lib/util'
import { Marca } from './ui'

const arred = (v: number) => Math.round(v * 100) / 100
export const totais = (p: { linhas: LinhaProposta[]; desconto: number; iva_pct: number }) => {
  const subtotal = arred(p.linhas.reduce((s, l) => s + (Number(l.quantidade) || 0) * (Number(l.preco) || 0), 0))
  const base = Math.max(0, arred(subtotal - (Number(p.desconto) || 0)))
  // IVA arredondado ao cêntimo (675,5 a 23% dá 155,37)
  const iva = Math.round(base * (Number(p.iva_pct) || 0)) / 100
  return { subtotal, base, iva, total: arred(base + iva) }
}

type Doc = Partial<Proposta> & Pick<Proposta, 'linhas' | 'desconto' | 'iva_pct' | 'titulo' | 'moeda'>

// O documento da proposta: igual na pré-visualização da app e na página que o cliente abre
export default function PropostaDoc({ p, marca }: { p: Doc; marca: PropostaPublica['marca'] }) {
  const t = totais(p)
  const m = (v: number) => dinheiro2(v, p.moeda)
  const rodape = [marca.site, marca.email, marca.telefone].filter(Boolean)
  return (
    <article className="mx-auto w-full max-w-[760px] overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 print:rounded-none print:shadow-none print:ring-0">
      <header className="flex flex-wrap items-end justify-between gap-4 bg-marca-700 px-6 py-6 text-sobre-marca sm:px-10 sm:py-8">
        <Marca nome={marca.nome} logo={marca.logo_url} tamanho={44} claro />
        <div className="sm:text-right">
          <p className="mono text-[10px] tracking-[0.25em] opacity-80">PROPOSTA{p.numero ? ` Nº ${p.numero}` : ''}</p>
          <p className="text-sm opacity-80">{p.criado_em ? dataLonga(p.criado_em) : ''}</p>
        </div>
      </header>
      <div className="space-y-7 px-5 py-7 sm:px-10 sm:py-9">
        <div>
          {(p.cliente_nome || p.cliente_empresa) && <p className="text-sm text-stone-500">Para {[p.cliente_nome, p.cliente_empresa].filter(Boolean).join(', ')}</p>}
          <h1 className="mt-1 break-words text-2xl font-semibold leading-tight text-marca-700 sm:text-3xl">{p.titulo || 'Proposta'}</h1>
          {p.introducao && <p className="mt-3 whitespace-pre-line break-words text-[15px] leading-relaxed text-stone-700">{p.introducao}</p>}
        </div>
        <div>
          <table className="w-full table-fixed text-sm">
            <thead><tr className="border-b border-stone-200 text-left text-[11px] uppercase tracking-wide text-stone-500"><th className="pb-2 font-semibold">Descrição</th><th className="w-12 pb-2 text-right font-semibold sm:w-16">Qtd.</th><th className="w-24 pb-2 text-right font-semibold sm:w-32">Valor</th></tr></thead>
            <tbody>
              {p.linhas.map((l, i) => (
                <tr key={i} className="border-b border-stone-100 align-top">
                  <td className="break-words py-3 pr-2 font-medium text-stone-900">{l.descricao || <span className="text-stone-400">Sem descrição</span>}{Number(l.quantidade) !== 1 && Number(l.preco) > 0 && <span className="block text-xs font-normal text-stone-500">{m(Number(l.preco))} por unidade</span>}</td>
                  <td className="numero py-3 pl-1 text-right text-stone-600">{String(l.quantidade).replace('.', ',')}</td>
                  <td className="numero py-3 pl-2 text-right font-medium">{Number(l.preco) ? m(arred(l.quantidade * l.preco)) : 'Incluído'}</td>
                </tr>
              ))}
              {p.linhas.length === 0 && <tr><td colSpan={3} className="py-3 text-stone-400">Sem linhas.</td></tr>}
            </tbody>
          </table>
          <dl className="ml-auto mt-4 w-full max-w-xs space-y-1.5 text-sm" aria-label="Totais">
            {p.desconto ? <><div className="flex justify-between text-stone-600"><dt>Subtotal</dt><dd className="numero">{m(t.subtotal)}</dd></div><div className="flex justify-between text-stone-600"><dt>Desconto</dt><dd className="numero">−{m(Number(p.desconto))}</dd></div></> : null}
            <div className="flex justify-between text-stone-600"><dt>Total sem IVA</dt><dd className="numero" data-total="base">{m(t.base)}</dd></div>
            <div className="flex justify-between text-stone-600"><dt>IVA ({String(p.iva_pct).replace('.', ',')}%)</dt><dd className="numero" data-total="iva">{m(t.iva)}</dd></div>
            <div className="flex justify-between border-t border-stone-200 pt-2 text-lg font-semibold text-marca-700"><dt>Total</dt><dd className="numero" data-total="total">{m(t.total)}</dd></div>
          </dl>
        </div>
        {p.condicoes && <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Condições</p><p className="whitespace-pre-line break-words text-sm leading-relaxed text-stone-600">{p.condicoes}</p></div>}
        {p.validade && <p className="text-sm text-stone-500">Proposta válida até {dataComDia(p.validade)}.</p>}
      </div>
      <footer className="flex flex-wrap justify-between gap-2 border-t border-stone-100 bg-stone-50 px-6 py-4 text-xs text-stone-500 sm:px-10">
        <span>{[marca.nome, marca.nif && `NIF ${marca.nif}`, marca.morada].filter(Boolean).join(' · ')}</span>
        {rodape.length > 0 && <span className="break-all">{rodape.join(' · ')}</span>}
      </footer>
    </article>
  )
}
