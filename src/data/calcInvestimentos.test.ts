import { assertEquals } from "jsr:@std/assert@1";
import { calcularCarteiraInvestimentos } from "./calcInvestimentos.ts";
import type { OperacaoInvestimento, LongTermAnalysis } from "./types.ts";

const base = { createdAt: 0, updatedAt: 0 };

const op = (
  id: string,
  ticker: string,
  tipo: "compra" | "venda",
  quantidade: number,
  precoUnitarioCentavos: number,
  data: string,
  moeda: "BRL" | "USD" = "BRL"
): OperacaoInvestimento => ({
  ...base,
  id,
  empresaId: "emp-1",
  data,
  ticker,
  tipo,
  quantidade,
  precoUnitarioCentavos,
  moeda,
});

Deno.test("calcularCarteiraInvestimentos calcula Preço Médio ponderado, Lucro Realizado e Não Realizado", () => {
  // Compra 1: 100 cotas a R$ 30,00 (R$ 3.000)
  // Compra 2: 100 cotas a R$ 40,00 (R$ 4.000) -> Total 200 cotas, Custo R$ 7.000, PM = R$ 35,00
  // Venda 1: 50 cotas a R$ 45,00 (Recebe R$ 2.250). Custo vendido: 50 * 35 = R$ 1.750. Lucro Realizado = R$ 500,00!
  // Sobram 150 cotas com PM inalterado de R$ 35,00 (Custo = R$ 5.250)
  const operacoes: OperacaoInvestimento[] = [
    op("1", "BBAS3", "compra", 100, 30_00, "2026-01-10"),
    op("2", "BBAS3", "compra", 100, 40_00, "2026-01-15"),
    op("3", "BBAS3", "venda", 50, 45_00, "2026-01-20"),
  ];

  const bbas3Analysis: LongTermAnalysis = {
    symbol: "BBAS3.SA",
    name: "Banco do Brasil",
    currency: "BRL",
    market: "B3",
    price: 50.0,
    dividendYield: 10.0,
    dividendRateAnual: 5.0,
    payoutRatio: 40,
    pl: 4.5,
    pvp: 0.8,
    isBestt: true,
    besttCategory: "Bancos",
    score: 95,
    status: "oportunidade",
    precoTetoBazin: 83.33,
    margemSegurancaBazin: 66.7,
    precoGraham: 62.5,
    margemLiquida: 24.5,
    pontosFortes: ["Excelente pagadora"],
    pontosAtencao: [],
    atualizadoEm: Date.now(),
  };

  const marketMap = new Map<string, LongTermAnalysis>();
  marketMap.set("BBAS3", bbas3Analysis);

  const resultado = calcularCarteiraInvestimentos(operacoes, marketMap, 5.35);

  assertEquals(resultado.posicoes.length, 1);
  const pos = resultado.posicoes[0];
  assertEquals(pos.ticker, "BBAS3");
  assertEquals(pos.quantidadeTotal, 150);
  assertEquals(pos.precoMedioCentavos, 35_00);
  assertEquals(pos.totalInvestidoCentavos, 150 * 35_00); // R$ 5.250,00
  assertEquals(pos.cotacaoAtualCentavos, 50_00);
  assertEquals(pos.valorMercadoAtualCentavos, 150 * 50_00); // R$ 7.500,00
  assertEquals(pos.lucroPrejuizoCentavos, 7500_00 - 5250_00); // + R$ 2.250,00 (Não realizado)
  assertEquals(pos.lucroRealizadoCentavos, 500_00); // + R$ 500,00 (Realizado na venda)
  assertEquals(pos.rentabilidadePct, 42.86);

  // Proventos anuais: 150 cotas * R$ 5,00/cota = R$ 750,00
  assertEquals(pos.proventosAnuaisEstimadosCentavos, 750_00);
  // Yield on Cost: (750 / 5250) * 100 = 14.29%
  assertEquals(pos.yieldOnCostPct, 14.29);

  // Indicadores de segurança
  assertEquals(pos.precoGrahamCentavos, 6250);
  assertEquals(pos.margemGrahamAtual, 25.0); // ((62.5 - 50) / 50) * 100
  assertEquals(pos.precoTetoBazinCentavos, 8333);

  // Consolidado da carteira
  assertEquals(resultado.totalInvestidoCentavos, 5250_00);
  assertEquals(resultado.valorMercadoAtualCentavos, 7500_00);
  assertEquals(resultado.lucroNaoRealizadoTotalCentavos, 2250_00);
  assertEquals(resultado.lucroRealizadoTotalCentavos, 500_00);
  assertEquals(resultado.lucroPrejuizoTotalCentavos, 2750_00); // 2250 + 500
  assertEquals(resultado.crescimentoPatrimonialPct, 42.86);
  assertEquals(resultado.proventosAnuaisTotalCentavos, 750_00);
  assertEquals(resultado.rendaMensalEstimadaCentavos, Math.round(750_00 / 12));
  assertEquals(resultado.rendaDiariaEstimadaCentavos, Math.round(750_00 / 365));
  assertEquals(resultado.yieldOnCostMedioPct, 14.29);

  // Bola de neve calculada
  assertEquals(resultado.projecaoBolaDeNeve.em1AnoCentavos > 7500_00, true);
  assertEquals(resultado.projecaoBolaDeNeve.em5AnosCentavos > resultado.projecaoBolaDeNeve.em1AnoCentavos, true);
});

Deno.test("calcularCarteiraInvestimentos suporta ativos em USD com conversão cambial", () => {
  const operacoes: OperacaoInvestimento[] = [
    op("1", "KO", "compra", 10, 50_00, "2026-01-10", "USD"), // $ 500,00
  ];

  const koAnalysis: LongTermAnalysis = {
    symbol: "KO",
    name: "Coca-Cola Co",
    currency: "USD",
    market: "GLOBAL",
    price: 60.0, // $ 60,00
    dividendYield: 3.2,
    dividendRateAnual: 1.92,
    score: 88,
    status: "oportunidade",
    precoTetoBazin: 76.8,
    margemSegurancaBazin: 28.0,
    precoGraham: 65.0,
    isBestt: false,
    isAristocrat: true,
    pontosFortes: [],
    pontosAtencao: [],
    atualizadoEm: Date.now(),
  };

  const marketMap = new Map<string, LongTermAnalysis>();
  marketMap.set("KO", koAnalysis);

  const cambio = 5.00;
  const res = calcularCarteiraInvestimentos(operacoes, marketMap, cambio);

  assertEquals(res.posicoes.length, 1);
  const p = res.posicoes[0];
  assertEquals(p.totalInvestidoCentavos, 500_00); // $ 500,00
  assertEquals(p.valorMercadoAtualCentavos, 600_00); // $ 600,00
  assertEquals(p.totalInvestidoBrlCentavos, 500_00 * cambio); // R$ 2.500,00
  assertEquals(p.valorMercadoBrlCentavos, 600_00 * cambio); // R$ 3.000,00
  assertEquals(res.totalInvestidoCentavos, 2500_00);
  assertEquals(res.valorMercadoAtualCentavos, 3000_00);
  assertEquals(res.lucroNaoRealizadoTotalCentavos, 500_00);
});

Deno.test("calcularCarteiraInvestimentos zera posição vendida integralmente e retém lucro realizado", () => {
  const operacoes: OperacaoInvestimento[] = [
    op("1", "PETR4", "compra", 100, 30_00, "2026-01-10"),
    op("2", "PETR4", "venda", 100, 35_00, "2026-01-15"),
  ];

  const resultado = calcularCarteiraInvestimentos(operacoes, new Map());
  assertEquals(resultado.posicoes.length, 0);
  assertEquals(resultado.totalInvestidoCentavos, 0);
  assertEquals(resultado.valorMercadoAtualCentavos, 0);
  // Lucro realizado: 100 cotas * R$ 5,00 = R$ 500,00
  assertEquals(resultado.lucroRealizadoTotalCentavos, 500_00);
  assertEquals(resultado.lucroPrejuizoTotalCentavos, 500_00);
});
