// Configuração base da app. O que muda de negócio para negócio (nome, logótipo, cor, moeda, IVA,
// fases do pipeline, textos das propostas) edita-se dentro da app, em Definições, e fica na base de dados.
// Aqui ficam só os valores por omissão e as listas que raramente mudam.

export const CONFIG = {
  // aparece antes de entrar e enquanto as definições não chegam
  nomeApp: 'Gestão',
  corPadrao: '#334155',
  moedaPadrao: 'EUR',
  ivaPadrao: 23,
  idioma: 'pt-PT',
  // chave onde o Supabase guarda a sessão no browser
  chaveSessao: 'gestao-auth',
  // um contacto "arrefece" quando tem um negócio aberto e ninguém falou com ele há este número de dias
  diasArrefecer: 14,
}

// categorias de contacto (para filtrar a lista); muda à vontade
export const CATEGORIAS_CONTACTO: { id: string; nome: string }[] = [
  { id: 'cliente', nome: 'Cliente' },
  { id: 'potencial', nome: 'Potencial cliente' },
  { id: 'parceiro', nome: 'Parceiro' },
  { id: 'fornecedor', nome: 'Fornecedor' },
  { id: 'outro', nome: 'Outro' },
]

// de onde vêm os contactos e negócios
export const ORIGENS = ['Recomendação', 'Site', 'Redes sociais', 'Email', 'Telefone', 'Evento', 'Parceiro', 'Outro']
