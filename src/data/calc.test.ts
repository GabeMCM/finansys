import { assertEquals } from "jsr:@std/assert@1";
import { calcular } from "./calc.ts";
import type { Conta, Lancamento, Projecao } from "./types.ts";

const base = { createdAt: 0, updatedAt: 0 };
const conta = (id: string, natureza: Conta["natureza"]): Conta =>
  ({ ...base, id, empresaId: "e", categoriaId: "c", natureza, nome: id, ativa: true });
const proj = (contaId: string, mes: number, valor: number): Projecao =>
  ({ ...base, id: crypto.randomUUID(), anoId: "a", contaId, mes, valor });
const lanc = (contaId: string, mes: number, valor: number): Lancamento =>
  ({ ...base, id: crypto.randomUUID(), anoId: "a", contaId, mes, valor, data: "2026-01-01" });

const contas = [conta("aluguel", "pagar"), conta("cliente", "receber"), conta("socio", "aporte"), conta("extra", "saida")];

Deno.test("resultado e saldo projetado", () => {
  const r = calcular(100_00, contas, [proj("cliente", 0, 50_00), proj("aluguel", 0, 30_00), proj("aluguel", 1, 30_00)], []);
  assertEquals(r.resultadoProj.slice(0, 2), [20_00, -30_00]);
  assertEquals(r.saldoProj.slice(0, 3), [120_00, 90_00, 90_00]);
  assertEquals(r.anual.saldoFinalProj, 90_00);
});

Deno.test("vários lançamentos somam e aportes/saídas livres entram no saldo", () => {
  const r = calcular(0, contas, [], [
    lanc("cliente", 0, 10_00), lanc("cliente", 0, 15_00),
    lanc("socio", 0, 5_00), lanc("extra", 0, 2_00), lanc("aluguel", 0, 8_00),
  ]);
  assertEquals(r.real.receber[0], 25_00);
  assertEquals(r.resultadoReal[0], 20_00);
  assertEquals(r.anual.real.aporte, 5_00);
});

Deno.test("desvio e limite de mês do saldo real", () => {
  const r = calcular(0, contas, [proj("cliente", 0, 10_00), proj("cliente", 1, 10_00)], [lanc("cliente", 0, 12_00), lanc("cliente", 1, 99_00)], 0);
  assertEquals(r.desvio[0], 2_00);
  assertEquals(r.saldoReal[1], 12_00); // mês 1 ignorado (ateMes = 0)
});

Deno.test("lançamento de conta inexistente é ignorado", () => {
  const r = calcular(0, contas, [], [lanc("fantasma", 0, 1_00)]);
  assertEquals(r.anual.resultadoReal, 0);
});
