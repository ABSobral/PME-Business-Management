import { createClient } from '@supabase/supabase-js'
import { CONFIG } from '../config'

// As tabelas vivem no esquema "app" (tem de estar em Exposed schemas nas definições da API do Supabase).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export const configurado = !!url && !!chave
export const supabase = createClient(url || 'https://configurar.supabase.co', chave || 'configurar', {
  db: { schema: 'app' },
  auth: { persistSession: true, autoRefreshToken: true, storageKey: CONFIG.chaveSessao },
})
