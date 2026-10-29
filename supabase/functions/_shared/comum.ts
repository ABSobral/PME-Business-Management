// Partes comuns às Edge Functions (email e banco).
// A chave service_role vive só aqui no servidor (variável SUPABASE_SERVICE_ROLE_KEY, posta pelo Supabase);
// nunca vai para o browser. Cada pedido é verificado: a sessão tem de ser de um membro ativo com acesso ao módulo.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

export type Membro = { email: string; nome: string; papel: "admin" | "membro"; acessos: string[]; ativo: boolean };
export type Modulo = "email" | "banco";

/** administradores usam tudo; os membros só os módulos que lhes deram */
export const pode = (m: Membro | null, modulo: Modulo) =>
  !!m && m.ativo && (m.papel === "admin" || (m.acessos ?? []).includes(modulo));

/** erro com estado HTTP, para devolver 401, 403 ou 400 com uma mensagem clara */
export class ErroHttp extends Error {
  constructor(public estado: number, mensagem: string) { super(mensagem); }
}

// deno-lint-ignore no-explicit-any
export type Cliente = SupabaseClient<any, "app", any>;
let cliente: Cliente | null = null;
/** cliente com a chave service_role, no esquema "app" (só existe dentro da função) */
export function servico(): Cliente {
  if (!cliente) {
    const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !chave) throw new ErroHttp(500, "Faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no servidor.");
    cliente = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "app" } });
  }
  return cliente!;
}

/** Quem está a pedir: valida o JWT da sessão no Supabase Auth e procura o email na equipa. */
export async function membroDoPedido(req: Request, sb = servico()): Promise<Membro> {
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new ErroHttp(401, "Falta a sessão. Entre outra vez.");
  const { data, error } = await sb.auth.getUser(jwt);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) throw new ErroHttp(401, "A sessão não é válida. Entre outra vez.");
  const { data: m } = await sb.from("membros").select("email, nome, papel, acessos, ativo").eq("email", email).maybeSingle();
  if (!m || !(m as Membro).ativo) throw new ErroHttp(403, "Esta conta não está ativa na equipa.");
  return m as Membro;
}

/** segredo guardado no Vault (pela app, em Definições), lido com a função app.ler_segredo */
export async function segredo(nome: "email_password" | "enablebanking_key", sb = servico()): Promise<string | null> {
  const { data, error } = await sb.rpc("ler_segredo", { p_nome: nome });
  if (error) throw new Error("Não foi possível ler o Vault: " + error.message);
  return (data as string | null) ?? null;
}

/** responde ao browser: OPTIONS para CORS, corpo JSON, erros com mensagem */
export function servir(tratar: (req: Request, corpo: Record<string, unknown>) => Promise<unknown>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ erro: "Use POST." }, 405);
    try {
      const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      return json(await tratar(req, corpo ?? {}));
    } catch (e) {
      if (e instanceof ErroHttp) return json({ erro: e.message }, e.estado);
      console.error(e);
      return json({ erro: (e as Error).message || "Erro inesperado." }, 400);
    }
  };
}
