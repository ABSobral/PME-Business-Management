export type Papel = 'admin' | 'membro'
export type Membro = { email: string; nome: string; cor: string; telefone: string | null; papel: Papel; ativo: boolean; criado_em: string }

export type CorFase = 'cinza' | 'azul' | 'ambar' | 'violeta' | 'marca' | 'verde' | 'vermelho'
export type TipoFase = 'aberto' | 'ganho' | 'perdido'
export type Fase = { id: string; nome: string; cor: CorFase; tipo: TipoFase }

export type Definicoes = {
  nome_negocio: string; logo_url: string | null; cor: string; moeda: string; iva_pct: number
  email: string | null; telefone: string | null; site: string | null; morada: string | null; nif: string | null
  estados: Fase[]; proposta_intro: string; proposta_condicoes: string; proposta_validade_dias: number
}

export type TipoEmpresa = 'cliente' | 'parceiro' | 'fornecedor' | 'outro'
export type Empresa = { id: string; nome: string; tipo: TipoEmpresa; setor: string | null; site: string | null; email: string | null; telefone: string | null; nif: string | null; morada: string | null; notas: string | null; criado_em: string }
export type Contacto = { id: string; nome: string; empresa_id: string | null; cargo: string | null; email: string | null; telefone: string | null; categoria: string | null; origem: string | null; responsavel: string | null; notas: string | null; criado_em: string }
export type Negocio = {
  id: string; titulo: string; estado: string; contacto_id: string | null; empresa_id: string | null
  valor: number | null; data: string | null; origem: string | null; responsavel: string | null
  proximo_passo: string | null; proximo_passo_em: string | null; motivo_perda: string | null; notas: string | null
  ordem: number; arquivado: boolean; estado_desde: string; criado_em: string; atualizado_em: string
}
export type TipoAtividade = 'nota' | 'chamada' | 'email' | 'reuniao' | 'whatsapp' | 'proposta' | 'estado'
export type Atividade = { id: string; negocio_id: string | null; contacto_id: string | null; tipo: TipoAtividade; resumo: string; data: string; autor: string | null }
export type TipoAgenda = 'reuniao' | 'servico' | 'seguimento' | 'outro'
export type Agenda = { id: string; titulo: string; tipo: TipoAgenda; inicio: string; fim: string | null; dia_inteiro: boolean; local: string | null; negocio_id: string | null; contacto_id: string | null; responsavel: string | null; notas: string | null }
export type Tarefa = { id: string; titulo: string; feito: boolean; feito_em: string | null; prazo: string | null; hora: string | null; prioridade: number; responsavel: string | null; notas: string | null; negocio_id: string | null; criado_em: string }

export type LinhaProposta = { descricao: string; quantidade: number; preco: number }
export type EstadoProposta = 'rascunho' | 'enviada' | 'vista' | 'aceite' | 'recusada'
export type Proposta = {
  id: string; token: string; numero: number; negocio_id: string | null; titulo: string
  cliente_nome: string | null; cliente_empresa: string | null; cliente_email: string | null
  introducao: string | null; linhas: LinhaProposta[]; desconto: number; iva_pct: number; moeda: string
  condicoes: string | null; validade: string | null; estado: EstadoProposta
  enviada_em: string | null; vista_em: string | null; vistas: number
  respondida_em: string | null; respondida_por: string | null; resposta: string | null
  criado_por: string | null; criado_em: string; atualizado_em: string
}
// o que a página pública recebe (sem campos internos), com os dados do negócio
export type PropostaPublica = Omit<Proposta, 'id' | 'negocio_id' | 'criado_por'> & {
  expirada: boolean
  marca: { nome: string; logo_url: string | null; cor: string; email: string | null; telefone: string | null; site: string | null; morada: string | null; nif: string | null }
}

export const CORES_FASE: { id: CorFase; nome: string; badge: string; ponto: string }[] = [
  { id: 'cinza', nome: 'Cinzento', badge: 'bg-stone-100 text-stone-700', ponto: 'bg-stone-400' },
  { id: 'azul', nome: 'Azul', badge: 'bg-sky-50 text-sky-800', ponto: 'bg-sky-500' },
  { id: 'ambar', nome: 'Âmbar', badge: 'bg-amber-50 text-amber-800', ponto: 'bg-amber-500' },
  { id: 'violeta', nome: 'Violeta', badge: 'bg-violet-50 text-violet-800', ponto: 'bg-violet-500' },
  { id: 'marca', nome: 'Cor principal', badge: 'bg-marca-50 text-marca-800', ponto: 'bg-marca-600' },
  { id: 'verde', nome: 'Verde', badge: 'bg-emerald-50 text-emerald-800', ponto: 'bg-emerald-600' },
  { id: 'vermelho', nome: 'Vermelho', badge: 'bg-red-50 text-red-700', ponto: 'bg-red-500' },
]
export const corFase = (c: string) => CORES_FASE.find(x => x.id === c) ?? CORES_FASE[0]

export const TIPOS_FASE: { id: TipoFase; nome: string }[] = [
  { id: 'aberto', nome: 'Em curso' }, { id: 'ganho', nome: 'Ganho' }, { id: 'perdido', nome: 'Perdido' },
]

export const TIPOS_ATIVIDADE: { id: Exclude<TipoAtividade, 'estado' | 'proposta'>; nome: string }[] = [
  { id: 'nota', nome: 'Nota' }, { id: 'chamada', nome: 'Chamada' }, { id: 'email', nome: 'Email' },
  { id: 'reuniao', nome: 'Reunião' }, { id: 'whatsapp', nome: 'WhatsApp' },
]
export const TIPOS_AGENDA: { id: TipoAgenda; nome: string; cor: string; ponto: string }[] = [
  { id: 'reuniao', nome: 'Reunião', cor: 'bg-marca-700 text-sobre-marca', ponto: 'bg-marca-700' },
  { id: 'servico', nome: 'Serviço ou entrega', cor: 'bg-emerald-600 text-white', ponto: 'bg-emerald-600' },
  { id: 'seguimento', nome: 'Seguimento', cor: 'bg-amber-100 text-amber-900', ponto: 'bg-amber-400' },
  { id: 'outro', nome: 'Outro', cor: 'bg-stone-200 text-stone-800', ponto: 'bg-stone-400' },
]
export const TIPOS_EMPRESA: { id: TipoEmpresa; nome: string }[] = [
  { id: 'cliente', nome: 'Cliente' }, { id: 'parceiro', nome: 'Parceiro' }, { id: 'fornecedor', nome: 'Fornecedor' }, { id: 'outro', nome: 'Outro' },
]
export const ESTADOS_PROPOSTA: Record<EstadoProposta, { nome: string; cor: string }> = {
  rascunho: { nome: 'Rascunho', cor: 'bg-stone-100 text-stone-600' },
  enviada: { nome: 'Enviada', cor: 'bg-sky-50 text-sky-800' },
  vista: { nome: 'Vista', cor: 'bg-amber-50 text-amber-800' },
  aceite: { nome: 'Aceite', cor: 'bg-emerald-50 text-emerald-800' },
  recusada: { nome: 'Recusada', cor: 'bg-red-50 text-red-700' },
}
