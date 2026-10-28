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

Deno.test("calcularCarteiraInvestimentos calcula Preço Médio ponderado e vendas parciais", () => {
  // Compra 1: 100 cotas a R$ 30,00
  // Compra 2: 100 cotas a R$ 40,00 -> Total 200 cotas, Custo R$ 7.000, PM = R$ 35,00
  // Venda 1: 50 cotas a R$ 45,00 -> Sobram 150 cotas com PM inalterado de R$ 35,00 (Custo = R$ 5.250)
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

  const resultado = calcularCarteiraInvestimentos(operacoes, marketMap);

  assertEquals(resultado.posicoes.length, 1);
  const pos = resultado.posicoes[0];
  assertEquals(pos.ticker, "BBAS3");
  assertEquals(pos.quantidadeTotal, 150);
  assertEquals(pos.precoMedioCentavos, 35_00);
  assertEquals(pos.totalInvestidoCentavos, 150 * 35_00); // R$ 5.250,00
  assertEquals(pos.cotacaoAtualCentavos, 50_00);
  assertEquals(pos.valorMercadoAtualCentavos, 150 * 50_00); // R$ 7.500,00
  assertEquals(pos.lucroPrejuizoCentavos, 7500_00 - 5250_00); // + R$ 2.250,00
  assertEquals(pos.rentabilidadePct, 42.86);

  // Proventos anuais: 150 cotas * R$ 5,00/cota = R$ 750,00
  assertEquals(pos.proventosAnuaisEstimadosCentavos, 750_00);
  // Yield on Cost: (750 / 5250) * 100 = 14.29%
  assertEquals(pos.yieldOnCostPct, 14.29);

  // Indicadores de segurança
  assertEquals(pos.precoGrahamCentavos, 6250);
  assertEquals(pos.precoTetoBazinCentavos, 8333);

  // Consolidado da carteira
  assertEquals(resultado.totalInvestidoCentavos, 5250_00);
  assertEquals(resultado.valorMercadoAtualCentavos, 7500_00);
  assertEquals(resultado.lucroPrejuizoTotalCentavos, 2250_00);
  assertEquals(resultado.rentabilidadeTotalPct, 42.86);
  assertEquals(resultado.proventosAnuaisTotalCentavos, 750_00);
  assertEquals(resultado.rendaMensalEstimadaCentavos, Math.round(750_00 / 12));
  assertEquals(resultado.yieldOnCostMedioPct, 14.29);
});

Deno.test("calcularCarteiraInvestimentos zera posição vendida integralmente", () => {
  const operacoes: OperacaoInvestimento[] = [
    op("1", "PETR4", "compra", 100, 30_00, "2026-01-10"),
    op("2", "PETR4", "venda", 100, 35_00, "2026-01-15"),
  ];

  const resultado = calcularCarteiraInvestimentos(operacoes, new Map());
  assertEquals(resultado.posicoes.length, 0);
  assertEquals(resultado.totalInvestidoCentavos, 0);
  assertEquals(resultado.valorMercadoAtualCentavos, 0);
});
