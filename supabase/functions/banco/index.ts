// Edge Function "banco": ligação ao banco pelo Enable Banking (PSD2, só leitura) e sincronização dos movimentos.
// Publicar:  supabase functions deploy banco --no-verify-jwt
// (a função verifica ela própria a sessão e se a pessoa é membro ativo com acesso ao banco)
import { ErroHttp, membroDoPedido, segredo, servico, servir } from "../_shared/comum.ts";
import { executar, type Ligacao, type RepoBanco } from "./acoes.ts";

function repoSupabase(): RepoBanco {
  const sb = servico()
  const ok = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data }
  return {
    definicoes: async () => ok(await sb.from("definicoes").select("modulo_banco, banco_config").eq("id", 1).single()) as { modulo_banco: boolean; banco_config: Record<string, unknown> },
    chave: () => segredo("enablebanking_key", sb),
    ligacoes: async () => ok(await sb.from("banco_ligacoes").select("*").order("criado_em")) as Ligacao[],
    criarLigacao: async l => ok(await sb.from("banco_ligacoes").insert(l).select().single()) as Ligacao,
    atualizarLigacao: async (id, campos) => { ok(await sb.from("banco_ligacoes").update(campos).eq("id", id)) },
    apagarLigacoes: async ids => { if (ids.length) ok(await sb.from("banco_ligacoes").delete().in("id", ids)) },
    ultimaData: async id => (ok(await sb.from("movimentos").select("data").eq("ligacao_id", id).order("data", { ascending: false }).limit(1)) as { data: string }[])[0]?.data ?? null,
    importadosDesde: async desde => ok(await sb.from("movimentos").select("id, data, valor").neq("origem", "enablebanking").gte("data", desde)) as { id: string; data: string; valor: number }[],
    hashesExistentes: async hashes => {
      const s = new Set<string>()
      for (let i = 0; i < hashes.length; i += 200) for (const r of ok(await sb.from("movimentos").select("hash").in("hash", hashes.slice(i, i + 200))) as { hash: string }[]) s.add(r.hash)
      return s
    },
    inserirMovimentos: async ms => (ok(await sb.from("movimentos").upsert(ms, { onConflict: "hash", ignoreDuplicates: true }).select("id")) as unknown[]).length,
  }
}

Deno.serve(servir(async (req, corpo) => {
  const acao = String(corpo.acao ?? "")
  const repo = repoSupabase()
  if (acao === "cron") {
    // sincronização agendada (pg_cron + pg_net): sem sessão, com o segredo CRON_SEGREDO (supabase secrets set)
    const esperado = Deno.env.get("CRON_SEGREDO")
    if (!esperado || req.headers.get("x-cron-segredo") !== esperado) throw new ErroHttp(401, "Sem permissão.")
    return await executar("cron", corpo, { repo, membro: null })
  }
  const membro = await membroDoPedido(req)
  const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim()
  return await executar(acao, corpo, { repo, membro, psu: ip ? { ip, ua: req.headers.get("user-agent") ?? "Gestao" } : null })
}))
