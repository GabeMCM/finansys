/**
 * Módulo de Integração com o Mercado Financeiro Global e Análise Fundamentalista de Longo Prazo.
 * Filosofia: Luiz Barsi (BESTT), Décio Bazin (Preço Teto 6%), e Filtro Anti-Armadilha (Anti-Dividend Trap).
 */

export interface MarketTickerRaw {
  symbol: string;
  name: string;
  currency: string;
  price: number;
  previousClose: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  sector?: string;
  industry?: string;
  dividendRate?: number;
  dividendYield?: number;
  trailingAnnualDividendRate?: number;
  trailingAnnualDividendYield?: number;
  fiveYearAvgDividendYield?: number;
  payoutRatio?: number;
  totalDebt?: number;
  ebitda?: number;
  debtToEquity?: number;
  returnOnEquity?: number;
  priceToBook?: number;
  trailingEps?: number;
}

export interface LongTermAnalysis {
  symbol: string;
  name: string;
  currency: string;
  market: "B3" | "GLOBAL";
  price: number;
  precoTetoBazin: number;
  margemSegurancaBazin: number; // Em porcentagem (ex: 15.5 = +15.5% de desconto)
  dividendYield: number; // Em porcentagem (ex: 8.5)
  dividendRateAnual: number; // Valor financeiro por cota (ex: 2.50)
  fiveYearAvgDividendYield?: number;
  payoutRatio?: number; // Em porcentagem (ex: 65)
  dividaEbitda?: number; // Múltiplo (ex: 1.8)
  debtToEquity?: number; // Em porcentagem
  roe?: number; // Em porcentagem (ex: 18.5)
  pvp?: number; // Preço / Valor Patrimonial
  pl?: number; // Preço / Lucro
  isBestt: boolean;
  besttCategory?: "Bancos" | "Energia" | "Saneamento" | "Telecom" | "Seguros";
  score: number; // 0 a 100
  status: "oportunidade" | "neutro" | "alerta";
  pontosFortes: string[];
  pontosAtencao: string[];
  atualizadoEm: number;
}

// Setores BESTT mapeados a partir de Industry / Sector do Yahoo Finance
export function identificarSetorBESTT(sector?: string, industry?: string, symbol?: string): {
  isBestt: boolean;
  category?: "Bancos" | "Energia" | "Saneamento" | "Telecom" | "Seguros";
} {
  const s = (sector || "").toLowerCase();
  const ind = (industry || "").toLowerCase();
  const symb = (symbol || "").toUpperCase();

  // Seguros (verificado antes para não colidir com 'Insurance - Diversified')
  if (
    ind.includes("insurance") ||
    ["BBSE3", "CXSE3", "PSSA3", "IRBR3"].some((t) => symb.includes(t))
  ) {
    return { isBestt: true, category: "Seguros" };
  }

  // Bancos
  if (
    ind.includes("bank") ||
    (s.includes("financial") && (ind.includes("regional") || ind.includes("banking") || (ind.includes("diversified") && !ind.includes("insurance")))) ||
    ["BBAS3", "ITUB4", "BBDC4", "SANB11", "ITSA4", "JPM", "BAC"].some((t) => symb.includes(t))
  ) {
    return { isBestt: true, category: "Bancos" };
  }

  // Energia Elétrica (Geração, Transmissão, Distribuição)
  if (
    ind.includes("electric") ||
    ind.includes("renewable") ||
    (s.includes("utilities") && !ind.includes("water")) ||
    ["TAEE11", "TRPL4", "CPLE6", "EGIE3", "ALUP11", "CMIG4", "ENBR3", "NEOE3", "EQTL3", "AURE3"].some((t) => symb.includes(t))
  ) {
    return { isBestt: true, category: "Energia" };
  }

  // Saneamento e Água
  if (
    ind.includes("water") ||
    ["SAPR11", "CSMG3", "SBSP3", "AMBP3"].some((t) => symb.includes(t))
  ) {
    return { isBestt: true, category: "Saneamento" };
  }

  // Telecomunicações
  if (
    s.includes("communication") ||
    ind.includes("telecom") ||
    ["VIVT3", "TIMS3", "FIQE3"].some((t) => symb.includes(t))
  ) {
    return { isBestt: true, category: "Telecom" };
  }

  return { isBestt: false };
}

/**
 * Normaliza o ticker para formato aceito pelo provedor de mercado global.
 * Ex: 'BBAS3' -> 'BBAS3.SA', 'AAPL' -> 'AAPL'
 */
export function normalizeSymbol(rawInput: string): string {
  let sym = (rawInput || "").trim().toUpperCase();
  if (!sym) return "";

  // Se já possui sufixo de bolsa (ex: .SA, .L, .TO)
  if (sym.includes(".")) return sym;

  // Padrão brasileiro da B3: 4 letras + 1 a 2 dígitos (ex: PETR4, TAEE11, MXRF11, BOVA11)
  const isB3Ticker = /^[A-Z]{4}(3|4|5|6|11|12|32|33|34|35)$/.test(sym);
  if (isB3Ticker) {
    return `${sym}.SA`;
  }

  return sym;
}

/**
 * Motor de Cálculo de Longo Prazo (Barsi / Bazin / Anti-Armadilha)
 */
export function calcularAnaliseLongoPrazo(raw: MarketTickerRaw): LongTermAnalysis {
  const price = raw.price > 0 ? raw.price : raw.previousClose;
  const isB3 = raw.symbol.endsWith(".SA");
  const cleanSymbol = raw.symbol.replace(".SA", "");

  // Setor BESTT
  const bestt = identificarSetorBESTT(raw.sector, raw.industry, raw.symbol);

  // Dividendo anual por ação
  let dividendRate = raw.dividendRate ?? raw.trailingAnnualDividendRate ?? 0;
  let dy = (raw.dividendYield ?? raw.trailingAnnualDividendYield ?? 0) * 100;

  // Se dy veio em formato decimal 0.08, multiplicar por 100
  if (dy > 0 && dy < 0.5) dy = dy * 100;
  if (dividendRate === 0 && dy > 0 && price > 0) {
    dividendRate = (dy / 100) * price;
  }
  if (dy === 0 && dividendRate > 0 && price > 0) {
    dy = (dividendRate / price) * 100;
  }

  // 1. Preço Teto de Bazin (DY 6% a.a.)
  let dpaRef = dividendRate;
  if (raw.fiveYearAvgDividendYield && raw.fiveYearAvgDividendYield > 0 && price > 0) {
    const avg5yRate = (raw.fiveYearAvgDividendYield / 100) * price;
    dpaRef = (dividendRate + avg5yRate) / 2;
  }

  const precoTetoBazin = dpaRef > 0 ? Number((dpaRef / 0.06).toFixed(2)) : 0;
  const margemSegurancaBazin = precoTetoBazin > 0 && price > 0
    ? Number((((precoTetoBazin - price) / price) * 100).toFixed(1))
    : -100;

  // 2. Métricas de Saúde Financeira
  const payout = raw.payoutRatio !== undefined && raw.payoutRatio !== null && !isNaN(raw.payoutRatio)
    ? Number((raw.payoutRatio * 100).toFixed(1))
    : undefined;

  let dividaEbitda: number | undefined = undefined;
  if (raw.totalDebt && raw.ebitda && raw.ebitda > 0) {
    dividaEbitda = Number((raw.totalDebt / raw.ebitda).toFixed(2));
  }

  const roe = raw.returnOnEquity !== undefined && raw.returnOnEquity !== null && !isNaN(raw.returnOnEquity)
    ? Number((raw.returnOnEquity * 100).toFixed(1))
    : undefined;

  const pvp = raw.priceToBook ? Number(raw.priceToBook.toFixed(2)) : undefined;
  const pl = raw.trailingEps && raw.trailingEps > 0 && price > 0
    ? Number((price / raw.trailingEps).toFixed(1))
    : undefined;

  // 3. Algoritmo de Score (0 a 100)
  let score = 50; // Base neutra
  const pontosFortes: string[] = [];
  const pontosAtencao: string[] = [];

  // A. Setor BESTT (Bônus de até +12 pts)
  if (bestt.isBestt) {
    score += 12;
    pontosFortes.push(`Setor Perene BESTT (${bestt.category}): demanda essencial e receita previsível.`);
  }

  // B. Dividend Yield
  if (dy >= 6) {
    score += Math.min(18, Math.round((dy - 6) * 2 + 10));
    pontosFortes.push(`Dividend Yield atraente de ${dy.toFixed(1)}% a.a. (acima do corte mínimo de 6%).`);
  } else if (dy >= 4) {
    score += 5;
    pontosAtencao.push(`Yield atual de ${dy.toFixed(1)}% a.a. está um pouco abaixo do patamar ideal de Bazin (6%).`);
  } else if (dy > 0) {
    score -= 10;
    pontosAtencao.push(`Yield baixo de ${dy.toFixed(1)}% a.a.`);
  } else {
    score -= 25;
    pontosAtencao.push("Não paga dividendos ou sem proventos registrados recentemente.");
  }

  // C. Margem de Segurança Bazin
  if (margemSegurancaBazin > 15) {
    score += 18;
    pontosFortes.push(`Negociando com grande desconto vs Preço Teto Bazin (+${margemSegurancaBazin.toFixed(0)}% de margem).`);
  } else if (margemSegurancaBazin > 0) {
    score += 10;
    pontosFortes.push(`Abaixo do Preço Teto Bazin (+${margemSegurancaBazin.toFixed(0)}% de margem de segurança).`);
  } else if (margemSegurancaBazin > -20) {
    score -= 5;
    pontosAtencao.push(`Preço atual está acima do teto de Bazin (${Math.abs(margemSegurancaBazin).toFixed(0)}% mais cara).`);
  } else {
    score -= 15;
    pontosAtencao.push(`Muito acima do Preço Teto Bazin. Aguardar recuo de cotação para aportar.`);
  }

  // D. Payout (Sustentabilidade dos Dividendos)
  if (payout !== undefined) {
    if (payout >= 35 && payout <= 85) {
      score += 10;
      pontosFortes.push(`Payout saudável de ${payout.toFixed(0)}% (distribui dividendos sem queimar caixa).`);
    } else if (payout > 100) {
      score -= 25;
      pontosAtencao.push(`Alerta de Armadilha: Payout de ${payout.toFixed(0)}% excede o lucro gerado pela empresa!`);
    } else if (payout > 85) {
      score -= 5;
      pontosAtencao.push(`Payout elevado (${payout.toFixed(0)}%), retenção pequena para novos investimentos.`);
    }
  }

  // E. Alavancagem e Dívida
  if (dividaEbitda !== undefined) {
    const limiteSeguro = bestt.category === "Energia" || bestt.category === "Saneamento" ? 3.5 : 2.5;
    if (dividaEbitda <= limiteSeguro) {
      score += 10;
      pontosFortes.push(`Dívida controlada (${dividaEbitda}x EBITDA, dentro da faixa de segurança).`);
    } else if (dividaEbitda > 4.5) {
      score -= 25;
      pontosAtencao.push(`Alavancagem perigosa: Dívida/EBITDA em ${dividaEbitda}x compromete a geração de caixa.`);
    } else {
      score -= 10;
      pontosAtencao.push(`Dívida moderadamente elevada (${dividaEbitda}x EBITDA). Exige acompanhamento.`);
    }
  }

  // F. Rentabilidade (ROE)
  if (roe !== undefined) {
    if (roe >= 15) {
      score += 10;
      pontosFortes.push(`Alta rentabilidade sobre patrimônio (ROE de ${roe.toFixed(1)}%).`);
    } else if (roe < 0) {
      score -= 30;
      pontosAtencao.push(`Empresa registrando prejuízo (ROE negativo de ${roe.toFixed(1)}%).`);
    } else if (roe < 8) {
      score -= 10;
      pontosAtencao.push(`Baixa eficiência patrimonial (ROE de ${roe.toFixed(1)}%).`);
    }
  }

  // G. Limites do Score (0 a 100)
  score = Math.max(5, Math.min(99, score));

  // Status consolidado
  let status: "oportunidade" | "neutro" | "alerta" = "neutro";
  if (score >= 75 && margemSegurancaBazin >= 0) {
    status = "oportunidade";
  } else if (score < 50 || margemSegurancaBazin < -25 || (roe !== undefined && roe < 0)) {
    status = "alerta";
  }

  return {
    symbol: cleanSymbol,
    name: raw.name || cleanSymbol,
    currency: raw.currency || (isB3 ? "BRL" : "USD"),
    market: isB3 ? "B3" : "GLOBAL",
    price: Number(price.toFixed(2)),
    precoTetoBazin,
    margemSegurancaBazin,
    dividendYield: Number(dy.toFixed(2)),
    dividendRateAnual: Number(dividendRate.toFixed(2)),
    fiveYearAvgDividendYield: raw.fiveYearAvgDividendYield ? Number(raw.fiveYearAvgDividendYield.toFixed(2)) : undefined,
    payoutRatio: payout,
    dividaEbitda,
    debtToEquity: raw.debtToEquity ? Number(raw.debtToEquity.toFixed(1)) : undefined,
    roe,
    pvp,
    pl,
    isBestt: bestt.isBestt,
    besttCategory: bestt.category,
    score,
    status,
    pontosFortes,
    pontosAtencao,
    atualizadoEm: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Sessão e Cookie Yahoo Finance
// ---------------------------------------------------------------------------
let _cachedCookie: string | null = null;
let _cachedCrumb: string | null = null;
let _crumbExpiry = 0;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function getYahooCrumb(): Promise<{ cookie: string; crumb: string } | null> {
  const now = Date.now();
  if (_cachedCookie && _cachedCrumb && now < _crumbExpiry) {
    return { cookie: _cachedCookie, crumb: _cachedCrumb };
  }

  try {
    const fcRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": USER_AGENT },
    });
    const cookie = fcRes.headers.get("set-cookie");
    if (!cookie) return null;

    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": USER_AGENT,
        "Cookie": cookie,
      },
    });

    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes("<html>")) return null;

    _cachedCookie = cookie;
    _cachedCrumb = crumb;
    _crumbExpiry = now + 1000 * 60 * 60 * 24; // 24h
    return { cookie, crumb };
  } catch (err) {
    console.warn("[Market Engine] Aviso ao obter crumb Yahoo Finance:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache em Memória de Ativos
// ---------------------------------------------------------------------------
const memoryCache = new Map<string, { data: LongTermAnalysis; expiresAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutos

/**
 * Consulta informações completas de um ativo mundial via API externa gratuita com cache.
 */
export async function fetchMarketTicker(rawSymbol: string): Promise<LongTermAnalysis> {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) {
    throw new Error("Símbolo do ativo inválido.");
  }

  const cached = memoryCache.get(symbol);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  // Busca dados na API externa com fallback gracioso
  let rawData: MarketTickerRaw | null = null;
  const session = await getYahooCrumb();

  if (session) {
    try {
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?crumb=${encodeURIComponent(
        session.crumb
      )}&modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile,price`;

      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Cookie": session.cookie,
        },
      });

      if (res.ok) {
        const json = await res.json();
        const r = json.quoteSummary?.result?.[0];
        if (r) {
          rawData = {
            symbol,
            name: r.price?.longName || r.price?.shortName || symbol,
            currency: r.price?.currency || (symbol.endsWith(".SA") ? "BRL" : "USD"),
            price: r.price?.regularMarketPrice?.raw || r.summaryDetail?.previousClose?.raw || 0,
            previousClose: r.summaryDetail?.previousClose?.raw || 0,
            fiftyTwoWeekHigh: r.summaryDetail?.fiftyTwoWeekHigh?.raw || 0,
            fiftyTwoWeekLow: r.summaryDetail?.fiftyTwoWeekLow?.raw || 0,
            sector: r.assetProfile?.sector,
            industry: r.assetProfile?.industry,
            dividendRate: r.summaryDetail?.dividendRate?.raw,
            dividendYield: r.summaryDetail?.dividendYield?.raw,
            trailingAnnualDividendRate: r.summaryDetail?.trailingAnnualDividendRate?.raw,
            trailingAnnualDividendYield: r.summaryDetail?.trailingAnnualDividendYield?.raw,
            fiveYearAvgDividendYield: r.summaryDetail?.fiveYearAvgDividendYield?.raw,
            payoutRatio: r.summaryDetail?.payoutRatio?.raw,
            totalDebt: r.financialData?.totalDebt?.raw,
            ebitda: r.financialData?.ebitda?.raw,
            debtToEquity: r.financialData?.debtToEquity?.raw,
            returnOnEquity: r.financialData?.returnOnEquity?.raw,
            priceToBook: r.defaultKeyStatistics?.priceToBook?.raw,
            trailingEps: r.defaultKeyStatistics?.trailingEps?.raw,
          };
        }
      } else if (res.status === 401) {
        // Invalida crumb e tenta recarregar na próxima chamada
        _cachedCrumb = null;
      }
    } catch (fetchErr) {
      console.warn(`[Market Engine] Erro ao consultar quoteSummary para ${symbol}:`, fetchErr);
    }
  }

  // Fallback 1: Se quoteSummary não respondeu, tenta endpoint /v8/finance/chart
  if (!rawData || rawData.price === 0) {
    try {
      const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;
      const chartRes = await fetch(chartUrl, { headers: { "User-Agent": USER_AGENT } });
      if (chartRes.ok) {
        const chartJson = await chartRes.json();
        const meta = chartJson.chart?.result?.[0]?.meta;
        if (meta) {
          rawData = {
            symbol,
            name: meta.longName || meta.shortName || symbol,
            currency: meta.currency || (symbol.endsWith(".SA") ? "BRL" : "USD"),
            price: meta.regularMarketPrice || meta.chartPreviousClose || 0,
            previousClose: meta.chartPreviousClose || 0,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || 0,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow || 0,
          };
        }
      }
    } catch (_chartErr) {
      // Ignora erro de fallback
    }
  }

  // Fallback 2: Se ainda assim falhou, verifica se o ativo está no catálogo estático inicial de segurança
  if (!rawData || rawData.price === 0) {
    const fallbackSeed = HOTLIST_SEED.find((s) => s.symbol === symbol || s.symbol === symbol.replace(".SA", ""));
    if (fallbackSeed) {
      rawData = { ...fallbackSeed, symbol };
    }
  }

  if (!rawData) {
    throw new Error(`Não foi possível localizar cotações e indicadores para o ativo ${rawSymbol}.`);
  }

  const analysis = calcularAnaliseLongoPrazo(rawData);
  memoryCache.set(symbol, { data: analysis, expiresAt: Date.now() + CACHE_TTL_MS });
  return analysis;
}

// ---------------------------------------------------------------------------
// Base Curada do Universo de Investimentos (Hotlist / Ranking Inicial)
// ---------------------------------------------------------------------------
export const HOTLIST_SEED: MarketTickerRaw[] = [
  // 1. Bancos & Seguros (BESTT)
  {
    symbol: "BBAS3.SA",
    name: "Banco do Brasil S.A.",
    currency: "BRL",
    price: 27.40,
    previousClose: 27.50,
    fiftyTwoWeekHigh: 31.00,
    fiftyTwoWeekLow: 24.10,
    sector: "Financial Services",
    industry: "Banks - Diversified",
    dividendRate: 2.72,
    dividendYield: 0.099,
    fiveYearAvgDividendYield: 9.4,
    payoutRatio: 0.44,
    returnOnEquity: 0.21,
    priceToBook: 0.86,
    trailingEps: 5.80,
  },
  {
    symbol: "BBSE3.SA",
    name: "BB Seguridade Participações",
    currency: "BRL",
    price: 35.80,
    previousClose: 35.70,
    fiftyTwoWeekHigh: 38.50,
    fiftyTwoWeekLow: 31.00,
    sector: "Financial Services",
    industry: "Insurance - Diversified",
    dividendRate: 3.45,
    dividendYield: 0.096,
    fiveYearAvgDividendYield: 8.8,
    payoutRatio: 0.82,
    returnOnEquity: 0.65,
    priceToBook: 6.2,
    trailingEps: 4.10,
  },
  {
    symbol: "CXSE3.SA",
    name: "Caixa Seguridade",
    currency: "BRL",
    price: 14.50,
    previousClose: 14.60,
    fiftyTwoWeekHigh: 16.20,
    fiftyTwoWeekLow: 12.10,
    sector: "Financial Services",
    industry: "Insurance - Diversified",
    dividendRate: 1.28,
    dividendYield: 0.088,
    fiveYearAvgDividendYield: 8.1,
    payoutRatio: 0.88,
    returnOnEquity: 0.48,
    priceToBook: 3.8,
    trailingEps: 1.45,
  },
  {
    symbol: "ITUB4.SA",
    name: "Itaú Unibanco Holding",
    currency: "BRL",
    price: 34.20,
    previousClose: 34.10,
    fiftyTwoWeekHigh: 37.00,
    fiftyTwoWeekLow: 28.50,
    sector: "Financial Services",
    industry: "Banks - Diversified",
    dividendRate: 2.65,
    dividendYield: 0.077,
    fiveYearAvgDividendYield: 6.8,
    payoutRatio: 0.60,
    returnOnEquity: 0.22,
    priceToBook: 1.7,
    trailingEps: 4.10,
  },
  {
    symbol: "ITSA4.SA",
    name: "Itaúsa S.A.",
    currency: "BRL",
    price: 10.40,
    previousClose: 10.35,
    fiftyTwoWeekHigh: 11.50,
    fiftyTwoWeekLow: 9.10,
    sector: "Financial Services",
    industry: "Holding Companies",
    dividendRate: 0.84,
    dividendYield: 0.081,
    fiveYearAvgDividendYield: 7.2,
    payoutRatio: 0.62,
    returnOnEquity: 0.18,
    priceToBook: 1.15,
    trailingEps: 1.35,
  },
  {
    symbol: "SANB11.SA",
    name: "Banco Santander Brasil",
    currency: "BRL",
    price: 28.10,
    previousClose: 28.30,
    fiftyTwoWeekHigh: 32.00,
    fiftyTwoWeekLow: 25.50,
    sector: "Financial Services",
    industry: "Banks - Regional",
    dividendRate: 1.95,
    dividendYield: 0.069,
    fiveYearAvgDividendYield: 7.5,
    payoutRatio: 0.58,
    returnOnEquity: 0.15,
    priceToBook: 1.1,
    trailingEps: 3.10,
  },

  // 2. Energia & Transmissão (BESTT)
  {
    symbol: "TAEE11.SA",
    name: "Taesa - Transmissora Aliança de Energia",
    currency: "BRL",
    price: 34.80,
    previousClose: 34.90,
    fiftyTwoWeekHigh: 38.00,
    fiftyTwoWeekLow: 32.80,
    sector: "Utilities",
    industry: "Utilities - Regulated Electric",
    dividendRate: 3.10,
    dividendYield: 0.089,
    fiveYearAvgDividendYield: 9.8,
    payoutRatio: 0.78,
    totalDebt: 11000000000,
    ebitda: 3200000000,
    returnOnEquity: 0.21,
    priceToBook: 1.65,
    trailingEps: 3.60,
  },
  {
    symbol: "CPLE6.SA",
    name: "Copel - Companhia Paranaense de Energia",
    currency: "BRL",
    price: 9.90,
    previousClose: 9.85,
    fiftyTwoWeekHigh: 11.20,
    fiftyTwoWeekLow: 8.40,
    sector: "Utilities",
    industry: "Utilities - Regulated Electric",
    dividendRate: 0.76,
    dividendYield: 0.077,
    fiveYearAvgDividendYield: 7.9,
    payoutRatio: 0.65,
    totalDebt: 14500000000,
    ebitda: 5600000000,
    returnOnEquity: 0.16,
    priceToBook: 1.18,
    trailingEps: 1.15,
  },
  {
    symbol: "TRPL4.SA",
    name: "ISA Cteep - Transmissão Paulista",
    currency: "BRL",
    price: 25.60,
    previousClose: 25.50,
    fiftyTwoWeekHigh: 27.80,
    fiftyTwoWeekLow: 23.10,
    sector: "Utilities",
    industry: "Utilities - Regulated Electric",
    dividendRate: 2.20,
    dividendYield: 0.086,
    fiveYearAvgDividendYield: 8.9,
    payoutRatio: 0.75,
    totalDebt: 9800000000,
    ebitda: 3400000000,
    returnOnEquity: 0.19,
    priceToBook: 1.12,
    trailingEps: 3.10,
  },
  {
    symbol: "EGIE3.SA",
    name: "Engie Brasil Energia",
    currency: "BRL",
    price: 43.20,
    previousClose: 43.10,
    fiftyTwoWeekHigh: 47.00,
    fiftyTwoWeekLow: 39.80,
    sector: "Utilities",
    industry: "Utilities - Renewable",
    dividendRate: 3.10,
    dividendYield: 0.072,
    fiveYearAvgDividendYield: 7.1,
    payoutRatio: 0.68,
    totalDebt: 19000000000,
    ebitda: 7400000000,
    returnOnEquity: 0.32,
    priceToBook: 3.2,
    trailingEps: 4.40,
  },
  {
    symbol: "ALUP11.SA",
    name: "Alupar Investimento",
    currency: "BRL",
    price: 29.50,
    previousClose: 29.40,
    fiftyTwoWeekHigh: 32.00,
    fiftyTwoWeekLow: 26.50,
    sector: "Utilities",
    industry: "Utilities - Regulated Electric",
    dividendRate: 2.15,
    dividendYield: 0.073,
    fiveYearAvgDividendYield: 6.8,
    payoutRatio: 0.55,
    totalDebt: 10500000000,
    ebitda: 3800000000,
    returnOnEquity: 0.15,
    priceToBook: 1.15,
    trailingEps: 3.50,
  },

  // 3. Saneamento (BESTT)
  {
    symbol: "SAPR11.SA",
    name: "Sanepar - Companhia de Saneamento do Paraná",
    currency: "BRL",
    price: 29.80,
    previousClose: 29.70,
    fiftyTwoWeekHigh: 33.50,
    fiftyTwoWeekLow: 24.20,
    sector: "Utilities",
    industry: "Utilities - Regulated Water",
    dividendRate: 2.10,
    dividendYield: 0.070,
    fiveYearAvgDividendYield: 6.9,
    payoutRatio: 0.50,
    totalDebt: 5800000000,
    ebitda: 2900000000,
    returnOnEquity: 0.16,
    priceToBook: 0.95,
    trailingEps: 3.80,
  },
  {
    symbol: "CSMG3.SA",
    name: "Copasa - Companhia de Saneamento de Minas Gerais",
    currency: "BRL",
    price: 21.40,
    previousClose: 21.20,
    fiftyTwoWeekHigh: 24.00,
    fiftyTwoWeekLow: 18.50,
    sector: "Utilities",
    industry: "Utilities - Regulated Water",
    dividendRate: 1.85,
    dividendYield: 0.086,
    fiveYearAvgDividendYield: 7.2,
    payoutRatio: 0.50,
    totalDebt: 4500000000,
    ebitda: 2600000000,
    returnOnEquity: 0.14,
    priceToBook: 0.92,
    trailingEps: 2.80,
  },

  // 4. Telecomunicações (BESTT)
  {
    symbol: "VIVT3.SA",
    name: "Telefônica Brasil (Vivo)",
    currency: "BRL",
    price: 52.40,
    previousClose: 52.60,
    fiftyTwoWeekHigh: 56.00,
    fiftyTwoWeekLow: 44.00,
    sector: "Communication Services",
    industry: "Telecom Services",
    dividendRate: 3.85,
    dividendYield: 0.073,
    fiveYearAvgDividendYield: 7.0,
    payoutRatio: 0.85,
    totalDebt: 18000000000,
    ebitda: 21000000000,
    returnOnEquity: 0.08,
    priceToBook: 1.25,
    trailingEps: 3.20,
  },

  // 5. Outras Grandes Pagadoras / Blue Chips B3
  {
    symbol: "VALE3.SA",
    name: "Vale S.A.",
    currency: "BRL",
    price: 61.20,
    previousClose: 61.50,
    fiftyTwoWeekHigh: 76.00,
    fiftyTwoWeekLow: 54.00,
    sector: "Basic Materials",
    industry: "Other Industrial Metals & Mining",
    dividendRate: 6.20,
    dividendYield: 0.101,
    fiveYearAvgDividendYield: 10.5,
    payoutRatio: 0.60,
    totalDebt: 72000000000,
    ebitda: 85000000000,
    returnOnEquity: 0.19,
    priceToBook: 1.35,
    trailingEps: 9.40,
  },
  {
    symbol: "PETR4.SA",
    name: "Petróleo Brasileiro S.A. - Petrobras",
    currency: "BRL",
    price: 36.80,
    previousClose: 36.90,
    fiftyTwoWeekHigh: 42.50,
    fiftyTwoWeekLow: 32.00,
    sector: "Energy",
    industry: "Oil & Gas Integrated",
    dividendRate: 5.60,
    dividendYield: 0.152,
    fiveYearAvgDividendYield: 18.2,
    payoutRatio: 0.55,
    totalDebt: 310000000000,
    ebitda: 250000000000,
    returnOnEquity: 0.28,
    priceToBook: 1.1,
    trailingEps: 9.80,
  },
  {
    symbol: "KLBN11.SA",
    name: "Klabin S.A.",
    currency: "BRL",
    price: 21.90,
    previousClose: 21.80,
    fiftyTwoWeekHigh: 25.00,
    fiftyTwoWeekLow: 19.50,
    sector: "Basic Materials",
    industry: "Paper & Paper Products",
    dividendRate: 1.45,
    dividendYield: 0.066,
    fiveYearAvgDividendYield: 6.4,
    payoutRatio: 0.65,
    totalDebt: 32000000000,
    ebitda: 7100000000,
    returnOnEquity: 0.15,
    priceToBook: 2.1,
    trailingEps: 2.10,
  },
  {
    symbol: "VULC3.SA",
    name: "Vulcabras S.A.",
    currency: "BRL",
    price: 18.40,
    previousClose: 18.30,
    fiftyTwoWeekHigh: 21.00,
    fiftyTwoWeekLow: 15.20,
    sector: "Consumer Cyclical",
    industry: "Footwear & Accessories",
    dividendRate: 1.75,
    dividendYield: 0.095,
    fiveYearAvgDividendYield: 8.2,
    payoutRatio: 0.78,
    totalDebt: 550000000,
    ebitda: 520000000,
    returnOnEquity: 0.26,
    priceToBook: 2.3,
    trailingEps: 1.95,
  },

  // 6. Empresas Caras ou Neutras (Para ordenação realista)
  {
    symbol: "WEGE3.SA",
    name: "WEG S.A.",
    currency: "BRL",
    price: 54.10,
    previousClose: 54.20,
    fiftyTwoWeekHigh: 57.00,
    fiftyTwoWeekLow: 34.00,
    sector: "Industrials",
    industry: "Specialty Industrial Machinery",
    dividendRate: 0.95,
    dividendYield: 0.018,
    fiveYearAvgDividendYield: 1.6,
    payoutRatio: 0.52,
    totalDebt: 4500000000,
    ebitda: 7900000000,
    returnOnEquity: 0.35,
    priceToBook: 12.5,
    trailingEps: 1.45,
  },

  // 7. Globais / Dividend Aristocrats
  {
    symbol: "KO",
    name: "The Coca-Cola Company",
    currency: "USD",
    price: 68.50,
    previousClose: 68.20,
    fiftyTwoWeekHigh: 73.00,
    fiftyTwoWeekLow: 55.00,
    sector: "Consumer Defensive",
    industry: "Beverages - Non-Alcoholic",
    dividendRate: 1.94,
    dividendYield: 0.028,
    fiveYearAvgDividendYield: 3.1,
    payoutRatio: 0.72,
    totalDebt: 42000000000,
    ebitda: 14800000000,
    returnOnEquity: 0.41,
    priceToBook: 10.8,
    trailingEps: 2.65,
  },
  {
    symbol: "JNJ",
    name: "Johnson & Johnson",
    currency: "USD",
    price: 161.20,
    previousClose: 160.80,
    fiftyTwoWeekHigh: 168.00,
    fiftyTwoWeekLow: 144.00,
    sector: "Healthcare",
    industry: "Drug Manufacturers - General",
    dividendRate: 4.96,
    dividendYield: 0.031,
    fiveYearAvgDividendYield: 2.9,
    payoutRatio: 0.65,
    totalDebt: 36000000000,
    ebitda: 31000000000,
    returnOnEquity: 0.28,
    priceToBook: 5.4,
    trailingEps: 6.10,
  },
  {
    symbol: "O",
    name: "Realty Income Corporation (Monthly Dividend)",
    currency: "USD",
    price: 54.80,
    previousClose: 54.90,
    fiftyTwoWeekHigh: 64.00,
    fiftyTwoWeekLow: 49.00,
    sector: "Real Estate",
    industry: "REIT - Retail",
    dividendRate: 3.16,
    dividendYield: 0.058,
    fiveYearAvgDividendYield: 4.9,
    payoutRatio: 0.78,
    totalDebt: 24000000000,
    ebitda: 4200000000,
    returnOnEquity: 0.04,
    priceToBook: 1.25,
    trailingEps: 1.40,
  },

  // 8. Empresas em Alerta / Distressed (Lanterna da Lista com Semáforo Vermelho)
  {
    symbol: "OIBR3.SA",
    name: "Oi S.A. - Em Recuperação Judicial",
    currency: "BRL",
    price: 3.20,
    previousClose: 3.25,
    fiftyTwoWeekHigh: 18.00,
    fiftyTwoWeekLow: 2.10,
    sector: "Communication Services",
    industry: "Telecom Services",
    dividendRate: 0,
    dividendYield: 0,
    payoutRatio: 0,
    totalDebt: 18000000000,
    ebitda: -1200000000,
    returnOnEquity: -0.85,
    trailingEps: -8.50,
  },
  {
    symbol: "AMER3.SA",
    name: "Americanas S.A. - Em Recuperação Judicial",
    currency: "BRL",
    price: 0.45,
    previousClose: 0.46,
    fiftyTwoWeekHigh: 1.80,
    fiftyTwoWeekLow: 0.35,
    sector: "Consumer Cyclical",
    industry: "Internet Retail",
    dividendRate: 0,
    dividendYield: 0,
    payoutRatio: 0,
    totalDebt: 45000000000,
    ebitda: -3400000000,
    returnOnEquity: -1.2,
    trailingEps: -12.40,
  },
  {
    symbol: "BHIA3.SA",
    name: "Casas Bahia Group",
    currency: "BRL",
    price: 4.80,
    previousClose: 4.90,
    fiftyTwoWeekHigh: 12.00,
    fiftyTwoWeekLow: 3.90,
    sector: "Consumer Cyclical",
    industry: "Specialty Retail",
    dividendRate: 0,
    dividendYield: 0,
    payoutRatio: 0,
    totalDebt: 8500000000,
    ebitda: -450000000,
    returnOnEquity: -0.45,
    trailingEps: -6.20,
  },
  {
    symbol: "AZUL4.SA",
    name: "Azul Linhas Aéreas Brasileiras",
    currency: "BRL",
    price: 5.60,
    previousClose: 5.80,
    fiftyTwoWeekHigh: 15.50,
    fiftyTwoWeekLow: 4.80,
    sector: "Industrials",
    industry: "Airlines",
    dividendRate: 0,
    dividendYield: 0,
    payoutRatio: 0,
    totalDebt: 24000000000,
    ebitda: 3100000000,
    returnOnEquity: -0.62,
    trailingEps: -7.10,
  },
];

/**
 * Retorna a Hotlist completa ranqueada do MELHOR (Top 1) ao PIOR (Último colocado),
 * enriquecida com cotações recentes e score consolidado.
 */
export async function getHotlist(): Promise<LongTermAnalysis[]> {
  const results: LongTermAnalysis[] = [];

  for (const item of HOTLIST_SEED) {
    try {
      // Se já estiver no cache, usa o cache (que pode ter dados ao vivo)
      const cached = memoryCache.get(item.symbol);
      if (cached) {
        results.push(cached.data);
      } else {
        const computed = calcularAnaliseLongoPrazo(item);
        results.push(computed);
      }
    } catch (_err) {
      // Continua se falhar um item
    }
  }

  // Ordena por Score decrescente (100 -> 0), e desempata por Margem de Segurança Bazin decrescente
  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.margemSegurancaBazin - a.margemSegurancaBazin;
  });

  return results;
}
