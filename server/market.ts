/**
 * Módulo de Integração com o Mercado Financeiro Global e Análise Fundamentalista de Longo Prazo.
 * Filosofia: Luiz Barsi (BESTT), Décio Bazin (Preço Teto 6% B3 / 2.5% Global - Padrão Graham & Siegel),
 * e Filtro Anti-Armadilha (Anti-Dividend Trap).
 *
 * Atualização Diária Dinâmica: Varre diariamente um universo amplo de ativos líquidos do Brasil e do mundo,
 * recalculando cotações, proventos reais pagos nos últimos 12 meses, Preço Teto Bazin e pontuação para gerar o HOT 100.
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
  trailingPE?: number;
  bookValue?: number;
  marketCap?: number;
}

export interface LongTermAnalysis {
  symbol: string;
  name: string;
  currency: string;
  market: "B3" | "GLOBAL";
  price: number;
  precoTetoBazin: number;
  margemSegurancaBazin: number; // Porcentagem de desconto (+15.5%) ou ágio (-10%)
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
  isAristocrat?: boolean;
  score: number; // 0 a 100
  status: "oportunidade" | "neutro" | "alerta";
  pontosFortes: string[];
  pontosAtencao: string[];
  atualizadoEm: number;
}

// ---------------------------------------------------------------------------
// Aristocratas de Dividendos Globais (S&P 500 Dividend Aristocrats & Kings)
// Empresas com mais de 25 a 60 anos consecutivos de dividendos crescentes.
// Critério #4 do Investidor Defensivo de Benjamin Graham em The Intelligent Investor.
// ---------------------------------------------------------------------------
export const DIVIDEND_ARISTOCRATS_SYMBOLS = new Set([
  "KO", "PEP", "JNJ", "PG", "MMM", "ABBV", "CVX", "XOM", "MCD", "O", "IBM", "T", "VZ", "MO", "PM",
  "CAT", "EMR", "GPC", "LOW", "WMT", "CL", "SYY", "ED", "BDX", "ITW", "PPG", "TGT", "ADM", "ADP",
  "AFL", "APD", "BKH", "CINF", "DOV", "FRT", "HRL", "KMB", "NUE", "PNR", "SHW", "SWK", "ABT",
  "CB", "CLX", "GD", "GWW", "LIN", "MDT", "MKC", "NEE", "ROP", "SPGI"
]);

// ---------------------------------------------------------------------------
// Setores BESTT Mapeados (Metodologia Luiz Barsi)
// ---------------------------------------------------------------------------
export function identificarSetorBESTT(sector?: string, industry?: string, symbol?: string): {
  isBestt: boolean;
  category?: "Bancos" | "Energia" | "Saneamento" | "Telecom" | "Seguros";
} {
  const s = (sector || "").toLowerCase();
  const ind = (industry || "").toLowerCase();
  const symb = (symbol || "").toUpperCase();

  // 1. Seguros (verificado antes para não colidir com 'Insurance - Diversified')
  if (
    ind.includes("insurance") ||
    ["BBSE3", "CXSE3", "PSSA3", "IRBR3"].some((t) => symb.includes(t))
  ) {
    return { isBestt: true, category: "Seguros" };
  }

  // 2. Bancos
  if (
    ind.includes("bank") ||
    (s.includes("financial") && (ind.includes("regional") || ind.includes("banking") || (ind.includes("diversified") && !ind.includes("insurance")))) ||
    ["BBAS3", "ITUB4", "BBDC4", "BBDC3", "SANB11", "ITSA4", "BPAC11", "BRSR6", "JPM", "BAC", "WFC"].some((t) => symb.includes(t))
  ) {
    return { isBestt: true, category: "Bancos" };
  }

  // 3. Energia Elétrica (Geração, Transmissão, Distribuição)
  if (
    ind.includes("electric") ||
    ind.includes("renewable") ||
    (s.includes("utilities") && !ind.includes("water")) ||
    ["TAEE11", "TRPL4", "CPLE6", "CPLE3", "EGIE3", "ALUP11", "CMIG4", "CMIG3", "NEOE3", "EQTL3", "ENGI11", "CPFE3", "AURE3", "ELET3", "ELET6"].some((t) => symb.includes(t))
  ) {
    return { isBestt: true, category: "Energia" };
  }

  // 4. Saneamento e Água
  if (
    ind.includes("water") ||
    ["SAPR11", "SAPR4", "CSMG3", "SBSP3", "AMBP3"].some((t) => symb.includes(t))
  ) {
    return { isBestt: true, category: "Saneamento" };
  }

  // 5. Telecomunicações
  if (
    s.includes("communication") ||
    ind.includes("telecom") ||
    ["VIVT3", "TIMS3", "FIQE3", "VZ", "T"].some((t) => symb.includes(t))
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

  // Aliases conhecidos de migrações societárias da B3
  if (sym === "CPLE6" || sym === "CPLE6.SA") return "CPLE3.SA";

  if (sym.includes(".")) return sym;

  // Padrão brasileiro da B3: 4 letras + dígitos (ex: PETR4, TAEE11, MXRF11)
  const isB3Ticker = /^[A-Z]{4}(3|4|5|6|11|12|32|33|34|35)$/.test(sym);
  if (isB3Ticker) {
    return `${sym}.SA`;
  }

  return sym;
}

/**
 * Motor de Cálculo de Longo Prazo (Barsi / Bazin / Anti-Armadilha / Graham / Siegel)
 */
export function calcularAnaliseLongoPrazo(raw: MarketTickerRaw): LongTermAnalysis {
  const price = raw.price > 0 ? raw.price : raw.previousClose;
  const isB3 = raw.symbol.endsWith(".SA");
  const cleanSymbol = raw.symbol.replace(".SA", "");

  // Setor BESTT (Luiz Barsi) e Aristocrata de Dividendos (Benjamin Graham)
  const bestt = identificarSetorBESTT(raw.sector, raw.industry, raw.symbol);
  const isAristocrat = DIVIDEND_ARISTOCRATS_SYMBOLS.has(cleanSymbol);

  // Dividendo anual por ação (prioriza proventos reais dos últimos 12 meses)
  let dividendRate = raw.trailingAnnualDividendRate || raw.dividendRate || 0;
  let dy = 0;
  if (raw.trailingAnnualDividendYield && raw.trailingAnnualDividendYield > 0) {
    dy = raw.trailingAnnualDividendYield * (raw.trailingAnnualDividendYield <= 1.0 ? 100 : 1);
  } else if (raw.dividendYield && raw.dividendYield > 0) {
    dy = raw.dividendYield * (raw.dividendYield <= 1.0 ? 100 : 1);
  }

  if (dy === 0 && dividendRate > 0 && price > 0) {
    dy = (dividendRate / price) * 100;
  }
  if (dividendRate === 0 && dy > 0 && price > 0) {
    dividendRate = (dy / 100) * price;
  }

  // 1. Preço Teto Bazin:
  // - Para B3 (Brasil): Taxa de corte clássica de 6.0% a.a. (Décio Bazin)
  // - Para Globais (Moeda Forte / USD): Taxa de corte calibrada para 2.5% a.a.
  //   (Fundamentação: Jeremy Siegel em "The Future for Investors", média histórica do S&P 500 Dividend Aristocrats
  //   e taxa real de juros em dólar de Benjamin Graham).
  let dpaRef = dividendRate;
  if (raw.fiveYearAvgDividendYield && raw.fiveYearAvgDividendYield > 0 && price > 0) {
    const avg5yRate = (raw.fiveYearAvgDividendYield / 100) * price;
    dpaRef = (dividendRate + avg5yRate) / 2;
  }

  const taxaCorteBazin = isB3 ? 0.06 : 0.025;
  const precoTetoBazin = dpaRef > 0 ? Number((dpaRef / taxaCorteBazin).toFixed(2)) : 0;
  const margemSegurancaBazin = precoTetoBazin > 0 && price > 0
    ? Number((((precoTetoBazin - price) / price) * 100).toFixed(1))
    : -100;

  // 2. Indicadores Fundamentalistas Derivados (Sem N/D)
  // Payout Ratio: se não veio direto, calcula matematicamente (DPA / EPS) * 100
  let payout: number | undefined = undefined;
  if (raw.payoutRatio !== undefined && raw.payoutRatio !== null && !isNaN(raw.payoutRatio)) {
    payout = Number((raw.payoutRatio * (raw.payoutRatio <= 1.0 ? 100 : 1)).toFixed(1));
  } else if (raw.trailingEps && raw.trailingEps > 0 && dividendRate > 0) {
    payout = Number(((dividendRate / raw.trailingEps) * 100).toFixed(1));
  }

  // Dívida / EBITDA
  let dividaEbitda: number | undefined = undefined;
  if (raw.totalDebt && raw.ebitda && raw.ebitda > 0) {
    dividaEbitda = Number((raw.totalDebt / raw.ebitda).toFixed(2));
  }

  // ROE (Return on Equity): se não veio direto, calcula (EPS / BookValue) * 100 ou (P/VP / P/L) * 100
  let roe: number | undefined = undefined;
  if (raw.returnOnEquity !== undefined && raw.returnOnEquity !== null && !isNaN(raw.returnOnEquity)) {
    roe = Number((raw.returnOnEquity * (raw.returnOnEquity <= 1.0 ? 100 : 1)).toFixed(1));
  } else if (raw.trailingEps && raw.bookValue && raw.bookValue > 0) {
    roe = Number(((raw.trailingEps / raw.bookValue) * 100).toFixed(1));
  } else if (raw.priceToBook && raw.trailingPE && raw.trailingPE > 0) {
    roe = Number(((raw.priceToBook / raw.trailingPE) * 100).toFixed(1));
  }

  // P/VP (Preço sobre Valor Patrimonial)
  const pvp = raw.priceToBook
    ? Number(raw.priceToBook.toFixed(2))
    : raw.bookValue && raw.bookValue > 0 && price > 0
    ? Number((price / raw.bookValue).toFixed(2))
    : undefined;

  // P/L (Preço sobre Lucro)
  const pl = raw.trailingPE
    ? Number(raw.trailingPE.toFixed(1))
    : raw.trailingEps && raw.trailingEps > 0 && price > 0
    ? Number((price / raw.trailingEps).toFixed(1))
    : undefined;

  // Identifica se é instituição financeira (Bancos e Seguradoras não possuem dívida operacional ou EBITDA)
  const isFinancial = bestt.category === "Bancos" || bestt.category === "Seguros" ||
    (raw.sector && raw.sector.toLowerCase().includes("financial"));

  // 3. Algoritmo de Score de Longo Prazo (0 a 100)
  let score = 50; // Base neutra
  const pontosFortes: string[] = [];
  const pontosAtencao: string[] = [];

  // A. Setor Perene BESTT (Barsi) ou Aristocrata de Dividendos (Graham)
  if (bestt.isBestt) {
    score += 12;
    pontosFortes.push(`Setor Perene BESTT (${bestt.category}): demanda essencial e receita previsível.`);
  } else if (isAristocrat) {
    score += 12;
    pontosFortes.push("S&P 500 Dividend Aristocrat: histórico ininterrupto de 25+ anos aumentando dividendos em dólar.");
  }

  // B. Dividend Yield (Calibrado por mercado)
  if (isB3) {
    if (dy >= 6) {
      score += Math.min(18, Math.round((dy - 6) * 2 + 10));
      pontosFortes.push(`Dividend Yield atraente de ${dy.toFixed(1)}% a.a. (acima do corte mínimo de 6% de Bazin).`);
    } else if (dy >= 4) {
      score += 5;
      pontosAtencao.push(`Yield atual de ${dy.toFixed(1)}% a.a. está abaixo da régua ideal de Bazin (6%).`);
    } else if (dy > 0) {
      score -= 10;
      pontosAtencao.push(`Yield baixo de ${dy.toFixed(1)}% a.a.`);
    } else {
      score -= 25;
      pontosAtencao.push("Não paga dividendos ou sem proventos registrados recentemente.");
    }
  } else {
    // Mercado Global (Moeda Forte USD - Padrão Graham & Siegel)
    if (dy >= 2.5) {
      score += Math.min(18, Math.round((dy - 2.5) * 3 + 10));
      pontosFortes.push(`Dividend Yield sólido em moeda forte de ${dy.toFixed(1)}% a.a. (acima da régua global de 2,5%).`);
    } else if (dy >= 1.8) {
      score += 5;
      pontosAtencao.push(`Yield em dólar de ${dy.toFixed(1)}% a.a. (acima da média do S&P 500, mas abaixo do alvo de 2,5%).`);
    } else if (dy > 0) {
      score -= 10;
      pontosAtencao.push(`Yield baixo em dólar de ${dy.toFixed(1)}% a.a.`);
    } else {
      score -= 25;
      pontosAtencao.push("Não paga dividendos ou sem proventos registrados recentemente.");
    }
  }

  // C. Margem de Segurança Bazin
  if (margemSegurancaBazin > 15) {
    score += 18;
    pontosFortes.push(`Negociando com grande desconto vs Preço Teto Bazin (+${margemSegurancaBazin.toFixed(0)}% de margem).`);
  } else if (margemSegurancaBazin >= 0) {
    score += 10;
    pontosFortes.push(`Abaixo do Preço Teto Bazin (+${margemSegurancaBazin.toFixed(0)}% de margem de segurança).`);
  } else if (margemSegurancaBazin > -20) {
    score -= 5;
    pontosAtencao.push(`Preço atual está acima do teto de Bazin (${Math.abs(margemSegurancaBazin).toFixed(0)}% mais cara).`);
  } else {
    score -= 15;
    pontosAtencao.push("Muito acima do Preço Teto Bazin. Aguardar recuo de cotação para aportar.");
  }

  // D. Payout (Sustentabilidade dos Dividendos)
  if (payout !== undefined) {
    const tetoPayout = isB3 ? 85 : 80;
    if (payout >= 30 && payout <= tetoPayout) {
      score += 10;
      pontosFortes.push(`Payout saudável de ${payout.toFixed(0)}% (distribui dividendos sem queimar caixa).`);
    } else if (payout > 100) {
      score -= 25;
      pontosAtencao.push(`Alerta de Armadilha: Payout de ${payout.toFixed(0)}% excede o lucro gerado pela empresa!`);
    } else if (payout > tetoPayout) {
      score -= 5;
      pontosAtencao.push(`Payout elevado (${payout.toFixed(0)}%), retenção pequena para reinvestimento.`);
    }
  }

  // E. Alavancagem e Dívida
  if (isFinancial) {
    pontosFortes.push("Instituição Financeira: solidez regulada por solvência e índice de Basileia (EBITDA não aplicável).");
  } else if (dividaEbitda !== undefined) {
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
  if (score >= 70 && margemSegurancaBazin >= 0) {
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
    isAristocrat,
    score,
    status,
    pontosFortes,
    pontosAtencao,
    atualizadoEm: Date.now(),
  };
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Gerenciador de Sessão e Crumb do Yahoo Finance
// ---------------------------------------------------------------------------
let _cachedCookie = "";
let _cachedCrumb = "";
let _crumbExpiresAt = 0;

async function getYahooCrumb(): Promise<{ cookie: string; crumb: string } | null> {
  const now = Date.now();
  if (_cachedCrumb && _cachedCookie && now < _crumbExpiresAt) {
    return { cookie: _cachedCookie, crumb: _cachedCrumb };
  }

  try {
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": USER_AGENT },
      redirect: "manual",
    });
    const setCookie = cookieRes.headers.get("set-cookie") || "";
    if (!setCookie) return null;

    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": USER_AGENT,
        "Cookie": setCookie,
      },
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes("Unauthorized") || crumb.length > 50) return null;

    _cachedCookie = setCookie;
    _cachedCrumb = crumb;
    _crumbExpiresAt = now + 1000 * 60 * 60; // 1 hora de cache
    return { cookie: _cachedCookie, crumb: _cachedCrumb };
  } catch (err) {
    console.warn("[Market Engine] Falha ao obter crumb do Yahoo:", err);
    return null;
  }
}

/**
 * Consulta de cotações em bloco (batch quotes) trazendo indicadores fundamentalistas completos
 * (P/L, P/VP, LPA, VPA, dividendos e taxas).
 */
export async function fetchBatchQuotes(symbols: string[]): Promise<Map<string, MarketTickerRaw>> {
  const results = new Map<string, MarketTickerRaw>();
  if (symbols.length === 0) return results;

  const auth = await getYahooCrumb();
  if (!auth) {
    console.warn("[Market Engine] Crumb indisponível, usando fallback de chart.");
    return results;
  }

  const chunkSize = 40;
  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    try {
      const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(","))}&crumb=${encodeURIComponent(auth.crumb)}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Cookie": auth.cookie,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          _cachedCrumb = "";
        }
        continue;
      }

      const json = await res.json();
      const quoteList = json.quoteResponse?.result || [];

      for (const q of quoteList) {
        const symb = q.symbol;
        const price = q.regularMarketPrice || q.regularMarketPreviousClose || 0;
        if (price <= 0) continue;

        const raw: MarketTickerRaw = {
          symbol: symb,
          name: q.longName || q.shortName || symb,
          currency: q.currency || (symb.endsWith(".SA") ? "BRL" : "USD"),
          price,
          previousClose: q.regularMarketPreviousClose || price,
          fiftyTwoWeekHigh: q.fiftyTwoWeekHigh || price,
          fiftyTwoWeekLow: q.fiftyTwoWeekLow || price,
          dividendRate: q.dividendRate || q.trailingAnnualDividendRate,
          dividendYield: q.dividendYield,
          trailingAnnualDividendRate: q.trailingAnnualDividendRate,
          trailingAnnualDividendYield: q.trailingAnnualDividendYield,
          priceToBook: q.priceToBook,
          trailingPE: q.trailingPE,
          trailingEps: q.epsTrailingTwelveMonths,
          bookValue: q.bookValue,
          marketCap: q.marketCap,
          debtToEquity: q.debtToEquity,
        };

        results.set(symb, raw);
      }
    } catch (err) {
      console.warn(`[Market Engine] Erro no batch quote do bloco ${i}:`, err);
    }
  }

  return results;
}

/**
 * Consulta de detalhamento financeiro complementar (Dívida Total, EBITDA) para ativos individuais.
 */
export async function fetchQuoteSummary(symbol: string): Promise<Partial<MarketTickerRaw> | null> {
  const auth = await getYahooCrumb();
  if (!auth) return null;

  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=financialData,defaultKeyStatistics&crumb=${encodeURIComponent(auth.crumb)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Cookie": auth.cookie,
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const fd = json.quoteSummary?.result?.[0]?.financialData;
    const ks = json.quoteSummary?.result?.[0]?.defaultKeyStatistics;

    return {
      totalDebt: fd?.totalDebt?.raw,
      ebitda: fd?.ebitda?.raw,
      debtToEquity: fd?.debtToEquity?.raw,
      returnOnEquity: fd?.returnOnEquity?.raw,
      payoutRatio: ks?.payoutRatio?.raw,
      priceToBook: ks?.priceToBook?.raw,
      trailingEps: ks?.trailingEps?.raw,
      fiveYearAvgDividendYield: ks?.fiveYearAverageDividendYield?.raw,
    };
  } catch (_err) {
    return null;
  }
}

/**
 * Consulta de alta confiabilidade via endpoint de Chart do Yahoo Finance (sem autenticação/cookies).
 * Retorna preço em tempo real e todos os proventos em dinheiro dos últimos 12 meses.
 */
export async function fetchChartTicker(symbol: string): Promise<MarketTickerRaw | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&events=div`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;

    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice || meta?.chartPreviousClose || 0;
    if (!meta || price <= 0) return null;

    const divs = data.chart?.result?.[0]?.events?.dividends || {};
    let sumDivs = 0;
    for (const k of Object.keys(divs)) {
      if (typeof divs[k]?.amount === "number") {
        sumDivs += divs[k].amount;
      }
    }

    return {
      symbol,
      name: meta.longName || meta.shortName || symbol,
      currency: meta.currency || (symbol.endsWith(".SA") ? "BRL" : "USD"),
      price,
      previousClose: meta.chartPreviousClose || price,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || price,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow || price,
      dividendRate: sumDivs,
      dividendYield: price > 0 ? (sumDivs / price) * 100 : 0,
    };
  } catch (err) {
    console.warn(`[Market Engine] Falha ao consultar chart para ${symbol}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Universo de Ativos Monitorados Diariamente (B3 & Bolsas Mundiais)
// ---------------------------------------------------------------------------
export const MARKET_UNIVERSE_SYMBOLS: string[] = [
  // 1. B3 - Bancos & Financeiro
  "BBAS3.SA", "ITUB4.SA", "BBDC4.SA", "BBDC3.SA", "SANB11.SA", "ITSA4.SA", "BPAC11.SA", "BRSR6.SA", "B3SA3.SA",

  // 2. B3 - Seguros
  "BBSE3.SA", "CXSE3.SA", "PSSA3.SA", "IRBR3.SA",

  // 3. B3 - Energia Elétrica & Transmissão (BESTT)
  "TAEE11.SA", "CPLE3.SA", "EGIE3.SA", "ALUP11.SA", "CMIG4.SA", "CMIG3.SA",
  "EQTL3.SA", "ENGI11.SA", "CPFE3.SA", "AURE3.SA",

  // 4. B3 - Saneamento e Água (BESTT)
  "SAPR11.SA", "SAPR4.SA", "CSMG3.SA", "SBSP3.SA", "AMBP3.SA",

  // 5. B3 - Telecomunicações (BESTT)
  "VIVT3.SA", "TIMS3.SA", "FIQE3.SA",

  // 6. B3 - Commodities, Mineração e Siderurgia
  "VALE3.SA", "PETR4.SA", "PETR3.SA", "GGBR4.SA", "GOAU4.SA", "CSNA3.SA", "USIM5.SA",
  "SUZB3.SA", "KLBN11.SA", "PRIO3.SA", "RECV3.SA", "UGPA3.SA", "VBBR3.SA", "RAIZ4.SA",

  // 7. B3 - Consumo, Varejo, Indústria e Saúde
  "ABEV3.SA", "WEGE3.SA", "VULC3.SA", "MDIA3.SA", "GRND3.SA", "CAML3.SA", "LEVE3.SA",
  "SHUL4.SA", "KEPL3.SA", "TUPY3.SA", "POMO4.SA", "RAPT4.SA", "LREN3.SA", "ALOS3.SA",
  "ASAI3.SA", "SMTO3.SA", "SLCE3.SA", "RADL3.SA", "HYPE3.SA", "FLRY3.SA",
  "CYRE3.SA", "EZTC3.SA", "DIRR3.SA", "MRVE3.SA", "RENT3.SA", "RAIL3.SA",

  // 8. B3 - Fundos Imobiliários (FIIs)
  "HGLG11.SA", "MXRF11.SA", "KNCR11.SA", "XPML11.SA", "XPLG11.SA", "VISC11.SA", "BTLG11.SA", "KNRI11.SA", "HGRU11.SA", "CPTS11.SA",

  // 9. B3 - Empresas em Alerta / Estresse
  "OIBR3.SA", "AMER3.SA", "BHIA3.SA", "CVCB3.SA",

  // 10. Globais - S&P 500 Dividend Aristocrats & Kings (25 a 50+ anos de dividendos crescentes)
  "KO", "PEP", "JNJ", "PG", "MMM", "ABBV", "CVX", "XOM", "MCD", "O", "IBM", "T", "VZ", "MO", "PM",
  "CAT", "EMR", "GPC", "LOW", "WMT", "CL", "SYY", "ED", "BDX", "ITW", "PPG", "TGT", "ADM", "ADP",
  "AFL", "APD", "BKH", "CINF", "DOV", "FRT", "HRL", "KMB", "NUE", "PNR", "SHW", "SWK", "ABT",
  "CB", "CLX", "GD", "GWW", "LIN", "MDT", "MKC", "NEE", "ROP", "SPGI",

  // 11. Globais - Mega Caps & Finanças Globais
  "JPM", "BAC", "WFC", "MS", "GS", "BLK", "TXN", "QCOM", "CSCO", "INTC", "ORCL", "MSFT", "AAPL", "V", "MA",
  "SCHD", "VYM", "VIG"
];

// ---------------------------------------------------------------------------
// Varredura Diária Paralela com Controle de Concorrência
// ---------------------------------------------------------------------------
async function scanMarketInBatches(symbols: string[]): Promise<LongTermAnalysis[]> {
  const analyzed: LongTermAnalysis[] = [];

  // 1. Busca cotações em bloco (batch quotes) trazendo indicadores completos (P/L, P/VP, LPA, VPA)
  const batchQuotes = await fetchBatchQuotes(symbols);

  // 2. Processa cada ativo com fallback para chart caso falte provento ou cotação
  for (const sym of symbols) {
    let raw = batchQuotes.get(sym);

    if (!raw || !raw.price || raw.dividendRate === undefined) {
      const chartRaw = await fetchChartTicker(sym);
      if (chartRaw && chartRaw.price > 0) {
        if (raw) {
          raw.price = raw.price || chartRaw.price;
          raw.dividendRate = raw.dividendRate ?? chartRaw.dividendRate;
          raw.dividendYield = raw.dividendYield ?? chartRaw.dividendYield;
        } else {
          raw = chartRaw;
        }
      }
    }

    if (raw && raw.price > 0) {
      try {
        const item = calcularAnaliseLongoPrazo(raw);
        analyzed.push(item);
      } catch (_err) {
        // Ignora erro em ativo isolado
      }
    }
  }

  // Ordenação rigorosa: Maior Score primeiro (100 -> 0), desempate por Maior Margem de Segurança Bazin
  analyzed.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.margemSegurancaBazin - a.margemSegurancaBazin;
  });

  return analyzed;
}

// ---------------------------------------------------------------------------
// Cache Global e Persistência do Hot 100
// ---------------------------------------------------------------------------
let _cachedHot100: LongTermAnalysis[] | null = null;
let _hot100LastUpdated = 0;
let _isScanningInProgress = false;
const HOT100_TTL_MS = 1000 * 60 * 60 * 24; // 24 horas

/**
 * Executa a varredura diária no mercado e persiste no banco de dados MongoDB (se disponível) e em memória.
 */
export async function runDailyMarketScanner(db?: any): Promise<{
  items: LongTermAnalysis[];
  updatedAt: number;
  totalScanned: number;
}> {
  if (_isScanningInProgress && _cachedHot100) {
    return {
      items: _cachedHot100,
      updatedAt: _hot100LastUpdated,
      totalScanned: _cachedHot100.length,
    };
  }

  _isScanningInProgress = true;
  console.log(`[Market Engine] Iniciando varredura diária de ${MARKET_UNIVERSE_SYMBOLS.length} ativos...`);

  try {
    const analyzed = await scanMarketInBatches(MARKET_UNIVERSE_SYMBOLS);
    const top100 = analyzed.slice(0, 100);
    const now = Date.now();

    _cachedHot100 = top100;
    _hot100LastUpdated = now;

    // Persiste no MongoDB Atlas para sobrevivência a reinicializações de container
    if (db) {
      try {
        await db.collection("market_hot100").updateOne(
          { _id: "daily_hot100" },
          {
            $set: {
              items: top100,
              updatedAt: now,
              totalScanned: analyzed.length,
            },
          },
          { upsert: true }
        );
        console.log(`[Market Engine] Hot 100 persistido no MongoDB com sucesso (${top100.length} ativos).`);
      } catch (dbErr) {
        console.warn("[Market Engine] Aviso ao gravar Hot 100 no MongoDB:", dbErr);
      }
    }

    return {
      items: top100,
      updatedAt: now,
      totalScanned: analyzed.length,
    };
  } finally {
    _isScanningInProgress = false;
  }
}

/**
 * Retorna o HOT 100 diário com carregamento instantâneo:
 * 1. Verifica memória ou MongoDB Atlas (0ms).
 * 2. Se não existir ou expirou (>24h), dispara a varredura diária em background.
 */
export async function getHot100(forceRefresh = false, db?: any): Promise<{
  items: LongTermAnalysis[];
  updatedAt: number;
  totalScanned: number;
}> {
  const now = Date.now();

  // 1. Se em memória e recente (<24h), retorna imediatamente
  if (!forceRefresh && _cachedHot100 && _cachedHot100.length > 0 && now - _hot100LastUpdated < HOT100_TTL_MS) {
    return {
      items: _cachedHot100,
      updatedAt: _hot100LastUpdated,
      totalScanned: _cachedHot100.length,
    };
  }

  // 2. Se temos conexão com MongoDB, tenta carregar o Hot 100 do banco
  if (!forceRefresh && db) {
    try {
      const doc = await db.collection("market_hot100").findOne({ _id: "daily_hot100" });
      if (doc && Array.isArray(doc.items) && doc.items.length > 0) {
        _cachedHot100 = doc.items;
        _hot100LastUpdated = doc.updatedAt || now;

        // Se os dados no banco tiverem menos de 24h, retorna imediatamente
        if (now - _hot100LastUpdated < HOT100_TTL_MS) {
          return {
            items: doc.items,
            updatedAt: _hot100LastUpdated,
            totalScanned: doc.totalScanned || doc.items.length,
          };
        }

        // Se expirou, inicia varredura em background e retorna os dados existentes sem travar a requisição
        runDailyMarketScanner(db).catch(console.error);
        return {
          items: doc.items,
          updatedAt: _hot100LastUpdated,
          totalScanned: doc.totalScanned || doc.items.length,
        };
      }
    } catch (_loadErr) {
      // Continua para varredura
    }
  }

  // 3. Se forçado ou primeira execução, executa a varredura
  return await runDailyMarketScanner(db);
}

/**
 * Consulta um ativo individual específico (da busca ou fora do Hot 100).
 */
export async function fetchMarketTicker(rawSymbol: string): Promise<LongTermAnalysis> {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) {
    throw new Error("Símbolo do ativo inválido.");
  }

  // 1. Verifica se já está no Hot 100 em cache
  if (_cachedHot100) {
    const clean = symbol.replace(".SA", "");
    const found = _cachedHot100.find((it) => it.symbol === clean || it.symbol === symbol);
    if (found) return found;
  }

  // 2. Consulta via batch quote
  const batchMap = await fetchBatchQuotes([symbol]);
  let raw = batchMap.get(symbol) || null;

  // 3. Se faltou cotação ou dividendo, enriquece com chart
  if (!raw || !raw.price || raw.dividendRate === undefined) {
    const chartQuote = await fetchChartTicker(symbol);
    if (chartQuote && chartQuote.price > 0) {
      if (raw) {
        raw.price = raw.price || chartQuote.price;
        raw.dividendRate = raw.dividendRate ?? chartQuote.dividendRate;
        raw.dividendYield = raw.dividendYield ?? chartQuote.dividendYield;
      } else {
        raw = chartQuote;
      }
    }
  }

  // 4. Se encontrou, enriquece com quoteSummary para Dívida/EBITDA e calcula
  if (raw && raw.price > 0) {
    const summary = await fetchQuoteSummary(symbol);
    if (summary) {
      raw = { ...raw, ...summary };
    }
    return calcularAnaliseLongoPrazo(raw);
  }

  throw new Error(`Não foi possível localizar cotações e indicadores para o ativo ${rawSymbol}.`);
}
