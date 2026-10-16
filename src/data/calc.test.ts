import { assertEquals } from "jsr:@std/assert@1";
import { calcular, calcularBaseLancamentos, calcularBaseProjecoes, calcularPendencias, calcularValorVinculado } from "./calc.ts";
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

Deno.test("calcularValorVinculado percentual e fixo com arredondamento seguro", () => {
  // 30% de R$ 5.000,00 (500000 centavos) = 150000 centavos (R$ 1.500,00)
  assertEquals(calcularValorVinculado(5000_00, { tipo: "conta", origemId: "salario", percentual: 30 }), 1500_00);
  // 33.33% de R$ 100,00 (10000 centavos) = 3333 centavos
  assertEquals(calcularValorVinculado(100_00, { tipo: "conta", origemId: "salario", percentual: 33.33 }), 3333);
  // Fixo R$ 250,00 (25000 centavos)
  assertEquals(calcularValorVinculado(5000_00, { tipo: "conta", origemId: "salario", valorFixo: 250_00 }), 250_00);
});

Deno.test("calcularBaseProjecoes e calcularBaseLancamentos por conta e por categoria", () => {
  const c1: Conta = { ...base, id: "c1", empresaId: "e", categoriaId: "cat_vendas", natureza: "receber", nome: "Vendas Loja", ativa: true };
  const c2: Conta = { ...base, id: "c2", empresaId: "e", categoriaId: "cat_vendas", natureza: "receber", nome: "Vendas Online", ativa: true };
  const contasVendas = [c1, c2];

  const p1 = proj("c1", 3, 2000_00);
  const p2 = proj("c2", 3, 3000_00);

  // Base de conta individual
  assertEquals(calcularBaseProjecoes({ tipo: "conta", origemId: "c1" }, 3, [p1, p2], contasVendas), 2000_00);
  // Base de categoria inteira (soma c1 + c2)
  assertEquals(calcularBaseProjecoes({ tipo: "categoria", origemId: "cat_vendas" }, 3, [p1, p2], contasVendas), 5000_00);

  const l1 = lanc("c1", 3, 1200_00);
  const l2 = lanc("c2", 3, 1800_00);
  // Base de lançamentos por conta
  assertEquals(calcularBaseLancamentos({ tipo: "conta", origemId: "c2" }, 3, [l1, l2], contasVendas), 1800_00);
  // Base de lançamentos por categoria
  assertEquals(calcularBaseLancamentos({ tipo: "categoria", origemId: "cat_vendas" }, 3, [l1, l2], contasVendas), 3000_00);
});

Deno.test("calcularPendencias identifica vencidas e a vencer com precisao", () => {
  // Projeções:
  // p1: aluguel mês 8 (setembro) R$ 2.000,00
  // p2: luz mês 9 (outubro) R$ 300,00 (dia 10)
  // p3: internet mês 9 (outubro) R$ 200,00 (dia 25)
  // p4: agua mês 9 (outubro) R$ 100,00 (já lançado 100,00)
  const ps = [
    proj("aluguel", 8, 2000_00),
    proj("luz", 9, 300_00),
    proj("internet", 9, 200_00),
    proj("agua", 9, 100_00),
  ];

  // Lançamentos já existentes (histórico de dias e lançamentos quitados)
  const ls = [
    { ...base, id: "l1", anoId: "a", contaId: "luz", mes: 8, valor: 280_00, data: "2026-09-10" },
    { ...base, id: "l2", anoId: "a", contaId: "internet", mes: 8, valor: 200_00, data: "2026-09-25" },
    { ...base, id: "l3", anoId: "a", contaId: "agua", mes: 9, valor: 100_00, data: "2026-10-05" }, // agua quitada
  ];

  // Data de referência: 16 de Outubro de 2026 (mes 9, dia 16)
  const ref = new Date(2026, 9, 16);

  const pendencias = calcularPendencias(ps, ls, 2026, "todos", ref);

  // Agua não deve constar (já quitada)
  assertEquals(pendencias.length, 3);

  // Aluguel (mês 8): vencida (mês anterior)
  const pendAluguel = pendencias.find((p) => p.contaId === "aluguel")!;
  assertEquals(pendAluguel.status, "vencida");
  assertEquals(pendAluguel.valorPendente, 2000_00);

  // Luz (mês 9, dia 10): vencida pois dia 16 > 10
  const pendLuz = pendencias.find((p) => p.contaId === "luz")!;
  assertEquals(pendLuz.status, "vencida");
  assertEquals(pendLuz.diasAtraso, 6); // 16 - 10 = 6 dias de atraso

  // Internet (mês 9, dia 25): a vencer pois dia 16 <= 25
  const pendNet = pendencias.find((p) => p.contaId === "internet")!;
  assertEquals(pendNet.status, "a_vencer");
  assertEquals(pendNet.valorPendente, 200_00);
});

