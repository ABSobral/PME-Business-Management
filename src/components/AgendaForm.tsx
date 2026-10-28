import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useDados } from '../lib/dados'
import { TIPOS_AGENDA, type Agenda, type TipoAgenda } from '../lib/tipos'
import { paraInputHora } from '../lib/util'
import { Campo, Erro } from './ui'
import { OpcoesEquipa } from './Escolher'
import { useDialogo } from './Dialogo'

type Base = Partial<Omit<Agenda, 'inicio' | 'fim'>> & { inicio?: string; fim?: string | null }
// inicio e fim chegam como ISO (gravado) ou "AAAA-MM-DDTHH:MM" (hora local)
const local = (v?: string | null) => (!v ? '' : v.length === 16 ? v : paraInputHora(v))

export default function AgendaForm({ base, onFeito }: { base: Base; onFeito: () => void }) {
  const { gravar, apagar, eu, negocios } = useDados()
  const { confirmar } = useDialogo()
  const [titulo, setTitulo] = useState(base.titulo ?? '')
  const [tipo, setTipo] = useState<TipoAgenda>(base.tipo ?? 'reuniao')
  const [inicio, setInicio] = useState(local(base.inicio))
  const [fim, setFim] = useState(local(base.fim))
  const [diaInteiro, setDiaInteiro] = useState(base.dia_inteiro ?? false)
  const [sitio, setSitio] = useState(base.local ?? '')
  const [responsavel, setResponsavel] = useState(base.responsavel ?? eu?.nome ?? '')
  const [negocioId, setNegocioId] = useState(base.negocio_id ?? '')
  const [notas, setNotas] = useState(base.notas ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [aGuardar, setAGuardar] = useState(false)

  async function guardar() {
    if (!titulo.trim() || !inicio) { setErro('Falta o título ou a data.'); return }
    setAGuardar(true); setErro(null)
    try {
      const ini = diaInteiro ? new Date(inicio.slice(0, 10) + 'T00:00') : new Date(inicio)
      const f = fim ? new Date(diaInteiro ? fim.slice(0, 10) + 'T23:59' : fim) : null
      if (f && f < ini) throw new Error('O fim é antes do início.')
      const neg = negocios.find(x => x.id === negocioId)
      await gravar('agenda', {
        ...(base.id ? { id: base.id } : {}), titulo: titulo.trim(), tipo, inicio: ini.toISOString(), fim: f?.toISOString() ?? null,
        dia_inteiro: diaInteiro, local: sitio || null, responsavel: responsavel || null, notas: notas || null,
        negocio_id: negocioId || null, contacto_id: neg?.contacto_id ?? base.contacto_id ?? null,
      })
      onFeito()
    } catch (e) { setErro((e as Error).message) } finally { setAGuardar(false) }
  }

  async function remover() {
    if (!base.id || !(await confirmar('Apagar esta marcação?', { ok: 'Apagar', perigo: true }))) return
    await apagar('agenda', base.id); onFeito()
  }

  return (
    <div className="space-y-3">
      <Erro texto={erro} />
      <div className="flex flex-wrap gap-1.5">
        {TIPOS_AGENDA.map(t => (
          <button key={t.id} type="button" onClick={() => setTipo(t.id)} className={`badge px-2.5 py-1.5 ${tipo === t.id ? t.cor : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}>{t.nome}</button>
        ))}
      </div>
      <Campo label="Título"><input className="input" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Reunião com o cliente" /></Campo>
      <label className="flex items-center gap-2 text-sm text-stone-600"><input type="checkbox" checked={diaInteiro} onChange={e => setDiaInteiro(e.target.checked)} /> Dia inteiro</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Início"><input className="input" type={diaInteiro ? 'date' : 'datetime-local'} value={diaInteiro ? inicio.slice(0, 10) : inicio} onChange={e => setInicio(diaInteiro ? e.target.value + 'T00:00' : e.target.value)} /></Campo>
        <Campo label="Fim (opcional)"><input className="input" type={diaInteiro ? 'date' : 'datetime-local'} value={diaInteiro ? fim.slice(0, 10) : fim} onChange={e => setFim(diaInteiro ? (e.target.value ? e.target.value + 'T23:59' : '') : e.target.value)} /></Campo>
        <Campo label="Local"><input className="input" value={sitio} onChange={e => setSitio(e.target.value)} /></Campo>
        <Campo label="Quem vai"><select className="input" value={responsavel} onChange={e => setResponsavel(e.target.value)}><OpcoesEquipa /></select></Campo>
        <Campo label="Negócio" className="sm:col-span-2">
          <select className="input" value={negocioId} onChange={e => setNegocioId(e.target.value)}>
            <option value="">Nenhum</option>{negocios.filter(n => !n.arquivado || n.id === negocioId).map(x => <option key={x.id} value={x.id}>{x.titulo}</option>)}
          </select>
        </Campo>
      </div>
      <Campo label="Notas"><textarea className="input min-h-16" value={notas} onChange={e => setNotas(e.target.value)} /></Campo>
      <div className="flex gap-2">
        {base.id && <button className="btn text-stone-500 hover:bg-red-50 hover:text-red-700" onClick={remover} aria-label="Apagar"><Trash2 size={16} /></button>}
        <div className="flex-1" />
        <button className="btn-outline" onClick={onFeito}>Cancelar</button>
        <button className="btn-primary" onClick={guardar} disabled={aGuardar}>Guardar</button>
      </div>
    </div>
  )
}
