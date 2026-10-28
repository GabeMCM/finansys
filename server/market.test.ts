import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  calcularAnaliseLongoPrazo,
  identificarSetorBESTT,
  normalizeSymbol,
  getHot100,
  fetchMarketTicker,
} from "./market.ts";

Deno.test("normalizeSymbol normaliza tickers brasileiros para .SA e mantém globais", () => {
  assertEquals(normalizeSymbol("bbas3"), "BBAS3.SA");
  assertEquals(normalizeSymbol("taee11"), "TAEE11.SA");
  assertEquals(normalizeSymbol("mxrf11"), "MXRF11.SA");
  assertEquals(normalizeSymbol("petr4.sa"), "PETR4.SA");
  assertEquals(normalizeSymbol("ko"), "KO");
  assertEquals(normalizeSymbol("aapl"), "AAPL");
});

Deno.test("identificarSetorBESTT reconhece setores perenes da estratégia Barsi", () => {
  assertEquals(identificarSetorBESTT("Financial Services", "Banks - Diversified", "BBAS3.SA").isBestt, true);
  assertEquals(identificarSetorBESTT("Financial Services", "Banks - Diversified", "BBAS3.SA").category, "Bancos");

  assertEquals(identificarSetorBESTT("Utilities", "Utilities - Regulated Electric", "TAEE11.SA").isBestt, true);
  assertEquals(identificarSetorBESTT("Utilities", "Utilities - Regulated Electric", "TAEE11.SA").category, "Energia");

  assertEquals(identificarSetorBESTT("Utilities", "Utilities - Regulated Water", "SAPR11.SA").isBestt, true);
  assertEquals(identificarSetorBESTT("Utilities", "Utilities - Regulated Water", "SAPR11.SA").category, "Saneamento");

  assertEquals(identificarSetorBESTT("Communication Services", "Telecom Services", "VIVT3.SA").isBestt, true);
  assertEquals(identificarSetorBESTT("Communication Services", "Telecom Services", "VIVT3.SA").category, "Telecom");

  assertEquals(identificarSetorBESTT("Financial Services", "Insurance - Diversified", "BBSE3.SA").isBestt, true);
  assertEquals(identificarSetorBESTT("Financial Services", "Insurance - Diversified", "BBSE3.SA").category, "Seguros");

  assertEquals(identificarSetorBESTT("Consumer Cyclical", "Airlines", "AZUL4.SA").isBestt, false);
});

Deno.test("calcularAnaliseLongoPrazo gera Preço Teto Bazin e pontuação alta para boa pagadora", () => {
  const analise = calcularAnaliseLongoPrazo({
    symbol: "TAEE11.SA",
    name: "Taesa S.A.",
    currency: "BRL",
    price: 34.0,
    previousClose: 34.0,
    fiftyTwoWeekHigh: 38.0,
    fiftyTwoWeekLow: 32.0,
    sector: "Utilities",
    industry: "Utilities - Regulated Electric",
    dividendRate: 3.20,
    dividendYield: 0.094,
    fiveYearAvgDividendYield: 9.8,
    payoutRatio: 0.75,
    totalDebt: 10000000000,
    ebitda: 3500000000,
    returnOnEquity: 0.22,
  });

  assertEquals(analise.symbol, "TAEE11");
  assertEquals(analise.isBestt, true);
  assertEquals(analise.besttCategory, "Energia");
  assert(analise.precoTetoBazin > analise.price, "Preço teto Bazin deve estar acima do preço");
  assert(analise.margemSegurancaBazin > 0, "Margem de segurança deve ser positiva");
  assertEquals(analise.status, "oportunidade");
  assert(analise.score >= 80, "Score de boa pagadora sólida deve ser alto");
});

Deno.test("calcularAnaliseLongoPrazo detecta empresa em crise/armadilha com score baixo e alerta", () => {
  const analise = calcularAnaliseLongoPrazo({
    symbol: "OIBR3.SA",
    name: "Oi S.A.",
    currency: "BRL",
    price: 3.0,
    previousClose: 3.1,
    fiftyTwoWeekHigh: 18.0,
    fiftyTwoWeekLow: 2.0,
    sector: "Communication Services",
    industry: "Telecom Services",
    dividendRate: 0,
    dividendYield: 0,
    payoutRatio: 0,
    totalDebt: 20000000000,
    ebitda: -1000000000,
    returnOnEquity: -0.90,
  });

  assertEquals(analise.symbol, "OIBR3");
  assertEquals(analise.status, "alerta");
  assert(analise.score <= 30, "Score de empresa com prejuízo crônico e sem dividendo deve ser baixo");
});

Deno.test("getHot100 retorna lista de Top 100 ativos ordenados do melhor ao pior", async () => {
  const hot100 = await getHot100();
  assert(hot100.items.length >= 10, "Hot 100 deve conter ativos analisados");
  assert(hot100.updatedAt > 0, "Deve ter timestamp de atualização diária");

  const primeiro = hot100.items[0];
  const ultimo = hot100.items[hot100.items.length - 1];

  assert(primeiro.score >= ultimo.score, "Primeiro ativo deve ter score maior ou igual ao último");
  assert(primeiro.score >= 70, "Primeiro colocado deve ter score alto");
});

Deno.test("fetchMarketTicker busca ativos com sucesso mesmo fora do cache", async () => {
  const bbas3 = await fetchMarketTicker("BBAS3");
  assert(bbas3.price > 0, "BBAS3 deve ter preço válido");
  assertEquals(bbas3.symbol, "BBAS3");

  const aapl = await fetchMarketTicker("AAPL");
  assert(aapl.price > 0, "AAPL deve ter preço válido");
  assertEquals(aapl.symbol, "AAPL");
});
