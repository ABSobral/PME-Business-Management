// Edge Function "email": caixa de correio por IMAP e SMTP, de qualquer fornecedor.
// Publicar:  supabase functions deploy email --no-verify-jwt
// (a função verifica ela própria a sessão e se a pessoa é membro ativo com acesso ao email)
import { ErroHttp, membroDoPedido, segredo, servico, servir } from "../_shared/comum.ts";
import { executar, type EmailLinha, type PastaLinha, type Repo } from "./acoes.ts";

function repoSupabase(): Repo {
  const sb = servico()
  const ok = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data }
  return {
    definicoes: async () => ok(await sb.from("definicoes").select("modulo_email, email_config, estados").eq("id", 1).single()) as { modulo_email: boolean; email_config: Record<string, unknown> },
    password: () => segredo("email_password", sb),
    pastas: async () => ok(await sb.from("email_pastas").select("*").order("caminho")) as PastaLinha[],
    guardarPasta: async p => { ok(await sb.from("email_pastas").upsert(p, { onConflict: "caminho" })) },
    apagarPastas: async cs => { ok(await sb.from("email_pastas").delete().in("caminho", cs)); ok(await sb.from("emails").delete().in("pasta", cs)) },
    marcasDaPasta: async pasta => ok(await sb.from("emails").select("id, uid, lido, respondido").eq("pasta", pasta).limit(20000)) as { id: string; uid: number; lido: boolean; respondido: boolean }[],
    inserirEmails: async linhas => { ok(await sb.from("emails").upsert(linhas, { onConflict: "pasta,uid", ignoreDuplicates: true })) },
    atualizarEmail: async (id, campos) => { ok(await sb.from("emails").update(campos).eq("id", id)) },
    apagarEmails: async ids => { if (ids.length) ok(await sb.from("emails").delete().in("id", ids)) },
    apagarEmailsDaPasta: async pasta => { ok(await sb.from("emails").delete().eq("pasta", pasta)) },
    emails: async ids => (ids.length ? ok(await sb.from("emails").select("*").in("id", ids.slice(0, 500))) : []) as EmailLinha[],
    contactosPorEmail: async enderecos => (enderecos.length ? ok(await sb.from("contactos").select("id, email, nome").in("email", enderecos)) : []) as { id: string; email: string; nome: string }[],
    negocioAberto: async contactoId => {
      const d = ok(await sb.from("definicoes").select("estados").eq("id", 1).single()) as { estados: { id: string; tipo: string }[] }
      const abertas = d.estados.filter(f => f.tipo === "aberto").map(f => f.id)
      const r = ok(await sb.from("negocios").select("id").eq("contacto_id", contactoId).eq("arquivado", false).in("estado", abertas).order("atualizado_em", { ascending: false }).limit(1)) as { id: string }[]
      return r[0]?.id ?? null
    },
    registarAtividade: async a => { ok(await sb.from("atividades").insert(a)) },
  }
}

Deno.serve(servir(async (req, corpo) => {
  if (corpo.acao === "cron") {
    // sincronização agendada (pg_cron + pg_net): sem sessão, com o segredo CRON_SEGREDO (supabase secrets set)
    const esperado = Deno.env.get("CRON_SEGREDO")
    if (!esperado || req.headers.get("x-cron-segredo") !== esperado) throw new ErroHttp(401, "Sem permissão.")
    const sistema = { email: "sistema@localhost", nome: "Sistema", papel: "admin" as const, acessos: [], ativo: true }
    const repo = repoSupabase()
    if (!(await repo.definicoes()).modulo_email) return { novos: 0 }
    return await executar("sincronizar", {}, { repo, membro: sistema })
  }
  const membro = await membroDoPedido(req)
  return await executar(String(corpo.acao ?? ""), corpo, { repo: repoSupabase(), membro })
}))
