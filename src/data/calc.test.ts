import { assertEquals } from "jsr:@std/assert@1";
import {
  calcular,
  calcularBaseLancamentos,
  calcularBaseProjecoes,
  calcularCarteiraReservas,
  calcularPendencias,
  calcularPosicaoBancos,
  calcularValorVinculado,
} from "./calc.ts";
import type { Conta, ContaBancaria, Lancamento, Projecao, Reserva, ReservaMovimento, ReservaProjecao } from "./types.ts";

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

Deno.test("calcularCarteiraReservas consolida aportes, resgates, rendimentos e metas", () => {
  const r1: Reserva = {
    ...base,
    id: "r1",
    empresaId: "e",
    nome: "Reserva de Emergência",
    metaCentavos: 10_000_00, // Meta R$ 10.000
    saldoInicialCentavos: 2_000_00, // Saldo inicial R$ 2.000
    ativa: true,
  };

  const r2: Reserva = {
    ...base,
    id: "r2",
    empresaId: "e",
    nome: "Expansão Futura",
    // Sem meta
    saldoInicialCentavos: 0,
    ativa: true,
  };

  // Projeções para r1
  const projs: ReservaProjecao[] = [
    { ...base, id: "p1", empresaId: "e", anoId: "a", reservaId: "r1", mes: 0, valorAporte: 1_000_00, valorResgate: 0, valorRendimento: 20_00 },
    { ...base, id: "p2", empresaId: "e", anoId: "a", reservaId: "r1", mes: 1, valorAporte: 1_000_00, valorResgate: 500_00, valorRendimento: 30_00 },
  ];

  // Movimentos reais para r1
  const movs: ReservaMovimento[] = [
    { ...base, id: "m1", empresaId: "e", anoId: "a", reservaId: "r1", tipo: "aporte", data: "2026-01-15", mes: 0, valor: 1_000_00 },
    { ...base, id: "m2", empresaId: "e", anoId: "a", reservaId: "r1", tipo: "rendimento", data: "2026-01-31", mes: 0, valor: 25_00 },
    { ...base, id: "m3", empresaId: "e", anoId: "a", reservaId: "r1", tipo: "resgate", data: "2026-02-10", mes: 1, valor: 400_00 },
  ];

  const carteira = calcularCarteiraReservas([r1, r2], movs, projs, 1);

  // Resumo de r1
  const resumoR1 = carteira.reservas.find((r) => r.reserva.id === "r1")!;
  assertEquals(resumoR1.saldoInicial, 2_000_00);
  assertEquals(resumoR1.totalAportesReal, 1_000_00);
  assertEquals(resumoR1.totalRendimentosReal, 25_00);
  assertEquals(resumoR1.totalResgatesReal, 400_00);

  // Evolução Real Mês 0: 2000 + 1000 + 25 = 3025
  // Evolução Real Mês 1: 3025 - 400 = 2625
  assertEquals(resumoR1.evolucaoMensalReal[0], 3025_00);
  assertEquals(resumoR1.evolucaoMensalReal[1], 2625_00);
  assertEquals(resumoR1.saldoAtualReal, 2625_00); // mês ref = 1

  // Meta de r1: 2625 / 10000 = 26%
  assertEquals(resumoR1.progressoMetaPct, 26);

  // Evolução Proj Mês 0: 2000 + 1000 + 20 = 3020
  // Evolução Proj Mês 1: 3020 + 1000 + 30 - 500 = 3550
  assertEquals(resumoR1.evolucaoMensalProj[0], 3020_00);
  assertEquals(resumoR1.evolucaoMensalProj[1], 3550_00);
  assertEquals(resumoR1.saldoFinalProj, 3550_00); // sem mais projs nos outros meses

  // Total da Carteira
  assertEquals(carteira.totalPatrimonioReal, 2625_00);
  assertEquals(carteira.totalPatrimonioProj, 3550_00);
  assertEquals(carteira.totalAportadoAnoReal, 1_000_00);
  assertEquals(carteira.totalResgatadoAnoReal, 400_00);
  assertEquals(carteira.totalRendimentoAnoReal, 25_00);
});

Deno.test("calcularPosicaoBancos consolida saldo inicial, entradas, saídas e reservas", () => {
  const b1: ContaBancaria = { ...base, id: "b1", empresaId: "e", nome: "Nubank PJ", saldoInicialCentavos: 10_000_00, ativa: true };
  const b2: ContaBancaria = { ...base, id: "b2", empresaId: "e", nome: "Itaú Corrente", saldoInicialCentavos: 5_000_00, ativa: true };

  const cReceita = conta("c_rec", "receber");
  const cDespesa = conta("c_desp", "pagar");

  const l1: Lancamento = { ...base, id: "l1", anoId: "a", contaId: "c_rec", mes: 0, valor: 3_000_00, data: "2026-01-10", bancoId: "b1" };
  const l2: Lancamento = { ...base, id: "l2", anoId: "a", contaId: "c_desp", mes: 0, valor: 1_000_00, data: "2026-01-12", bancoId: "b1" };
  const l3: Lancamento = { ...base, id: "l3", anoId: "a", contaId: "c_desp", mes: 0, valor: 500_00, data: "2026-01-15", bancoId: "b2" };
  const lSemBanco: Lancamento = { ...base, id: "l4", anoId: "a", contaId: "c_rec", mes: 0, valor: 9_999_00, data: "2026-01-20" };

  // Movimento de reserva direto (sem lançamento duplicado)
  const movResgate: ReservaMovimento = {
    ...base,
    id: "m_resg",
    empresaId: "e",
    anoId: "a",
    reservaId: "r1",
    tipo: "resgate",
    valor: 2_000_00,
    data: "2026-01-25",
    mes: 0,
    bancoId: "b2",
  };

  const pos = calcularPosicaoBancos([b1, b2], [l1, l2, l3, lSemBanco], [cReceita, cDespesa], [movResgate]);

  // Banco 1 (Nubank):
  // Saldo Inicial = 10.000,00
  // Entradas = 3.000,00 (l1)
  // Saídas = 1.000,00 (l2)
  // Saldo Atual = 12.000,00
  const posB1 = pos.bancos.find((b) => b.banco.id === "b1")!;
  assertEquals(posB1.saldoInicial, 10_000_00);
  assertEquals(posB1.totalEntradas, 3_000_00);
  assertEquals(posB1.totalSaidas, 1_000_00);
  assertEquals(posB1.saldoAtual, 12_000_00);
  assertEquals(posB1.qtdLancamentos, 2);

  // Banco 2 (Itaú):
  // Saldo Inicial = 5.000,00
  // Entradas = 2.000,00 (movResgate)
  // Saídas = 500,00 (l3)
  // Saldo Atual = 6.500,00
  const posB2 = pos.bancos.find((b) => b.banco.id === "b2")!;
  assertEquals(posB2.saldoInicial, 5_000_00);
  assertEquals(posB2.totalEntradas, 2_000_00);
  assertEquals(posB2.totalSaidas, 500_00);
  assertEquals(posB2.saldoAtual, 6_500_00);
  assertEquals(posB2.qtdLancamentos, 2);

  // Total Consolidado:
  // Saldo Inicial = 15.000,00
  // Total Entradas = 5.000,00
  // Total Saídas = 1.500,00
  // Total Saldo Atual = 18.500,00
  assertEquals(pos.totalSaldoInicial, 15_000_00);
  assertEquals(pos.totalEntradas, 5_000_00);
  assertEquals(pos.totalSaidas, 1_500_00);
  assertEquals(pos.totalSaldoAtual, 18_500_00);
});

Deno.test("calcularPosicaoBancos processa aportes e resgates com banco de origem e destino simultaneos", () => {
  const bOrigem: ContaBancaria = { ...base, id: "b_origem", empresaId: "e", nome: "Itaú Corrente", saldoInicialCentavos: 10_000_00, ativa: true };
  const bDestino: ContaBancaria = { ...base, id: "b_destino", empresaId: "e", nome: "XP Investimentos", saldoInicialCentavos: 2_000_00, ativa: true };

  // Aporte: sai do Itaú e entra na XP
  const movAporte: ReservaMovimento = {
    ...base,
    id: "m_ap",
    empresaId: "e",
    anoId: "a",
    reservaId: "r1",
    tipo: "aporte",
    valor: 3_000_00,
    data: "2026-02-01",
    mes: 1,
    bancoId: "b_origem",
    bancoDestinoId: "b_destino",
  };

  // Resgate: sai da XP e entra no Itaú
  const movResgate: ReservaMovimento = {
    ...base,
    id: "m_resg",
    empresaId: "e",
    anoId: "a",
    reservaId: "r1",
    tipo: "resgate",
    valor: 1_000_00,
    data: "2026-02-10",
    mes: 1,
    bancoId: "b_destino",
    bancoDestinoId: "b_origem",
  };

  const pos = calcularPosicaoBancos([bOrigem, bDestino], [], [], [movAporte, movResgate]);

  // Itaú:
  // Saldo Inicial = 10.000,00
  // Saída = 3.000,00 (Aporte)
  // Entrada = 1.000,00 (Resgate)
  // Saldo Atual = 8.000,00
  const posOrigem = pos.bancos.find((b) => b.banco.id === "b_origem")!;
  assertEquals(posOrigem.saldoAtual, 8_000_00);
  assertEquals(posOrigem.totalSaidas, 3_000_00);
  assertEquals(posOrigem.totalEntradas, 1_000_00);

  // XP:
  // Saldo Inicial = 2.000,00
  // Entrada = 3.000,00 (Aporte)
  // Saída = 1.000,00 (Resgate)
  // Saldo Atual = 4.000,00
  const posDestino = pos.bancos.find((b) => b.banco.id === "b_destino")!;
  assertEquals(posDestino.saldoAtual, 4_000_00);
  assertEquals(posDestino.totalEntradas, 3_000_00);
  assertEquals(posDestino.totalSaidas, 1_000_00);
});



