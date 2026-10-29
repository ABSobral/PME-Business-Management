// Testes da leitura de extratos (src/lib/extrato.ts, o mesmo código que corre no browser).
// Correr:  deno test -A --config supabase/functions/deno.json tests/funcoes/extrato_test.ts
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import * as XLSX from "npm:xlsx@0.18.5";
import { comHash, dataPT, lerExtrato, numeroPT, paraCSV, xlsxParaTexto } from "../../src/lib/extrato.ts";

const amostra = (n: string) => new URL(`../amostras/${n}`, import.meta.url)

Deno.test("números à portuguesa", () => {
  const casos: [string, number | null][] = [
    ["1.234,56", 1234.56], ["−12,50", -12.5], ["-12,50", -12.5], ["12,50-", -12.5], ["(40,00)", -40], ["1 500,00", 1500], ["1500.5", 1500.5],
    ["2.734", 2734], ["12,5 €", 12.5], ["1,234,567", 1234567], ["abc", null], ["", null], ["-", null], ["1.2.3,4,5", null],
  ]
  for (const [t, n] of casos) assertEquals(numeroPT(t), n, t)
})

Deno.test("datas", () => {
  assertEquals(dataPT("31/12/2025"), "2025-12-31")
  assertEquals(dataPT("2026-10-06"), "2026-10-06")
  assertEquals(dataPT("07-10-26"), "2026-10-07")
  assertEquals(dataPT("29/02/2028"), "2028-02-29")
  for (const d of ["31/02/2026", "29/02/2026", "32/01/2026", "00/01/2026", "15/13/2026", "texto"]) assertEquals(dataPT(d), null, d)
})

Deno.test("extrato com débito e crédito, metadados antes do cabeçalho, linha com data impossível e valor inválido", async () => {
  const r = lerExtrato(await Deno.readTextFile(amostra("extrato-debito-credito.csv")))
  assertEquals(r.linhas.map(l => [l.data, l.valor]), [["2026-10-01", 1234.56], ["2026-10-02", -12.5], ["2026-10-03", -40], ["2026-10-05", -12.5], ["2026-10-05", -12.5]])
  assertEquals(r.linhas[2].descritivo, "PAGAMENTO SERVICOS; TELECOM")
  assertEquals(r.linhas[0].saldo, 2734.56)
  // a linha 31/02/2026 e a linha com "abc" ficam de parte, com o número da linha e o motivo; o resto entra
  assertEquals(r.rejeitadas.map(x => [x.linha, x.motivo]), [[8, 'Data inválida: "31/02/2026"'], [10, 'Valor inválido: "abc"']])
  assertEquals(r.ignoradas, 1) // "Saldo final" (sem data)
  assertEquals(r.aviso, null)
  // as duas compras iguais no mesmo dia são dois movimentos (hash diferente); ler outra vez dá os mesmos hashes
  const h1 = await comHash(r.linhas), h2 = await comHash(lerExtrato(await Deno.readTextFile(amostra("extrato-debito-credito.csv"))).linhas)
  assertEquals(new Set(h1.map(x => x.hash)).size, 5)
  assertEquals(h1.map(x => x.hash), h2.map(x => x.hash))
})

Deno.test("extrato com uma só coluna de valor (−650, 1 500,00, data com ano de 2 dígitos)", async () => {
  const r = lerExtrato(await Deno.readTextFile(amostra("extrato-valor.csv")))
  assertEquals(r.linhas.map(l => [l.data, l.valor, l.descritivo]), [["2026-10-06", 1500, "Venda balcão"], ["2026-10-07", -650, "Renda outubro"], ["2026-10-07", -45.3, "Combustível"]])
  assertEquals(r.rejeitadas, [])
})

Deno.test("extrato em XLSX (datas e números do Excel e em texto)", async () => {
  const texto = xlsxParaTexto(XLSX as never, await Deno.readFile(amostra("extrato.xlsx")))
  const r = lerExtrato(texto)
  assertEquals(r.linhas.map(l => [l.data, l.valor]), [["2026-10-01", 1234.56], ["2026-10-02", -12.5], ["2026-10-03", -40]])
  assertEquals(r.rejeitadas.length, 1)
  assertMatch(r.rejeitadas[0].motivo, /31\/02\/2026/)
})

Deno.test("ficheiros que não são extratos", () => {
  assert(lerExtrato("olá").aviso)
  assertMatch(lerExtrato("nome;idade\nana;30\nrui;40").aviso ?? "", /Não reconheci/)
})

Deno.test("exportar CSV", () => {
  const csv = paraCSV(["Data", "Descritivo", "Valor"], [["2026-10-01", 'Loja "A"; centro', -12.5], ["2026-10-02", null, 1234.56]])
  assertEquals(csv, '﻿Data;Descritivo;Valor\r\n2026-10-01;"Loja ""A""; centro";-12,50\r\n2026-10-02;;1234,56\r\n')
})
